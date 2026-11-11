#!/usr/bin/env python3
# Second half of tools/make-theme-thumbs.js: screenshots -> tv/launcher/bg/pv-*.webp (960x540, the size the Theme picker
# draws them at on a 4K panel), plus the composed cards: "auto" (Home: Aurore / Noël split), "sv-auto" (the three looks
# side by side) and "sv-photos" (an abstract picture of a photo stack: never a real photo).
import sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageChops
src, out = sys.argv[1], sys.argv[2]
W, H = 960, 540
def load(n): return Image.open(os.path.join(src, n + '.png')).convert('RGB').resize((W, H), Image.LANCZOS)
def save(im, n): im.save(os.path.join(out, 'pv-' + n + '.webp'), 'WEBP', quality=86, method=6); print('pv-' + n)
for f in sorted(os.listdir(src)):
    if f.endswith('.png') and not f.startswith('fw'): save(load(f[:-4]), f[:-4])
# fireworks: one burst at a time on black, so several moments are merged (brightest pixel wins)
fw = None
for f in sorted(os.listdir(src)):
    if f.startswith('fw') and f.endswith('.png'): im = load(f[:-4]); fw = im if fw is None else ImageChops.lighter(fw, im)
if fw: save(fw, 'sv-fireworks')
# Home "auto": the base theme and the season theme cut by a soft diagonal
a, b = load('th-aurore'), load('th-noel')
m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m); d.polygon([(W * .62, 0), (W, 0), (W, H), (W * .38, H)], fill=255)
save(Image.composite(b, a, m.filter(ImageFilter.GaussianBlur(3))), 'th-auto')
# screensaver "auto": the three animated looks in vertical bands
im = Image.new('RGB', (W, H))
for i, n in enumerate(['sv-aurore', 'sv-eclipse', 'sv-soie']):
    x0 = i * W // 3; im.paste(load(n).crop((x0, 0, x0 + W // 3, H)), (x0, 0))
d = ImageDraw.Draw(im)
for i in (1, 2): d.line([(i * W // 3, 0), (i * W // 3, H)], fill=(0, 0, 0), width=4)
save(im, 'sv-auto')
# screensaver "photos": three soft, tilted, abstract frames on near black
S = 2; big = Image.new('RGB', (W * S, H * S), (6, 7, 10))
cards = [(-9, (58, 82, 140), (196, 120, 92)), (6, (40, 110, 104), (226, 196, 140)), (-2, (92, 64, 132), (240, 150, 120))]
for k, (ang, c1, c2) in enumerate(cards):
    cw, ch = int(W * S * .34), int(H * S * .5)
    g = Image.new('RGB', (cw, ch)); gd = ImageDraw.Draw(g)
    for y in range(ch):
        t = y / ch; gd.line([(0, y), (cw, y)], fill=tuple(int(c1[j] + (c2[j] - c1[j]) * t) for j in range(3)))
    frame = Image.new('RGBA', (cw + 36, ch + 36), (236, 236, 232, 255)); frame.paste(g, (18, 18))
    mask = Image.new('L', frame.size, 0); ImageDraw.Draw(mask).rounded_rectangle([0, 0, frame.size[0] - 1, frame.size[1] - 1], 22, fill=255); frame.putalpha(mask)
    frame = frame.rotate(ang, resample=Image.BICUBIC, expand=True)
    sh = Image.new('RGBA', frame.size, (0, 0, 0, 0)); sh.putalpha(frame.split()[3].point(lambda v: v * .6)); sh = sh.filter(ImageFilter.GaussianBlur(30))
    x = int(W * S * (.2 + k * .2)) - frame.size[0] // 2 + int(W * S * .1); y = int(H * S * .5) - frame.size[1] // 2 + (k - 1) * 20
    big.paste((0, 0, 0), (x + 10, y + 34), sh); big.paste(frame, (x, y), frame)
save(big.resize((W, H), Image.LANCZOS), 'sv-photos')
