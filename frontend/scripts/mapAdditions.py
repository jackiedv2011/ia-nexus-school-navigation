"""Things drawn onto the school's floor plans that the issued plans leave out.

The school's simplified plans show the Xchange/Library on floors 2 and 3 as
empty boxes. The blueprint and the owner's own marked-up sketches put
staircases and furniture there: on floor 2, Stairwell 9 (the main staircase)
and Stairwell 10 ("STAIR 9.2" on the blueprint), a small room, seating and
desks; on floor 3, Stairwell 10 again, a walled reading area with couches,
chairs and a table, a desk and a round table. buildMapImages.py draws them
here, in the plan's own line style, onto the upscaled image.

Every position is in the plan's pixel space (FLOOR_MAPS w×h in
src/lib/floorMaps.js), the same space routes, pins and labels use. Their names
("STAIR 9", "STAIR 10") are labels in src/lib/mapLabels.json, drawn as text by
the app like every other label.

These are drawings only: nothing here changes a route. The router's stairwell
landings and hallways live in backend/data/roomCoordinates.js.
"""
import math

from PIL import Image, ImageDraw

INK = (17, 17, 17)

ADDITIONS = {
    '2': [
        # Stairwell 9 — the main staircase, a straight flight (up to the left).
        ('stair_straight', (336.8, 266.8, 371.8, 283.4)),
        # Stairwell 10 — blueprint "STAIR 9.2", two flights with a landing.
        ('stair_switchback', (471.5, 266.8, 500.3, 284.3)),
        # Small room, door on its south wall, two armchairs in front of it.
        ('room', (387.5, 216.5, 409.4, 237.5)),
        ('chair', (379.6, 241.0, 391.0, 257.2), 'left'),
        ('chair', (398.0, 241.0, 409.4, 257.2), 'right'),
        # Couch and a desk for two along the top.
        ('sofa', (434.3, 218.3, 463.2, 227.0), 'top'),
        ('desk', (468.0, 219.2, 493.4, 231.4), 2, 'bottom'),
        # Seating along the east side.
        ('chair', (501.7, 217.8, 508.7, 228.3), 'right'),
        ('sofa', (502.1, 235.3, 510.0, 252.8), 'right'),
        ('chair', (502.1, 258.1, 510.0, 268.6), 'right'),
        ('chair', (503.0, 275.6, 510.8, 287.8), 'right'),
        # Long desk along the south side.
        ('desk', (457.5, 293.5, 504.3, 300.1), 3, 'top'),
    ],
    '3': [
        # Stairwell 10 arriving from floor 2 — two flights with a landing.
        ('stair_switchback', (527.4, 301.6, 572.7, 333.1)),
        # Reading area: walled on three sides, open to the east.
        ('wall', (343.0, 249.0, 454.0, 249.0)),
        ('wall', (343.0, 249.0, 343.0, 357.2)),
        ('wall', (343.0, 357.2, 445.7, 357.2)),
        ('chair', (361.0, 253.3, 371.0, 263.3), 'left'),
        ('chair', (358.6, 270.5, 368.6, 280.5), 'left'),
        ('chair', (359.8, 291.4, 369.8, 301.4), 'left'),
        ('sofa', (357.0, 310.5, 366.5, 347.3), 'left'),
        ('sofa', (384.2, 257.0, 410.8, 266.0), 'top'),
        ('sofa', (415.2, 257.0, 447.7, 266.0), 'top'),
        ('chair', (429.4, 296.2, 439.4, 306.2), 'top'),
        ('table', (390.0, 321.0, 434.5, 339.0), 3),
        # East of it: a desk with its chairs, and a round table just south of
        # the walk from the west door to Stairwell 10 (y≈325), chairs turned away.
        ('desk', (503.8, 247.0, 554.5, 262.0), 2, 'bottom'),
        ('round_table', (500.3, 330.0, 522.5, 350.0), 3),
    ],
}


def draw_additions(img, floor, scale):
    """Draw floor's additions onto img (the plan upscaled by `scale`).
    Drawn at twice the size and scaled down, so the lines are smooth."""
    items = ADDITIONS.get(floor)
    if not items:
        return img
    SS = 2
    k = scale * SS
    big = img.resize((img.width * SS, img.height * SS), Image.LANCZOS)
    d = ImageDraw.Draw(big)
    W = lambda w: max(1, round(w * SS))

    def rect(x1, y1, x2, y2, w=2, fill=(255, 255, 255), r=0):
        if r:
            d.rounded_rectangle([x1, y1, x2, y2], radius=r, outline=INK, width=W(w), fill=fill)
        else:
            d.rectangle([x1, y1, x2, y2], outline=INK, width=W(w), fill=fill)

    def line(p, q, w=2):
        d.line([p, q], fill=INK, width=W(w))

    def arrow(p, q, w=1.5):
        line(p, q, w)
        ang = math.atan2(q[1] - p[1], q[0] - p[0])
        for a in (ang + 2.6, ang - 2.6):
            line(q, (q[0] + W(9) * math.cos(a), q[1] + W(9) * math.sin(a)), w)

    def chair(x1, y1, x2, y2, back='right'):
        s = x2 - x1
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        h, t = s / 2, s * 0.22
        rect(cx - h, cy - h, cx + h, cy + h, r=W(3))
        if back == 'right':
            line((cx + h - t, cy - h), (cx + h - t, cy + h))
        elif back == 'left':
            line((cx - h + t, cy - h), (cx - h + t, cy + h))
        elif back == 'top':
            line((cx - h, cy - h + t), (cx + h, cy - h + t))
        else:
            line((cx - h, cy + h - t), (cx + h, cy + h - t))

    def sofa(x1, y1, x2, y2, back='top'):
        rect(x1, y1, x2, y2, r=W(4))
        if (x2 - x1) >= (y2 - y1):
            bd, arm = (y2 - y1) * 0.28, (y2 - y1) * 0.45
            by = y1 + bd if back == 'top' else y2 - bd
            line((x1, by), (x2, by))
            line((x1 + arm, y1), (x1 + arm, y2))
            line((x2 - arm, y1), (x2 - arm, y2))
            n = max(2, round((x2 - x1 - 2 * arm) / ((y2 - y1) * 1.1)))
            for i in range(1, n):
                xx = x1 + arm + (x2 - x1 - 2 * arm) * i / n
                line((xx, by), (xx, y2 if back == 'top' else y1), 1)
        else:
            bd, arm = (x2 - x1) * 0.28, (x2 - x1) * 0.45
            bx = x2 - bd if back == 'right' else x1 + bd
            line((bx, y1), (bx, y2))
            line((x1, y1 + arm), (x2, y1 + arm))
            line((x1, y2 - arm), (x2, y2 - arm))
            n = max(2, round((y2 - y1 - 2 * arm) / ((x2 - x1) * 1.1)))
            for i in range(1, n):
                yy = y1 + arm + (y2 - y1 - 2 * arm) * i / n
                line((x1 if back == 'right' else bx, yy), (bx if back == 'right' else x2, yy), 1)

    def desk(x1, y1, x2, y2, chairs=1, side='bottom'):
        rect(x1, y1, x2, y2)
        s = max(min(x2 - x1, y2 - y1) * 0.55, 18 * SS)
        for i in range(chairs):
            cx = x1 + (x2 - x1) * (i + 0.5) / chairs
            cy = y2 + s * 0.45 if side == 'bottom' else y1 - s * 0.45
            chair(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, side)

    def wall(x1, y1, x2, y2):
        # a partition the plan's way: two lines with paper between
        t = 1.0 * k
        rect(min(x1, x2) - t, min(y1, y2) - t, max(x1, x2) + t, max(y1, y2) + t, w=1.5)

    def table(x1, y1, x2, y2, per_side=2):
        rect(x1, y1, x2, y2)
        s = 8.5 * k
        for i in range(per_side):
            cx = x1 + (x2 - x1) * (i + 0.5) / per_side
            chair(cx - s / 2, y1 - s * 0.95, cx + s / 2, y1 - s * 0.05, 'top')
            chair(cx - s / 2, y2 + s * 0.05, cx + s / 2, y2 + s * 0.95, 'bottom')

    def round_table(x1, y1, x2, y2, chairs=3):
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        r = min(x2 - x1, y2 - y1) * 0.3
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=INK, width=W(2), fill=(255, 255, 255))
        s = 7.5 * k
        for i in range(chairs):
            a = math.pi / 2 + 2 * math.pi * i / chairs     # first chair to the south
            px, py = cx + (r + s * 0.6) * math.cos(a), cy + (r + s * 0.6) * math.sin(a)
            d.rounded_rectangle([px - s / 2, py - s / 2, px + s / 2, py + s / 2], radius=W(3),
                                outline=INK, width=W(2), fill=(255, 255, 255))

    def room(x1, y1, x2, y2):
        # double-line walls like the plan's rooms; door swung into the room
        rect(x1, y1, x2, y2, w=3)
        rect(x1 + W(5), y1 + W(5), x2 - W(5), y2 - W(5), fill=None)
        dw, dx = (x2 - x1) * 0.38, x1 + (x2 - x1) * 0.18
        d.rectangle([dx, y2 - W(7), dx + dw, y2 + W(2)], fill=(255, 255, 255))
        line((dx, y2 - W(6)), (dx, y2 + W(1)))
        line((dx + dw, y2 - W(6)), (dx + dw, y2 + W(1)))
        line((dx, y2), (dx, y2 - dw))
        d.arc([dx - dw, y2 - dw, dx + dw, y2 + dw], 270, 360, fill=INK, width=W(1))

    def stair_straight(x1, y1, x2, y2):
        rect(x1, y1, x2, y2)
        for i in range(1, 12):
            xx = x1 + (x2 - x1) * i / 12
            line((xx, y1), (xx, y2), 1)
        cy, m = (y1 + y2) / 2, (x2 - x1) * 0.08
        arrow((x2 - m, cy), (x1 + m, cy))
        line((x1 + (x2 - x1) * 0.55, y1), (x1 + (x2 - x1) * 0.45, y2), 1)   # break line

    def stair_switchback(x1, y1, x2, y2):
        rect(x1, y1, x2, y2)
        my, land = (y1 + y2) / 2, (x2 - x1) * 0.28
        line((x1, my), (x2 - land, my))
        line((x2 - land, y1), (x2 - land, y2), 1)
        for i in range(1, 9):
            xx = x1 + (x2 - land - x1) * i / 9
            line((xx, y1), (xx, y2), 1)
        q, m = (y2 - y1) / 4, (x2 - x1) * 0.06
        line((x1 + m, my + q), (x2 - land * 0.5, my + q), 1.5)
        line((x2 - land * 0.5, my + q), (x2 - land * 0.5, my - q), 1.5)
        arrow((x2 - land * 0.5, my - q), (x1 + m, my - q))

    draw = {'chair': chair, 'sofa': sofa, 'desk': desk, 'room': room, 'wall': wall,
            'table': table, 'round_table': round_table,
            'stair_straight': stair_straight, 'stair_switchback': stair_switchback}
    for kind, (x1, y1, x2, y2), *args in items:
        draw[kind](x1 * k, y1 * k, x2 * k, y2 * k, *args)
    return big.resize(img.size, Image.LANCZOS)
