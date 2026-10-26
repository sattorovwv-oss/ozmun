#!/usr/bin/env python3
"""Start only an isolated, private OBHUSH container. Never edit the shared proxy.

Uses a checksum-pinned prebuilt release. No package installation or server build.
Default mode is read-only; --apply explicitly starts the separate application.
"""
import argparse
import getpass
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

BASE = 'https://github.com/sattorovwv-oss/ozmun/releases/download/obhush-1-aac11e1/'
IMAGE = 'obhush:2026-10-26'
IMAGE_FILE = 'obhush-linux-amd64.image.tar.gz'
IMAGE_SHA = '47b5311e793d30755776b9614d076de36dab0159f097823904a2c188d2ea1ec2'
COMPOSE_SHA = '2f195bcaf09c8c13bc596871d9cf2b594b8bbaf2724d51b374be59a481185ea2'


def command(args, *, env=None, timeout=120):
    r = subprocess.run(args, capture_output=True, text=True, env=env, timeout=timeout)
    if r.returncode:
        # Do not dump command output: a future provider/CLI may include secrets.
        raise RuntimeError('Command failed: ' + ' '.join(args[:3]) + '; exit=' + str(r.returncode))
    return r.stdout


def inspect(name):
    return json.loads(command(['docker', 'inspect', name]))[0]


def protected_snapshot(names):
    result = {}
    for name in names:
        d = inspect(name)
        state = d['State']
        if not state['Running'] or state.get('Restarting'):
            raise RuntimeError('Protected container is not stable: ' + name)
        health = state.get('Health', {}).get('Status')
        if health is not None and health != 'healthy':
            raise RuntimeError('Protected container is not healthy: ' + name)
        result[name] = (d['Id'], state['StartedAt'], d['RestartCount'], health)
    return result


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while block := f.read(1024 * 1024):
            h.update(block)
    return h.hexdigest()


def download(name, destination, checksum):
    with urllib.request.urlopen(BASE + name, timeout=60) as r, destination.open('wb') as f:
        if not r.url.startswith('https://'):
            raise RuntimeError('HTTPS redirect required')
        shutil.copyfileobj(r, f, 1024 * 1024)
    if digest(destination) != checksum:
        raise RuntimeError('Downloaded file checksum mismatch: ' + name)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--proxy', required=True)
    p.add_argument('--protect', action='append', required=True)
    p.add_argument('--directory', type=Path, default=Path('/opt/obhush'))
    p.add_argument('--project', default='obhush')
    p.add_argument('--port', type=int, default=43100)
    p.add_argument('--network')
    p.add_argument('--archive', type=Path, help='Use an already downloaded checksum-pinned archive')
    p.add_argument('--no-ai', action='store_true', help='Local calculations only; do not request a key')
    p.add_argument('--apply', action='store_true')
    args = p.parse_args()
    if not re.fullmatch(r'obhush(?:-[a-z0-9-]+)?', args.project):
        raise RuntimeError('Project name must start with obhush')
    if not args.directory.name.startswith('obhush') or args.directory.is_symlink():
        raise RuntimeError('Use a dedicated directory named obhush…')
    if not 1024 <= args.port <= 65535:
        raise RuntimeError('Invalid private port')
    if os.uname().machine not in ('x86_64', 'amd64'):
        raise RuntimeError('This release is Linux/amd64 only')
    command(['docker', 'compose', 'version'])
    names = list(dict.fromkeys(args.protect + [args.proxy]))
    before = protected_snapshot(names)
    proxy = inspect(args.proxy)
    networks = proxy['NetworkSettings']['Networks']
    network = args.network or (next(iter(networks)) if len(networks) == 1 else None)
    if not network or network not in networks:
        raise RuntimeError('Select the existing proxy network explicitly')
    gateway = networks[network]['Gateway']
    if not ipaddress.ip_address(gateway).is_private:
        raise RuntimeError('Expected a private bridge gateway')
    memory = dict((line.split(':', 1)[0], int(line.split()[1]))
                  for line in Path('/proc/meminfo').read_text().splitlines())['MemAvailable'] * 1024
    parent = args.directory.parent
    if not parent.is_dir():
        raise RuntimeError('Parent directory does not exist')
    if memory < 1536 * 1024 * 1024 or shutil.disk_usage(parent).free < 3 * 1024 ** 3:
        raise RuntimeError('Insufficient spare memory or disk; production remains unchanged')
    if os.getloadavg()[1] > (os.cpu_count() or 1) * .75:
        raise RuntimeError('Current load is too high for a deployment')
    if command(['docker', 'ps', '-aq', '--filter', 'label=com.docker.compose.project=' + args.project]).strip():
        raise RuntimeError('This OBHUSH Compose project already exists; no changes made')
    with socket.socket() as s:
        s.bind((gateway, args.port))
    print('Preflight OK. Protected containers are stable.', flush=True)
    print('Private endpoint: http://' + gateway + ':' + str(args.port), flush=True)
    print('Limit: 512 MiB, 0.5 CPU. No existing proxy, package or protected service configuration is edited.', flush=True)
    if not args.apply:
        print('Read-only preflight completed. Use --apply for the separate application.')
        return
    if args.directory.exists() and any(args.directory.iterdir()):
        raise RuntimeError('Destination is not empty; refusing to overwrite files')
    args.directory.mkdir(mode=0o700, exist_ok=True)
    os.chmod(args.directory, 0o700)
    compose = args.directory / 'compose.yml'
    download('compose.yml', compose, COMPOSE_SHA)
    text = compose.read_text()
    binding = '127.0.0.1:${OBHUSH_PORT:-43100}:3000'
    if text.count(binding) != 1:
        raise RuntimeError('Unexpected Compose binding')
    compose.write_text(text.replace(binding, gateway + ':${OBHUSH_PORT:-43100}:3000'))
    archive = args.archive or args.directory / IMAGE_FILE
    if args.archive:
        if digest(archive) != IMAGE_SHA:
            raise RuntimeError('Local image checksum mismatch')
    else:
        print('Downloading the prebuilt image; no compilation on this VPS…', flush=True)
        download(IMAGE_FILE, archive, IMAGE_SHA)
    command(['docker', 'load', '-i', str(archive)], timeout=180)
    image_env = json.loads(command(['docker', 'image', 'inspect', IMAGE]))[0]['Config']['Env']
    if any(v.startswith('LLM_API_KEY=') for v in image_env):
        raise RuntimeError('The image unexpectedly contains a key binding')
    key = '' if args.no_ai else getpass.getpass('OpenRouter key (hidden; Enter = local assistant): ')
    envfile = args.directory / 'runtime.env'
    fd = os.open(envfile, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write('LLM_MODEL=openrouter/free\nLLM_API_KEY=' + key.strip() + '\n')
    key = ''
    env = dict(os.environ, OBHUSH_PORT=str(args.port))
    cli = ['docker', 'compose', '-p', args.project, '-f', str(compose)]
    started = False
    try:
        command(cli + ['config', '--quiet'], env=env)
        started = True
        command(cli + ['up', '-d', '--wait', '--wait-timeout', '60'], env=env, timeout=90)
        rows = json.loads(command(['docker', 'inspect', args.project + '-app-1']))
        host = rows[0]['HostConfig']
        if (host['Memory'] != 512 * 1024 ** 2 or host['MemorySwap'] != 512 * 1024 ** 2
                or host['NanoCpus'] != 500000000 or host['PidsLimit'] != 96 or not host['ReadonlyRootfs']):
            raise RuntimeError('Container resource limits were not applied')
        raw = command(['docker', 'exec', args.proxy, 'wget', '-q', '-T', '5', '-O', '-',
                       'http://' + gateway + ':' + str(args.port) + '/api/health'])
        if json.loads(raw).get('status') != 'ok':
            raise RuntimeError('The existing proxy cannot reach the new private application')
        if protected_snapshot(names) != before:
            raise RuntimeError('Protected container state changed; stopping only OBHUSH')
        manifest = {'project': args.project, 'gateway': gateway, 'port': args.port,
                    'proxy': args.proxy, 'protected': names, 'imageSha256': IMAGE_SHA,
                    'preparedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
        (args.directory / 'prepared.json').write_text(json.dumps(manifest, indent=2))
        print('PRIVATE_READY: application healthy; proxy can reach it; protected containers unchanged.', flush=True)
        print('Shared proxy configuration has NOT been edited. No container of the existing project was restarted.')
    except BaseException:
        if started:
            subprocess.run(cli + ['stop', 'app'], env=env, capture_output=True, timeout=30)
        raise


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as e:
        # Deliberately avoid subprocess output and exception reprs containing tokens.
        print('STOPPED: ' + str(e), file=sys.stderr)
        sys.exit(1)
