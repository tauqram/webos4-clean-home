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
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bggeom import RIM, SUN_X, rim_y, BLUE_HILLS, DUNES, SEA, OCEAN_MOON, DUNES_MOON   # shapes shared with make-backgrounds.py

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
# Geometry in bggeom.py (shared with make-backgrounds.py, which draws the thin rim line itself as a vector: sharp at 4K).


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
    # the soft light hugging the rim (the sharp line itself is an SVG stroke on top, see make-backgrounds.py)
    line = np.exp(-(d / 5.0) ** 2) * (.05 + .22 * wide)
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


def edge(c, top_y, soft=.6):
    """Anti-aliased coverage of the area below the curve top_y (array over x) on canvas c."""
    return np.clip((c.y - top_y) * c.s / (2 * soft) + .5, 0, 1)


def fbm(w, h, seed, octaves=((6, 1.0), (13, .5), (27, .25))):
    """Smooth value noise (0..1) of size w x h: a few random grids enlarged with bicubic filtering, summed."""
    rng = np.random.default_rng(seed); out = np.zeros((h, w), np.float32); tot = 0
    for n, amp in octaves:
        g = (rng.random((n, n)) * 255).astype(np.uint8)
        out += np.asarray(Image.fromarray(g).resize((w, h), Image.BICUBIC), np.float32) / 255 * amp; tot += amp
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def moon(c, cx, cy, r, tint, k, seed=7):
    """A full moon: limb darkening, dark maria, craters with a lit rim and a shadowed wall (light from the upper left),
    fine regolith grain. Drawn in a box around the disc at the canvas resolution, then a soft halo on the whole canvas."""
    s = c.s; R = r * s; x0, y0 = int(cx * s - R - 3), int(cy * s - R - 3); n = int(2 * R + 7)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    dx = (xx + x0 + .5 - cx * s) / R; dy = (yy + y0 + .5 - cy * s) / R; d = np.sqrt(dx * dx + dy * dy)
    cov = np.clip((1 - d) * R + .5, 0, 1)
    z = np.sqrt(np.clip(1 - d * d, 0, 1))
    limb = z ** .35
    m = fbm(n, n, seed)                                                          # maria: large dark seas, uneven edges
    maria = np.clip((m - .42) / .36, 0, 1); maria = maria * maria * (3 - 2 * maria)
    alb = 1 - .26 * maria - .06 * fbm(n, n, seed + 1, ((24, 1.0), (50, .6)))
    rng = random.Random(seed); L = (-.62, -.78)                                   # direction towards the sun (upper left)
    tex = np.zeros((n, n), np.float32)
    for _ in range(40):
        while True:
            u, v = rng.uniform(-.95, .95), rng.uniform(-.95, .95)
            if u * u + v * v < .9: break
        rc = .025 + .13 * rng.random() ** 2.6; zc = math.sqrt(max(0, 1 - u * u - v * v))
        ox, oy = dx - u, dy - v; dd = np.sqrt(ox * ox + oy * oy) / rc
        near = dd < 1.6
        if not near.any(): continue
        cosl = (ox * L[0] + oy * L[1]) / (np.sqrt(ox * ox + oy * oy) + 1e-6)
        bowl = -.09 * np.exp(-(dd / .85) ** 6)                                    # darker, flat floor
        shade = -.16 * np.exp(-((dd - .7) / .28) ** 2) * np.clip(cosl, 0, 1)     # the wall on the sun's side is in shadow
        lit = .14 * np.exp(-((dd - .8) / .22) ** 2) * np.clip(-cosl, 0, 1)        # the opposite wall catches the light
        rim = .10 * np.exp(-((dd - 1.05) / .16) ** 2) * (.4 + .6 * np.clip(cosl, 0, 1))
        tex += (bowl + shade + lit + rim) * (.35 + .65 * zc) * near
    grain = np.asarray(Image.fromarray(((np.random.default_rng(seed).random((n, n)) * 255)).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.6 * s)), np.float32) / 255
    grain = (grain - grain.mean()) * .10
    val = k * limb * alb * (1 + tex + grain)
    sub = c.img[y0:y0 + n, x0:x0 + n]
    c.img[y0:y0 + n, x0:x0 + n] = sub * (1 - cov[..., None]) + hexc(tint) * (val * cov)[..., None]
    c.glow(cx, cy, r * 2.2, r * 2.2, tint, k * .10, 1.2)                         # soft halo, kept low (Sam: no glare)
    c.glow(cx, cy, r * 9, r * 9, tint, k * .035, 1.0)


def mix(c, top_y, depth_px, c0, c1):
    """Colour per pixel that goes from c0 at the ridge line to c1 depth_px lower (smooth)."""
    u = np.clip((c.y - top_y) / depth_px, 0, 1); u = u * u * (3 - 2 * u)
    return hexc(c0) * (1 - u[..., None]) + hexc(c1) * u[..., None]


def lay(c, cov, col):
    c.img = c.img * (1 - cov[..., None]) + col * cov[..., None]


def row(c, fn):
    return fn(c.x[0])[None, :].astype(np.float32) * np.ones((c.H, 1), np.float32)


# ---------- Bleu nuit: calm deep-blue sky, a real Milky Way, a hill with a blue rim light, two lower ridges down to the bottom ----------
def bleunuit(path, s=1):
    c = Canvas(s)
    c.vgrad([(0, '#03050c'), (.22, '#050a19'), (.30, '#0a1531'), (.36, '#14275a'), (.5, '#0a1430'), (1, '#0a1430')])
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
    h0 = row(c, BLUE_HILLS[0])
    c.img += hexc('#dfe8ff') * (dust * (c.y < h0 - 4))[..., None]
    c.glow(960, 330, 1150, 150, '#5a82e6', .20)                                   # horizon glow behind the hill
    # three ridges, far to near; each body goes from a lit navy at its top to a deep blue (never black), mist in the valleys
    for i, (cx, top, bot, k, mist_y) in enumerate(((1000, '#0f1c3d', '#070e22', .9, 0), (720, '#0e1a3a', '#081128', .55, 560), (1250, '#0f1c3e', '#0a142e', .45, 805))):
        hy = row(c, BLUE_HILLS[i])
        if mist_y: c.glow(960, mist_y, 1500, 70, '#3c5cb4', .07)                  # thin mist lying in the valley
        cov = edge(c, hy, .5); lay(c, cov, mix(c, hy, 200, top, bot))
        lit = np.exp(-((c.x - cx) / 560) ** 2) * .85 + .15
        c.img += hexc('#20356e') * (np.exp(-np.clip(c.y - hy, 0, None) / 30) * .35 * k * cov)[..., None]   # the top catches sky light
        c.img += hexc('#a9c4ff') * (np.exp(-((c.y - hy) / 4.0) ** 2) * .07 * k * lit)[..., None]           # soft light around the rim (the line is SVG)
        c.img += hexc('#5a82e6') * (np.exp(-np.clip(hy - c.y, 0, None) / 14) * (c.y < hy) * .10 * k * lit)[..., None]
    c.save(path, seed=41)


# ---------- Ocean: moon over a calm sea; the shimmering reflection stays live (vector) on top ----------
def ocean(path, s=1):
    c = Canvas(s)
    c.vgrad([(0, '#02040a'), (.18, '#050b18'), (.33, '#0b1a30'), (.345, '#10253f'), (.3455, '#081426'), (.42, '#060f1e'), (.7, '#040912'), (1, '#03060c')])
    mx, my, mr = OCEAN_MOON
    c.glow(mx, my, 820, 460, '#5e82c8', .07, 1.4)                                 # sky lit by the moon
    c.glow(mx, SEA, 900, 10, '#9fb8e8', .10, 2, mask=(np.abs(c.y - SEA) < 30).astype(np.float32))   # the horizon line catches light
    sea = (c.y > SEA).astype(np.float32)
    c.glow(mx, SEA + 30, 240, 520, '#7f9fd8', .05, 1.6, mask=sea)                 # broad glow on the water under the moon
    moon(c, mx, my, mr, '#dfe6f2', .80)
    c.save(path, seed=42)


# ---------- Dunes: night desert, amber light grazing the crests, a muted moon; the dunes go on to the bottom of the screen ----------
def dunes(path, s=1):
    c = Canvas(s)
    c.vgrad([(0, '#07060c'), (.22, '#100b17'), (.30, '#1f121d'), (.35, '#2c1823'), (.45, '#160d15'), (1, '#160d15')])
    c.glow(730, 330, 1050, 150, '#ff9a5a', .16)                                   # warm last light low over the dunes
    moon(c, *DUNES_MOON, tint='#ece0cc', k=.82, seed=8)
    # far crests are lit the most; the near dunes keep a warm body colour (no black band at the bottom)
    spec = (('#2e1a24', '#21131b', .32), ('#22131b', '#180e15', .20), ('#1a0f16', '#130b11', .13),
            ('#24141b', '#170d13', .15), ('#2a171d', '#1a0f15', .17), ('#311b20', '#1f1218', .19))
    for fn, (top, bot, rim) in zip(DUNES, spec):
        hy = row(c, fn); cov = edge(c, hy, .5); lay(c, cov, mix(c, hy, 160, top, bot))
        dpt = np.clip(c.y - hy, 0, None)
        c.img += hexc('#ff9c6a') * ((np.exp(-dpt / 22) * .45 + np.exp(-dpt / 110) * .12) * rim * cov)[..., None]   # light grazing the crest
        c.img += hexc('#ffb38a') * (np.exp(-((c.y - hy) / 3.5) ** 2) * rim * .18)[..., None]                   # soft glow around the crest (line is SVG)
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


# ---------- Lignes: a warm light from the top right; the contour lines themselves are SVG (sharp, they sway slowly) ----------
def lignes(path, s=1):
    c = Canvas(s); c.img[:] = hexc('#0b0c0f')
    c.glow(1800, -250, 1100, 760, '#ffbe82', .16, 1.6)
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
if 'horizon' in ONLY or not ONLY:
    horizon(os.path.join(OUT, 'horizon.webp')); horizon(os.path.join(OUT, 'horizon@2x.webp'), 2)
    horizon_sun(os.path.join(OUT, 'horizon-sun.webp')); horizon_sun(os.path.join(OUT, 'horizon-sun@2x.webp'), 2)
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
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(os.path.join(OUT, f)))
