"""Fault-injection checks for interrupted and resumed update downloads. No VPS required."""
import importlib.util,hashlib,tempfile,threading,http.server,socketserver,socket,sys
sys.dont_write_bytecode=True
from pathlib import Path
spec=importlib.util.spec_from_file_location('updater',str(Path(__file__).resolve().parents[1]/'deploy/update_vps.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
data=(b'OBHUSH-media-update-fixture-'*120000)
expected=hashlib.sha256(data).hexdigest();requests=[]
class H(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  requests.append((self.path,self.headers.get('Range')))
  offset=int(self.headers.get('Range','bytes=0-').split('=')[1].split('-')[0])
  if self.path=='/ignore-range':offset=0
  self.send_response(206 if offset else 200)
  if offset:self.send_header('Content-Range',f'bytes {offset}-{len(data)-1}/{len(data)}')
  self.send_header('Content-Length',str(len(data)-offset));self.end_headers()
  if self.path=='/interrupt' and sum(p=='/interrupt' for p,_ in requests)==1:
   self.wfile.write(data[:1400000]);self.wfile.flush();self.connection.shutdown(socket.SHUT_RDWR);self.connection.close()
  else:self.wfile.write(data[offset:])
class S(socketserver.ThreadingTCPServer):allow_reuse_address=True
server=S(('127.0.0.1',0),H);threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_address[1]}'
try:
 with tempfile.TemporaryDirectory(dir='/tmp') as td:
  for name in ['resume','ignore-range','interrupt','complete']:
   target=Path(td)/(name+'.gz');part=target.with_suffix('.gz.part')
   if name in ['resume','ignore-range']:part.write_bytes(data[:123456])
   if name=='complete':part.write_bytes(data)
   m.download(base+'/'+name,target,expected)
   assert target.read_bytes()==data and not part.exists()
   print(name,'passed')
  assert ('/resume','bytes=123456-') in requests
  assert any(p=='/interrupt' and r and r!='bytes=0-' for p,r in requests)
  assert not any(p=='/complete' for p,_ in requests)
  target=Path(td)/'symlink.gz';part=target.with_suffix('.gz.part');part.symlink_to(Path(td)/'resume.gz')
  try:m.download(base+'/resume',target,expected)
  except RuntimeError:print('symlink rejected')
  else:raise AssertionError('symlink accepted')
finally:server.shutdown();server.server_close()
print('Interrupted download, retained partial, ignored Range, completed partial and symlink protection verified.')
