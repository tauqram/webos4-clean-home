// Previews for the Theme picker on Home (Home themes and screensaver looks): tv/launcher/bg/pv-<id>.webp, 800x450.
// Renders the launcher's own preview page (tools/preview.js output in scratch/preview) in headless Chromium, app icons
// replaced by plain glass squares and the clock fixed at 10:09, so the pictures never show anything personal.
// Needs Playwright (npm i -g playwright, or any project where require('playwright') works) and Python 3 + Pillow.
//   PV_PUBLIC=1 node tools/preview.js x "mock=1"      (writes scratch/preview; it may fail at the screenshot step: fine)
//   node tools/make-theme-thumbs.js
// Run it again after changing a theme's look or adding one (themes.js THEMES / FX).
'use strict';
const path = require('path'), fs = require('fs'), cp = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..'), PV = path.join(ROOT, 'scratch', 'preview'), OUT = path.join(ROOT, 'tv', 'launcher', 'bg');
const TMP = path.join(ROOT, 'scratch', 'thumbs');
const THEMES = ['noir', 'aurore', 'bleunuit', 'horizon', 'ocean', 'dunes', 'degrade', 'lignes', 'studio', 'noel'];
const SAVERS = ['aurore', 'eclipse', 'soie', 'fireworks', 'none'];
const HIDE = `.tile .ic>*{display:none!important}.tile .ic,.tile .ic:before,.tile .ic:after{background:rgba(255,255,255,.14)!important;--tb:rgba(255,255,255,.14)!important;box-shadow:none!important}
  .tile .nm,#dline,#updpill,#toast,.hbtn span{display:none!important}.tile.foc .ic{transform:none!important;animation:none!important}
  body.tilefoc #view .tile .ic{opacity:1!important}`;
(async () => {
  if (!fs.existsSync(path.join(PV, 'index.html'))) { console.error('run: PV_PUBLIC=1 node tools/preview.js x "mock=1" first'); process.exit(1); }
  fs.mkdirSync(TMP, { recursive: true });
  // preview.js does not copy these: use the current ones
  const L = path.join(ROOT, 'tv', 'launcher'); fs.mkdirSync(path.join(PV, 'bg'), { recursive: true });
  for (const f of ['themes.js', 'backgrounds.css']) fs.copyFileSync(path.join(L, f), path.join(PV, f));
  for (const f of fs.readdirSync(path.join(L, 'bg'))) if (!/^pv-/.test(f)) fs.copyFileSync(path.join(L, 'bg', f), path.join(PV, 'bg', f));
  const b = await chromium.launch();
  const page = async () => {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    await p.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (f, t, ...a) => (t >= 30000 ? 0 : st(f, t, ...a)); });   // no screensaver during the shots
    p.on('pageerror', e => console.log('page error', e.message));
    await p.goto('file://' + path.join(PV, 'index.html') + '?mock=1'); await p.waitForTimeout(2500);
    await p.addStyleTag({ content: HIDE });
    return p;
  };
  let p = await page();
  for (const t of THEMES) {
    await p.evaluate(t => { window.__tvhome.set('theme', t); document.getElementById('time').textContent = '10:09'; }, t);
    await p.waitForTimeout(1800);
    await p.evaluate(() => { document.getElementById('time').textContent = '10:09'; });
    await p.screenshot({ path: path.join(TMP, 'th-' + t + '.png') }); console.log('theme', t);
  }
  await p.close();
  for (const s of SAVERS) {
    p = await page();
    await p.evaluate(s => { const h = window.__tvhome; h.set('saver.photos', false); h.set('saver.clock', false); h.set('saver.fx', s); h.saver(); }, s);
    await p.waitForTimeout(s === 'fireworks' ? 4200 : 6000);
    if (s === 'fireworks') {      // the screen is black between two bursts: 30 shots, merged (brightest pixel) by the Python step
      for (let i = 0; i < 30; i++) { await p.screenshot({ path: path.join(TMP, 'fw' + String(i).padStart(2, '0') + '.png') }); await p.waitForTimeout(1100); }
      console.log('saver', s); await p.close(); continue;
    }
    await p.screenshot({ path: path.join(TMP, 'sv-' + s + '.png') }); console.log('saver', s); await p.close();
  }
  await b.close();
  cp.execFileSync('python3', [path.join(__dirname, 'make-theme-thumbs.py'), TMP, OUT], { stdio: 'inherit' });
})();
