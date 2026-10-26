#!/usr/bin/env python3
"""Append one validated site to an existing Caddyfile, with guarded rollback.

Never recreate/restart the proxy, application, Docker daemon or VPS. Preserve the
bind-mounted file inode. Defaults to checks only; --apply performs a reload.
"""
import argparse
import fcntl
import http.client
import ipaddress
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import socket
import ssl
import subprocess
import sys
import time

TLS_PORT = 443
TLS_CONTEXT = ssl.create_default_context
HTTPS_WAIT_SECONDS = 60


def run(args, data=None, timeout=35):
    r = subprocess.run(args, input=data, text=True, capture_output=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError('Command failed: ' + ' '.join(args[:4]) + '; exit=' + str(r.returncode))
    return r.stdout


def inspect(name):
    return json.loads(run(['docker', 'inspect', name]))[0]


def snapshot(names):
    out = {}
    for name in names:
        d = inspect(name)
        s = d['State']
        health = s.get('Health', {}).get('Status')
        if not s['Running'] or s.get('Restarting') or (health is not None and health != 'healthy'):
            raise RuntimeError('Protected container is not healthy: ' + name)
        out[name] = (d['Id'], s['StartedAt'], d['RestartCount'], health)
    return out


def origin(domain, path='/'):
    # Connect locally, but verify the real hostname and public certificate chain.
    # This avoids DNS hairpin/cache problems without disabling TLS verification.
    class LocalOrigin(http.client.HTTPSConnection):
        def connect(self):
            raw = socket.create_connection(('127.0.0.1', TLS_PORT), timeout=self.timeout)
            self.sock = self._context.wrap_socket(raw, server_hostname=domain)
    conn = LocalOrigin(domain, TLS_PORT, timeout=8, context=TLS_CONTEXT())
    try:
        conn.request('GET', path, headers={'Host': domain, 'User-Agent': 'OBHUSH-deployment-check/1.0'})
        r = conn.getresponse()
        body = r.read(8192)
        return r.status, body
    finally:
        conn.close()


def require_dns(domain, expected_ip):
    actual = {r[4][0] for r in socket.getaddrinfo(domain, 443, socket.AF_INET, socket.SOCK_STREAM)}
    if actual != {expected_ip}:
        raise RuntimeError('DNS A does not point exclusively to the requested VPS yet; no proxy changes made')
    try:
        ipv6 = socket.getaddrinfo(domain, 443, socket.AF_INET6, socket.SOCK_STREAM)
    except socket.gaierror as e:
        if e.errno not in (socket.EAI_NONAME, getattr(socket, 'EAI_NODATA', socket.EAI_NONAME)):
            raise RuntimeError('IPv6 DNS lookup is temporarily unavailable; no proxy changes made')
        ipv6 = []
    if ipv6:
        raise RuntimeError('AAAA exists: IPv6 needs separate confirmation before publication')


def hostnames(config):
    found = set()
    def visit(item):
        if isinstance(item, dict):
            if isinstance(item.get('host'), list):
                for value in item['host']:
                    if isinstance(value, str) and '.' in value and '*' not in value:
                        found.add(value)
            for value in item.values():
                visit(value)
        elif isinstance(item, list):
            for value in item:
                visit(value)
    visit(config.get('apps', {}).get('http', {}))
    return sorted(found)


def render_site(domain, gateway, port):
    return ('\n# BEGIN OBHUSH ' + domain + '\n' + domain + ' {\n'
            '    encode zstd gzip\n    reverse_proxy ' + gateway + ':' + str(port) + '\n}\n'
            '# END OBHUSH ' + domain + '\n').encode()


def append_guarded(path, original, block):
    with path.open('r+b', buffering=0) as f:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if f.read() != original:
            raise RuntimeError('Proxy configuration changed concurrently; refusing to write')
        f.seek(0, 2)
        if f.write(block) != len(block):
            f.truncate(len(original))
            os.fsync(f.fileno())
            raise RuntimeError('Incomplete append; original configuration restored')
        os.fsync(f.fileno())


def restore_guarded(path, original, block):
    with path.open('r+b', buffering=0) as f:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current = f.read()
        if current == original:
            return
        if not current.startswith(original) or not block.startswith(current[len(original):]):
            raise RuntimeError('Concurrent proxy edit detected; will not overwrite another change')
        f.truncate(len(original))
        os.fsync(f.fileno())


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--domain', required=True)
    p.add_argument('--server-ip', required=True)
    p.add_argument('--proxy-config', type=Path, required=True)
    p.add_argument('--container-config', default='/etc/caddy/Caddyfile')
    p.add_argument('--directory', type=Path, default=Path('/opt/obhush'))
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    domain = args.domain.lower()
    if len(domain) > 253 or len(domain.split('.')) < 2 or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', v) for v in domain.split('.')):
        raise RuntimeError('Invalid domain name')
    if ipaddress.ip_address(args.server_ip).version != 4:
        raise RuntimeError('Expected IPv4 server address')
    require_dns(domain, args.server_ip)
    manifest = json.loads((args.directory / 'prepared.json').read_text())
    proxy, names = manifest['proxy'], manifest['protected']
    before = snapshot(names)
    d = inspect(proxy)
    startup = (d['Config'].get('Entrypoint') or []) + (d['Config'].get('Cmd') or [])
    if '--watch' in startup or 'caddy' not in ' '.join(startup) or 'run' not in startup:
        raise RuntimeError('Proxy startup is not a supported non-watching Caddy process')
    config = args.proxy_config
    if not config.is_file() or config.is_symlink():
        raise RuntimeError('Expected a regular existing host Caddyfile')
    original = config.read_bytes()
    if len(original) > 1024 * 1024:
        raise RuntimeError('Large shared config requires manual review')
    mount_ok = False
    for mount in d['Mounts']:
        dest = PurePosixPath(mount['Destination'])
        target = PurePosixPath(args.container_config)
        try:
            relative = target.relative_to(dest)
        except ValueError:
            continue
        if Path(mount['Source']).joinpath(str(relative)).resolve() == config.resolve():
            mount_ok = True
    if not mount_ok:
        raise RuntimeError('Host config does not match the inspected proxy mount')
    bound = run(['docker', 'exec', proxy, 'cat', args.container_config]).encode()
    if bound != original:
        raise RuntimeError('Bind-mounted config differs from the host file; no changes made')
    cli = ['docker', 'exec', '-i', '-w', str(PurePosixPath(args.container_config).parent), proxy, 'caddy']
    adapted = json.loads(run(cli + ['adapt', '--config', '-', '--adapter', 'caddyfile'], original.decode()))
    if adapted.get('admin', {}).get('disabled'):
        raise RuntimeError('Caddy admin API is disabled; safe reload is unavailable')
    admin = adapted.get('admin', {}).get('listen', 'localhost:2019')
    if admin not in ('localhost:2019', '127.0.0.1:2019', ':2019', '0.0.0.0:2019'):
        raise RuntimeError('Custom admin address requires a separate review; no proxy changes made')
    active = json.loads(run(['docker', 'exec', proxy, 'wget', '-q', '-T', '5', '-O', '-', 'http://127.0.0.1:2019/config/']))
    if active != adapted:
        raise RuntimeError('Active proxy config differs from the host file; refusing to replace unpersisted settings')
    old_hosts = hostnames(adapted)
    if domain in old_hosts:
        raise RuntimeError('This domain is already configured; do not append a duplicate')
    if not old_hosts or len(old_hosts) > 10:
        raise RuntimeError('Existing site baseline requires manual review')
    statuses = {}
    for host in old_hosts:
        code, _ = origin(host)
        if code >= 500:
            raise RuntimeError('An existing site is already returning a server error; no changes made')
        statuses[host] = code
    upstream = 'http://' + manifest['gateway'] + ':' + str(manifest['port']) + '/api/health'
    health = json.loads(run(['docker', 'exec', proxy, 'wget', '-q', '-T', '5', '-O', '-', upstream]))
    if health.get('service') != 'obhush' or health.get('status') != 'ok':
        raise RuntimeError('Private application is not ready')
    block = render_site(domain, manifest['gateway'], manifest['port'])
    run(cli + ['validate', '--config', '-', '--adapter', 'caddyfile'], (original + block).decode())
    print('Preflight OK: DNS, private application, existing HTTPS sites and candidate Caddy config checked.', flush=True)
    if not args.apply:
        print('Read-only checks completed. No proxy changes made.')
        return
    backup = args.directory / ('caddy.before-' + str(time.time_ns()) + '.conf')
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as f:
        f.write(original)
    reload_cli = ['docker', 'exec', proxy, 'caddy', 'reload', '--config', args.container_config, '--adapter', 'caddyfile']
    changed = False
    try:
        changed = True
        append_guarded(config, original, block)
        run(reload_cli)
        if snapshot(names) != before:
            raise RuntimeError('Protected containers changed after reload')
        for host, expected in statuses.items():
            if origin(host)[0] != expected:
                raise RuntimeError('An existing site changed its HTTP status')
        deadline = time.monotonic() + HTTPS_WAIT_SECONDS
        while True:
            try:
                code, body = origin(domain, '/api/health')
                payload = json.loads(body)
                if code == 200 and payload.get('status') == 'ok' and payload.get('service') == 'obhush':
                    break
            except Exception:
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('New HTTPS endpoint did not become ready in time')
            time.sleep(2)
        if snapshot(names) != before or any(origin(h)[0] != status for h, status in statuses.items()):
            raise RuntimeError('Protected site checks changed')
        (args.directory / 'published.json').write_text(json.dumps({'domain': domain, 'backup': str(backup), 'publishedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}, indent=2))
        print('DOMAIN_READY: https://' + domain, flush=True)
        print('Existing HTTPS sites retain their status; protected containers were not restarted.')
    except BaseException:
        if changed:
            restore_guarded(config, original, block)
            run(reload_cli)
            print('ROLLBACK_COMPLETE: original proxy config restored without restarting containers.', flush=True)
        raise


def interrupt(_signal, _frame):
    raise KeyboardInterrupt('Deployment interrupted')


if __name__ == '__main__':
    for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupt)
    try:
        main()
    except (Exception, KeyboardInterrupt) as e:
        print('STOPPED: ' + str(e), file=sys.stderr)
        sys.exit(1)
