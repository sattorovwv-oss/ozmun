"""Render the retained real elevation grid as a locally available relief map.

No risk zones or live snow cover are inferred from this raster.
"""
import json
import math
from pathlib import Path
from PIL import Image, ImageFilter

root = Path(__file__).resolve().parent.parent
terrain = json.loads((root / 'public/terrain.json').read_text())
w, h = terrain['width'], terrain['height']
values = terrain['elevations']
stops = [(0, (210, 222, 201)), (1600, (220, 230, 211)), (2800, (231, 233, 218)),
         (4000, (235, 232, 219)), (5400, (236, 235, 228)), (7000, (252, 253, 250))]
pixels = []
for y in range(h):
    for x in range(w):
        z = values[y * w + x]
        for (a, ca), (b, cb) in zip(stops, stops[1:]):
            if a <= z <= b:
                t = (z - a) / (b - a)
                base = [ca[i] * (1 - t) + cb[i] * t for i in range(3)]
                break
        else:
            base = list(stops[-1][1])
        dx = (values[y * w + min(x+1, w-1)] - values[y * w + max(x-1, 0)]) / 1350
        dy = (values[min(y+1, h-1) * w + x] - values[max(y-1, 0) * w + x]) / 1350
        light = (-dx * -.55 - dy * -.7 + .7) / math.sqrt(dx*dx + dy*dy + 1)
        factor = .79 + max(-.25, min(.65, light)) * .32
        pixels.append(tuple(max(0, min(255, round(c * factor))) for c in base))
image = Image.new('RGB', (w, h))
image.putdata(pixels)
image = image.resize((1536, 1280), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.2))
image.save(root / 'public/relief.webp', 'WEBP', quality=90, method=6)
print('Real elevation relief rendered:', (root / 'public/relief.webp').stat().st_size, 'bytes')
