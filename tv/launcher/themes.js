/* Themes and screensaver effects for the Home launcher (Chromium 53: ES5 only, no CSS grid, no backdrop-filter).
   A theme = a background drawn in CSS (body.th-<id> #themebg, see index.html), an accent colour and the screensaver effect
   that goes with it. Seasonal themes go in SEASONS: with the theme set to "auto" they take over between their dates. */
(function(){
'use strict';

var THEMES = {
  noir:     {name: 'Noir OLED', accent: '#ffffff', fx: 'fireworks'},
  aurore:   {name: 'Aurore',    accent: '#7cf5d0', fx: 'fireworks'},
  bleunuit: {name: 'Bleu nuit', accent: '#8fb4ff', fx: 'fireworks', layers: ['full rim', 'full s1', 'full s2 tw1', 'full s3 tw2', 'sh sh1', 'sh sh2']},
  horizon:  {name: 'Horizon',   accent: '#a9c4ff', fx: 'fireworks', layers: ['full rim', 'full s1', 'full s2 tw1', 'full s3 tw2', 'sh sh1', 'sh sh2', 'sun']},
  ocean:    {name: 'Océan',     accent: '#bcd2f5', fx: 'fireworks', layers: ['full s1 tw1', 'full ref1 shim1', 'full ref2 shim2', 'sh sh1', 'sh sh2']},
  dunes:    {name: 'Dunes',     accent: '#ffb38a', fx: 'fireworks', layers: ['full rim', 'full s1 tw1', 'sh sh1', 'sh sh2']},
  degrade:  {name: 'Dégradé',   accent: '#b9a8ff', fx: 'fireworks', layers: []},
  lignes:   {name: 'Lignes',    accent: '#ffc58f', fx: 'fireworks', layers: ['lines']},
  studio:   {name: 'Studio',    accent: '#f2f2f0', fx: 'fireworks', soft: true, layers: []},
  noel:     {name: 'Noël',      accent: '#cfe0ff', fx: 'fireworks', layers: ['snow far', 'snow mid', 'snow near']}
};
// layers: the divs a theme draws in #themebg (each word becomes class nb-<word>), styled by backgrounds.css,
// which tools/make-backgrounds.py generates. Themes without layers use the .tb1-.tb3 divs styled in index.html.
// {theme: 'noel', from: [12, 1], to: [1, 6]}  = from 1 December to 6 January (month, day), both included
var SEASONS = [{theme: 'noel', from: [12, 1], to: [1, 6]}];
var BASE = 'aurore';      // what "auto" shows outside every season

function md(d){ return (d.getMonth() + 1) * 100 + d.getDate(); }
function inSeason(s, d){
  var a = s.from[0] * 100 + s.from[1], b = s.to[0] * 100 + s.to[1], x = md(d);
  return a <= b ? x >= a && x <= b : x >= a || x <= b;      // a season can run over New Year
}
function resolve(id, d){
  if (id && id !== 'auto' && THEMES[id]) return id;
  d = d || new Date();
  for (var i = 0; i < SEASONS.length; i++) if (THEMES[SEASONS[i].theme] && inSeason(SEASONS[i], d)) return SEASONS[i].theme;
  return BASE;
}
var current = null;
function apply(id){
  var t = resolve(id), b = document.body;
  if (t === current) return t;
  b.className = (' ' + b.className + ' ').replace(/ th-\w+ /g, ' ').replace(/^ +| +$/g, '') + ' th-' + t;
  layers(THEMES[t].layers);
  document.documentElement.style.setProperty('--accent', THEMES[t].accent);
  current = t; return t;
}
function layers(list){
  var bg = document.getElementById('themebg'), n = document.getElementById('nbg');
  if (n) n.parentNode.removeChild(n);
  if (!bg || !list) return;
  n = document.createElement('div'); n.id = 'nbg';
  for (var i = 0; i < list.length; i++) { var d = document.createElement('div'); d.className = 'nb-' + list[i].split(' ').join(' nb-'); n.appendChild(d); }
  bg.appendChild(n);
}
function options(){
  var o = [['auto', 'Automatique (saisons)']];
  for (var k in THEMES) o.push([k, THEMES[k].name]);
  return o;
}

/* ---------- screensaver effects: drawn on a black canvas, nothing on screen between two bursts ---------- */
var FX = {};

// Fireworks: one rocket at a time, at a new spot each time; the burst fades out slowly, then the screen is fully black
// for a few seconds before the next one (pixels off on an OLED).
FX.fireworks = function(cv, palette, soft){
  var MULTI = soft ? palette : PRIMARY;
  var ctx = cv.getContext('2d'), W = 0, H = 0, parts = [], rocket = null, raf = 0, wait = 0, alive = true, last = 0;
  function size(){ W = cv.width = Math.round(window.innerWidth / 2); H = cv.height = Math.round(window.innerHeight / 2); }   // half resolution: a quarter of the pixels to draw
  function black(){ ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  function launch(){
    if (!alive) return;
    var x = W * (0.12 + Math.random() * 0.76), ty = H * (0.18 + Math.random() * 0.32);
    rocket = {x: x + (Math.random() - 0.5) * W * 0.08, y: H + 4, tx: x, ty: ty, t: 0, dur: 1100 + Math.random() * 500};
    loop();
  }
  function pick(){ return palette[Math.floor(Math.random() * palette.length)]; }
  // every burst draws its own size, shape and colours, so no two look the same
  var SHAPES = ['sphere', 'sphere', 'ring', 'double', 'willow', 'crackle'];
  function burst(x, y){
    var shape = SHAPES[Math.floor(Math.random() * SHAPES.length)], scale = 0.6 + Math.random() * 1.0;     // from small to about a quarter of the screen
    var colours = Math.random() < 0.3 ? 'multi' : Math.random() < 0.5 ? 'one' : 'two', c1 = pick(), c2 = pick();
    var n = Math.round((120 + Math.random() * 60) * scale), r = H * 0.055 * scale;
    for (var i = 0; i < n; i++) {
      var a = Math.PI * 2 * i / n + Math.random() * 0.08, k, g = 0.012, max = 5000 + Math.random() * 3000, c;
      if (shape === 'ring') k = 0.92 + Math.random() * 0.08;
      else if (shape === 'double') k = i % 2 ? 0.95 + Math.random() * 0.05 : 0.5 + Math.random() * 0.05;
      else k = 0.25 + 0.75 * Math.sqrt(Math.random());      // a filled sphere
      if (shape === 'willow') { g = 0.03; max = 7000 + Math.random() * 3000; k *= 0.8; }          // long golden strands that fall
      c = colours === 'multi' ? MULTI[Math.floor(Math.random() * MULTI.length)] : colours === 'two' && (shape === 'double' ? i % 2 : i % 3 === 0) ? c2 : c1;
      if (shape === 'willow' && colours !== 'multi' && !soft) c = '#ffcf7a';
      parts.push({x: x, y: y, vx: Math.cos(a) * r * k, vy: Math.sin(a) * r * k, c: c, g: g, life: 0, max: max,
                  tw: shape === 'crackle' ? Math.random() < 0.8 : Math.random() < 0.3});
    }
  }
  function loop(){ raf = requestAnimationFrame(frame); }
  function frame(now){
    if (!alive) return;
    var dt = last ? Math.min(50, now - last) : 16; last = now;
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(0, 0, W, H);   // short trails
    ctx.globalCompositeOperation = 'lighter';
    if (rocket) {
      rocket.t += dt; var k = Math.min(1, rocket.t / rocket.dur), e = 1 - Math.pow(1 - k, 2);
      var x = rocket.x + (rocket.tx - rocket.x) * e, y = H + 4 + (rocket.ty - H - 4) * e;
      ctx.fillStyle = 'rgba(255,230,190,0.9)'; ctx.fillRect(x - 1, y - 1, 2, 3);
      if (k >= 1) { burst(rocket.tx, rocket.ty); rocket = null; }
    }
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]; p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      var f = dt / 16; p.vx *= Math.pow(0.965, f); p.vy = p.vy * Math.pow(0.965, f) + p.g * f; p.x += p.vx * f * 0.1; p.y += p.vy * f * 0.1;
      var al = 1 - p.life / p.max; al = al * al; if (p.tw && Math.random() < 0.35) al *= 0.25;
      ctx.globalAlpha = al; ctx.fillStyle = p.c; ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    if (rocket || parts.length) { loop(); return; }
    black(); last = 0;       // all faded: a truly black screen until the next rocket
    wait = setTimeout(launch, 3000 + Math.random() * 1500);
  }
  size(); black();
  wait = setTimeout(launch, window.__MOCK__ ? 300 : 1500);
  return {stop: function(){ alive = false; cancelAnimationFrame(raf); clearTimeout(wait); parts = []; rocket = null; black(); }};
};

var PRIMARY = ['#ff3b3b', '#ffd23b', '#3b7bff', '#3bff6e', '#ff3bd8', '#ffffff'];
var PALETTES = {
  noir: ['#ffffff', '#ffd27a', '#ff6b6b', '#7ab8ff'],
  aurore: ['#7cf5d0', '#5ad1ff', '#c38bff', '#ffffff'],
  bleunuit: ['#8fb4ff', '#ffffff', '#ffd27a', '#ff8fd0'],
  horizon: ['#a9c4ff', '#ffffff', '#ffe2b8', '#7ab8ff'],
  ocean: ['#bcd2f5', '#ffffff', '#8fd8e8', '#ffd27a'],
  dunes: ['#ffb38a', '#ffd9a0', '#fff1d6', '#ff7b6b'],
  degrade: ['#b9a8ff', '#5ad1e0', '#ff8fd0', '#ffffff'],
  lignes: ['#ffc58f', '#ffffff', '#ff9a6a', '#ffe7c2'],
  noel: ['#ffffff', '#cfe0ff', '#ffd27a', '#ff6b6b'],
  studio: ['#f2f2f0', '#d8d6d0', '#b9b7b0', '#ffffff'],
};
// Aurore / Eclipse / Soie: pictures moved by CSS (index.html, "screensaver looks"). The elements exist only while the saver
// runs; stop() removes them after the saver's fade-out, so their pictures leave memory with them.
var svClear = null;
function domFx(name, html){
  var f = function(){
    var box = document.getElementById('svfx'); if (!box) return null;
    clearTimeout(svClear); box.innerHTML = html; box.className = 'on sv-' + name;
    return {stop: function(){ svClear = setTimeout(function(){ box.className = ''; box.innerHTML = ''; }, 1400); }};
  };
  f.dom = true; return f;
}
FX.aurore = domFx('aurore', '<div class="sv a2"><div class="svi"></div></div><div class="sv a3"><div class="svi"></div></div><div class="sv a1"><div class="svi"></div></div>');
FX.eclipse = domFx('eclipse', '<div class="sv g"><div class="sv rot"><div class="svi rim"></div><div class="svi bl"></div></div></div>');
FX.soie = domFx('soie', '<div class="sv s2"><div class="svi"></div></div><div class="sv s1"><div class="svi"></div></div>');
var ROTATION = ['aurore', 'eclipse', 'soie'], rotIx = Math.floor(Math.random() * ROTATION.length);

var running = null;
// choice: 'auto' (or the old 'theme') = the next of Aurore / Eclipse / Soie each time the saver starts; lowmem: the TV is
// short of memory, so the lightest look (Eclipse, about 20 MB of pictures at 4K) replaces the two others.
function saverFx(cv, choice, lowmem){
  saverFxStop();
  var t = current || resolve('auto'), name = choice;
  if (!name || name === 'theme' || name === 'auto') { rotIx = (rotIx + 1) % ROTATION.length; name = ROTATION[rotIx]; }
  if (lowmem && (name === 'aurore' || name === 'soie')) name = 'eclipse';
  if (name === 'none' || !FX[name]) return;
  if (FX[name].dom) { cv.style.display = 'none'; running = FX[name](); return; }
  cv.style.display = 'block';
  running = FX[name](cv, PALETTES[t] || PALETTES.noir, !!(THEMES[t] && THEMES[t].soft));
}
function saverFxStop(){ if (running) { running.stop(); running = null; } }

window.Theme = {apply: apply, resolve: resolve, options: options, saverFx: saverFx, saverFxStop: saverFxStop, list: THEMES};
})();
