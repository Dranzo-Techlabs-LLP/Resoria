# Animation plans — Resoria website

Audit of `source/website` against WeLand's motion (`C:\WeLand\website`). Resoria
already carries every WeLand effect: the WebGL "in the mist" flight, the hero's
scroll and cursor parallax, the tilt-up photo frames and the card reveals. These plans
fit them to Resoria's one photo and its placeholder art.

| # | Plan | Severity | Status |
|---|------|----------|--------|
| 001 | [Make the mist's last line match what the camera shows](001-mist-copy-matches-the-camera.md) | HIGH | DONE |
| 002 | [Re-fit the fog's heightfield to the Resoria photo](002-fog-heightfield-for-the-villa-photo.md) | MEDIUM | DONE |
| 003 | [Give the placeholder hills the same two-depth parallax](003-placeholder-hills-get-depth.md) | MEDIUM | DONE |

Order: 001 → 002 → 003. They're independent; 001 and 002 both concern the mist, so
feel-check them together.

Not a code finding: every effect is gated on `prefers-reduced-motion: no-preference`.
With Windows' Settings → Accessibility → Visual effects → **Animation effects** off,
browsers report reduced motion, and the whole page (WeLand's too) shows its still
version. That's by design.
