#!/usr/bin/env python3
"""Pictures for the season themes, computed on the PC: tv/launcher/bg/*.webp (committed, about 0.5 MB in all).

    pip install numpy pillow ; python3 tools/make-season-backgrounds.py

Why pictures and not CSS: soft light, real depth-of-field flakes and grain look like a photo only when they are computed
(blur, additive light), which the TV's Chromium 53 cannot do live. The TV only slides these pictures (transform), so it costs
almost nothing. Fixed seeds: every run gives the same files.

Noël = a calm blue night (noel-base.webp, full screen) and three layers of snow (snow-far/mid/near.webp, transparent,
half resolution, shown twice as big: the flakes are soft anyway, and it keeps the decoded size at 2 MB per layer).
Each snow picture wraps vertically, so a layer two pictures tall that slides down by one picture loops without a seam.
"""
import os, random
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tv', 'launcher', 'bg')


def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def base(path, W=1920, H=1080):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); t = yy / (H - 1)
    stops = [(0, '#03060d'), (.25, '#081428'), (.38, '#0d1f3a'), (.52, '#060d1a'), (1, '#030509')]
    img = np.zeros((H, W, 3), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1); u = np.clip((t - p0) / (p1 - p0), 0, 1); u = u * u * (3 - 2 * u)
        c = hexc(c0) * (1 - u[..., None]) + hexc(c1) * u[..., None]; img[m] = c[m]
    def glow(cx, cy, rx, ry, col, k):
        img[:] += hexc(col) * (np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)) * k)[..., None]
    glow(960, -120, 1100, 520, '#7fa6e8', .12)       # cold light from above
    glow(960, 360, 900, 80, '#ffb870', .06)          # a faint warm line far away behind the clock
    img += np.random.default_rng(12).standard_normal((H, W, 1)).astype(np.float32) * .007   # grain: no banding on the OLED
    Image.fromarray((np.clip(img, 0, 1) * 255 + .5).astype(np.uint8)).save(path, 'WEBP', quality=90, method=6)


def snow(path, n, rmin, rmax, amin, amax, blur, seed, xpick=None, W=960, H=540):
    """Transparent tile of white flakes (alpha only matters). Flakes near the top/bottom edge are drawn twice so the tile wraps."""
    r = random.Random(seed); a = np.zeros((H, W), np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    k = 0
    while k < n:
        x = r.uniform(0, W); y = r.uniform(0, H)
        if xpick and not xpick(x / W, r): continue
        k += 1; rad = rmin + (rmax - rmin) * r.random() ** 2; al = r.uniform(amin, amax)
        for oy in (-H, 0, H):
            cy = y + oy
            if cy + rad + 2 < 0 or cy - rad - 2 > H: continue
            y0, y1, x0, x1 = int(max(0, cy - rad - 2)), int(min(H, cy + rad + 3)), int(max(0, x - rad - 2)), int(min(W, x + rad + 3))
            d = np.sqrt((xx[y0:y1, x0:x1] - x) ** 2 + (yy[y0:y1, x0:x1] - cy) ** 2)
            a[y0:y1, x0:x1] = np.maximum(a[y0:y1, x0:x1], np.clip(rad + .8 - d, 0, 1) * al)
    if blur:  # blur with wrap: pad top/bottom, blur, crop
        pad = int(blur * 3) + 2
        big = np.concatenate([a[-pad:], a, a[:pad]])
        big = np.asarray(Image.fromarray((big * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)), np.float32) / 255
        a = big[pad:pad + H]
    rgba = np.zeros((H, W, 4), np.uint8); rgba[..., :3] = 255; rgba[..., 3] = (np.clip(a, 0, 1) * 255 + .5).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(path, 'WEBP', quality=92, method=6)


os.makedirs(OUT, exist_ok=True)
base(os.path.join(OUT, 'noel-base.webp'))
# far: tiny, faint, everywhere (the only flakes behind the app rows that you notice are these)
snow(os.path.join(OUT, 'snow-far.webp'), 420, .5, 1.1, .25, .65, .3, 1)
# mid: small soft flakes, everywhere but sparse
snow(os.path.join(OUT, 'snow-mid.webp'), 70, 1.6, 3.0, .25, .55, 1.0, 2)
# near: a few big out-of-focus flakes, mostly along the left and right edges
snow(os.path.join(OUT, 'snow-near.webp'), 9, 7, 13, .10, .20, 4.0, 3, lambda u, r: u < .2 or u > .8 or r.random() < .15)
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)))
