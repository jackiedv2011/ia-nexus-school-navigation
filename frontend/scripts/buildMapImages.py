"""Builds the Route Finder's floor plan images: public/maps/floor{1,2,3}.png.

The plans the school issued (maps-src/) are small — 873 to 1222 px wide — with
their room numbers baked in at about 8 px tall. Shown at phone or desktop size
those numbers blur, and no amount of CSS can sharpen pixels that aren't there.
So the app draws every label itself as real text (src/lib/mapLabels.json →
components/MapLabels.jsx), and the images it serves are the plans with their
printed labels erased and the line work upscaled 3× and re-sharpened.

The images stay in the plans' own coordinate space: FLOOR_MAPS (lib/floorMaps.js)
still gives each plan's ORIGINAL width and height, and every route, pin and
label is positioned in those units. Only the pixel density of the file changes,
so the blueprint→plan transform and everything built on it are untouched.

    python3 scripts/buildMapImages.py      (needs Pillow + numpy; uses pngquant
                                            and oxipng when installed)
"""
import json
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SCALE = 3          # must match MAP_IMAGE_SCALE in src/lib/floorMaps.js

labels = json.loads((ROOT / 'src/lib/mapLabels.json').read_text())

for floor in ('1', '2', '3'):
    src = Image.open(ROOT / f'maps-src/floor{floor}.png').convert('RGB')
    a = np.asarray(src).copy()

    # Erase each printed label (and the spell-check squiggles and link
    # underlines the export left under some of them) — the app draws its own.
    for lab in labels[floor]:
        for x1, y1, x2, y2 in lab['erase']:
            a[max(0, round(y1)):round(y2), max(0, round(x1)):round(x2)] = 255

    big = Image.fromarray(a).resize((src.width * SCALE, src.height * SCALE), Image.LANCZOS)
    # Lanczos leaves the line work grey and soft; a contrast curve pulls the
    # anti-aliased edges back to near-black lines on white paper.
    x = np.asarray(big).astype(np.float32)
    x = np.clip((x - 60) / (235 - 60), 0, 1) * 255
    out = ROOT / f'public/maps/floor{floor}.png'
    Image.fromarray(x.astype(np.uint8)).convert('L').save(out, optimize=True)

    if shutil.which('pngquant'):
        subprocess.run(['pngquant', '--force', '--skip-if-larger', '--quality=80-100',
                        '--speed=1', '--ext=.png', '16', str(out)], check=False)
    if shutil.which('oxipng'):
        subprocess.run(['oxipng', '-o', '4', '--strip', 'safe', '-q', str(out)], check=True)
    print(out.relative_to(ROOT), Image.open(out).size, f'{out.stat().st_size // 1024} KB')
