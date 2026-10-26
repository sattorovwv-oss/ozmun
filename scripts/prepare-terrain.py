"""Build an offline terrain mesh from public AWS Terrain Tiles (Terrarium).

Elevation attribution: Mapzen/AWS Terrain Tiles, underlying SRTM and other sources.
https://github.com/tilezen/joerd/blob/master/docs/attribution.md
River routing is an explicitly schematic connecting line, not surveyed geometry.
"""
import concurrent.futures
import datetime
import io
import json
import math
import pathlib
import urllib.request
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
PUBLIC.mkdir(exist_ok=True)
B = [68.85, 38.15, 72.15, 40.35]
Z, N, M = 8, 192, 160

def tilepos(lon, lat):
    return (lon + 180) / 360 * 2**Z, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 2**Z

left, bottom = tilepos(B[0], B[1])
right, top = tilepos(B[2], B[3])
coords = [(x,y) for x in range(int(left), int(right)+1) for y in range(int(top), int(bottom)+1)]

def download(c):
    x,y=c
    url=f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{Z}/{x}/{y}.png'
    with urllib.request.urlopen(url, timeout=35) as r:
        image=Image.open(io.BytesIO(r.read())).convert('RGB')
    return c,image

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    tiles=dict(pool.map(download,coords))

heights=[]
for row in range(M):
    lat=B[3] - row/(M-1)*(B[3]-B[1])
    for col in range(N):
        lon=B[0]+col/(N-1)*(B[2]-B[0])
        tx,ty=tilepos(lon,lat)
        r,g,b=tiles[(int(tx),int(ty))].getpixel((min(255,int(tx%1*256)),min(255,int(ty%1*256))))
        heights.append(round(r*256+g+b/256-32768))

payload={
    'bounds':B,'width':N,'height':M,'elevations':heights,
    'source':'AWS Terrain Tiles / Mapzen, SRTM and other elevation sources',
    'sourceUrl':'https://registry.opendata.aws/terrain-tiles/',
    'attributionUrl':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
    'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'verticalExaggeration':1.65,
}
(PUBLIC/'terrain.json').write_text(json.dumps(payload,separators=(',',':')))
print(f'Terrain: {N} x {M}, {min(heights)}–{max(heights)} m; {len(tiles)} source tiles')

geography={
 'routeKind':'schematic',
 'routeDescription':'Approximate river-system connecting line for orientation only; not surveyed river geometry or a basin boundary.',
 'river':[[71.95,39.45],[71.55,39.38],[71.12,39.22],[70.75,39.13],[70.43,39.08],[70.19,38.99],[70.05,38.86],[69.90,38.77],[69.78,38.69],[69.69,38.62],[69.57,38.57],[69.46,38.51],[69.43,38.44],[69.35,38.37],[69.25,38.30],[69.17,38.18]],
 'points':[
   {'id':'nurek','name':'Нурекская ГЭС','nameTj':'НБО-и Норак','lon':69.3486,'lat':38.3719,'kind':'dam'},
   {'id':'rogun','name':'Рогунская ГЭС','nameTj':'НБО-и Роғун','lon':69.7736,'lat':38.6844,'kind':'dam'},
   {'id':'garm','name':'Рашт','nameTj':'Рашт','lon':70.383,'lat':39.028,'kind':'weather'},
   {'id':'upper','name':'Верховья','nameTj':'Болооб','lon':71.2,'lat':39.4,'kind':'weather'},
 ],
 'country':'Таджикистан',
}
(PUBLIC/'geography.json').write_text(json.dumps(geography,ensure_ascii=False,separators=(',',':')))
