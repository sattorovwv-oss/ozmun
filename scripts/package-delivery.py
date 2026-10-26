"""Package source and presentation artifacts, never runtime secrets or images."""
from pathlib import Path
import os
import re
import zipfile

root = Path(__file__).resolve().parents[1]
destination = root.parent / 'obhush-project.zip'
excluded_dirs = {'.git', 'node_modules', 'dist', 'playwright-report', 'test-results', '__pycache__'}
excluded_paths = {'deploy/runtime.env', 'deploy/known_hosts', 'deploy/.env'}
known_secrets = []
env = root / '.env'
if env.exists():
    for line in env.read_text().splitlines():
        if line.startswith('LLM_API_KEY=') and line.split('=', 1)[1].strip():
            known_secrets.append(line.split('=', 1)[1].strip().encode())

files = []
for current, dirs, names in os.walk(root):
    dirs[:] = [d for d in dirs if d not in excluded_dirs and not (Path(current) == root / 'data' and d == 'runtime')]
    for name in names:
        path = Path(current) / name
        relative = path.relative_to(root).as_posix()
        if relative in excluded_paths:
            continue
        if (name == '.env' or name.startswith('.env.') or name.endswith('.env')) and name != '.env.example':
            continue
        if name.endswith(('.log', '.tar', '.tar.gz', '.tar.gz.sha256', '.zip', '.pem', '.key')):
            continue
        content = path.read_bytes()
        if any(secret in content for secret in known_secrets) or re.search(rb'sk-or-v1-[a-fA-F0-9]{64}', content):
            raise SystemExit('Packaging stopped: credential-like content found in a deliverable file.')
        files.append((relative, content))

with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative, content in sorted(files):
        archive.writestr('obhush/' + relative, content)
with zipfile.ZipFile(destination) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Archive integrity check failed.')
print(f'Verified source delivery: {len(files)} files, {destination.stat().st_size} bytes. Secrets and Docker image archives excluded.')
