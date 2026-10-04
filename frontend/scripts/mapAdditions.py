"""Things drawn onto the school's floor plans that the issued plans leave out.

The school's simplified floor 2 plan shows the Xchange/Library as one empty box.
The blueprint (and the owner's own marked-up sketch) has two staircases in it —
Stairwell 9, the main staircase, and Stairwell 10 ("STAIR 9.2" on the
blueprint) — plus a small room, seating and desks. buildMapImages.py draws them
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

    draw = {'chair': chair, 'sofa': sofa, 'desk': desk, 'room': room,
            'stair_straight': stair_straight, 'stair_switchback': stair_switchback}
    for kind, (x1, y1, x2, y2), *args in items:
        draw[kind](x1 * k, y1 * k, x2 * k, y2 * k, *args)
    return big.resize(img.size, Image.LANCZOS)
