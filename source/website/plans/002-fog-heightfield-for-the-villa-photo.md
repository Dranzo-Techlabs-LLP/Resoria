# 002 — Re-fit the fog's heightfield and lighting notes to the Resoria photo

- **Status**: DONE
- **Commit**: not a git repository (written 2026-10-26)
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file, ~10 lines

## Problem

`src/components/mist/cloudShader.ts` was written for WeLand's top-down aerial photo.
`ground()` raises the land around WeLand's hilltop and says nothing about this photo's
foreground. Its comments still describe "blue-hour skylight":

```glsl
// src/components/mist/cloudShader.ts:53 — current
float ground(vec2 q) {
  float tilt = 0.45 + 0.6 * (q.x - 0.45) + 0.5 * (q.y - 0.35);
  vec2 r = q - vec2(0.62, 0.48);
  float hill = 0.5 * exp(-(r.x * r.x / 0.06 + r.y * r.y / 0.08));
  return 0.34 * clamp(tilt + hill, 0.0, 1.1);
}
```

In the Resoria photo (an eye-level view), the villa's glass room is at about (0.68, 0.58),
and the pool and terrace fill the bottom edge. The fog should leave the villa and the
pool first. It should linger longest in the valley at the top left, around the waterfall,
which is where it settles in the photo itself.

## Target

```glsl
// target
// Roughly how high the land stands under each point of the photo (x right,
// y down). The photo is taken at eye level, so "high" means near: the villa
// and the pool in front clear first; the valley and the falls behind, at the
// top left, keep the fog longest.
float ground(vec2 q) {
  float tilt = 0.4 + 0.55 * (q.x - 0.45) + 0.7 * (q.y - 0.4);
  vec2 r = q - vec2(0.68, 0.58);
  float villa = 0.55 * exp(-(r.x * r.x / 0.05 + r.y * r.y / 0.07));
  return 0.34 * clamp(tilt + villa, 0.0, 1.1);
}
```

Lighting comment: replace "blue-hour skylight … darkens to blue-grey" with "warm, misty
dusk light, soft and from above, so the fog's top is bright and it darkens to green-grey
inside and in its hollows". `LIT` and `SHADE` already have these values; leave them.

## Steps

1. Replace the `ground()` function and the comment above it with the target block.
2. Update lines 15–16 of the header comment as described.

## Boundaries

- Do NOT change `SIGMA`, `LEVEL_START`, `LEVEL_END`, `STEPS` or the march loop.

## Verification

- **Mechanical**: `npm run build` succeeds (the shader is a string, so it compiles in the browser; check the console for `CloudCanvas` errors).
- **Feel check**: reduced motion off, 1440×900. Scroll the section slowly. At about 45% progress the villa should be clear while the top left is still white. At the end, fog lies only in the valley behind. If the villa clears later than before, the bump is in the wrong place: re-check the photo coordinates.
- **Done when**: the console shows no shader errors, and the villa clears before the valley.
