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
import math, os, random, sys
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


# ---------- shared helpers for the themes below (all sizes in px of a 1920x1080 screen, times s for the 4K copy) ----------
class Canvas:
    def __init__(self, s):
        self.s = s; self.W, self.H = 1920 * s, 1080 * s
        yy, xx = np.mgrid[0:self.H, 0:self.W].astype(np.float32); self.x = xx / s; self.y = yy / s
        self.img = np.zeros((self.H, self.W, 3), np.float32)

    def vgrad(self, stops):
        t = self.y / 1079.0
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            m = (t >= p0) & (t <= p1); u = np.clip((t - p0) / max(p1 - p0, 1e-6), 0, 1); u = u * u * (3 - 2 * u)
            c = hexc(c0) * (1 - u[..., None]) + hexc(c1) * u[..., None]; self.img[m] = c[m]

    def glow(self, cx, cy, rx, ry, col, k, power=2.0, mask=None):
        a = np.exp(-((((self.x - cx) / rx) ** 2 + ((self.y - cy) / ry) ** 2) ** (power / 2))) * k
        if mask is not None: a = a * mask
        self.img += hexc(col) * a[..., None]

    def fill(self, mask, col):          # mask 0..1 (anti-aliased coverage)
        self.img = self.img * (1 - mask[..., None]) + hexc(col) * mask[..., None]

    def save(self, path, grain=.006, seed=1, q=92):
        g = np.random.default_rng(seed).standard_normal((self.H, self.W, 1)).astype(np.float32) * grain
        Image.fromarray((np.clip(self.img + g, 0, 1) * 255 + .5).astype(np.uint8)).save(path, 'WEBP', quality=q, method=6)


def curve_from_bezier(d, xs):
    """y(x) for an SVG path made of 'M x y' then 'C x1 y1 x2 y2 x y' segments (monotonic in x)."""
    n = [float(v) for v in d.replace('M', ' ').replace('C', ' ').split()]
    px, py = [n[0]], [n[1]]; i = 2; cur = (n[0], n[1])
    while i + 5 < len(n) + 1 and i + 5 <= len(n) - 1 + 1:
        x1, y1, x2, y2, x3, y3 = n[i:i + 6]; i += 6
        t = np.linspace(0, 1, 60)[1:]
        bx = (1 - t) ** 3 * cur[0] + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3 * x3
        by = (1 - t) ** 3 * cur[1] + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3 * y3
        px += list(bx); py += list(by); cur = (x3, y3)
    return np.interp(xs, px, py)


def edge(c, top_y, soft=.6):
    """Anti-aliased coverage of the area below the curve top_y (array over x) on canvas c."""
    return np.clip((c.y - top_y) * c.s / (2 * soft) + .5, 0, 1)


def moon(c, cx, cy, r, tint, k):
    d = np.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2)
    cov = np.clip((r - d) * c.s + .5, 0, 1)
    limb = np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1)) ** .35                      # limb darkening
    rng = np.random.default_rng(7)                                              # faint maria: smooth low-frequency blotches
    nz = sum(np.cos((c.x - cx) / r * f1 + p1) * np.cos((c.y - cy) / r * f2 + p2) for f1, f2, p1, p2 in rng.uniform(1.5, 4.5, (5, 4)))
    tex = 1 - .12 * (nz - nz.min()) / (nz.max() - nz.min() + 1e-6)
    disc = (hexc(tint) * (k * limb * tex)[..., None]) * cov[..., None]
    c.img = c.img * (1 - cov[..., None]) + disc
    c.glow(cx, cy, r * 2.2, r * 2.2, tint, k * .10, 1.2)                         # soft halo, kept low (Sam: no glare)
    c.glow(cx, cy, r * 9, r * 9, tint, k * .035, 1.0)


# ---------- Bleu nuit: calm deep-blue sky, a real Milky Way, a hill with a thin blue rim light ----------
HILL = 'M0 372 C200 360 340 368 480 352 C580 340 640 318 720 304 C780 296 820 322 880 328 C950 334 990 300 1060 290 C1120 280 1160 304 1220 318 C1300 344 1420 340 1560 356 C1700 370 1820 362 1920 366'


def bleunuit(path, s=1):
    c = Canvas(s)
    c.vgrad([(0, '#03050c'), (.22, '#050a19'), (.30, '#0a1531'), (.36, '#14275a'), (.5, '#0a1430'), (1, '#050915')])
    # Milky Way: a tilted band with a soft core, uneven brightness and two darker dust lanes, faint
    ang = math.radians(-14); u = (c.x - 960) * math.cos(ang) + (c.y - 120) * math.sin(ang); v = -(c.x - 960) * math.sin(ang) + (c.y - 120) * math.cos(ang)
    band = np.exp(-(v / 120) ** 2) * (.6 + .4 * np.cos(u / 260 + 1.3) * np.cos(u / 97))
    lanes = 1 - .55 * np.exp(-((v - 12 - 18 * np.sin(u / 180)) / 16) ** 2) - .35 * np.exp(-((v + 40 + 10 * np.sin(u / 140 + 2)) / 22) ** 2)
    c.img += hexc('#8ea6e6') * (np.clip(band * lanes, 0, None) * .085)[..., None]
    rng = np.random.default_rng(31); n = 2600                                    # star dust inside the band (static, tiny)
    us = rng.normal(0, 700, n); vs = rng.normal(0, 70, n); sx = 960 + us * math.cos(ang) - vs * math.sin(ang); sy = 120 + us * math.sin(ang) + vs * math.cos(ang)
    dust = np.zeros((c.H, c.W), np.float32); ix = (sx * s).astype(int); iy = (sy * s).astype(int); ok = (ix >= 0) & (ix < c.W) & (iy >= 0) & (iy < c.H)
    np.add.at(dust, (iy[ok], ix[ok]), rng.uniform(.15, .55, ok.sum()))
    dust = np.asarray(Image.fromarray(np.clip(dust * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.5 * s)), np.float32) / 255 * 1.6
    hy = curve_from_bezier(HILL, c.x[0])[None, :] * np.ones((c.H, 1), np.float32)
    c.img += hexc('#dfe8ff') * (dust * (c.y < hy - 4))[..., None]
    c.glow(960, 330, 1150, 150, '#5a82e6', .20)                                   # horizon glow behind the hill
    below = edge(c, hy, .5)
    c.fill(below, '#050915')
    depth = np.clip(c.y - hy, 0, None)
    c.img += hexc('#0e1a38') * (np.exp(-depth / 40) * .9 * below)[..., None]      # the hill's top catches a little sky light
    lit = np.exp(-((c.x - 1000) / 520) ** 2) * .9 + .1
    c.img += hexc('#a9c4ff') * (np.exp(-((c.y - hy) / .9) ** 2) * .55 * lit)[..., None]   # rim light, strongest in the middle
    c.img += hexc('#5a82e6') * (np.exp(-np.clip(hy - c.y, 0, None) / 14) * (c.y < hy) * .10 * lit)[..., None]
    c.save(path, seed=41)


# ---------- Ocean: moon over a calm sea; the shimmering reflection stays live (vector) on top ----------
SEA = 373.0


def ocean(path, s=1):
    c = Canvas(s)
    c.vgrad([(0, '#02040a'), (.18, '#050b18'), (.33, '#0b1a30'), (.345, '#10253f'), (.3455, '#081426'), (.42, '#060f1e'), (.7, '#040912'), (1, '#03060c')])
    c.glow(1536, 200, 820, 460, '#5e82c8', .07, 1.4)                            # sky lit by the moon
    c.glow(1536, SEA, 900, 10, '#9fb8e8', .10, 2, mask=(np.abs(c.y - SEA) < 30).astype(np.float32))   # the horizon line catches light
    sea = (c.y > SEA).astype(np.float32)
    c.glow(1536, SEA + 30, 240, 520, '#7f9fd8', .05, 1.6, mask=sea)               # broad glow on the water under the moon
    moon(c, 1536, 200, 35, '#dfe6f2', .78)
    c.save(path, seed=42)


# ---------- Dunes: night desert, amber light grazing the crests, a muted moon ----------
def dune_curve(xs, base, amp, seed):
    r = random.Random(seed); ph = r.uniform(0, 6)
    gx = np.arange(0, 1921, 60, dtype=np.float32); gy = base + amp * np.sin(gx / 420 + ph) + amp * .45 * np.sin(gx / 170 + ph * 2)
    return np.interp(xs, gx, gy)


def dunes(path, s=1):
    c = Canvas(s)
    c.vgrad([(0, '#07060c'), (.22, '#100b17'), (.30, '#1f121d'), (.35, '#2c1823'), (.45, '#160d15'), (1, '#0b070b')])
    c.glow(730, 330, 1050, 150, '#ff9a5a', .16)                                   # warm last light low over the dunes
    moon(c, 1459, 210, 33, '#ece0cc', .80)
    for base, amp, seed, col, rim in ((330, 26, 1, '#2b1822', .32), (372, 22, 2, '#1d1017', .20), (420, 18, 3, '#110a0f', .11)):
        top = dune_curve(c.x[0], base, amp, seed)[None, :] * np.ones((c.H, 1), np.float32)
        cov = edge(c, top, .5); c.fill(cov, col)
        dpt = np.clip(c.y - top, 0, None)
        c.img += hexc('#ff9c6a') * (np.exp(-dpt / 22) * rim * .45 * cov)[..., None]      # light grazing the crest, fading down the slope
        c.img += hexc('#ffb38a') * (np.exp(-((c.y - top) / .9) ** 2) * rim)[..., None]    # the crest line itself
    c.save(path, seed=43)


# ---------- Degrade: soft colour light at the top, melting into black behind the rows ----------
def degrade(path, s=1):
    c = Canvas(s); c.img[:] = hexc('#07080d')
    c.glow(150, -120, 950, 620, '#5846d2', .40, 1.7)
    c.glow(1800, -60, 900, 560, '#1496aa', .32, 1.7)
    c.glow(1000, 170, 650, 300, '#be468c', .14, 1.8)
    fade = np.clip((c.y - 250) / 420, 0, 1); fade = fade * fade * (3 - 2 * fade)
    c.img = c.img * (1 - fade[..., None] * .9) + hexc('#07080d') * (fade[..., None] * .9)
    c.save(path, grain=.009, seed=44)


# ---------- Lignes: fine topographic lines lit by a warm light from the top right ----------
def lignes(path, s=1):
    c = Canvas(s); c.img[:] = hexc('#0b0c0f')
    c.glow(1800, -250, 1100, 760, '#ffbe82', .16, 1.6)
    r = random.Random(5); p = [r.uniform(0, 6) for _ in range(4)]
    light = np.exp(-(((c.x - 1700) / 1300) ** 2 + ((c.y + 150) / 900) ** 2))
    xs = c.x[0]
    for i in range(26):
        t = i / 25.0; base = 120 + 950 * (t ** 1.25)
        y = base + (34 - 14 * t) * np.sin(xs / 300 + p[0] + t * 2.2) + 18 * np.sin(xs / 130 + p[1] - t * 3.1) + 9 * np.sin(xs / 61 + p[2] + t * 5)
        dy = np.gradient(y, xs)
        yl = y[None, :] * np.ones((c.H, 1), np.float32)
        d = np.abs(c.y - yl) / np.sqrt(1 + dy[None, :] ** 2)
        line = np.clip(.7 - d * c.s / 1.0, 0, 1)                                 # 1.4 px line, anti-aliased
        k = (.08 + .26 * light) * (1 - .55 * np.clip((c.y - 420) / 500, 0, 1))
        c.img += (hexc('#ffffff') * .5 + hexc('#ffd2a6') * .5) * (line * k)[..., None]
    c.save(path, seed=45)


# ---------- Studio: graphite with one soft spotlight from above ----------
def studio(path, s=1):
    c = Canvas(s); c.img[:] = hexc('#111214')
    c.glow(960, -280, 1150, 760, '#ffffff', .11, 1.6)
    c.glow(960, -120, 520, 420, '#ffffff', .04, 1.6)
    vig = np.clip(np.sqrt(((c.x - 960) / 1150) ** 2 + ((c.y - 380) / 820) ** 2) - .55, 0, 1)
    c.img *= (1 - .45 * vig)[..., None]
    c.save(path, grain=.008, seed=46)


os.makedirs(OUT, exist_ok=True)
ONLY = set(sys.argv[1:])          # e.g. "python3 tools/render-backgrounds.py ocean dunes" renders only those
for name, fn in (('bleunuit', bleunuit), ('ocean', ocean), ('dunes', dunes), ('degrade', degrade), ('lignes', lignes), ('studio', studio)):
    if ONLY and name not in ONLY: continue
    fn(os.path.join(OUT, name + '.webp')); fn(os.path.join(OUT, name + '@2x.webp'), 2)
if ONLY:
    raise SystemExit(0)
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
