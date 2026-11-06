#!/usr/bin/env python3
# make-focus-light.py - draws tv/launcher/bg/focus-light.webp, the soft spot of light that drifts over the focused Home icon.
# A Gaussian falloff with triangular dither in the alpha channel: a CSS radial-gradient showed visible rings (8-bit steps) on the OLED.
#   python3 tools/make-focus-light.py      (needs numpy + Pillow)
import os, numpy as np
from PIL import Image
N = 768; rng = np.random.default_rng(7)
y, x = np.mgrid[0:N, 0:N] / (N - 1)
r2 = (x - .38) ** 2 + (y - .30) ** 2                       # centre of the spot, as a share of the layer (the layer is 160 % of the icon)
a = .26 * np.exp(-r2 / (2 * .12 ** 2))                       # peak opacity .26, sigma 12 % of the layer
a *= np.clip((.62 - np.sqrt(r2)) / .12, 0, 1) ** 2            # reaches exactly 0 well before the layer's edge
al = np.clip(np.round(a * 255 + rng.random((N, N)) - rng.random((N, N))), 0, 255).astype(np.uint8)
img = np.dstack([np.full((N, N), 255, np.uint8)] * 3 + [al])
out = os.path.join(os.path.dirname(__file__), '..', 'tv', 'launcher', 'bg', 'focus-light.webp')
Image.fromarray(img, 'RGBA').save(out, lossless=True, quality=100, method=6)
print('wrote', out)
