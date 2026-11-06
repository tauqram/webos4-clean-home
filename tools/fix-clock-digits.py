#!/usr/bin/env python3
"""Smooths the 6 and 9 of the clock font (Bricolage Grotesque 800, SIL OFL, no Reserved Font Name, so a modified copy is allowed).

Bricolage draws a deep "ink trap" where the bowl of the 6 and the 9 meets the stem: a thin sliver that reaches into the
counter. It is meant for small print; at the 19rem Home clock it reads as a strange notch (Sam, 2026-11-06). This replaces
those three segments with one smooth curve, for the proportional and the tabular digits, and writes the font back.
Run once from the repo root:  pip install fonttools brotli; python3 tools/fix-clock-digits.py
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

SRC = sys.argv[1] if len(sys.argv) > 1 else 'tv/launcher/fonts/bricolage-grotesque-latin-800-normal.woff2'
OUT = sys.argv[2] if len(sys.argv) > 2 else SRC
f = TTFont(SRC); gs = f.getGlyphSet()


def smooth(name):
    rec = RecordingPen(); gs[name].draw(rec); ops = list(rec.value)
    # the trap = a qCurveTo ending at the top of the cut, a short horizontal lineTo, then a qCurveTo back along the bowl
    for i in range(1, len(ops) - 2):
        a, b, c = ops[i], ops[i + 1], ops[i + 2]
        if a[0] == 'qCurveTo' and b[0] == 'lineTo' and c[0] == 'qCurveTo':
            (ax, ay), (bx, by) = a[1][-1], b[1][0]
            if ay == by and 0 < abs(ax - bx) <= 16:
                prev = ops[i - 1][1][-1]                     # where the stem edge starts to bend into the trap
                end = c[1][-1]                               # where the bowl's edge levels out
                dy = 1 if ay > prev[1] else -1               # the 9's trap points up, the 6's points down
                dx = 1 if end[0] < prev[0] else -1
                h = abs(ay - prev[1]); w = abs(prev[0] - end[0])
                curve = ((prev[0] - dx * w * .30, end[1]), end)      # a clean crotch at the stem, flat at the bottom of the bowl
                ops[i:i + 3] = [('qCurveTo', curve)]
                break
    else:
        raise SystemExit('no ink trap found in ' + name)
    pen = TTGlyphPen(gs)
    for op, args in ops: getattr(pen, op)(*args)
    g = pen.glyph(); g.recalcBounds(f['glyf']); f['glyf'][name] = g


for n in ('nine', 'nine.tf', 'six', 'six.tf'):
    smooth(n)
f.flavor = 'woff2'; f.save(OUT); print('wrote', OUT)
