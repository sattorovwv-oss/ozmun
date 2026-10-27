#!/usr/bin/env python3
"""Update only the prepared OBHUSH app from a checksum-pinned prebuilt image.

Never edits proxy configuration, runtime.env, protected projects, packages or the
Docker daemon. Retains the previous image and rolls back only OBHUSH on failure.
"""
import argparse
import fcntl
import hashlib
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

IMAGE = 'obhush:2026-10-26'
TLS_PORT = 443
TLS_CONTEXT = ssl.create_default_context


def run(args, timeout=40):
    result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args[:4]) + '; exit=' + str(result.returncode))
    return result.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def snapshot(names):
    result = {}
    for name in names:
        item = inspect(name)
        state = item['State']
        health = state.get('Health', {}).get('Status')
        if not state['Running'] or state.get('Restarting') or health not in (None, 'healthy'):
            raise RuntimeError('A protected container is not healthy; no application update started')
        result[name] = (item['Id'], state['StartedAt'], item['RestartCount'], health)
    return result


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def active_config(proxy):
    return json.loads(run(['docker', 'exec', proxy, 'wget', '-q', '-T', '5', '-O', '-', 'http://127.0.0.1:2019/config/']))


def hosts(config):
    out = set()
    def visit(value):
        if isinstance(value, dict):
            for host in value.get('host', []):
                if isinstance(host, str) and '.' in host and '*' not in host:
                    out.add(host)
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
    visit(config.get('apps', {}).get('http', {}))
    return sorted(out)


def origin(domain, path='/'):
    class LocalOrigin(http.client.HTTPSConnection):
        def connect(self):
            raw = socket.create_connection(('127.0.0.1', TLS_PORT), timeout=self.timeout)
            self.sock = self._context.wrap_socket(raw, server_hostname=domain)
    connection = LocalOrigin(domain, TLS_PORT, timeout=10, context=TLS_CONTEXT())
    try:
        connection.request('GET', path, headers={'Host': domain, 'User-Agent': 'OBHUSH-update-check/2'})
        response = connection.getresponse()
        return response.status, response.read(8192)
    finally:
        connection.close()


def config_files(proxy):
    return {item['Source']: digest(Path(item['Source'])) for item in inspect(proxy)['Mounts']
            if item['Type'] == 'bind' and Path(item['Source']).is_file()}


def verify_limits(name):
    app = inspect(name)
    host = app['HostConfig']
    if (host['Memory'] != 512 * 1024 ** 2 or host['MemorySwap'] != 512 * 1024 ** 2
            or host['NanoCpus'] != 500000000 or host['PidsLimit'] != 96 or not host['ReadonlyRootfs']):
        raise RuntimeError('OBHUSH resource limits differ from the prepared budget')
    return app


def download(url, path, expected):
    if path.is_symlink():
        raise RuntimeError('Refusing a symlink as the update archive')
    if path.exists():
        if digest(path) != expected:
            raise RuntimeError('Existing update archive has a different checksum')
        return
    partial = path.with_suffix(path.suffix + '.part')
    if partial.is_symlink() or (partial.exists() and not partial.is_file()):
        raise RuntimeError('Refusing an irregular partial update archive')
    # The caller holds .update.lock. A disconnected SSH attempt may have left
    # this exact release's partial file; resume it instead of failing O_EXCL.
    for attempt in range(3):
        offset = partial.stat().st_size if partial.exists() else 0
        if offset and digest(partial) == expected:
            partial.rename(path)
            return
        if offset > 1024 ** 3:
            raise RuntimeError('Partial update archive exceeds the download budget')
        headers = {'User-Agent': 'OBHUSH-release-installer/3'}
        if offset:
            headers['Range'] = 'bytes=' + str(offset) + '-'
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as source:
                status = source.status
                if status == 206:
                    content_range = re.fullmatch(r'bytes ([0-9]+)-([0-9]+)/([0-9]+)', source.headers.get('Content-Range', ''))
                    if not content_range or int(content_range[1]) != offset:
                        raise RuntimeError('Unexpected download range; partial archive retained')
                    append = bool(offset)
                elif status == 200:
                    # Some servers ignore Range. Restart the archive download,
                    # without replacing or stopping the running application.
                    append = False
                else:
                    raise RuntimeError('Unexpected update download status')
                flags = os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW | (os.O_APPEND if append else os.O_TRUNC)
                received = 0
                fd = os.open(partial, flags, 0o600)
                with os.fdopen(fd, 'wb') as dest:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        received += len(chunk)
                        if received + (offset if append else 0) > 1024 ** 3:
                            raise RuntimeError('Update archive exceeds the download budget')
                        dest.write(chunk)
                declared = source.headers.get('Content-Length')
                if declared is not None and received != int(declared):
                    raise ConnectionError('Update download ended before its declared length')
            if digest(partial) != expected:
                partial.unlink()
                raise RuntimeError('Downloaded image checksum mismatch')
            partial.rename(path)
            return
        except (urllib.error.URLError, OSError, http.client.IncompleteRead) as error:
            if attempt == 2:
                raise RuntimeError('Update download interrupted; partial file retained for the next run') from error
            print('Download interrupted; retrying from retained bytes…', flush=True)
            time.sleep(2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path('/opt/obhush'))
    parser.add_argument('--release', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--archive', type=Path)
    parser.add_argument('--expected-version', type=int, default=2)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'obhush-[0-9]+-[a-f0-9]{7}', args.release) or not re.fullmatch(r'[a-f0-9]{64}', args.sha256):
        raise RuntimeError('Invalid release tag or SHA256')
    directory = args.directory
    if directory.is_symlink() or not directory.is_dir():
        raise RuntimeError('Expected the prepared regular OBHUSH directory')
    manifest = json.loads((directory / 'prepared.json').read_text())
    published = json.loads((directory / 'published.json').read_text())
    project, proxy, protected, domain = manifest['project'], manifest['proxy'], manifest['protected'], published['domain']
    if not re.fullmatch(r'obhush[a-z0-9_-]*', project):
        raise RuntimeError('Refusing to update an unrelated Compose project')
    app_name = project + '-app-1'
    if app_name in protected or proxy not in protected or not 1 <= len(protected) <= 20:
        raise RuntimeError('Invalid protected-container manifest')
    if not re.fullmatch(r'[a-z0-9.-]+\.[a-z]{2,}', domain):
        raise RuntimeError('Invalid published domain')
    if not ipaddress.ip_address(manifest['gateway']).is_private:
        raise RuntimeError('Expected a private upstream gateway')
    if not isinstance(manifest['port'], int) or not 1024 <= manifest['port'] <= 65535:
        raise RuntimeError('Invalid prepared application port')
    os.environ['OBHUSH_PORT'] = str(manifest['port'])
    compose = directory / 'compose.yml'
    if not compose.is_file() or compose.is_symlink():
        raise RuntimeError('Expected the prepared Compose file')
    compose_sha = digest(compose)
    app = verify_limits(app_name)
    if app['Config']['Image'] != IMAGE or app['Config']['Labels'].get('com.docker.compose.project') != project:
        raise RuntimeError('Running application does not match the prepared image/project')
    old_image = app['Image']
    before = snapshot(protected)
    if any(inspect(name)['Config']['Image'] == IMAGE for name in protected):
        raise RuntimeError('A protected container uses this application image tag; refusing to replace it')
    original_config, original_files = active_config(proxy), config_files(proxy)
    old_hosts = [host for host in hosts(original_config) if host != domain]
    if not 1 <= len(old_hosts) <= 10:
        raise RuntimeError('Existing HTTPS baseline requires review')
    statuses = {host: origin(host)[0] for host in old_hosts}
    if any(status >= 500 for status in statuses.values()):
        raise RuntimeError('An existing site already returns a server error; no update started')
    if origin(domain, '/api/health')[0] != 200:
        raise RuntimeError('Current OBHUSH public endpoint is not healthy')
    available = dict((line.split(':', 1)[0], int(line.split()[1])) for line in Path('/proc/meminfo').read_text().splitlines())['MemAvailable'] * 1024
    if available < 1024 ** 3 or shutil.disk_usage(directory).free < 2 * 1024 ** 3:
        raise RuntimeError('Insufficient spare memory or disk')
    if os.getloadavg()[1] > (os.cpu_count() or 1) * .85:
        raise RuntimeError('Current host load is too high')
    cli = ['docker', 'compose', '-p', project, '-f', str(compose)]
    run(cli + ['config', '--quiet'])
    print('Preflight OK: protected containers, existing HTTPS sites and resource budget checked.', flush=True)
    if not args.apply:
        print('Read-only checks complete; --apply updates only OBHUSH.')
        return
    with (directory / '.update.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        archive = args.archive or directory / (args.release + '.image.tar.gz')
        print('Downloading the prebuilt update; no compilation or package installation on this VPS…', flush=True)
        if args.archive:
            if digest(archive) != args.sha256:
                raise RuntimeError('Local image checksum mismatch')
        else:
            download('https://github.com/sattorovwv-oss/ozmun/releases/download/' + args.release + '/obhush-linux-amd64.image.tar.gz', archive, args.sha256)
        if (snapshot(protected) != before or active_config(proxy) != original_config
                or digest(compose) != compose_sha or inspect(app_name)['Id'] != app['Id']):
            raise RuntimeError('Protected state changed during download; no application replacement started')
        rollback_tag = 'obhush:rollback-' + str(time.time_ns())
        run(['docker', 'image', 'tag', old_image, rollback_tag])
        replacing = False
        try:
            run(['docker', 'load', '-i', str(archive)], timeout=180)
            new_image = json.loads(run(['docker', 'image', 'inspect', IMAGE]))[0]
            if any(value.startswith('LLM_API_KEY=') for value in new_image['Config']['Env']):
                raise RuntimeError('The image unexpectedly contains a key binding')
            replacing = True
            run(cli + ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '60', 'app'], timeout=90)
            current = verify_limits(app_name)
            if current['Image'] != new_image['Id']:
                raise RuntimeError('Running image does not match the downloaded release')
            upstream = 'http://' + manifest['gateway'] + ':' + str(manifest['port']) + '/api/health'
            health = json.loads(run(['docker', 'exec', proxy, 'wget', '-q', '-T', '5', '-O', '-', upstream]))
            if health.get('status') != 'ok' or health.get('interfaceVersion') != args.expected_version:
                raise RuntimeError('Updated application did not return the expected interface version')
            code, body = origin(domain, '/api/health')
            if code != 200 or json.loads(body).get('interfaceVersion') != args.expected_version:
                raise RuntimeError('Public HTTPS does not serve the expected update')
            if (snapshot(protected) != before or active_config(proxy) != original_config or config_files(proxy) != original_files
                    or digest(compose) != compose_sha or any(origin(host)[0] != status for host, status in statuses.items())):
                raise RuntimeError('A protected check changed; restoring only OBHUSH')
            (directory / 'updated.json').write_text(json.dumps({'release': args.release, 'sha256': args.sha256,
                'previousImage': old_image, 'rollbackTag': rollback_tag, 'image': new_image['Id'],
                'updatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, indent=2))
            print('UPDATE_READY: https://' + domain + ' · interfaceVersion=' + str(args.expected_version), flush=True)
            print('Protected containers unchanged. Proxy configuration and runtime.env were not edited.')
        except BaseException:
            run(['docker', 'image', 'tag', old_image, IMAGE])
            if replacing:
                run(cli + ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '60', 'app'], timeout=90)
                print('ROLLBACK_COMPLETE: previous OBHUSH image restored; protected projects were not restarted.', flush=True)
            raise


def interrupted(_signum, _frame):
    raise KeyboardInterrupt('Application update interrupted')


if __name__ == '__main__':
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print('STOPPED: ' + str(error), file=sys.stderr)
        sys.exit(1)
