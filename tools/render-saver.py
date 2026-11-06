#!/usr/bin/env python3
"""Screensaver pictures computed on the PC: tv/launcher/bg/sv-*.webp (same idea as render-backgrounds.py).

    pip install numpy pillow ; python3 tools/render-saver.py [outdir]

The screensaver stays mostly black (OLED pixels off). Soft light is computed here (the TV's Chromium 53 cannot blur live);
on the TV the layers only move with transform / opacity, so the GPU just slides finished pictures.
Three looks:
  aurore  : two curtains of aurora light (sv-aur1, sv-aur2), they drift and breathe
  eclipse : a black moon with a thin rim of light (sv-ecl-rim) that slowly travels around it, plus a soft bloom (sv-ecl-bloom)
  soie    : bundles of fine light lines like silk (sv-silk1, sv-silk2), periodic in x so a slide by one period loops
Transparent layers keep rgb = light / alpha, so drawn over black they give exactly the computed light.
Fixed seeds: every run gives the same files.
"""
import math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'tv', 'launcher', 'bg')


def hexc(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def save_rgba(light, path, seed):
    """light: HxWx3 additive light over black. Grain only where there is light (the black stays exactly black)."""
    rng = np.random.default_rng(seed)
    lum = light.max(axis=2, keepdims=True)
    light = light * (1 + rng.standard_normal(lum.shape).astype(np.float32) * .03) + rng.standard_normal(lum.shape).astype(np.float32) * .004 * np.clip(lum * 40, 0, 1)
    light = np.clip(light, 0, 1)
    a = light.max(axis=2)
    rgb = np.where(a[..., None] > 1e-5, light / np.maximum(a[..., None], 1e-5), 0)
    rgba = np.concatenate([rgb, a[..., None]], axis=2)
    Image.fromarray((rgba * 255 + .5).astype(np.uint8), 'RGBA').save(path, 'WEBP', quality=84, method=6)
    print('wrote', os.path.relpath(path, ROOT), light.shape[1], 'x', light.shape[0])


def tone(x):
    return 1 - np.exp(-x)        # soft shoulder: bright parts never clip hard


def ramp(t, stops):
    t = np.clip(t, 0, 1); out = np.zeros(t.shape + (3,), np.float32)
    for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
        m = (t >= p0) & (t <= p1); u = np.clip((t - p0) / (p1 - p0), 0, 1); u = u * u * (3 - 2 * u)
        c = hexc(c0) * (1 - u[..., None]) + hexc(c1) * u[..., None]; out[m] = c[m]
    return out


def smooth_noise(n, rng, periods, amps):
    x = np.arange(n, dtype=np.float32); v = np.zeros(n, np.float32)
    for p, a in zip(periods, amps):
        v += a * np.sin(2 * math.pi * x / p + rng.uniform(0, 6.283))
    v -= v.min(); return v / max(v.max(), 1e-6)


# ---------- Aurore: a curtain of light, bright lower edge, fine vertical rays rising from it ----------
# Sizes in CSS px (1 rem = 16 px on a 1920 px wide page). The rays are vertical, so the picture needs full 4K resolution
# across (sx = 2) but only half of it down (sy = 1): it is shown stretched x2 vertically, which leaves vertical rays sharp.
def aurora(path, seed, sx=2, sy=1, Wc=2304, Hc=820, base=600, cols=None, height=260, k=1.0, span=.36):
    rng = np.random.default_rng(seed)
    W, H = int(Wc * sx), int(Hc * sy)
    X = ((np.arange(W, dtype=np.float32) + .5) / sx)[None, :]
    Y = ((np.arange(H, dtype=np.float32) + .5) / sy)[:, None]
    ph = rng.uniform(0, 6.283, 20)
    yc = base + 45 * np.sin(2 * math.pi * X / 1900 + ph[0]) + 34 * np.sin(2 * math.pi * X / 730 + ph[1]) + 12 * np.sin(2 * math.pi * X / 260 + ph[2])
    Lh = height * (.7 + .3 * (np.sin(2 * math.pi * X / 1300 + ph[3]) + .6 * np.sin(2 * math.pi * X / 610 + ph[4])) / 1.6 + .3)
    env = np.exp(-((X - Wc * .5) / (Wc * span)) ** 4) * (.62 + .38 * (.5 + .5 * np.sin(2 * math.pi * X / 900 + ph[5])))
    dy = yc - Y                                             # > 0 above the lower edge
    xr = X + .12 * dy                                       # rays lean a little
    per = [61, 37, 23, 140, 17, 11, 7.3, 4.9, 3.3]; amp = [1, .8, .6, .9, .45, .35, .25, .16, .10]   # down to 3 px filaments: sharp at 4K
    r = sum(a_ * np.sin(2 * math.pi * xr / p_ + ph[6 + i]) for i, (p_, a_) in enumerate(zip(per, amp)))
    r = (r - r.min()) / (r.max() - r.min())
    rays = .26 + .74 * r ** 2.4
    dyp = np.maximum(dy, 0)
    up = np.exp(-dyp / Lh) * (1 - np.exp(-dyp / 10))
    prof = np.where(dy > 0, up + np.exp(-(dy / 16) ** 2) * 1.6, np.exp(-(np.minimum(dy, 0) / 26) ** 2) * 1.6)
    glow = np.exp(-((dy - 60) / 220) ** 2) * .14 * np.clip(dy / 40 + 1, 0, 1)    # nothing below the lower edge: black ground
    topfade = np.clip(Y / 220, 0, 1) ** 2                                          # the light dies out before the top
    I = env * (rays * prof * .9 + glow) * k * topfade
    t = np.clip(dy / (Lh * 1.6), 0, 1)
    col = ramp(t, cols or [(0, '#7dffcf'), (.35, '#3fd6b0'), (.7, '#4a8cff'), (1, '#8a6cff')])
    save_rgba(col * tone(I * 1.25)[..., None], path, seed + sx)


# ---------- Éclipse: thin rim of light around a black disk (square layer, rotated on the TV) ----------
def eclipse_rim(path, s=1, R=360, S=1100):
    W = S * s
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    x = xx / s - S / 2; y = yy / s - S / 2
    r = np.sqrt(x * x + y * y); th = np.arctan2(y, x)
    arc = np.maximum(0, np.cos(th + math.pi / 2)) ** 2.2          # brightest at the top (rotated by CSS)
    arc2 = np.maximum(0, np.cos(th + math.pi / 2)) ** 7
    d = r - R
    line = np.exp(-(d / (0.7 + .5 * arc)) ** 2) * (.10 + .95 * arc)
    halo = np.where(d > 0, np.exp(-d / 14) * .55 * arc2 + np.exp(-d / 70) * .22 * arc + np.exp(-d / 260) * .07 * arc, 0)
    limb = np.where(d < 0, np.exp(d / 5) * .25 * arc2, 0)
    core = hexc('#fff4e4'); cool = hexc('#9db8ff'); mid = hexc('#d8e2ff')
    win = np.clip((S / 2 - 20 - r) / 140, 0, 1) ** 2                 # every glow is zero at the square's edge (no visible corner)
    halo = halo * win
    light = core * (line * (.4 + .6 * arc2))[..., None] + mid * (line * (1 - .6 * arc2))[..., None] * .8 \
        + cool * halo[..., None] + core * limb[..., None]
    save_rgba(tone(light * 1.6), path, 31 + s)


def eclipse_bloom(path, R=360, S=1100):
    """Soft bloom around the brightest point, half resolution (it is all blur), rotates with the rim."""
    s = .5; W = int(S * s)
    yy, xx = np.mgrid[0:W, 0:W].astype(np.float32)
    x = xx / s - S / 2; y = yy / s - S / 2
    px, py = 0, -R
    d2 = (x - px) ** 2 + (y - py) ** 2
    light = hexc('#fff1dc') * (np.exp(-d2 / (18 ** 2)) * .9)[..., None] + hexc('#b9c9ff') * (np.exp(-d2 / (95 ** 2)) * .35 + np.exp(-d2 / (300 ** 2)) * .10)[..., None]
    r = np.sqrt(x * x + y * y)
    light *= np.clip((r - R + 2) / 3, 0, 1)[..., None] * .9 + .1      # the moon hides the bloom behind it
    light *= (np.clip((S / 2 - 20 - r) / 140, 0, 1) ** 2)[..., None]
    save_rgba(tone(light * 1.4), path, 41)


# ---------- Soie: fine lines that fold like a silk ribbon. ONE period wide (P px): the page repeats it side by side,
# so the browser decodes it once, and a slide by exactly one period loops without a seam. ----------
def silk(path, seed, s=2, P=1920, H=640, n=56, w=.75, cols=None, amp=1.0, glowk=.10):
    rng = np.random.default_rng(seed)
    W = P * s; Hs = H * s
    X = (np.arange(W, dtype=np.float32) + .5) / s
    Y = ((np.arange(Hs, dtype=np.float32) + .5) / s)[:, None]
    light = np.zeros((Hs, W, 3), np.float32)
    c1, c2 = rng.uniform(0, 6.283, 2)
    k1 = 2 * math.pi * 1 / P; k2 = 2 * math.pi * 2 / P; k3 = 2 * math.pi * 3 / P
    hue = ramp(.5 + .5 * np.sin(k1 * X + c1), cols or [(0, '#7f6bff'), (.5, '#5aa8ff'), (1, '#7ef0e0')])
    def centre(u):
        return H * .5 + amp * (150 * np.sin(k1 * X + c1 + 1.6 * u) + 70 * np.sin(k2 * X + c2 - 2.4 * u) + 26 * np.sin(k3 * X + c2 + 3.1 * u)) \
            + u * (40 + 120 * (.5 + .5 * np.sin(k1 * X + c2)))       # the ribbon widens and pinches: a fold
    for i in range(n):
        u = i / (n - 1) - .5
        yc = centre(u)
        slope = np.gradient(yc, X)
        we = w * np.sqrt(1 + slope * slope)                          # same thickness whatever the angle
        edge = 1 - (2 * abs(u)) ** 3
        bright = (.30 + .70 * (.5 + .5 * np.sin(k1 * X + c1 + 2.2 * u + 1))) * edge
        prof = np.exp(-((Y - yc[None, :]) / we[None, :]) ** 2) * bright[None, :] * .55
        light += hue[None, :, :] * prof[..., None]
    yc0 = centre(0)
    light += hue[None, :, :] * (np.exp(-((Y - yc0[None, :]) / 100) ** 2) * glowk)[..., None]
    light += hexc('#ffffff') * (tone(light.max(axis=2) * 1.2) ** 3 * .35)[..., None]   # white-hot where lines cross
    light *= (np.clip(np.minimum(Y, H - Y) / 90, 0, 1) ** 2)[..., None]               # fades out before the top and bottom
    save_rgba(tone(light * 1.3), path, seed + s)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    o = lambda n: os.path.join(OUT, n)
    only = os.environ.get('ONLY', '')
    FUCHSIA = [(0, '#ff6fd8'), (.35, '#e055ff'), (.75, '#9a5cff'), (1, '#5a6cff')]
    for sx, sy, suf in ((1, .5, ''), (2, 1, '@2x')):
        if not only or 'aurore' in only:
            aurora(o('sv-aur1%s.webp' % suf), 7, sx, sy, base=605, height=270)
            aurora(o('sv-aur2%s.webp' % suf), 19, sx, sy, base=497, height=200, k=.75, cols=[(0, '#6fe8ff'), (.4, '#4f86ff'), (.8, '#9a6bff'), (1, '#c070ff')])
            aurora(o('sv-aur3%s.webp' % suf), 23, sx, sy, Wc=1500, base=520, height=210, k=.85, span=.30, cols=FUCHSIA)
    for s_, suf in ((1, ''), (2, '@2x')):
        if not only or 'eclipse' in only:
            eclipse_rim(o('sv-ecl-rim%s.webp' % suf), s_)
        if not only or 'soie' in only:
            silk(o('sv-silk1%s.webp' % suf), 3, s_)
            silk(o('sv-silk2%s.webp' % suf), 11, s_, n=34, w=.6, amp=.8, glowk=.05, cols=[(0, '#ff9f7a'), (.5, '#d77cff'), (1, '#7f9bff')])
    if not only or 'eclipse' in only:
        eclipse_bloom(o('sv-ecl-bloom.webp'))
