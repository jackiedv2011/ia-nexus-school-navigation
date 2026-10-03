/* Scale shared by every part of the 3D model. The router measures in
   blueprint px; the scene draws in world units; doors, windows and
   railings are modelled in metres. Kept apart from floorScene.js so the texture and prop modules can
   use it without importing the whole scene. */

export const M_PER_PX = 140 / 2448;  // the scale the router measures in
export const S = 0.028;              // blueprint px -> world units
export const PXM = 1 / M_PER_PX;     // blueprint px per metre (≈17.5)
export const UM = S * PXM;           // world units per metre (≈0.49)
export const WALL_H = 1.5;           // world units, floor to ceiling
export const WALL_M = WALL_H / UM;   // ≈3.06 m, a normal school ceiling
export const FY = 0.06;              // top of every floor surface
