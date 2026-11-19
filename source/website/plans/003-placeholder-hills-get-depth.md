# 003 — Give the placeholder hills the same two-depth parallax as real photos

- **Status**: DONE
- **Commit**: not a git repository (written 2026-10-26)
- **Severity**: MEDIUM
- **Category**: Missed opportunities
- **Estimated scope**: 2 files, ~25 lines

## Problem

`photosSettle()` in `src/components/ScrollMotion.tsx` tilts each `.stay-main` and
`.conference-main` frame up from `rotateX: 7` as it scrolls in. It then eases the
**photo inside** out of `scale: 1.12` over a longer stretch, so the frame and the
picture move at different depths:

```ts
// src/components/ScrollMotion.tsx — current
const img = frame.querySelector("img");
if (img) { gsap.fromTo(img, { scale: 1.12 }, { scale: 1, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: true } }); }
```

Four of Resoria's five frames hold the SVG `Placeholder` instead of an `<img>`. They
get the tilt but not the inner depth layer, so they read as flat cards, unlike WeLand,
where every frame had a photo.

## Target

Each placeholder's four hill layers rise into place at different speeds as the frame
scrolls in: the furthest moves least and the nearest moves most, like a parallax
landscape. They settle once the frame is 30% from the top. Layers only move
**downward from rest**, so a hill's bottom edge (which runs to `H`) never lifts and
uncovers the sky.

- Layer `i` (0 = furthest) starts `y: 14 + i * 16` (SVG user units, viewBox 800×600) and ends at `y: 0`.
- The sun starts `y: 24` and ends at `y: 0`.
- `ease: "none"`, `scrollTrigger: { trigger: frame, start: "top bottom", end: "top 30%", scrub: 0.6 }`.
- Reduced motion: unchanged. `photosSettle` already only runs under `(prefers-reduced-motion: no-preference)`.

## Repo conventions to follow

- All scroll effects live in `ScrollMotion.tsx`, inside the `gsap.matchMedia()` block; extend `photosSettle`, don't add a new component.
- Mark motion hooks with `data-*` attributes, as the hero does with `data-hero-parallax`.

## Steps

1. `src/components/Placeholder.tsx`: on the hills variant, give each `<g key={i}>` the attribute `data-depth={i}`, and the sun `<circle>` the attribute `data-depth-sun`.
2. `src/components/ScrollMotion.tsx`, in `photosSettle`, after the `img` block, add:
   ```ts
   const hills = frame.querySelectorAll<SVGGElement>("[data-depth]");
   hills.forEach((g) => {
     const i = Number(g.dataset.depth);
     gsap.fromTo(g, { y: 14 + i * 16 }, { y: 0, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "top 30%", scrub: 0.6 } });
   });
   const sun = frame.querySelector("[data-depth-sun]");
   if (sun) gsap.fromTo(sun, { y: 24 }, { y: 0, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "top 30%", scrub: 0.6 } });
   ```
3. Update the header comment's `photos` line: "big photos (and the placeholder hills, layer by layer) stand up from a slight tilt as they come into view".

## Boundaries

- Do NOT change the map variant of `Placeholder`.
- Do NOT animate anything when reduced motion is on.

## Verification

- **Mechanical**: `npx tsc --noEmit`; `npm run build`.
- **Feel check**: scroll to "The Waterfall Suites". The frame stands up from its tilt while the hills inside slide up into place, the nearest fastest. No sky shows below the front hill at any point. Slow it down (DevTools → Animations at 10%) and confirm the layers move at different speeds.
- **Done when**: every placeholder frame shows layered motion, and reduced motion shows the same still art as before.
