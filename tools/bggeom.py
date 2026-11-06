"""Shapes shared by render-backgrounds.py (the pictures) and make-backgrounds.py (the vector lines and stars on top).

Every curve is a function y(x) in px of a 1920x1080 screen, written with numpy so it works for one x or for an array.
The thin bright lines (planet rim, hill rims, dune crests, contour lines) are drawn as SVG by make-backgrounds.py: the TV
draws vectors at its own resolution (4K), so they stay sharp; only the soft light around them is in the pictures.
"""
import random
import numpy as np

W, H = 1920, 1080

# ---- Horizon: the night side of a planet, an ellipse centred at x 960, half-width 3840, top at y 280, half-height 3200
RIM = dict(cx=960.0, rx=3840.0, top=280.0, ry=3200.0)
SUN_X = 1382.0


def rim_y(x):
    u = np.clip((np.asarray(x, np.float64) - RIM['cx']) / RIM['rx'], -1, 1)
    return RIM['top'] + RIM['ry'] - RIM['ry'] * np.sqrt(1 - u * u)


# ---- Bleu nuit: the main hill (a Bezier path) and two lower ridges that carry the landscape to the bottom of the screen
HILL = 'M0 372 C200 360 340 368 480 352 C580 340 640 318 720 304 C780 296 820 322 880 328 C950 334 990 300 1060 290 C1120 280 1160 304 1220 318 C1300 344 1420 340 1560 356 C1700 370 1820 362 1920 366'


def bezier_y(d, x):
    n = [float(v) for v in d.replace('M', ' ').replace('C', ' ').split()]
    px, py = [n[0]], [n[1]]; cur = (n[0], n[1])
    t = np.linspace(0, 1, 80)[1:]
    for i in range(2, len(n), 6):
        x1, y1, x2, y2, x3, y3 = n[i:i + 6]
        px += list((1 - t) ** 3 * cur[0] + 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3 * x3)
        py += list((1 - t) ** 3 * cur[1] + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3 * y3)
        cur = (x3, y3)
    return np.interp(x, px, py)


def ridge(base, amp, seed, f1=420.0, f2=170.0):
    """A smooth ridge line: two sines with a phase fixed by the seed."""
    ph = random.Random(seed).uniform(0, 6)
    return lambda x: base + amp * np.sin(np.asarray(x, np.float64) / f1 + ph) + amp * .45 * np.sin(np.asarray(x, np.float64) / f2 + ph * 2)


BLUE_HILLS = [lambda x: bezier_y(HILL, x), ridge(585, 30, 11, 520, 210), ridge(830, 26, 12, 610, 240)]

# ---- Dunes: crests from the far ones (high, thin light) to the near ones (low, at the bottom of the screen)
DUNES = [ridge(330, 26, 1), ridge(372, 22, 2), ridge(420, 18, 3), ridge(520, 26, 4, 520, 200), ridge(665, 30, 5, 600, 230), ridge(860, 34, 6, 700, 260)]

# ---- Ocean
SEA = 373.0
OCEAN_MOON = (1536.0, 200.0, 35.0)
DUNES_MOON = (1459.0, 210.0, 33.0)

# ---- Lignes: 26 contour lines
_r = random.Random(5); _lp = [_r.uniform(0, 6) for _ in range(4)]
NLINES = 26


def contour_y(i, x):
    x = np.asarray(x, np.float64); t = i / (NLINES - 1.0); base = 120 + 950 * (t ** 1.25)
    return base + (34 - 14 * t) * np.sin(x / 300 + _lp[0] + t * 2.2) + 18 * np.sin(x / 130 + _lp[1] - t * 3.1) + 9 * np.sin(x / 61 + _lp[2] + t * 5)
