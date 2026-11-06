#!/usr/bin/env python3
"""Background pictures computed on the PC: tv/launcher/bg/*.webp (committed). The CSS that uses them is in make-backgrounds.py.

    pip install numpy pillow ; python3 tools/render-backgrounds.py ; python3 tools/make-backgrounds.py

Why pictures and not CSS: soft light, real depth-of-field flakes and grain look like a photo only when they are computed
(blur, additive light), which the TV's Chromium 53 cannot do live. The TV only slides these pictures (transform), so it costs
almost nothing. Fixed seeds: every run gives the same files.

Noël = a calm blue night (noel-base.webp, full screen) and three layers of snow (snow-far/mid/near.webp, transparent,
the far layer at full definition, the soft mid and near layers at half resolution shown twice as big: 2 MB each).
4K copies (@2x) are picked by the browser only if it draws the page at 4K; webOS 4 normally draws apps at 1920x1080.
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


# ---------- Horizon: the night side of a planet, its atmosphere lit from behind at the sunrise point ----------
# Geometry shared with make-backgrounds.py (the stars there are kept above this rim): an ellipse centred at x 960 px,
# half-width 3840 px, top at y 280 px, half-height 3200 px (on a 1920x1080 screen).
RIM = dict(cx=960.0, rx=3840.0, top=280.0, ry=3200.0)
SUN_X = 1382.0


def rim_y(x):
    u = np.clip((x - RIM['cx']) / RIM['rx'], -1, 1)
    return RIM['top'] + RIM['ry'] - RIM['ry'] * np.sqrt(1 - u * u)


def horizon(path, s=1):
    W, H = 1920 * s, 1080 * s
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); x = xx / s; y = yy / s
    ry = rim_y(x); slope = np.gradient(ry[0])[None, :] * 0 + np.gradient(rim_y(np.arange(1920, dtype=np.float32)))[np.clip(x.astype(int), 0, 1919)]
    d = (ry - y) / np.sqrt(1 + slope * slope)          # > 0 above the rim (sky), < 0 inside the planet, in screen px
    near = np.exp(-((x - SUN_X) / 520) ** 2)            # how close to the sunrise point
    wide = np.exp(-((x - SUN_X) / 1400) ** 2)
    img = np.zeros((H, W, 3), np.float32)
    # sky: black with a faint deep-blue haze high up
    img += hexc('#0a1430') * (np.exp(-(((x - 960) / 1100) ** 2 + ((y - 330) / 420) ** 2)) * .55)[..., None]
    sky = d > 0
    # atmosphere above the rim: blue scattering that falls off with height, brighter towards the sun
    atm = np.where(sky, np.exp(-np.maximum(d, 0) / 24) * (.06 + .50 * wide) + np.exp(-np.maximum(d, 0) / 110) * (.025 + .16 * wide), 0)
    img += hexc('#3a62e0') * atm[..., None]
    # the lit rim itself: a thin line of light, white near the sun, blue far from it, anti-aliased (1.1 px)
    line = np.exp(-(d / 1.1) ** 2) * (.18 + .82 * wide)
    img += (hexc('#bcd0ff') * (1 - near[..., None]) + hexc('#fff6e6') * near[..., None]) * line[..., None]
    # planet body: almost black, a soft limb glow just inside the rim, cooler and fainter far from the sun
    body = ~sky
    limb = np.where(body, np.exp(np.minimum(d, 0) / 18) * (.05 + .20 * wide) + np.exp(np.minimum(d, 0) / 140) * (.012 + .03 * wide), 0)
    img = np.where(body[..., None], hexc('#020305') + hexc('#4a78ff') * limb[..., None], img)
    img += np.random.default_rng(21).standard_normal((H, W, 1)).astype(np.float32) * .006
    Image.fromarray((np.clip(img, 0, 1) * 255 + .5).astype(np.uint8)).save(path, 'WEBP', quality=92, method=6)


def horizon_sun(path, s=1, W0=1400, H0=520):
    """The sunrise bloom, a separate transparent layer (it breathes slowly in CSS). Box centred on the sunrise point."""
    W, H = W0 * s, H0 * s
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); x = xx / s - W0 / 2; y = yy / s - H0 / 2
    core = np.exp(-((x / 9) ** 2 + (y / 5) ** 2)) * 1.0
    halo = np.exp(-((x / 90) ** 2 + (y / 34) ** 2)) * .42 + np.exp(-((x / 380) ** 2 + (y / 120) ** 2)) * .16
    warm, white, blue = hexc('#ffd9a8'), hexc('#fff8ee'), hexc('#8fb0ff')
    light = white * core[..., None] + (warm * .6 + blue * .4) * halo[..., None]     # no straight streak: the rim is curved
    a = np.clip(light.max(axis=2), 0, 1)
    rgb = np.where(a[..., None] > 1e-4, light / np.maximum(a[..., None], 1e-4), 0)
    rgba = np.concatenate([np.clip(rgb, 0, 1), a[..., None]], axis=2)
    Image.fromarray((rgba * 255 + .5).astype(np.uint8), 'RGBA').save(path, 'WEBP', quality=92, method=6)


os.makedirs(OUT, exist_ok=True)
base(os.path.join(OUT, 'noel-base.webp'))
base(os.path.join(OUT, 'noel-base@2x.webp'), 3840, 2160)          # used only if the TV draws the page at 4K (devicePixelRatio 2)
# far: tiny, faint, everywhere, at full definition so the small flakes stay sharp (and a 4K copy)
snow(os.path.join(OUT, 'snow-far.webp'), 420, .7, 1.6, .25, .65, .4, 1, W=1920, H=1080)
snow(os.path.join(OUT, 'snow-far@2x.webp'), 420, 1.4, 3.2, .25, .65, .8, 1, W=3840, H=2160)
# mid: small soft flakes, everywhere but sparse
snow(os.path.join(OUT, 'snow-mid.webp'), 70, 1.6, 3.0, .25, .55, 1.0, 2)
# near: a few big out-of-focus flakes, mostly along the left and right edges
snow(os.path.join(OUT, 'snow-near.webp'), 9, 7, 13, .10, .20, 4.0, 3, lambda u, r: u < .2 or u > .8 or r.random() < .15)
horizon(os.path.join(OUT, 'horizon.webp')); horizon(os.path.join(OUT, 'horizon@2x.webp'), 2)
horizon_sun(os.path.join(OUT, 'horizon-sun.webp')); horizon_sun(os.path.join(OUT, 'horizon-sun@2x.webp'), 2)
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)))
