"""Builds the Route Finder's floor plan images: public/maps/floor{1,2,3}.png.

The plans the school issued (maps-src/) are small — 873 to 1222 px wide — with
their room numbers baked in at about 8 px tall. Shown at phone or desktop size
those numbers blur, and no amount of CSS can sharpen pixels that aren't there.
So the app draws every label itself as real text (src/lib/mapLabels.json →
components/MapLabels.jsx), and the images it serves are the plans with their
printed labels erased and the line work upscaled 3× and re-sharpened.

Anything the issued plans leave out — floor 2's library staircases and
furniture — is drawn on afterwards by mapAdditions.py.

It also measures the room each label sits in (the closed white box around it
on the plan) and writes the largest font size that still fits inside as `fit`
in mapLabels.json, so a label never spills over its room's walls however small
the map is drawn. Everything else in that file is hand-checked and left alone.

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
from PIL import Image, ImageFont
from scipy import ndimage

from mapAdditions import draw_additions

ROOT = Path(__file__).resolve().parent.parent
SCALE = 3          # must match MAP_IMAGE_SCALE in src/lib/floorMaps.js

LABELS_FILE = ROOT / 'src/lib/mapLabels.json'
labels = json.loads(LABELS_FILE.read_text())

# MapLabels draws in Arial at weight 600 (Arial has no semibold, so bold),
# with letter-spacing 0.01em and line-height 1.12.
FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 200)
def text_em(line):
    return FONT.getlength(line) / 200 + 0.01 * len(line)

def fit_size(lab, box):
    """Largest font size (plan px) at which the label sits inside its room
    with a little paper showing around it."""
    x1, y1, x2, y2 = box
    lines = lab.get('lines') or [lab['text']]
    w = max(text_em(t) for t in lines)
    h = 1.12 * len(lines)
    return round(min((x2 - x1) * 0.84 / w, (y2 - y1) * 0.78 / h), 1)

for floor in ('1', '2', '3'):
    src = Image.open(ROOT / f'maps-src/floor{floor}.png').convert('RGB')
    a = np.asarray(src).copy()

    # Erase each printed label (and the spell-check squiggles and link
    # underlines the export left under some of them) — the app draws its own.
    for lab in labels[floor]:
        for x1, y1, x2, y2 in lab['erase']:
            a[max(0, round(y1)):round(y2), max(0, round(x1)):round(x2)] = 255

    # Each label's room: the connected patch of paper under its centre. One that
    # spreads over most of the sheet is outdoors, not a room — no limit then.
    paper, _ = ndimage.label(a.mean(axis=2) > 200)
    H, W = paper.shape
    for lab in labels[floor]:
        lab.pop('fit', None)
        if 'room' in lab:        # a label placed beside the furniture, not centred in its room
            lab['fit'] = fit_size(lab, lab['room'])
            continue
        k = paper[round(lab['y']), round(lab['x'])]
        if not k:
            continue
        ys, xs = np.nonzero(paper == k)
        box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        if (box[2] - box[0]) > W * 0.7 and (box[3] - box[1]) > H * 0.7:
            continue
        lab['fit'] = fit_size(lab, box)

    big = Image.fromarray(a).resize((src.width * SCALE, src.height * SCALE), Image.LANCZOS)
    # Lanczos leaves the line work grey and soft; a contrast curve pulls the
    # anti-aliased edges back to near-black lines on white paper.
    x = np.asarray(big).astype(np.float32)
    x = np.clip((x - 60) / (235 - 60), 0, 1) * 255
    # Then whatever the issued plan leaves out (the library's stairs and
    # furniture on floor 2 — see mapAdditions.py), at full resolution.
    img = draw_additions(Image.fromarray(x.astype(np.uint8)), floor, SCALE)
    out = ROOT / f'public/maps/floor{floor}.png'
    img.convert('L').save(out, optimize=True)

    if shutil.which('pngquant'):
        subprocess.run(['pngquant', '--force', '--skip-if-larger', '--quality=80-100',
                        '--speed=1', '--ext=.png', '16', str(out)], check=False)
    if shutil.which('oxipng'):
        subprocess.run(['oxipng', '-o', '4', '--strip', 'safe', '-q', str(out)], check=True)
    print(out.relative_to(ROOT), Image.open(out).size, f'{out.stat().st_size // 1024} KB')

# Same layout as the hand-edited file: one label per line.
LABELS_FILE.write_text('{\n' + ',\n'.join(
    f' "{floor}": [\n' + ',\n'.join('  ' + json.dumps(l, ensure_ascii=False) for l in floor_labels) + '\n ]'
    for floor, floor_labels in labels.items()) + '\n}\n')
