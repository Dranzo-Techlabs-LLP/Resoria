"""Flow map for the waterfall in resort-dusk.jpg (and its waterfall-view.jpg crop).

Channels (all 0..255):
  R  water: where the falls are, feathered at the edges, never over the trees
  G  spray: the mist thrown up where the water lands
  B  where across the falls this is: signed distance from the centre line,
     128 = on it, 1 step = 0.25px (+-32px), so the strands follow the curve

Run:  python -I make_flow_map.py <resort-dusk.jpg> <out dir>
"""
import sys

import numpy as np
from PIL import Image, ImageFilter

src, out = sys.argv[1], sys.argv[2]
photo = Image.open(src).convert("RGB")
W, H = photo.size
a = np.asarray(photo).astype(np.float32)

# The falls' centre line (photo pixels, top to bottom) and half-width there.
path = [
    (95, 262, 7),
    (101, 276, 9),
    (108, 292, 10),
    (114, 312, 11),
    (118, 334, 12),
    (126, 352, 13),
    (133, 372, 13),
    (138, 392, 13),
    (140, 412, 13),
    (142, 432, 14),
    (146, 452, 16),
]

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
water = np.zeros((H, W), np.float32)
across = np.zeros((H, W), np.float32)
nearest = np.full((H, W), np.inf, np.float32)
for (x0, y0, w0), (x1, y1, w1) in zip(path, path[1:]):
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy
    t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / L2, 0, 1)
    px, py = x0 + t * dx, y0 + t * dy
    d = np.hypot(xx - px, yy - py)
    half = w0 + (w1 - w0) * t
    m = np.clip(1.0 - (d - half * 0.55) / (half * 0.6), 0, 1)
    water = np.maximum(water, m)
    # signed distance to the centre line: positive to the right of the flow
    side = np.sign((xx - px) * dy - (yy - py) * dx)
    closer = d < nearest
    nearest = np.where(closer, d, nearest)
    across = np.where(closer, side * d, across)

# fade in at the lip and out into the spray at the foot
water *= np.clip((yy - 258) / 10, 0, 1) * np.clip((470 - yy) / 26, 0, 1)

# keep the water off the trees in front (green, darker than the mist)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
luma = 0.299 * r + 0.587 * g + 0.114 * b
tree = ((g - (r + b) / 2 > 9) & (luma < 120)).astype(np.float32)
tree = np.asarray(Image.fromarray((tree * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.5))) / 255
water *= 1 - np.clip(tree * 1.4, 0, 1)

# spray: a soft cloud where the water lands, rising and spreading
spray = np.exp(-(((xx - 146) / 34) ** 2 + ((yy - 448) / 30) ** 2))
spray += 0.6 * np.exp(-(((xx - 150) / 46) ** 2 + ((yy - 418) / 44) ** 2))
spray = np.clip(spray, 0, 1) * (1 - np.clip(tree * 1.2, 0, 1) * 0.6)

def smooth(m, radius):
    img = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(radius))).astype(np.float32) / 255

water = smooth(water, 1.2)
spray = smooth(spray, 4)
across_b = np.clip(0.5 + across / 64.0, 0, 1)

rgb = np.stack([water, spray, across_b], -1)
full = Image.fromarray((rgb * 255).round().astype(np.uint8), "RGB")
full.save(f"{out}/resort-dusk-flow.png", optimize=True)
# the suites' photo is this crop of the same picture
full.crop((0, 165, 368, 441)).save(f"{out}/waterfall-view-flow.png", optimize=True)

# a check image: the water in red, the spray in green, over the photo
check = (a * 0.6 + np.stack([water * 255, spray * 200, np.zeros_like(water)], -1) * 0.6).clip(0, 255)
Image.fromarray(check.astype(np.uint8)).crop((40, 220, 220, 520)).resize((360, 600)).save(f"{out}/_flow_check.png")
print("ok", W, H)
