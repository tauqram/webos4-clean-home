#!/usr/bin/env python3
"""Builds tv/launcher/backgrounds.css: the Home backgrounds (Horizon, Bleu nuit, Océan, Dunes, Dégradé, Lignes, Studio, Noël).

Two steps, both on the PC:   python3 tools/render-backgrounds.py   then   python3 tools/make-backgrounds.py
- render-backgrounds.py computes the pictures (tv/launcher/bg/*.webp, 1080p + a 4K @2x copy): sky, light, planet, moon,
  hills, grain. Soft light only looks real when it is computed; the TV's Chromium 53 cannot do that live.
- this file writes the CSS: each theme shows its picture (-webkit-image-set picks the 4K copy only on a 4K page) and keeps
  the small live details as vectors on top (twinkling stars, shooting stars, the sea's shimmer, falling snow).
Rules for the TV (Chromium 53, OLED panel): animations only touch opacity and transform (no repaint while they run); the
area behind the app rows stays dark. Fixed random seeds: the output is the same on every run.
themes.js puts the layers into #themebg (THEMES[id].layers, one div per entry: class "nb-<name>"), styled here under
body.th-<id>.
"""
import math, os, random, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from bggeom import RIM, SUN_X, rim_y, HILL, bezier_y, BLUE_HILLS, DUNES, SEA, OCEAN_MOON, DUNES_MOON, NLINES, contour_y

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tv', 'launcher', 'backgrounds.css')
SVG = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1920 1080' preserveAspectRatio='none'>"


def uri(svg):
    # '#' must be escaped (it starts a fragment), quotes stay single so the CSS can use double quotes around url()
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe=" :/=',.()-_") + '")'


def stars(n, ymax, rmin, rmax, seed, cols=('#ffffff', '#dfe8ff', '#fff4e0', '#cfe0ff'), keep=None):
    r = random.Random(seed); c = []
    for _ in range(n):
        x = r.uniform(0, 1920); y = ymax * (r.random() ** 1.35)      # more stars higher up
        if keep and not keep(x, y): continue
        rad = rmin + (rmax - rmin) * (r.random() ** 3); op = 0.35 + 0.65 * r.random()
        c.append("<circle cx='%.0f' cy='%.0f' r='%.2f' fill='%s' fill-opacity='%.2f'/>" % (x, y, rad, r.choice(cols), op))
    return uri(SVG + ''.join(c) + '</svg>')


def bright(n, ymax, seed, keep=None):
    r = random.Random(seed); c = []
    for _ in range(n):
        x = r.uniform(60, 1860); y = ymax * (r.random() ** 1.2); s = r.uniform(1.6, 2.4)
        if keep and not keep(x, y): continue
        c.append("<circle cx='%.0f' cy='%.0f' r='%.1f' fill='#fff'/><circle cx='%.0f' cy='%.0f' r='%.1f' fill='#cfe0ff' fill-opacity='.08'/>" % (x, y, s, x, y, s * 2.4))
    return uri(SVG + ''.join(c) + '</svg>')






def reflection(part):
    """The moon's path on the sea: short wavy glints (one ripple each, round ends), split over two layers that shimmer and
    sway out of step, so the light seems to ride on moving water."""
    r = random.Random(9); d = []
    mx = OCEAN_MOON[0]
    for i in range(300):
        t = r.random() ** 1.3; y = SEA + 2 + t * 700; w = r.uniform(8, 30) * (1 + t * 2.2); x = mx + r.gauss(0, 14 + t * 90) - w / 2
        op = (0.42 * (1 - t) + 0.04) * r.uniform(.4, 1); a = (1.3 + t * 3.2) * r.uniform(.7, 1.2) * r.choice((-1, 1)); sw = .9 + t * 1.8
        if i % 2 != part: continue
        k = 3 if w > 34 else 2; seg = w / k                                       # 1 to 1.5 ripples per glint
        d.append("<path d='M%.1f %.1f q%.1f %.1f %.1f 0%s' fill='none' stroke='#e6eeff' stroke-width='%.1f' stroke-linecap='round' stroke-opacity='%.2f'/>"
                 % (x, y, seg / 2, -a, seg, (' t%.1f 0' % seg) * (k - 1), sw, op))
    return uri(SVG + ''.join(d) + '</svg>')


def hexmix(a, b, u):
    a = [int(a[i:i + 2], 16) for i in (1, 3, 5)]; b = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(int(round(p + (q - p) * u)) for p, q in zip(a, b))


def path_d(xs, ys):
    """A smooth SVG path through the points (Catmull-Rom turned into cubic Beziers)."""
    P = list(zip(xs, ys)); o = ['M%.1f %.1f' % P[0]]
    for i in range(len(P) - 1):
        p0 = P[max(i - 1, 0)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(i + 2, len(P) - 1)]
        o.append('C%.1f %.1f %.1f %.1f %.1f %.1f' % (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                                                     p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]))
    return ''.join(o)


def grad(gid, x0, x1, f, n=10):
    """Horizontal gradient for a stroke: f(x) -> (colour, opacity)."""
    st = []
    for k in range(n + 1):
        x = x0 + (x1 - x0) * k / n; col, op = f(x)
        st.append("<stop offset='%.3f' stop-color='%s' stop-opacity='%.3f'/>" % (k / float(n), col, op))
    return "<linearGradient id='%s' gradientUnits='userSpaceOnUse' x1='%.0f' y1='0' x2='%.0f' y2='0'>%s</linearGradient>" % (gid, x0, x1, ''.join(st))


def rims(lines, view='0 0 1920 1080'):
    """Thin lit lines drawn by the TV itself (vector: sharp at 4K). lines: (fn y(x), [(width, f(x)->(colour, opacity)), ...])."""
    defs, paths = [], []
    xs = np.arange(-120, 2041, 30.0)
    for i, (fn, strokes) in enumerate(lines):
        d = path_d(xs, fn(xs))
        for j, (w, f) in enumerate(strokes):
            gid = 'g%d_%d' % (i, j); defs.append(grad(gid, -120, 2040, f))
            paths.append("<path d='%s' fill='none' stroke='url(#%s)' stroke-width='%.2f' stroke-linecap='round'/>" % (d, gid, w))
    svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='%s' preserveAspectRatio='none'><defs>%s</defs>%s</svg>" % (view, ''.join(defs), ''.join(paths))
    return uri(svg)


def kf(name, body):
    return '@-webkit-keyframes %s{%s}@keyframes %s{%s}' % (name, body.replace('transform', '-webkit-transform'), name, body)


def anim(a):
    return '-webkit-animation:%s;animation:%s' % (a, a)


css = ['/* GENERATED by tools/make-backgrounds.py: do not edit by hand. Layers come from themes.js (THEMES[id].layers). */',
       '#nbg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}',
       '#nbg div{position:absolute}',
       '#nbg .nb-full{left:0;top:0;width:100%;height:100%;background-repeat:no-repeat;background-size:100% 100%}',
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


# ---- Horizon: the night side of a planet whose atmosphere is lit from behind; sky, glow and planet are a picture computed on
# the PC (render-backgrounds.py: real light falloff, 4K copy); the thin rim line is an SVG stroke (the TV draws it at 4K, so it
# stays sharp); stars, shooting stars and the breathing sunrise stay live on top.
def above_rim(x, y):      # stars only in the sky, never on the planet
    return y < float(rim_y(x)) - 6


def hires(name):
    return 'url(bg/%s.webp);background-image:-webkit-image-set(url(bg/%s.webp) 1x,url(bg/%s@2x.webp) 2x)' % (name, name, name)


def _hz(x, k):
    wide = math.exp(-((x - SUN_X) / 1400.0) ** 2); near = math.exp(-((x - SUN_X) / 520.0) ** 2)
    return hexmix('#bcd0ff', '#fff6e6', near), min(1.0, (.18 + .82 * wide) * k)


css += ['body.th-horizon{--bg:#000;--card:#0d1018}',
        'body.th-horizon #themebg{background:#000 0 0/100% 100% no-repeat;background-image:' + hires('horizon') + '}',
        # the sunrise bloom: 1400x520 px picture centred on the rim at x 1382 (72 %), y 299 px
        'body.th-horizon .nb-sun{left:71.98%;top:18.71rem;width:87.5rem;height:32.5rem;margin:-16.25rem 0 0 -43.75rem;background:0 0/100% 100% no-repeat;background-image:' + hires('horizon-sun') + ';' + anim('nbbreathe 9s ease-in-out infinite alternate') + '}']
layer('horizon', 'rim', rims([(rim_y, [(4.5, lambda x: _hz(x, .22)), (1.5, lambda x: _hz(x, 1.0))])]))
layer('horizon', 's1', stars(260, 560, .6, 1.3, 1, keep=above_rim)); layer('horizon', 's2', stars(90, 520, .8, 1.7, 2, keep=above_rim)); layer('horizon', 's3', bright(9, 470, 3, keep=above_rim))


# ---- The themes below are pictures computed on the PC (render-backgrounds.py: real light falloff, 4K copy). On top, as vectors:
# the thin lit lines (hill rims, dune crests, contour lines: sharp at 4K), twinkling stars, shooting stars, the shimmer on the sea.
def picture(theme, name, card, extra=''):
    css.append('body.th-%s{--card:%s%s}' % (theme, card, extra))
    css.append('body.th-%s #themebg{background:#000 0 0/100%% 100%% no-repeat;background-image:%s}' % (theme, hires(name)))


def under(fn, x, y, gap=6):
    return y < float(fn(x)) - gap


picture('bleunuit', 'bleunuit', '#111a30')
def _bn(cx, k):
    return lambda x: ('#a9c4ff', (math.exp(-((x - cx) / 560.0) ** 2) * .85 + .15) * k)
layer('bleunuit', 'rim', rims([(BLUE_HILLS[0], [(4.0, _bn(1000, .10)), (1.3, _bn(1000, .55))]),
                               (BLUE_HILLS[1], [(4.0, _bn(720, .06)), (1.2, _bn(720, .32))]),
                               (BLUE_HILLS[2], [(4.0, _bn(1250, .05)), (1.2, _bn(1250, .26))])]))
layer('bleunuit', 's1', stars(340, 760, .6, 1.3, 4, keep=lambda x, y: under(BLUE_HILLS[0], x, y)))
layer('bleunuit', 's2', stars(120, 700, .8, 1.7, 5, keep=lambda x, y: under(BLUE_HILLS[0], x, y)))
layer('bleunuit', 's3', bright(12, 640, 6, keep=lambda x, y: under(BLUE_HILLS[0], x, y)))

picture('dunes', 'dunes', '#1c1218', ';--dim:#b9a59f')
_crest = (.32, .20, .13, .15, .17, .19)
layer('dunes', 'rim', rims([(fn, [(1.2, (lambda k: lambda x: ('#ffb38a', k * .9))(k))]) for fn, k in zip(DUNES, _crest)]))
layer('dunes', 's1', stars(160, 520, .45, 1.0, 7, keep=lambda x, y: under(DUNES[0], x, y) and math.hypot(x - DUNES_MOON[0], y - DUNES_MOON[1]) > 60))

picture('ocean', 'ocean', '#0d1626')
css.append('body.th-ocean .nb-shim1{' + anim('nbtw 2.6s ease-in-out infinite alternate,nbwave1 6.2s ease-in-out infinite alternate') + '}')
css.append('body.th-ocean .nb-shim2{' + anim('nbtw 3.3s ease-in-out infinite alternate 1.1s,nbwave2 7.7s ease-in-out infinite alternate') + '}')
css.append(kf('nbwave1', 'from{transform:translate3d(-.45rem,0,0)}to{transform:translate3d(.45rem,.08rem,0)}'))
css.append(kf('nbwave2', 'from{transform:translate3d(.55rem,.06rem,0)}to{transform:translate3d(-.5rem,0,0)}'))
layer('ocean', 's1', stars(150, 340, .45, 1.0, 10, keep=lambda x, y: math.hypot(x - OCEAN_MOON[0], y - OCEAN_MOON[1]) > 70))
layer('ocean', 'ref1', reflection(0)); layer('ocean', 'ref2', reflection(1))

picture('degrade', 'degrade', '#12121c')

# Lignes: the contour lines are one SVG layer a little larger than the screen that sways very slowly (36 s each way)
picture('lignes', 'lignes', '#16171b')
def _lg(i):
    t = i / (NLINES - 1.0); ym = 120 + 950 * (t ** 1.25)
    def f(x):
        light = math.exp(-(((x - 1700) / 1300.0) ** 2 + ((ym + 150) / 900.0) ** 2))
        return '#ffe9d3', min(1.0, (.08 + .26 * light) * (1 - .55 * min(max((ym - 420) / 500.0, 0), 1)) * 1.25)
    return f
css += ['#nbg .nb-lines{left:-5%;top:-2%;width:110%;height:104%;background:0 0/100% 100% no-repeat;will-change:transform;' + anim('nbsway 36s ease-in-out infinite alternate') + '}',
        kf('nbsway', 'from{transform:translate3d(-3rem,-.5rem,0)}to{transform:translate3d(3rem,.5rem,0)}')]
layer('lignes', 'lines', rims([((lambda i: lambda x: contour_y(i, x))(i), [(1.3, _lg(i))]) for i in range(NLINES)], view='-96 -21.6 2112 1123.2'))
picture('studio', 'studio', '#1a1b1e')

# ---- Noel (season theme, 1 Dec - 6 Jan with the theme on "auto"): a calm blue night and slow snow over the whole screen.
# The pictures come from tools/render-backgrounds.py (computed on the PC); here they only slide down (transform).
# Each snow layer is two pictures tall and moves by exactly one picture, so the loop has no seam.
css += ['body.th-noel{--card:#0f1a2c}',
        'body.th-noel #themebg{background:#03060d url(bg/noel-base.webp) 0 0/100% 100% no-repeat;background-image:-webkit-image-set(url(bg/noel-base.webp) 1x,url(bg/noel-base@2x.webp) 2x)}',
        '#nbg .nb-snow{left:0;top:-100%;width:100%;height:200%;background-repeat:repeat-y;background-size:100% 50%;will-change:transform}',
        'body.th-noel .nb-far{background-image:url(bg/snow-far.webp);background-image:-webkit-image-set(url(bg/snow-far.webp) 1x,url(bg/snow-far@2x.webp) 2x);' + anim('nbfall 70s linear infinite') + '}',
        'body.th-noel .nb-mid{background-image:url(bg/snow-mid.webp);' + anim('nbfall2 38s linear infinite') + '}',
        'body.th-noel .nb-near{background-image:url(bg/snow-near.webp);' + anim('nbfall3 21s linear infinite') + '}',
        kf('nbfall', 'from{transform:translate3d(0,0,0)}to{transform:translate3d(0,50%,0)}'),
        kf('nbfall2', 'from{transform:translate3d(0,0,0)}to{transform:translate3d(-1.5rem,50%,0)}'),
        kf('nbfall3', 'from{transform:translate3d(0,0,0)}to{transform:translate3d(2.5rem,50%,0)}')]

open(OUT, 'w', newline='\n').write('\n'.join(css) + '\n')
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
