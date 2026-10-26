#!/usr/bin/env bash
# Read-only inventory. Never install, restart, reload, prune or alter services.
# Never print process arguments, environments, application logs or secrets.
set -u
export LC_ALL=C

section() { printf '\n[%s]\n' "$1"; }
available() { command -v "$1" >/dev/null 2>&1; }

section timestamp
date -u '+%Y-%m-%dT%H:%M:%SZ'
section platform
uname -srm
getconf _NPROCESSORS_ONLN 2>/dev/null || true
section load
uptime
section memory
if available free; then free -m; else head -n 6 /proc/meminfo; fi
section local_disks
if available timeout; then timeout 5 df -hPl; else df -hPl; fi
section short_cpu_sample
if available vmstat; then vmstat 1 3; else printf 'vmstat unavailable\n'; fi
section largest_processes_without_arguments
ps -eo pid,user,comm,pcpu,pmem,rss --sort=-rss | head -n 16
section tcp_listeners
if available ss; then ss -H -lntp; else printf 'ss unavailable\n'; fi
section running_service_names
if available systemctl; then systemctl list-units --type=service --state=running --no-pager --plain 2>/dev/null; fi
section existing_container_runtime
if available docker; then
  docker version --format 'server={{.Server.Version}}' 2>/dev/null || true
  docker info --format 'cgroup={{.CgroupDriver}} version={{.CgroupVersion}} cpus={{.NCPU}} memory_bytes={{.MemTotal}}' 2>/dev/null || true
  docker ps --format 'name={{.Names}} image={{.Image}} status={{.Status}} ports={{.Ports}}' 2>/dev/null || true
  docker stats --no-stream --format 'name={{.Name}} cpu={{.CPUPerc}} memory={{.MemUsage}} pids={{.PIDs}}' 2>/dev/null || true
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    docker inspect --format 'name={{.Name}} memory_limit={{.HostConfig.Memory}} nano_cpus={{.HostConfig.NanoCpus}} restarts={{.RestartCount}}' "$id" 2>/dev/null || true
  done < <(docker ps -q 2>/dev/null)
else
  printf 'Docker not installed; do not install it during this audit.\n'
fi
section existing_pm2_and_proxy_metadata
if available python3; then
  python3 - <<'PY'
import json, pathlib, re
dump=pathlib.Path.home()/'.pm2/dump.pm2'
if dump.is_file():
    try:
        processes=json.loads(dump.read_text())
        for p in processes:
            e=p.get('pm2_env',p)
            print('pm2_name='+str(e.get('name','unknown'))+' mode='+str(e.get('exec_mode','unknown'))+' saved_status='+str(e.get('status','unknown')))
    except (OSError,ValueError,TypeError):
        print('PM2 saved metadata unreadable; do not assume it is absent.')
else:
    print('No PM2 dump in this user home; other users may still run PM2.')
paths=list(pathlib.Path('/etc/nginx/sites-enabled').glob('*'))+list(pathlib.Path('/etc/nginx/conf.d').glob('*.conf'))
for p in paths:
    try:
        if not p.is_file(): continue
        for line in p.read_text().splitlines():
            m=re.match(r'^\s*(server_name|listen)\s+([^;]+);',line)
            if m: print('proxy_config='+p.name+' '+m.group(1)+'='+m.group(2))
    except (OSError,UnicodeError):
        print('Unreadable proxy config: '+p.name)
PY
else
  printf 'Python3 unavailable; proxy and PM2 details require separate read-only inspection.\n'
fi
section completed
printf 'Read-only audit completed. No production change is authorized by this report alone.\n'
