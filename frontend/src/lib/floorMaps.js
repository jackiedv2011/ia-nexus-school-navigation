// ─── Floor plan images + blueprint↔image transform ────────────────────────────
// Every route coordinate the backend produces (rooms, corridors, stairwells) is
// expressed in the ORIGINAL annotated blueprint's 2448×1584 pixel space. The
// floor plans the school issued are a redrawn, simplified version of those same
// blueprints at a different scale and crop — same building, same wall positions,
// different image.
//
// Rather than re-deriving hundreds of room coordinates against the new drawings
// (and re-validating the pathfinder against them), each floor carries the
// similarity transform that maps blueprint space onto its image:
//
//     imageX = blueprintX * scale + dx
//     imageY = blueprintY * scale + dy
//
// The numbers come from FFT cross-correlation registration of the new drawing
// against the blueprint it replaced (uniform scale + translation, ink-mask
// correlation), verified by overlaying the two and confirming the walls land on
// each other. Because the transform lives here rather than in the coordinate
// data, roomCoordinates.js and the routing algorithm are untouched — swapping in
// another revision of the plans only means re-running the registration and
// updating these six numbers.
//
// This registers the scanned plan IMAGES against blueprint space. The pin
// picker is what needs it: it turns a tap on one of those images back into a
// blueprint coordinate for the router. Routes themselves are drawn on the 3D
// model (lib/floorScene.js), which is built in blueprint space and so needs no
// image registration at all.
export const FLOOR_MAPS = {
  1: { src: '/maps/floor1.png', w: 1222, h: 681, scale: 0.50118, dx:   -3.5, dy:  -8.7 },
  2: { src: '/maps/floor2.png', w:  873, h: 653, scale: 0.41653, dx:  -76.1, dy:  -1.2 },
  3: { src: '/maps/floor3.png', w:  982, h: 762, scale: 0.49983, dx: -130.5, dy: -11.2 },
};

export const floorMap = (floor) => FLOOR_MAPS[floor] || FLOOR_MAPS[1];

// Blueprint space → this floor plan's own pixels.
export function blueprintToImage([x, y], floor) {
  const m = floorMap(floor);
  return [x * m.scale + m.dx, y * m.scale + m.dy];
}

// This floor plan's own pixels → blueprint space. The exact inverse of the
// above, so a point converted in one direction and back lands where it started.
export function imageToBlueprint([ix, iy], floor) {
  const m = floorMap(floor);
  return [(ix - m.dx) / m.scale, (iy - m.dy) / m.scale];
}
