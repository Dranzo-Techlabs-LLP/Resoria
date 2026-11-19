# 001 — Make the mist's last line match what the camera shows

- **Status**: DONE
- **Commit**: not a git repository (written 2026-10-26)
- **Severity**: HIGH
- **Category**: Purpose & frequency
- **Estimated scope**: 1 file, 1 line

## Problem

The "in the mist" section (`src/components/mist/MistSection.tsx`) zooms the photo by
`ZOOM = 0.14` about `RESORT_IN_PHOTO = { x: 0.69, y: 0.5 }`, the villa. Its closing
line promises the waterfall:

```ts
// src/lib/content.ts:157 — current
"and the waterfall comes back *into view.*",
```

The waterfall sits at x ≈ 0.08–0.15 of the photo. On a 1440×900 screen the zoom about
x = 0.69 pushes it to the far left edge (0–100px), where the fog is still thickest. On a
375×812 phone the cover crop shows only x ≈ 0.40–0.73 of the photo, so the waterfall is
never on screen. The motion ends on the villa, and the line names something the viewer
can't see. That gap shows up at the payoff moment of the page's one big effect.

## Target

The line names what the motion reveals, on every aspect ratio:

```ts
// src/lib/content.ts:157 — target
"and Resoria comes back *into view.*",
```

The `Resoria Evora` label (pinned to the villa at progress 0.82) then confirms the line.

## Repo conventions to follow

- All copy lives in `src/lib/content.ts`; `*…*` marks the words set in italics (`withEmphasis` in `MistSection.tsx`).

## Steps

1. In `src/lib/content.ts`, replace `"and the waterfall comes back *into view.*",` with `"and Resoria comes back *into view.*",`.

## Boundaries

- Do NOT change `ZOOM`, `PHOTO_POSITION` or `RESORT_IN_PHOTO`.
- Do NOT touch the timeline in `MistSection.tsx`.

## Verification

- **Mechanical**: `npx tsc --noEmit` passes; `npm run build` succeeds.
- **Feel check**: with reduced motion off, scroll through the section at 1440×900 and at 375×812. The third line appears as the villa clears, and the label lands on the villa a beat later.
- **Done when**: the third beat reads "and Resoria comes back *into view.*".
