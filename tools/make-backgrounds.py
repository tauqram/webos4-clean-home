#!/usr/bin/env python3
"""Builds tv/launcher/backgrounds.css: the vector Home backgrounds (Horizon, Bleu nuit, Dunes, Ocean, Degrade, Lignes, Studio).

Run on the PC after changing anything here:   python3 tools/make-backgrounds.py
Everything is generated from fixed random seeds, so the output is the same on every run (no binary assets in the repo).

Rules for the TV (Chromium 53, OLED panel):
- every layer is a plain absolutely placed div drawn ONCE (gradients, inline SVG data URIs); animations only touch
  opacity and transform, so nothing is repainted while they run;
- the area behind the app rows stays dark (pixels off on an OLED, icons stay readable);
- a faint grain PNG over each background stops the gradients from showing bands.
themes.js puts the layers into #themebg (THEMES[id].layers, one div per entry: class "nb-<name>"), this file styles them
under body.th-<id>.
"""
import math, os, random, struct, urllib.parse, zlib, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tv', 'launcher', 'backgrounds.css')
SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1920 1080' preserveAspectRatio='none'>"


def uri(svg):
    # '#' must be escaped (it starts a fragment), quotes stay single so the CSS can use double quotes around url()
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" :/=',.()-_") + '")'


def stars(n, ymax, rmin, rmax, seed, cols=('#ffffff', '#dfe8ff', '#fff4e0', '#cfe0ff')):
    r = random.Random(seed); c = []
    for _ in range(n):
        x = r.uniform(0, 1920); y = ymax * (r.random() ** 1.35)      # more stars higher up
        rad = rmin + (rmax - rmin) * (r.random() ** 3); op = 0.35 + 0.65 * r.random()
        c.append("<circle cx='%.0f' cy='%.0f' r='%.2f' fill='%s' fill-opacity='%.2f'/>" % (x, y, rad, r.choice(cols), op))
    return uri(SVG + ''.join(c) + '</svg>')


def bright(n, ymax, seed):
    r = random.Random(seed); c = []
    for _ in range(n):
        x = r.uniform(60, 1860); y = ymax * (r.random() ** 1.2); s = r.uniform(1.6, 2.4)
        c.append("<circle cx='%.0f' cy='%.0f' r='%.1f' fill='#fff'/><circle cx='%.0f' cy='%.0f' r='%.1f' fill='#cfe0ff' fill-opacity='.08'/>" % (x, y, s, x, y, s * 2.4))
    return uri(SVG + ''.join(c) + '</svg>')


def grain_png():
    # 160x160 grey + alpha noise, alpha 10/255: invisible as a pattern, enough to break gradient bands
    r = random.Random(42); raw = b''
    for _ in range(160):
        raw += b'\x00' + bytes(v for _ in range(160) for v in (r.randrange(256), 10))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 160, 160, 8, 4, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    return 'url(data:image/png;base64,' + base64.b64encode(png).decode() + ')'


def dunes():
    out = []
    for base, amp, seed, col, rim in ((330, 26, 1, '#2b1822', .35), (372, 22, 2, '#1d1017', .22), (420, 18, 3, '#110a0f', .12)):
        r = random.Random(seed); ph = r.uniform(0, 6); pts = []
        for x in range(0, 1921, 60):
            pts.append((x, base + amp * math.sin(x / 420 + ph) + amp * .45 * math.sin(x / 170 + ph * 2)))
        line = 'M0 %.0f ' % pts[0][1] + ' '.join('L%d %.1f' % p for p in pts[1:])
        out.append("<path d='%s V1080 H0Z' fill='%s'/><path d='%s' fill='none' stroke='#ffb38a' stroke-opacity='%.2f' stroke-width='1.6'/>" % (line, col, line, rim))
    return uri(SVG + ''.join(out) + '</svg>')


def reflection():
    r = random.Random(9); d = []
    for _ in range(260):
        t = r.random() ** 1.3; y = 372 + t * 700; w = r.uniform(6, 26) * (1 + t * 2.2); x = 1536 + r.gauss(0, 14 + t * 90) - w / 2
        op = (0.42 * (1 - t) + 0.04) * r.uniform(.4, 1)
        d.append("<rect x='%.0f' y='%.0f' width='%.0f' height='%.1f' rx='1' fill='#e6eeff' fill-opacity='%.2f'/>" % (x, y, w, 1.2 + t * 2.2, op))
    return uri(SVG + ''.join(d) + '</svg>')


def contours():
    # topographic lines: denser and brighter around the middle of the top half, faint below the rows
    r = random.Random(5); p = [r.uniform(0, 6) for _ in range(4)]; out = []
    for i in range(26):
        t = i / 25.0; base = 120 + 950 * (t ** 1.25); op = .035 + .05 * math.exp(-((t - .3) / .2) ** 2)
        pts = []
        for x in range(0, 1921, 40):
            y = base + (34 - 14 * t) * math.sin(x / 300 + p[0] + t * 2.2) + 18 * math.sin(x / 130 + p[1] - t * 3.1) + 9 * math.sin(x / 61 + p[2] + t * 5)
            pts.append('L%d %.1f' % (x, y))
        out.append("<path d='M%s' fill='none' stroke='white' stroke-opacity='%.3f' stroke-width='1.4'/>" % (' '.join(pts)[1:], op))
    return uri(SVG + ''.join(out) + '</svg>')


def blue_hill():
    d = 'M0 372 C200 360 340 368 480 352 C580 340 640 318 720 304 C780 296 820 322 880 328 C950 334 990 300 1060 290 C1120 280 1160 304 1220 318 C1300 344 1420 340 1560 356 C1700 370 1820 362 1920 366'
    return uri(SVG + "<defs><linearGradient id='f' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#0c1630'/><stop offset='.1' stop-color='#070d1d'/><stop offset='.35' stop-color='#050915'/></linearGradient>"
               "<linearGradient id='r' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#8fb4ff' stop-opacity='0'/><stop offset='.45' stop-color='#a9c4ff' stop-opacity='.55'/><stop offset='1' stop-color='#8fb4ff' stop-opacity='0'/></linearGradient></defs>"
               "<path d='" + d + " V1080 H0Z' fill='url(#f)'/><path d='" + d + "' fill='none' stroke='url(#r)' stroke-width='2'/></svg>")


def kf(name, body):
    return '@-webkit-keyframes %s{%s}@keyframes %s{%s}' % (name, body.replace('transform', '-webkit-transform'), name, body)


def anim(a):
    return '-webkit-animation:%s;animation:%s' % (a, a)


css = ['/* GENERATED by tools/make-backgrounds.py: do not edit by hand. Layers come from themes.js (THEMES[id].layers). */',
       '#nbg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}',
       '#nbg div{position:absolute}',
       '#nbg .nb-full{left:0;top:0;width:100%;height:100%;background-repeat:no-repeat;background-size:100% 100%}',
       '#nbg .nb-grain{left:0;top:0;width:100%;height:100%;background:' + grain_png() + ' repeat}',
       '.nb-tw1{' + anim('nbtw 5.5s ease-in-out infinite alternate') + '}',
       '.nb-tw2{' + anim('nbtw 3.1s ease-in-out infinite alternate 1.3s') + '}',
       kf('nbtw', 'from{opacity:.25}to{opacity:1}'),
       kf('nbbreathe', 'from{opacity:.55}to{opacity:1}'),
       # shooting stars: a thin tail with a bright head, crossing in under a second, then a long empty pause
       '#nbg .nb-sh{width:24rem;height:.14rem;border-radius:.1rem;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(220,232,255,.55) 70%,#fff);opacity:0;will-change:transform,opacity}',
       '#nbg .nb-sh:after{content:"";position:absolute;right:-.3rem;top:-.28rem;width:.7rem;height:.7rem;border-radius:50%;background:#fff;box-shadow:0 0 .8rem .3rem rgba(200,220,255,.6)}',
       '#nbg .nb-sh1{left:12%;top:5%;' + anim('nbsh1 19s linear infinite 4s') + '}',
       '#nbg .nb-sh2{left:58%;top:3%;' + anim('nbsh2 31s linear infinite 13s') + '}',
       kf('nbsh1', '0%{opacity:0;transform:translate3d(0,0,0) rotate(16deg)}.8%{opacity:1}5%{opacity:0;transform:translate3d(46rem,13rem,0) rotate(16deg)}100%{opacity:0;transform:translate3d(46rem,13rem,0) rotate(16deg)}'),
       kf('nbsh2', '0%{opacity:0;transform:translate3d(0,0,0) rotate(158deg)}.5%{opacity:.9}3.2%{opacity:0;transform:translate3d(-38rem,15rem,0) rotate(158deg)}100%{opacity:0;transform:translate3d(-38rem,15rem,0) rotate(158deg)}'),
       ]
S = {}


def layer(theme, name, bg):
    css.append('body.th-%s #nbg .nb-%s{background-image:%s}' % (theme, name, bg))


# ---- Horizon: the rim of a dark planet behind the clock, sunrise light on its edge, twinkling stars, shooting stars
css += ['body.th-horizon{--bg:#000;--card:#0d1018}',
        'body.th-horizon #themebg{background:#000}',
        'body.th-horizon .nb-sky{left:0;top:0;width:100%;height:100%;background:radial-gradient(ellipse 70% 40% at 50% 32%,rgba(50,80,160,.16),rgba(0,0,0,0) 70%)}',
        'body.th-horizon .nb-planet{left:-150%;width:400%;top:17.5rem;height:400rem;border-radius:50%;background:#030406;box-shadow:0 -1rem 4.5rem rgba(80,130,255,.28),0 -.25rem 1.2rem rgba(160,195,255,.32),inset 0 .14rem 0 rgba(215,228,255,.85),inset 0 1.4rem 3.4rem rgba(90,140,255,.14)}',
        'body.th-horizon .nb-lit{left:0;top:0;width:100%;height:100%;background:radial-gradient(ellipse 34% 9% at 72% 28%,rgba(150,190,255,.12),rgba(0,0,0,0) 70%)}',
        # the sunrise: a soft glow on the rim that slowly breathes (no hard straight streak: the rim is curved)
        'body.th-horizon .nb-sun{left:72%;top:18.4rem;width:64rem;height:9rem;margin:-4.5rem 0 0 -32rem;background:radial-gradient(ellipse 50% 50% at 50% 50%,rgba(255,246,232,.55) 0%,rgba(200,220,255,.26) 7%,rgba(110,150,255,.08) 32%,rgba(0,0,0,0) 70%);' + anim('nbbreathe 9s ease-in-out infinite alternate') + '}']
layer('horizon', 's1', stars(260, 560, .6, 1.3, 1)); layer('horizon', 's2', stars(90, 520, .8, 1.7, 2)); layer('horizon', 's3', bright(9, 470, 3))

# ---- Bleu nuit: calm deep-blue sky, a faint Milky Way, a hill with a thin blue rim
css += ['body.th-bleunuit{--card:#111a30}',
        'body.th-bleunuit #themebg{background:linear-gradient(180deg,#03050c 0%,#060b1c 35%,#0b1838 62%,#12255a 80%,#0a1430 100%)}',
        'body.th-bleunuit .nb-milky{left:-20%;top:-30%;width:140%;height:70%;-webkit-transform:rotate(-12deg);transform:rotate(-12deg);background:radial-gradient(ellipse 50% 22% at 50% 50%,rgba(170,190,255,.07),rgba(170,190,255,0) 70%)}',
        'body.th-bleunuit .nb-hz{left:0;top:0;width:100%;height:100%;background:radial-gradient(ellipse 60% 18% at 50% 35%,rgba(90,130,230,.22),rgba(0,0,0,0) 70%)}']
layer('bleunuit', 's1', stars(340, 760, .6, 1.3, 4)); layer('bleunuit', 's2', stars(120, 700, .8, 1.7, 5)); layer('bleunuit', 's3', bright(12, 640, 6))
layer('bleunuit', 'hill', blue_hill())

# ---- Dunes: night desert, amber light on the crests, a muted moon
css += ['body.th-dunes{--card:#1c1218;--dim:#b9a59f}',
        'body.th-dunes #themebg{background:linear-gradient(180deg,#07060c 0%,#120c18 28%,#2a1722 40%,#1a0f18 52%,#0c080c 100%)}',
        'body.th-dunes .nb-glow{left:0;top:0;width:100%;height:100%;background:radial-gradient(ellipse 55% 14% at 38% 31%,rgba(255,150,90,.30),rgba(255,120,80,.08) 50%,rgba(0,0,0,0) 75%)}',
        'body.th-dunes .nb-moon{left:76%;top:11rem;width:4.2rem;height:4.2rem;border-radius:50%;background:radial-gradient(circle at 38% 38%,#e9dfcf,#cbbba3 60%,#ab9a82);box-shadow:0 0 2.6rem .8rem rgba(255,225,190,.07)}']
layer('dunes', 's1', stars(160, 520, .45, 1.0, 7)); layer('dunes', 'dunes', dunes())

# ---- Ocean: the moon over a calm sea, its reflection shimmering
css += ['body.th-ocean{--card:#0d1626}',
        'body.th-ocean #themebg{background:linear-gradient(180deg,#02040a 0%,#050b18 18%,#0b1a30 33%,#0f2440 34.6%,#071222 35.5%,#040912 60%,#03060c 100%)}',
        'body.th-ocean .nb-moon{left:80%;top:12.5rem;width:4.4rem;height:4.4rem;margin-left:-2.2rem;border-radius:50%;background:radial-gradient(circle at 40% 38%,#e8edf5,#cdd6e4 55%,#a9b6cb);box-shadow:0 0 3.2rem 1.1rem rgba(210,225,255,.09)}',
        'body.th-ocean .nb-halo{left:80%;top:5rem;width:50rem;height:30rem;margin-left:-25rem;background:radial-gradient(closest-side,rgba(150,180,240,.10),rgba(0,0,0,0))}',
        'body.th-ocean .nb-shim{' + anim('nbtw 2.6s ease-in-out infinite alternate') + '}']
layer('ocean', 's1', stars(150, 340, .45, 1.0, 10)); layer('ocean', 'ref', reflection())

# ---- Degrade: soft colour mesh at the top, fading into black behind the rows
css += ['body.th-degrade{--card:#12121c}',
        'body.th-degrade #themebg{background:#07080d}',
        '#nbg .nb-m{border-radius:50%}',
        'body.th-degrade .nb-m1{left:-18%;top:-45%;width:80rem;height:70rem;background:radial-gradient(closest-side,rgba(88,70,210,.50),rgba(88,70,210,0))}',
        'body.th-degrade .nb-m2{right:-15%;top:-30%;width:75rem;height:65rem;background:radial-gradient(closest-side,rgba(20,150,170,.38),rgba(20,150,170,0))}',
        'body.th-degrade .nb-m3{left:30%;top:5%;width:60rem;height:40rem;background:radial-gradient(closest-side,rgba(190,70,140,.20),rgba(190,70,140,0))}',
        'body.th-degrade .nb-fade{left:0;top:0;width:100%;height:100%;background:linear-gradient(180deg,rgba(7,8,13,0) 25%,rgba(7,8,13,.85) 55%,#07080d 75%)}']

# ---- Lignes: faint topographic lines and a warm light from the top right
css += ['body.th-lignes{--card:#16171b}',
        'body.th-lignes #themebg{background:#0b0c0f}',
        'body.th-lignes .nb-spot{right:-10%;top:-40%;width:90rem;height:70rem;background:radial-gradient(closest-side,rgba(255,190,130,.16),rgba(255,190,130,0))}',
        'body.th-lignes .nb-fade{left:0;top:0;width:100%;height:100%;background:linear-gradient(180deg,rgba(11,12,15,0) 30%,rgba(11,12,15,.7) 60%,rgba(11,12,15,.95) 85%)}']
layer('lignes', 'ln', contours())

# ---- Studio: graphite with one soft spotlight from above
css += ['body.th-studio{--card:#1a1b1e}',
        'body.th-studio #themebg{background:#111214}',
        'body.th-studio .nb-light{left:50%;top:-38rem;width:120rem;margin-left:-60rem;height:80rem;background:radial-gradient(closest-side,rgba(255,255,255,.13),rgba(255,255,255,.04) 55%,rgba(255,255,255,0))}',
        'body.th-studio .nb-vig{left:0;top:0;width:100%;height:100%;background:radial-gradient(ellipse 85% 75% at 50% 35%,rgba(0,0,0,0) 55%,rgba(0,0,0,.45))}']

open(OUT, 'w', newline='\n').write('\n'.join(css) + '\n')
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
