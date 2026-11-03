/* Home launcher logic for LG webOS 4.x (Chromium 53): ES5 style on purpose.
   Two modes share this file: Home (index.html) and the Settings overlay (settings.html, opened by the remote's Settings key). */
(function(){
'use strict';
var T0 = Date.now();

/* ================= configuration & settings ================= */
var API = 'http://127.0.0.1:8765';
var MOCK = window.__MOCK__ || null;
var MODE = window.__MODE__ || 'home';
if (MOCK && /mode=settings/.test(location.search)) MODE = 'settings';
if (MOCK && /mode=inputs/.test(location.search)) MODE = 'inputs';
var INPMODE = MODE === 'inputs';          // the Inputs overlay: only the Inputs panel (replaces LG's input picker)
var SETMODE = MODE === 'settings' || INPMODE;   // both overlays share the "no Home behaviour" switches
var CFG = {
  iconInset: {'amazon.alexa': 1},      // apps whose icon is drawn right to its edge: shown a little inside the tile so the rounding does not cut it
  glow: {'netflix':'#e50914','youtube.leanback.v4':'#ff1f3d','hulu':'#1ce783','com.disney.disneyplus-prod':'#2a5bff','amazon':'#00a8e1',
         'com.apple.appletv':'#9aa3b5','com.wbd.stream':'#5b3dff','com.peacock.tv':'#f5c518','spotify-beehive':'#1db954','com.plutotv.app':'#fff200','com.tubitv.ott.tubi':'#7a2bff'},
  inputs: [['com.webos.app.hdmi1','HDMI 1'],['com.webos.app.hdmi2','HDMI 2'],['com.webos.app.hdmi3','HDMI 3'],['com.webos.app.hdmi4','HDMI 4'],
           ['com.webos.app.externalinput.av1','AV'],['com.webos.app.externalinput.component','Composante'],['com.webos.app.livetv','TV en direct']],
  fallbackPlace: {lat: 40.4259, lon: -86.9081, place: 'West Lafayette'}
};
// user settings, stored on the TV in state/settings.json (edited here, on the phone page, or by hand)
var DEFAULTS = {
  weather: {mode: 'auto', zip: '', unit: 'C'},
  clock24: true,
  bg: {on: true, everyMin: 10},
  saver: {on: true, idleMin: 2, photos: true, slideSec: 300, weather: true, dim: 20, level: 15, fx: 'theme', clock: true},
  theme: 'auto',
  ui: {hideCursor: true},
  dock: ['netflix','youtube.leanback.v4','amazon','com.disney.disneyplus-prod'],
  order: [],      // the order of the app grid chosen on Home (long press OK, then left / right); apps not listed keep LG's order, after these
  hide: ['webos.day','com.webos.app.homeconnect','com.webos.app.home','com.webos.app.fullhome']
};
var S = clone(DEFAULTS);

function $(id){ return document.getElementById(id); }
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function merge(d, s){ for (var k in s) { if (s[k] && typeof s[k] === 'object' && !(s[k] instanceof Array)) { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; merge(d[k], s[k]); } else d[k] = s[k]; } return d; }
function el(tag, cls, html){ var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
function p2(n){ return n < 10 ? '0' + n : '' + n; }
function lsGet(k){ try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch(e){ return null; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
function noop(){}
function cls(e, c, on){ var has = (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; if (on && !has) e.className += (e.className ? ' ' : '') + c; else if (!on && has) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^ +| +$/g, '').replace(/ {2,}/g, ' '); }

/* ================= http / api ================= */
function xhr(method, url, body, cb, timeout){
  if (window.__TVAPI__ && url.indexOf(API) === 0) { window.__TVAPI__(method, url.slice(API.length), body, cb); return; }      // rootless build (rootless.js): no local API
  var x = new XMLHttpRequest(); x.open(method, url, true); x.timeout = timeout || 10000;
  x.onload = function(){ var j = null; try { j = JSON.parse(x.responseText); } catch(e){} cb(x.status >= 200 && x.status < 300 ? null : new Error('HTTP ' + x.status), j); };
  x.onerror = x.ontimeout = function(){ cb(new Error('net'), null); };
  x.send(body || null);
}
function mockFor(path){
  var q = path.split('?'), p = q[0];
  if (p === '/api/lg/get') { var m = /cat=(\w+)/.exec(q[1] || ''); var d = (MOCK.lg || {})[m ? m[1] : ''] || {}; return {returnValue: true, settings: d, dimension: (MOCK.lgDim || {})[m ? m[1] : ''] || {}}; }
  return MOCK[p] !== undefined ? MOCK[p] : {};
}
function api(path, cb, timeout){ if (MOCK) { setTimeout(function(){ cb(null, clone(mockFor(path))); }, 15); return; } xhr('GET', API + path, null, cb, timeout || 12000); }
function apiPost(path, body, cb, timeout){ if (MOCK) { setTimeout(function(){ (cb || noop)(null, mockFor(path.split('?')[0]) || {ok: true, returnValue: true}); }, 15); return; } xhr('POST', API + path, body, cb || noop, timeout || 12000); }
var logN = 0;
function dlog(m){ if (MOCK || logN++ > 200) return; try { xhr('POST', API + '/api/log', String(m), noop, 3000); } catch(e){} }
window.onerror = function(m, u, l){ dlog('JSERR ' + m + ' @' + l); };
function toast(m){ var t = $('toast'); t.textContent = m; t.className = 'on'; clearTimeout(toast.h); toast.h = setTimeout(function(){ t.className = ''; }, 3200); }
// a note on Home when a newer version of this project is on GitHub (selfupdate.sh keeps the facts; this only reads them) and the result of the last install
function updPoll(){
  api('/api/update', function(err, j){
    var p = $('updpill'); if (err || !j) return;
    if (j.resultKind && !document.hidden) { toast(j.result || ''); api('/api/update/conf?k=ack&v=1', noop); }
    if (j.available && !j.busy) { p.innerHTML = 'Mise à jour <b></b> prête &nbsp;·&nbsp; Réglages › Mises à jour du logiciel'; p.querySelector('b').textContent = j.available; p.className = 'on'; } else p.className = '';
  }, 8000);
}
// held keys repeat quickly: the longer a key is held the bigger the step (sliders, framing editor)
var lastKey = 0, lastKeyAt = 0, keyRun = 0;
function boost(k){ var n = Date.now(); if (k === lastKey && n - lastKeyAt < 160) keyRun++; else keyRun = 0; lastKey = k; lastKeyAt = n; return keyRun < 4 ? 1 : keyRun < 12 ? 3 : 6; }

/* ================= settings store ================= */
var saveT = null;
function saveSettings(){
  clearTimeout(saveT);
  saveT = setTimeout(function(){ saveT = null; apiPost('/api/settings', JSON.stringify(S), function(err){ if (err) dlog('settings save failed'); }); }, 400);
}
function setPath(path, v){ var p = path.split('.'), o = S; for (var i = 0; i < p.length - 1; i++) o = o[p[i]]; o[p[p.length - 1]] = v; saveSettings(); settingsChanged(path); }
function getPath(path){ var p = path.split('.'), o = S; for (var i = 0; i < p.length; i++) o = o[p[i]]; return o; }
function applyUi(){ cls(document.body, 'nocursor', !!(S.ui && S.ui.hideCursor)); if (window.Theme && !SETMODE) Theme.apply(S.theme); }
function settingsChanged(path){
  if (SETMODE) { if (path.indexOf('ui.') === 0) applyUi(); return; }
  if (path.indexOf('weather.') === 0) wxLoad(true);
  if (path.indexOf('clock24') === 0) { lastT = ''; tick(); }
  if (path.indexOf('bg.') === 0) { bgApply(true); }
  if (path.indexOf('saver.') === 0) activity();
  if (path.indexOf('ui.') === 0 || path === 'theme') applyUi();
  if ((path === 'dock' || path === 'hide' || path === 'order') && apps.length && !tedSilent) buildApps(apps);
}
function applyRemoteSettings(j){
  if (!j || typeof j !== 'object') return;
  var n = merge(clone(DEFAULTS), j), a = JSON.stringify(n), b = JSON.stringify(S);
  if (a === b || saveT) return;      // unchanged, or we have an unsaved local edit
  var dockCh = JSON.stringify(n.dock) !== JSON.stringify(S.dock) || JSON.stringify(n.hide) !== JSON.stringify(S.hide) || JSON.stringify(n.order) !== JSON.stringify(S.order), wxCh = JSON.stringify(n.weather) !== JSON.stringify(S.weather), bgCh = JSON.stringify(n.bg) !== JSON.stringify(S.bg);
  S = n; applyUi();
  if (SETMODE) { if (settingsOn) renderCat(false); return; }
  lastT = ''; tick(); if (dockCh && apps.length) buildApps(apps); if (wxCh) wxLoad(true); if (bgCh) bgApply(true); activity(); if (settingsOn) renderCat(false);
}
function loadSettings(cb){ api('/api/settings', function(err, j){ if (!err) applyRemoteSettings(j); if (cb) cb(); }); }

/* ================= clock ================= */
var DAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'], MONS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
function fmtTime(d){ var h = d.getHours(), ap = ''; if (!S.clock24) { ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12; } else h = p2(h); return {t: h + ':' + p2(d.getMinutes()), ap: ap}; }
function fmtDate(d){ var s = DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONS[d.getMonth()]; return s.charAt(0).toUpperCase() + s.slice(1); }
var MONS3 = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
function fmtShort(d){ var s = DAYS[d.getDay()].slice(0, 3) + '. ' + d.getDate() + ' ' + MONS3[d.getMonth()]; return s.charAt(0).toUpperCase() + s.slice(1); }
var lastT = '', lastD = '';
function tick(){
  var d = new Date(), f = fmtTime(d), ds = fmtDate(d), ts = f.t + ' ' + f.ap;
  if (ts !== lastT) { lastT = ts; $('time').innerHTML = f.t + (f.ap ? '<small>' + f.ap + '</small>' : ''); if (saverOn) $('sinfo').firstChild.innerHTML = f.t + (f.ap ? '<small>' + f.ap + '</small>' : ''); }
  if (ds !== lastD) { lastD = ds; applyUi(); $('date').textContent = ds; if (saverOn) $('sinfo').childNodes[1].textContent = ds; wxRender(); }
}

/* ================= weather (auto location by IP, or ZIP) ================= */
var WX = {
  sun:'<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="9" fill="#ffc83d"/><g stroke="#ffc83d" stroke-width="3" stroke-linecap="round"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/></g></svg>',
  moon:'<svg viewBox="0 0 48 48"><path d="M32 6a18 18 0 1 0 10 28A15 15 0 0 1 32 6z" fill="#cfd8ff"/></svg>',
  part:'<svg viewBox="0 0 48 48"><circle cx="18" cy="18" r="8" fill="#ffc83d"/><path d="M16 38a8 8 0 0 1 1-16 11 11 0 0 1 21 3 6.5 6.5 0 0 1-1 13z" fill="#e9eef7"/></svg>',
  cloud:'<svg viewBox="0 0 48 48"><path d="M13 38a9 9 0 0 1 1-18 12 12 0 0 1 23 3 7.5 7.5 0 0 1-1 15z" fill="#cdd5e3"/></svg>',
  rain:'<svg viewBox="0 0 48 48"><path d="M13 30a9 9 0 0 1 1-18 12 12 0 0 1 23 3 7.5 7.5 0 0 1-1 15z" fill="#aab4c8"/><g stroke="#5aa9ff" stroke-width="3" stroke-linecap="round"><path d="M16 36l-2 6M25 36l-2 6M34 36l-2 6"/></g></svg>',
  snow:'<svg viewBox="0 0 48 48"><path d="M13 30a9 9 0 0 1 1-18 12 12 0 0 1 23 3 7.5 7.5 0 0 1-1 15z" fill="#aab4c8"/><g fill="#fff"><circle cx="15" cy="39" r="2.2"/><circle cx="25" cy="41" r="2.2"/><circle cx="35" cy="39" r="2.2"/></g></svg>',
  storm:'<svg viewBox="0 0 48 48"><path d="M13 30a9 9 0 0 1 1-18 12 12 0 0 1 23 3 7.5 7.5 0 0 1-1 15z" fill="#8c97ad"/><path d="M26 28l-7 11h6l-2 8 9-13h-6z" fill="#ffc83d"/></svg>',
  fog:'<svg viewBox="0 0 48 48"><g stroke="#b8c1d3" stroke-width="3.5" stroke-linecap="round"><path d="M8 17h32M12 25h28M8 33h32"/></g></svg>'
};
function wxDecode(code, isDay){
  if (code === 0) return [isDay ? 'sun' : 'moon', 'Ciel dégagé'];
  if (code === 1 || code === 2) return [isDay ? 'part' : 'cloud', code === 1 ? 'Plutôt dégagé' : 'Partiellement nuageux'];
  if (code === 3) return ['cloud', 'Nuageux'];
  if (code === 45 || code === 48) return ['fog', 'Brouillard'];
  if (code >= 51 && code <= 57) return ['rain', 'Bruine'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['rain', 'Pluie'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['snow', 'Neige'];
  if (code >= 95) return ['storm', 'Orages'];
  return ['cloud', 'Nuageux'];
}
var wx = null, wxAt = 0;
function wxRender(){
  if (!wx) return;
  var d = wxDecode(wx.code, wx.day), now = new Date(), hl = wx.hi != null ? 'Max ' + Math.round(wx.hi) + '°  Min ' + Math.round(wx.lo) + '°  ·  ' : '';
  $('wicon').innerHTML = WX[d[0]] || '';
  $('wtemp').innerHTML = Math.round(wx.temp) + '°<small>' + d[1] + '</small>';
  $('wdesc').textContent = hl + wx.place;
  $('weather').className = 'on';
  var w = $('sinfo').childNodes[2];
  w.innerHTML = (WX[d[0]] || '') + '<span>' + Math.round(wx.temp) + '° ' + d[1] + '</span><span class="p">' + hl + wx.place + '</span>';
  w.className = 'w' + (S.saver.weather ? ' on' : '');
  if (settingsOn && cats[catIdx] && cats[catIdx].id === 'weather' && !wxRender.busy) { wxRender.busy = true; renderCat(false); wxRender.busy = false; }
}
function geoResolve(cb){
  var w = S.weather, key = w.mode === 'zip' ? 'zip:' + w.zip : 'auto', c = lsGet('loc');
  if (c && c.key === key && (key !== 'auto' || Date.now() - c.at < 86400000)) return cb(c);
  function done(l){ l.key = key; l.at = Date.now(); lsSet('loc', l); cb(l); }
  function fallback(){ cb((c && c.key === key ? c : null) || {lat: CFG.fallbackPlace.lat, lon: CFG.fallbackPlace.lon, place: CFG.fallbackPlace.place, key: key, at: 0}); }
  if (MOCK) return cb({lat: CFG.fallbackPlace.lat, lon: CFG.fallbackPlace.lon, place: CFG.fallbackPlace.place, key: key});
  if (w.mode === 'zip') {
    if (!/^\d{5}$/.test(w.zip)) return fallback();
    xhr('GET', 'https://api.zippopotam.us/us/' + w.zip, null, function(err, j){
      if (err || !j || !j.places || !j.places[0]) { toast('ZIP code ' + w.zip + ' not found'); return fallback(); }
      var p = j.places[0]; done({lat: parseFloat(p.latitude), lon: parseFloat(p.longitude), place: p['place name'] + ', ' + p['state abbreviation']});
    }, 10000);
  } else {
    xhr('GET', 'https://ipwho.is/', null, function(err, j){
      if (!err && j && j.success && j.latitude) return done({lat: j.latitude, lon: j.longitude, place: j.city || 'Ici'});
      xhr('GET', 'https://ipapi.co/json/', null, function(e2, k){
        if (!e2 && k && k.latitude) return done({lat: k.latitude, lon: k.longitude, place: k.city || 'Ici'});
        fallback();
      }, 10000);
    }, 10000);
  }
}
function wxLoad(force){
  if (!force && Date.now() - wxAt < 10 * 60000) return;
  geoResolve(function(l){
    var unit = S.weather.unit === 'C' ? 'celsius' : 'fahrenheit';
    if (MOCK) { wx = {temp: 61, code: 2, day: 1, hi: 66, lo: 48, place: l.place}; wxAt = Date.now(); return wxRender(); }
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon + '&current_weather=true&daily=temperature_2m_max,temperature_2m_min' +
            '&temperature_unit=' + unit + '&timezone=auto&forecast_days=1';
    xhr('GET', u, null, function(err, j){
      if (err || !j || !j.current_weather) { dlog('weather failed ' + (err && err.message)); return; }
      var cw = j.current_weather;
      wx = {temp: cw.temperature, code: cw.weathercode, day: cw.is_day === 1, place: l.place,
            hi: j.daily && j.daily.temperature_2m_max ? j.daily.temperature_2m_max[0] : null, lo: j.daily && j.daily.temperature_2m_min ? j.daily.temperature_2m_min[0] : null};
      wxAt = Date.now(); lsSet('wx', {wx: wx, at: wxAt, unit: unit}); wxRender();
    }, 15000);
  });
}
(function(){ var c = lsGet('wx'); if (c && c.wx) { wx = c.wx; wxAt = c.at; } })();

/* ================= apps, tiles, focus ================= */
var apps = [], rows = [], R = 0, C = 0, lastX = null, viewY = 0;
function iconUrl(p){ if (!p) return ''; if (p.charAt(0) !== '/') return p; return MOCK && MOCK.iconBase ? MOCK.iconBase + p.split('/').slice(-2).join('_') : 'file://' + encodeURI(p); }
function glowFor(a){
  if (!a) return '#3a4a78'; if (CFG.glow[a.id]) return CFG.glow[a.id];
  var c = a.iconColor || a.bgColor || '';
  if (/^#[0-9a-f]{6}$/i.test(c) && c.toLowerCase() !== '#ffffff' && c.toLowerCase() !== '#000000') return c;
  var h = 0, s = a.id || ''; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return 'hsl(' + h + ',70%,55%)';
}
function mkTile(a, big){
  var t = el('div', 'tile ' + (big ? 'big' : 'sm')), ic = el('div', 'ic'), img = el('img'); img.alt = ''; img.src = iconUrl(a.largeIcon || a.icon);
  // LG's own Home paints each tile with the app's iconColor and draws the (often transparent) icon over it: do the same, so icons fill their tile as on LG's bar
  var tb = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(a.iconColor || '') ? a.iconColor : '';
  if (tb) { ic.style.setProperty('--tb', tb); ic.className += ' lgc' + (CFG.iconInset[a.id] ? ' ins' : ''); }
  else if (big) {
    ic.style.background ='linear-gradient(150deg, rgba(255,255,255,.12) 0%, rgba(7,8,12,.55) 100%), ' + glowFor(a);   // wide card tinted with the app's colour
    var tint = el('div', 'tint'); tint.style.background = glowFor(a); ic.appendChild(tint);      // a flat tint, used by themes that want it (Azion)
  }
  ic.appendChild(img); ic.appendChild(el('div', 'ring')); t.appendChild(ic);
  var nm = el('div', 'nm'); nm.textContent = a.title || a.id; t.appendChild(nm); t._app = a; return t;
}
function buildApps(list){
  var dock = $('dock'), grid = $('grid'); dock.innerHTML = ''; grid.innerHTML = '';
  var byId = {}, inDock = {}; list.forEach(function(a){ byId[a.id] = a; });
  S.dock.forEach(function(id){ if (byId[id]) { dock.appendChild(mkTile(byId[id], true)); inDock[id] = 1; } });
  gridApps(list, inDock).forEach(function(a){ grid.appendChild(mkTile(a, false)); });
  layoutRows();
}
// the apps of the grid, in the order chosen on Home (S.order) and then LG's order for anything new
function gridApps(list, inDock){
  var g = list.filter(function(a){ return !inDock[a.id] && S.hide.indexOf(a.id) < 0 && a.visible !== false; }), o = S.order || [];
  return g.map(function(a, i){ var k = o.indexOf(a.id); return {a: a, k: k < 0 ? 1e6 + i : k}; }).sort(function(x, y){ return x.k - y.k; }).map(function(x){ return x.a; });
}
function layoutRows(){
  var hb = [$('b-theme'), $('b-eco'), $('b-net'), $('b-settings')], dock = [].slice.call($('dock').children), g = [].slice.call($('grid').children), gr = [], top = -1;
  g.forEach(function(t){ if (t.offsetTop !== top) { gr.push([]); top = t.offsetTop; } gr[gr.length - 1].push(t); });
  rows = [hb, dock].concat(gr).filter(function(r){ return r.length; });
  if (R >= rows.length) R = rows.length - 1; if (C >= rows[R].length) C = rows[R].length - 1;
}
function loadApps(cb){
  api('/api/apps', function(err, j){
    if (err || !j || !j.launchPoints) { dlog('apps failed ' + (err && err.message)); if (cb) cb(false); return; }
    apps = j.launchPoints; buildApps(apps); if (cb) cb(true);
  });
}
var lastFocus = null, glowSide = 0;
// the large line above the rows names whatever has the focus
var HERO_BTN = {'b-eco': ['Économie d’énergie', 'Baisse la luminosité de l’écran, pour le soir'], 'b-theme': ['Thème', 'Les couleurs et le fond de l’accueil'], 'b-inputs': ['Entrées', 'HDMI, TV en direct et autres sources'], 'b-net': ['Réseau', 'Connexion et adresse de la TV'], 'b-settings': ['Réglages', 'Image, son, veille et confidentialité']};
function setHero(e){
  var t = $('htitle'), s = $('hsub'); if (!t || !s) return;
  var b = HERO_BTN[e.id];
  t.textContent = b ? b[0] : (e._app ? e._app.title || e._app.id : '');
  s.textContent = b ? b[1] : ted ? '◀ ▶ pour déplacer  ·  ▲ favori ou masquer  ·  OK pour terminer' : 'OK pour ouvrir  ·  appui long sur OK pour modifier';
}
function setGlow(color){
  var a = $('glowA'), b = $('glowB'), n = glowSide ? a : b, o = glowSide ? b : a; glowSide = 1 - glowSide;
  n.style.background = 'radial-gradient(ellipse at 50% 0%, ' + color + ' 0%, rgba(0,0,0,0) 62%)'; n.className = 'on'; o.className = '';
}
function focusItem(r, c, keepX){
  if (!rows.length) return;
  R = Math.max(0, Math.min(rows.length - 1, r)); C = Math.max(0, Math.min(rows[R].length - 1, c));
  var e = rows[R][C];
  if (lastFocus && lastFocus !== e) lastFocus.className = lastFocus.className.replace(' foc', '');
  if (e.className.indexOf(' foc') < 0) e.className += ' foc';
  lastFocus = e;
  if (!keepX) { var rc = e.getBoundingClientRect(); lastX = rc.left + rc.width / 2; }
  setGlow(glowFor(e._app));
  setHero(e);
  var rc2 = e.getBoundingClientRect(), vh = window.innerHeight, fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
  var bottom = rc2.bottom + viewY + 5 * fs, want = bottom > vh ? bottom - vh : 0;
  if (R <= 1) want = 0;
  viewY = want; $('view').style.transform = want ? 'translate3d(0,' + (-want) + 'px,0)' : 'translate3d(0,0,0)';
}
function move(dir){
  var r = R, c = C;
  if (dir === 'L' || dir === 'R') { c += dir === 'L' ? -1 : 1; if (c < 0 || c >= rows[R].length) return; focusItem(R, c); return; }
  r += dir === 'U' ? -1 : 1; if (r < 0 || r >= rows.length) return;
  var best = 0, bd = 1e9, x = lastX == null ? 0 : lastX;
  for (var i = 0; i < rows[r].length; i++) { var rc = rows[r][i].getBoundingClientRect(), d = Math.abs(rc.left + rc.width / 2 - x); if (d < bd) { bd = d; best = i; } }
  focusItem(r, best, true);
}
function launch(id){
  dlog('launch ' + id);
  var path = id === 'com.palm.app.settings' ? '/api/lg/open' : '/api/launch?id=' + encodeURIComponent(id);
  api(path, function(err, j){ if (err || (j && j.returnValue === false)) toast('Impossible d’ouvrir ' + id + (j && j.errorText ? ' (' + j.errorText + ')' : '')); else if (SETMODE && id === 'com.palm.app.settings') closeSettings(); });
}

/* ================= photos (gallery), framing & Home background ================= */
var photos = [], photosLoaded = false, crops = {};
function photoBase(){ return MOCK && MOCK.photoBase ? MOCK.photoBase : 'photos/'; }
function photoUrl(n){ return photoBase() + encodeURIComponent(n); }
function thumbUrl(n){ return photoBase() + 'thumbs/' + encodeURIComponent(n); }
function httpPhotoUrl(n){ return MOCK ? photoUrl(n) : API + '/photos/' + encodeURIComponent(n); }      // the editor reads pixels, so it needs a CORS-enabled URL
function shuffle(a){ for (var i = a.length - 1; i > 0; i--) { var k = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[k]; a[k] = t; } return a; }
function refreshPhotos(cb){
  api('/api/photos', function(err, j){
    if (err || !(j instanceof Array)) { if (cb) cb(false); return; }
    var changed = false, had = photos.slice();
    if (!photosLoaded) { photos = shuffle(j.slice()); photosLoaded = true; changed = true; }
    else {
      var keep = photos.filter(function(n){ return j.indexOf(n) >= 0; }), add = j.filter(function(n){ return photos.indexOf(n) < 0; });
      photos = keep.concat(add); changed = photos.length !== had.length || add.length > 0;
    }
    if (changed && photos.length && bgIx >= photos.length) bgIx = 0;
    api('/api/crops', function(e2, c){
      if (!e2 && c && typeof c === 'object') { var s1 = JSON.stringify(crops), s2 = JSON.stringify(c); if (s1 !== s2) { crops = c; changed = true; } }
      if (cb) cb(changed);
    });
  });
}
function setBodyBg(on){ cls(document.body, 'hasbg', on); }
function hasBg(){ return document.body.className.indexOf('hasbg') >= 0; }
function layerStage(layer){ if (!layer._st) { layer._st = Stage.make(); layer.appendChild(layer._st); } return layer._st; }
var bgIx = -1, bgFlip = 0, bgT = null, bgAt = 0, LOWMEM = false;      // LOWMEM: memguard.sh says the TV is short of memory (or is a weak one): no photos on Home or in the screensaver
function bgShow(ix){
  if (!photos.length || !S.bg.on || LOWMEM) return;
  bgIx = ((ix % photos.length) + photos.length) % photos.length; bgAt = Date.now(); lsSet('bgName', photos[bgIx]);
  var name = photos[bgIx], a = $(bgFlip ? 'bgB' : 'bgA'), b = $(bgFlip ? 'bgA' : 'bgB'), im = new Image();
  im.onload = function(){
    var st = layerStage(a); st.lastChild.src = im.src; Stage.place(st, im.naturalWidth, im.naturalHeight, crops[name]);
    a.className = 'bgl show'; b.className = 'bgl'; setBodyBg(true); bgFlip = 1 - bgFlip;
    setTimeout(function(){ if (b.className.indexOf('show') < 0) layerStage(b).lastChild.removeAttribute('src'); }, 3000);
  };
  im.onerror = function(){ dlog('bg photo failed ' + name); };
  im.src = photoUrl(name);
}
function bgPickNew(){
  if (!photos.length || !S.bg.on || LOWMEM) return;
  var last = lsGet('bgName'), n = photos.length, k = Math.floor(Math.random() * n);
  if (n > 1 && photos[k] === last) k = (k + 1 + Math.floor(Math.random() * (n - 1))) % n;
  bgShow(k);
}
function bgSchedule(){ clearTimeout(bgT); bgT = setTimeout(function(){ if (!document.hidden && !saverOn && !settingsOn) bgShow(bgIx + 1); bgSchedule(); }, Math.max(1, S.bg.everyMin) * 60000); }
function bgApply(reschedule){
  if (!S.bg.on || !photos.length || LOWMEM) { $('bgA').className = $('bgB').className = 'bgl'; setBodyBg(false); layerStage($('bgA')).lastChild.removeAttribute('src'); layerStage($('bgB')).lastChild.removeAttribute('src'); }
  else if (reschedule && bgIx < 0) bgPickNew();
  else if (!hasBg()) bgShow(bgIx < 0 ? 0 : bgIx);
  if (reschedule) bgSchedule();
}

/* ================= screensaver / AFK ================= */
var saverOn = false, pIx = 0, flip = 0, idleT = null, slideT = null, driftT = null, SV = null;
function svStages(){ if (!SV) { SV = [Stage.make(), Stage.make()]; var sv = $('saver'); sv.insertBefore(SV[0], sv.firstChild); sv.insertBefore(SV[1], sv.firstChild); } return SV; }
function showNext(){
  if (!saverOn) return;
  var sv = svStages(), a = sv[flip], b = sv[1 - flip];
  var name = photos[pIx], src = photoUrl(name); pIx = (pIx + 1) % photos.length; var im = new Image();
  im.onload = function(){
    if (!saverOn) return;
    a.lastChild.src = src; Stage.place(a, im.naturalWidth, im.naturalHeight, crops[name]); a.className = 'stage show'; b.className = 'stage'; flip = 1 - flip;
    slideT = setTimeout(showNext, Math.max(4, S.saver.slideSec) * 1000);
    setTimeout(function(){ if (a.className.indexOf('show') < 0) return; b.lastChild.removeAttribute('src'); }, 2200);
  };
  im.onerror = function(){ dlog('photo failed ' + src); slideT = setTimeout(showNext, 1000); };
  im.src = src;
}
function drift(){
  var s = $('sinfo'); s.style.left = (3 + Math.random() * 40) + 'rem'; s.style.bottom = (3 + Math.random() * 40) + 'rem';
  driftT = setTimeout(drift, 30000);
}
// the TV's real backlight: lowered while the screensaver runs (tv/backlight.sh keeps the original and restores it in five independent ways)
var blOn = false, blT = null;
function blDim(){
  var p = S.saver.level === undefined ? 15 : S.saver.level; if (p >= 100 || MOCK) return;
  blOn = true; api('/api/backlight?v=dim&level=' + p, noop, 15000);
  clearInterval(blT); blT = setInterval(function(){ if (saverOn) api('/api/backlight?v=hold', noop); }, 60000);
}
function blRestore(){ clearInterval(blT); if (blOn) { blOn = false; api('/api/backlight?v=restore', noop, 15000); } }
function saverStart(){
  if (saverOn || document.hidden || mstack.length || settingsOn || SETMODE) return;
  saverOn = true; lastT = lastD = ''; tick(); wxRender();
  // free the Home background while the screensaver runs: two big photos at once would make the TV swap
  ['bgA', 'bgB'].forEach(function(id){ var l = $(id); l.className = 'bgl'; layerStage(l).lastChild.removeAttribute('src'); }); setBodyBg(false);
  var withPhotos = S.saver.photos && photos.length > 0 && !LOWMEM;
  $('saver').className = 'on' + (withPhotos ? '' : ' nophoto') + (S.saver.clock === false ? ' noclock' : '') + (withPhotos || S.saver.fx === 'none' ? '' : ' fxon'); cls(document.body, 'saving', true);
  $('sdim').style.opacity = ((S.saver.dim === undefined ? 30 : S.saver.dim) / 100);
  blDim(); api('/api/history?v=saver', noop);      // Back forgets where you were, if the options say so
  $('scrimS').style.display = withPhotos ? 'block' : 'none';
  if (withPhotos) { pIx = (bgIx + 1) % photos.length; showNext(); } else { drift(); if (window.Theme) Theme.saverFx($('fx'), S.saver.fx); }
  dlog('saver on photos=' + withPhotos);
}
function saverStop(){
  if (!saverOn) return;
  saverOn = false; clearTimeout(slideT); clearTimeout(driftT); $('saver').className = ''; cls(document.body, 'saving', false);
  if (window.Theme) Theme.saverFxStop(); $('fx').style.display = 'none'; $('sdim').style.opacity = 0; blRestore();
  var sv = svStages(); sv[0].className = 'stage'; sv[1].className = 'stage';
  var s = $('sinfo'); s.style.left = ''; s.style.bottom = '';
  setTimeout(function(){ if (!saverOn) { sv[0].lastChild.removeAttribute('src'); sv[1].lastChild.removeAttribute('src'); } }, 1500);
  if (photos.length && S.bg.on) setTimeout(function(){ if (!saverOn) bgShow(bgIx < 0 ? 0 : bgIx); }, 200);
}
function activity(){ clearTimeout(idleT); if (document.hidden || !S.saver.on || SETMODE) return; idleT = setTimeout(saverStart, Math.max(1, S.saver.idleMin) * 60000); }

/* ================= modal list (Inputs / Network / choices) ================= */
var mstack = [], pItems = [], pIdx = 0;
function mtop(){ return mstack[mstack.length - 1]; }
function mpush(n){ mstack.push(n); } function mpop(n){ var i = mstack.lastIndexOf(n); if (i >= 0) mstack.splice(i, 1); }
function panelOpen(title, list){
  $('ptitle').textContent = title; var box = $('plist'); box.innerHTML = ''; pItems = [];
  list.forEach(function(it){ var d = el('div', 'pitem'); d.innerHTML = '<span></span><span class="v"></span>'; d.firstChild.textContent = it[0]; d.lastChild.textContent = it[1] || ''; d._pick = it[2]; box.appendChild(d); pItems.push(d); });
  $('panel').className = 'on'; if (mtop() !== 'panel') mpush('panel'); panelFocus(0);
}
function panelFocus(i){ pIdx = Math.max(0, Math.min(pItems.length - 1, i)); pItems.forEach(function(d, k){ d.className = 'pitem' + (k === pIdx ? ' foc' : ''); }); }
function panelClose(){ if (mtop() === 'panel') mpop('panel'); $('panel').className = ''; if (INPMODE) apiPost('/api/settings/close?id=inputs', ''); }      // the Inputs overlay is only its panel: closing it ends the page
// Favorites = the wide cards on top of Home. The panel lists every app in alphabetical order; OK adds one (at the end) or removes it.
var favApps = null, FAV_MAX = 6;
function favPanel(at){
  if (!favApps) { api('/api/apps', function(e, j){ if (j && j.launchPoints) { favApps = j.launchPoints; favPanel(at); } else toast('Impossible de lire la liste des apps'); }, 15000); return; }
  var list = favApps.filter(function(a){ return a.visible !== false && S.hide.indexOf(a.id) < 0; });
  list.sort(function(a, b){ return (a.title || a.id).localeCompare(b.title || b.id); });
  panelOpen('Favoris (' + S.dock.length + ' sur ' + FAV_MAX + ')', list.map(function(a, i){ var k = S.dock.indexOf(a.id);
    return [(k >= 0 ? '★  ' : '') + (a.title || a.id), k >= 0 ? 'position ' + (k + 1) : 'ajouter', function(){ favToggle(a.id, i); }]; }));
  if (at) panelFocus(at);
}
function favToggle(id, i){
  var d = S.dock.slice(), k = d.indexOf(id);
  if (k >= 0) d.splice(k, 1); else { if (d.length >= FAV_MAX) { toast(FAV_MAX + ' favoris au maximum : retires-en un d’abord'); return; } d.push(id); }
  setPath('dock', d); favPanel(i); if (settingsOn) renderCat(false);
}
// apps hidden from Home by the owner (the system entries hidden by default are not offered)
function userHidden(){ return S.hide.filter(function(id){ return DEFAULTS.hide.indexOf(id) < 0; }); }
function hiddenPanel(at){
  if (!favApps) { api('/api/apps', function(e, j){ if (j && j.launchPoints) { favApps = j.launchPoints; hiddenPanel(at); } else toast('Impossible de lire la liste des apps'); }, 15000); return; }
  var by = {}; favApps.forEach(function(a){ by[a.id] = a; });
  var l = userHidden().map(function(id){ return [(by[id] && by[id].title) || id, 'remettre', function(){ setPath('hide', S.hide.filter(function(x){ return x !== id; })); toast('De retour sur l’accueil'); hiddenPanel(pIdx); if (settingsOn) renderCat(false); }]; });
  if (!l.length) l.push(['Aucune app masquée', '']);
  panelOpen('Apps masquées', l); if (at) panelFocus(at);
}
// the header's sun / moon button: LG's picture.energySaving (OLED: lowers the light a lot), one press away from Home
var ECO = [['off', 'Désactivée', 'luminosité normale'], ['min', 'Minimum', ''], ['med', 'Moyenne', ''], ['max', 'Maximum', 'le plus sombre'], ['auto', 'Automatique', 'selon la lumière de la pièce']];
var SVG_SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    SVG_MOON = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>';
function ecoShow(v){
  var on = v && v !== 'off', n = {min: 'Éco min', med: 'Éco moyen', max: 'Éco max', auto: 'Éco auto'};
  $('ecoico').innerHTML = on ? SVG_MOON : SVG_SUN; $('ecolabel').textContent = on ? (n[v] || 'Éco') : 'Éco';
}
function ecoRead(cb){ lgLoad('picture', ['energySaving'], function(){ var v = (LGC.picture || {}).energySaving; ecoShow(v); if (cb) cb(v); }); }
function openEco(){
  ecoRead(function(cur){
    panelOpen('Économie d’énergie', ECO.map(function(o){ return [(o[0] === cur ? '✓  ' : '') + o[1], o[2], function(){
      panelClose(); lgSet('picture', 'energySaving', o[0], function(){ ecoRead(); toast('Économie d’énergie : ' + o[1].toLowerCase()); });
    }]; }));
    for (var i = 0; i < ECO.length; i++) if (ECO[i][0] === cur) { panelFocus(i); break; }
  });
}
// the header's brush button: the theme list straight from Home (the remote's Input key still opens the inputs)
function openThemes(){
  var o = window.Theme ? Theme.options() : [['auto', 'Automatique']], cur = S.theme || 'auto', at = 0;
  panelOpen('Thème', o.map(function(x, i){ if (x[0] === cur) at = i; return [(x[0] === cur ? '✓  ' : '') + x[1], '', function(){ panelClose(); if (x[0] !== (S.theme || 'auto')) setPath('theme', x[0]); }]; }));
  panelFocus(at);
}
function openInputs(){ panelOpen('Entrées', CFG.inputs.map(function(i){ return [i[1], '', function(){ panelClose(); launch(i[0]); }]; })); }
function openNet(){
  api('/api/net', function(err, j){
    var l = [];
    if (j && j.returnValue) { var w = j.wired || {}, f = j.wifi || {};
      l.push(['Ethernet', w.state === 'connected' ? (w.ipAddress || 'connected') : 'non connecté']);
      l.push(['Wi-Fi', f.state === 'connected' ? ((f.ssid || 'connected') + (f.ipAddress ? '  ' + f.ipAddress : '')) : 'non connecté']);
      l.push(['Internet', j.isInternetConnectionAvailable ? 'available' : 'indisponible']);
    } else l.push(['État du réseau', 'unavailable']);
    l.push(['Plus de réglages réseau', '', function(){ panelClose(); openSettings('net'); }]);
    panelOpen('Réseau', l); for (var i = 0; i < pItems.length; i++) if (pItems[i]._pick) { panelFocus(i); break; }
  });
}
function activate(){
  var e = rows[R] && rows[R][C]; if (!e) return;
  if (e._app) launch(e._app.id); else if (e.id === 'b-inputs') openInputs(); else if (e.id === 'b-theme') openThemes(); else if (e.id === 'b-eco') openEco(); else if (e.id === 'b-net') openNet(); else if (e.id === 'b-settings') openSettings();
}

/* ================= keypad (ZIP entry) ================= */
var kVal = '', kIdx = 0, kBtns = [], kDone = null, kMax = 5;
function keypadOpen(title, initial, max, done){
  kVal = initial || ''; kMax = max; kDone = done; $('ktitle').textContent = title;
  var pad = $('kpad'); pad.innerHTML = ''; kBtns = [];
  ['1','2','3','4','5','6','7','8','9','⌫','0','✓'].forEach(function(k){ var b = el('div', 'kk', k); b._k = k; pad.appendChild(b); kBtns.push(b); });
  kIdx = 0; keypadDraw(); $('keym').className = 'on'; mpush('keypad');
}
function keypadDraw(){ $('kdisp').textContent = kVal || '–'; kBtns.forEach(function(b, i){ b.className = 'kk' + (i === kIdx ? ' foc' : ''); }); }
function keypadPress(k){
  if (k === '⌫') kVal = kVal.slice(0, -1);
  else if (k === '✓') { var v = kVal; keypadClose(); if (kDone) kDone(v); return; }
  else if (kVal.length < kMax) kVal += k;
  keypadDraw();
}
function keypadClose(){ mpop('keypad'); $('keym').className = ''; }
function keypadKey(k, e){
  if (k >= 48 && k <= 57) { keypadPress(String.fromCharCode(k)); return; }
  if (k === 461 || k === 27) { keypadClose(); return; }
  if (k === 8) { keypadPress('⌫'); return; }
  if (k === 37) kIdx = kIdx % 3 ? kIdx - 1 : kIdx; else if (k === 39) kIdx = (kIdx % 3) < 2 ? kIdx + 1 : kIdx;
  else if (k === 38) kIdx = kIdx >= 3 ? kIdx - 3 : kIdx; else if (k === 40) kIdx = kIdx < 9 ? kIdx + 3 : kIdx;
  else if (k === 13) { keypadPress(kBtns[kIdx]._k); return; }
  keypadDraw();
}

/* ================= QR / phone link ================= */
var qrPoll = null;
// qr.js (57 KB) is only needed for the phone-link QR code: load it then, not at every start of Home and Settings
function withQr(cb){
  if (typeof qrcode === 'function') return cb();
  var s = document.createElement('script'); s.src = 'qr.js'; s.onload = cb; s.onerror = function(){ toast('QR failed'); }; document.head.appendChild(s);
}
function qrOpen(){ withQr(qrOpen2); }
function qrOpen2(){
  api('/api/info', function(err, j){
    if (err || !j || !j.ip) { toast('Impossible de lire l’adresse de la TV'); return; }
    var url = MOCK ? 'http://10.0.0.63:8765/?t=demo' : 'http://' + j.ip + ':' + j.port + '/?t=' + j.token;
    var cv = $('qrcv'), ctx = cv.getContext('2d'), qr;
    try { qr = qrcode(0, 'M'); qr.addData(url); qr.make(); } catch(e){ toast('QR failed'); return; }
    var n = qr.getModuleCount(), cell = Math.floor(280 / n), off = Math.floor((280 - cell * n) / 2);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 280, 280); ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    $('qrurl').textContent = url.replace(/\?t=.*/, '');
    $('qrm').className = 'on'; mpush('qr');
    qrPoll = setInterval(function(){ refreshPhotos(function(ch){ if (ch) { toast(photos.length + ' photos dans la galerie'); if (settingsOn) renderCat(false); } }); }, 3000);
  });
}
function qrClose(){ clearInterval(qrPoll); mpop('qr'); $('qrm').className = ''; refreshPhotos(function(){ if (settingsOn) renderCat(false); if (!SETMODE && !hasBg()) bgApply(true); }); }

/* ================= LG settings access ================= */
var LGC = {}, LGD = {};
function lgLoad(cat, keys, cb){
  api('/api/lg/get?cat=' + cat + '&keys=' + keys.join(','), function(err, j){
    if (j && j.settings) { LGC[cat] = j.settings; LGD[cat] = j.dimension || {}; } else if (!LGC[cat]) LGC[cat] = {};
    cb();
  });
}
function lgLoadMany(list, cb){ var i = 0; (function next(){ if (i >= list.length) return cb(); var l = list[i++]; lgLoad(l[0], l[1], next); })(); }
function lgSet(cat, key, val, after){
  var st = {}; st[key] = String(val); (LGC[cat] = LGC[cat] || {})[key] = String(val);
  apiPost('/api/lg/set', JSON.stringify({category: cat, settings: st}), function(err, j){
    if (err || (j && j.returnValue === false)) { toast('La TV a refusé ce réglage' + (j && j.errorText ? ': ' + j.errorText : '')); }
    if (after) after();
  });
}
function lgHas(cat, key){ return !!LGC[cat] && LGC[cat][key] !== undefined; }

/* ================= Settings screen ================= */
var paneOpen = false;
var settingsOn = false, cats = [], catIdx = 0, sArea = 'cats', sRows = [], sR = 0, sC = 0, setY = 0, catY = 0;
var ICON = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 2.5L5.5 13.5H11l-1 8 8-11.5h-5.5z"/></svg>',
  update: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/><path d="M12 8v5l3 2"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.5 1.5A3.5 3.5 0 0 1 17 18z"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  pic: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="#0b0e14"/><circle cx="15" cy="12" r="2" fill="#0b0e14"/><circle cx="8" cy="17" r="2" fill="#0b0e14"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>',
  power: '<svg viewBox="0 0 24 24"><path d="M12 3v9M6.5 6.5a8 8 0 1 0 11 0"/></svg>',
  net: '<svg viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
  block: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
  hdmi: '<svg viewBox="0 0 24 24"><path d="M4 8h16v6l-3 3H7l-3-3zM9 11h6"/></svg>',
  remote: '<svg viewBox="0 0 24 24"><rect x="8" y="2.5" width="8" height="19" rx="3"/><circle cx="12" cy="8" r="1.6"/><path d="M12 12.5v.5M12 16v.5"/></svg>',
  access: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><path d="M5 9l7 1.5L19 9M12 10.5V15l-3 5.5M12 15l3 5.5"/></svg>'
};
function tgl(label, desc, get, set){ return {type: 'toggle', label: label, desc: desc, get: get, set: set}; }
// Back-button history options live on the TV (lastapp.sh, state/back.conf); the Remote page's data object holds the current values
function backOpt(k, v){ var d = cats[catIdx].data = cats[catIdx].data || {}; d.back = d.back || {}; d.back[k] = (k === 'reset' || k === 'leave') ? v : parseInt(v, 10); api('/api/history?k=' + k + '&n=' + v, function(){ toast('Enregistré'); }); }
function chc(label, desc, opts, get, set){ return {type: 'choice', label: label, desc: desc, opts: opts, get: get, set: set}; }
function sld(label, desc, min, max, step, get, set){ return {type: 'slider', label: label, desc: desc, min: min, max: max, step: step, get: get, set: set}; }
function inf(label, value, desc){ return {type: 'info', label: label, value: value, desc: desc}; }
function act(label, desc, run, val){ return {type: 'action', label: label, desc: desc, run: run, val: val}; }
function head(label){ return {type: 'head', label: label}; }
// the ONE backlight control: applied to every input, app and picture mode (brightness.sh). LG's own "Backlight" slider is hidden because it only ever changed the screen you were on.
function brSld(label){ return sld(label, 'Rétroéclairage pour toutes les entrées et applications, 100 = maximum. La veille a son propre réglage, plus bas, dans Accueil et veille. LG garde un rétroéclairage par entrée : celui-ci les règle toutes et les maintient.', 5, 100, 5,
  function(){ var n = parseInt(BRV, 10); return isNaN(n) ? 100 : n; },
  function(v){ BRV = String(v); clearTimeout(brSld.t); brSld.t = setTimeout(function(){ api('/api/brightness?v=' + v, function(err){ toast(err ? 'Impossible de modifier ce réglage' : 'Rétroéclairage ' + v); }, 70000); }, 700); }); }
function optsOf(it){ return typeof it.opts === 'function' ? it.opts() : it.opts; }
// rows backed by LG's settings service; a row disappears when the TV does not have that key for the current input / picture mode
function lgTgl(cat, key, label, desc, onv, offv){ onv = onv || 'on'; offv = offv || 'off';
  var it = tgl(label, desc, function(){ return String((LGC[cat] || {})[key]) === onv; }, function(b){ lgSet(cat, key, b ? onv : offv); }); it.show = function(){ return lgHas(cat, key); }; return it; }
function lgChc(cat, key, label, desc, opts, reload){
  var it = chc(label, desc, opts, function(){ return (LGC[cat] || {})[key]; }, function(v){ lgSet(cat, key, v, reload ? function(){ renderCat(true); } : null); }); it.show = function(){ return lgHas(cat, key); }; return it; }
function lgSld(cat, key, label, desc, min, max, step){
  var it = sld(label, desc, min, max, step, function(){ return parseInt((LGC[cat] || {})[key] || '0', 10); }, function(v){ clearTimeout(it._t); it._t = setTimeout(function(){ lgSet(cat, key, v); }, 350); });
  it.local = function(v){ (LGC[cat] = LGC[cat] || {})[key] = String(v); }; it.show = function(){ return lgHas(cat, key); }; return it;
}
var OFFON = [['off','Désactivé'],['on','Activé']];
var ASPECTS = [['16x9','16:9'],['original','Original'],['full_wide','Plein écran'],['4x3','4:3'],['14x9','14:9'],['zoom','Zoom'],['zoom2','Zoom 2'],['cinema_zoom','Zoom cinéma'],['21x9','21:9']];
var SOUNDMODES = [['standard','Standard'],['movie','Cinéma'],['news','Voix claire / Infos'],['sports','Sport'],['music','Musique'],['game','Jeu'],['asc','Son IA'],['bass','Graves']];
var SLEEPS = [['off','Désactivé'],['10','10 min'],['20','20 min'],['30','30 min'],['60','1 heure'],['90','1 h 30'],['120','2 heures'],['180','3 heures'],['240','4 heures']];
var LEVELS = [['off','Désactivé'],['low','Bas'],['medium','Moyen'],['high','Élevé']];
var MINS = function(v){ return v + ' min'; };
var PICMODES = {vivid:'Éclatant', normal:'Standard', eco:'Éco', cinema:'Cinéma', sports:'Sport', game:'Jeu', photo:'Photo', expert1:'Expert (pièce claire)', expert2:'Expert (pièce sombre)',
  hdrVivid:'HDR Éclatant', hdrStandard:'HDR Standard', hdrCinemaBright:'HDR Cinéma lumineux', hdrCinema:'HDR Cinéma', hdrGame:'HDR Jeu', hdrEffect:'Effet HDR', technicolor:'Technicolor', hdrTechnicolor:'HDR Technicolor',
  dolbyHdrVivid:'Dolby Vision Éclatant', dolbyHdrStandard:'Dolby Vision Standard', dolbyHdrCinemaBright:'Dolby Vision Cinéma lumineux', dolbyHdrCinema:'Dolby Vision Cinéma', dolbyHdrGame:'Dolby Vision Jeu'};
function picModes(){
  var cur = (LGC.picture || {}).pictureMode || 'normal', fam = /^dolby/.test(cur) ? /^dolby/ : /^(hdr|technicolor)/.test(cur) ? /^(hdr|technicolor)/ : null, out = [];
  for (var k in PICMODES) { var isH = /^(hdr|technicolor|dolby)/.test(k); if (fam ? fam.test(k) : !isH) out.push([k, PICMODES[k]]); }
  if (!out.length) out.push([cur, cur]); return out;
}
var SOUNDOUT = [['tv_speaker','Haut-parleurs de la TV'],['external_arc','HDMI ARC / eARC'],['external_optical','Optique'],['bt_soundbar','Barre de son Bluetooth'],['lineout','Sortie ligne'],['headphone','Casque'],['bt_audio','Appareil Bluetooth'],['tv_external_speaker','Haut-parleurs TV + externe'],['tv_speaker_headphone','Haut-parleurs TV + casque']];
function fmtDate2(sec){ if (!sec) return 'never'; var d = new Date(sec * 1000); return MONS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + ', ' + d.getFullYear(); }
function num(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

cats = [
  {id: 'quick', name: 'Réglages rapides', icon: 'bolt', title: 'Réglages rapides', desc: 'Les mêmes raccourcis que le panneau rapide de LG : mode d’image, format, mode son, sortie son, minuterie, réseau et tous les réglages.', info: '/api/net',
    lg: [['picture', ['pictureMode','aspectRatio']], ['sound', ['soundMode','soundOutput']], ['time', ['sleepTimer']]], build: function(){ var j = this.data || {}, w = j.wired || {}, f = j.wifi || {}; return [
    brSld('Rétroéclairage (toutes les entrées et applications)'),
    lgChc('picture', 'pictureMode', 'Mode d’image', '', picModes, true),
    lgChc('picture', 'aspectRatio', 'Format d’image', '', ASPECTS),
    lgChc('sound', 'soundMode', 'Mode son', '', SOUNDMODES),
    lgChc('sound', 'soundOutput', 'Sortie son', 'Où le son est diffusé. Si la TV devient muette, choisis Haut-parleurs de la TV.', SOUNDOUT),
    lgChc('time', 'sleepTimer', 'Minuterie de mise en veille', 'Éteint la TV après ce délai', SLEEPS),
    inf('Réseau', function(){ return (w.state === 'connected' ? 'Ethernet' : f.state === 'connected' ? 'Wi-Fi ' + (f.ssid || '') : 'Hors ligne') + (w.ipAddress || f.ipAddress ? '  ·  ' + (w.ipAddress || f.ipAddress) : ''); }),
    act('Tous les réglages', 'L’application Réglages complète de LG', function(){ launch('com.palm.app.settings'); })
  ]; }},
  {id: 'home', name: 'Accueil et veille', icon: 'home', title: 'Accueil et veille', desc: 'Photos de fond, écran de veille et horloge.', build: function(){ return [
    chc('Thème', 'Fond, couleur d’accent et animation de veille. Automatique = le thème de la saison quand il y en a un', window.Theme ? Theme.options() : [['auto', 'Automatique']], function(){ return S.theme || 'auto'; }, function(v){ setPath('theme', v); }),
    act('Favoris', 'Les grandes cartes en haut de l’accueil (6 au maximum). Plus simple : sur l’accueil, appui long sur OK sur une app, puis ▲ et l’étoile. ◀ ▶ la déplacent.', function(){ favPanel(0); }, S.dock.length + ' app' + (S.dock.length > 1 ? 's' : '') + '  ▶'),
    act('Apps masquées', 'Les apps retirées de l’accueil avec la corbeille (appui long sur OK). OK sur une app pour la remettre.', function(){ hiddenPanel(0); }, userHidden().length + '  ▶'),
    tgl('Photo en fond de l’accueil', 'Utilise les photos de ta galerie', function(){ return S.bg.on; }, function(b){ setPath('bg.on', b); }),
    chc('Changer de fond toutes les', '', [[5,'5 min'],[10,'10 min'],[20,'20 min'],[30,'30 min'],[60,'1 heure']], function(){ return S.bg.everyMin; }, function(v){ setPath('bg.everyMin', v); }),
    tgl('Veille en cas d’inactivité', 'Heure, date et météo après un moment', function(){ return S.saver.on; }, function(b){ setPath('saver.on', b); }),
    chc('Démarrer après', '', [[1,'1 min'],[2,'2 min'],[5,'5 min'],[10,'10 min'],[15,'15 min'],[30,'30 min']], function(){ return S.saver.idleMin; }, function(v){ setPath('saver.idleMin', v); }),
    tgl('Photos de la galerie pendant la veille', 'Désactivé = écran noir avec l’heure', function(){ return S.saver.photos; }, function(b){ setPath('saver.photos', b); }),
    chc('Changer de photo toutes les', 'Lent, c’est plus reposant pour les yeux et pour la TV', [[12,'12 s'],[30,'30 s'],[60,'1 min'],[120,'2 min'],[300,'5 min'],[600,'10 min'],[900,'15 min']], function(){ return S.saver.slideSec; }, function(v){ setPath('saver.slideSec', v); }),
    chc('Animation de veille', 'Sans photos, la veille reste noire (pixels éteints) avec cette animation de temps en temps', [['theme', 'Selon le thème'], ['fireworks', 'Feux d’artifice'], ['none', 'Aucune (écran noir)']], function(){ return S.saver.fx || 'theme'; }, function(v){ setPath('saver.fx', v); }),
    tgl('Heure pendant la veille', 'Petite et grise, elle change de place chaque minute', function(){ return S.saver.clock !== false; }, function(b){ setPath('saver.clock', b); }),
    tgl('Météo pendant la veille', '', function(){ return S.saver.weather; }, function(b){ setPath('saver.weather', b); wxRender(); }),
    sld('Assombrissement de la veille', 'Assombrit la photo pour reposer les yeux ; l’heure reste lisible. 0 = aucun assombrissement', 0, 80, 5, function(){ return S.saver.dim === undefined ? 30 : S.saver.dim; }, function(v){ setPath('saver.dim', v); }),
    sld('Rétroéclairage pendant la veille', function(){ var b = parseInt(BRV, 10); b = isNaN(b) ? 100 : b; return 'Rétroéclairage pendant la veille, sur l’échelle LG de 0 à 100 (jamais plus fort que ton réglage normal, ' + b + '). Rétabli dès que tu sors de la veille.'; }, 5, 100, 5, function(){ return S.saver.level === undefined ? 15 : S.saver.level; }, function(v){ setPath('saver.level', v); }),
    tgl('Heure sur 24 h', '', function(){ return S.clock24; }, function(b){ setPath('clock24', b); })
  ]; }},
  {id: 'weather', name: 'Météo', icon: 'cloud', title: 'Météo', desc: 'Prévisions gratuites d’Open-Meteo.', build: function(){ return [
    chc('Lieu', 'Automatique utilise la connexion internet de la TV', [['auto','Automatique'],['zip','Code postal (US)']], function(){ return S.weather.mode; }, function(v){ setPath('weather.mode', v); renderCat(true); }),
    {type: 'text', label: 'Code postal (US)', desc: 'Codes postaux américains uniquement. OK pour le saisir avec la télécommande.', show: function(){ return S.weather.mode === 'zip'; },
      get: function(){ return S.weather.zip || 'non défini'; }, run: function(){ keypadOpen('Code postal (US)', S.weather.zip, 5, function(v){ if (/^\d{5}$/.test(v)) { S.weather.mode = 'zip'; setPath('weather.zip', v); renderCat(true); } else toast('Saisis 5 chiffres'); }); }},
    chc('Unités', '', [['F','°F'],['C','°C']], function(){ return S.weather.unit; }, function(v){ setPath('weather.unit', v); }),
    inf('Affiché', function(){ return wx ? wx.place : 'loading…'; }),
    act('Actualiser maintenant', '', function(){ lsSet('loc', null); wxLoad(true); toast('Mise à jour de la météo…'); })
  ]; }},
  {id: 'gallery', name: 'Galerie photo', icon: 'image', title: 'Galerie photo', desc: 'Photos utilisées pour le fond de l’accueil et la veille. Choisis une photo pour ajuster son cadrage.', build: function(){ return [
    act('Ajouter des photos depuis ton téléphone', 'Affiche un QR code à scanner. La page du téléphone permet aussi d’ajuster le cadrage et de modifier les listes de blocage.', function(){ qrOpen(); }, 'QR'),
    inf('Photos dans la galerie', function(){ return String(photos.length); }),
    tgl('Photo en fond de l’accueil', '', function(){ return S.bg.on; }, function(b){ setPath('bg.on', b); }),
    tgl('Photos pendant la veille', '', function(){ return S.saver.photos; }, function(b){ setPath('saver.photos', b); }),
    act('Réinitialiser le lien du téléphone', 'Les anciens QR codes ne fonctionneront plus', function(){ panelOpen('Réinitialiser le lien du téléphone ?', [['Oui, réinitialiser', '', function(){ panelClose(); apiPost('/api/resettoken', '', function(){ toast('Lien du téléphone réinitialisé'); }); }], ['Annuler', '', panelClose]]); }),
    {type: 'thumbs'}
  ]; }},
  {id: 'picture', name: 'Image', icon: 'pic', title: 'Image', desc: 'S’applique à ce qui est à l’écran : l’entrée et le mode d’image actuels.',
    lg: [['picture', ['pictureMode','backlight','contrast','brightness','sharpness','color','tint','colorTemperature','energySaving','dynamicContrast','localDimming','peakBrightness','superResolution','noiseReduction','mpegNoiseReduction','gamma','colorGamut','blackLevel','dynamicColor','hdrDynamicToneMapping','truMotionMode','truMotionJudder','truMotionBlur','motionEyeCare','eyeComfortMode','aspectRatio']]], build: function(){ return [
    lgChc('picture', 'pictureMode', 'Mode d’image', '', picModes, true),
    brSld('Rétroéclairage'), lgSld('picture', 'contrast', 'Contraste', '', 0, 100, 1),
    lgSld('picture', 'brightness', 'Niveau de noir', 'LG l’appelle « Luminosité » : le niveau des parties les plus sombres de l’image. Ce n’est pas le rétroéclairage.', 0, 100, 1), lgSld('picture', 'sharpness', 'Netteté', '', 0, 50, 1),
    lgSld('picture', 'color', 'Couleur', '', 0, 100, 1), lgSld('picture', 'tint', 'Teinte', '', -50, 50, 1), lgSld('picture', 'colorTemperature', 'Température de couleur', 'Négatif = plus chaud, positif = plus froid', -50, 50, 1),
    lgChc('picture', 'energySaving', 'Économie d’énergie', '', [['off','Désactivé'],['auto','Auto'],['min','Minimum'],['med','Moyen'],['max','Maximum'],['screen_off','Écran éteint']]),
    head('Options d’image'),
    lgChc('picture', 'dynamicContrast', 'Contraste dynamique', '', LEVELS), lgChc('picture', 'localDimming', 'Gradation locale', '', LEVELS), lgChc('picture', 'peakBrightness', 'Luminosité de crête', '', LEVELS),
    lgChc('picture', 'superResolution', 'Super résolution', '', LEVELS), lgChc('picture', 'noiseReduction', 'Réduction du bruit', '', [['off','Désactivé'],['low','Bas'],['medium','Moyen'],['high','Élevé'],['auto','Auto']]),
    lgChc('picture', 'mpegNoiseReduction', 'Réduction du bruit MPEG', '', [['off','Désactivé'],['low','Bas'],['medium','Moyen'],['high','Élevé'],['auto','Auto']]),
    lgChc('picture', 'gamma', 'Gamma', '', [['low','Bas'],['medium','Moyen'],['high1','Élevé 1'],['high2','Élevé 2']]), lgChc('picture', 'colorGamut', 'Gamme de couleurs', '', [['auto','Auto'],['wide','Grand'],['extended','Étendue'],['srgb','sRGB']]),
    lgChc('picture', 'blackLevel', 'Niveau de noir', '', [['auto','Auto'],['low','Bas'],['high','Élevé']]), lgChc('picture', 'dynamicColor', 'Couleur dynamique', '', LEVELS),
    lgChc('picture', 'hdrDynamicToneMapping', 'Mappage des tons HDR', '', [['on','Activé'],['off','Désactivé'],['HGIG','HGIG']]),
    lgChc('picture', 'truMotionMode', 'TruMotion', 'Fluidité des mouvements', [['off','Désactivé'],['smooth','Fluide'],['clear','Net'],['user','Utilisateur']]),
    lgSld('picture', 'truMotionJudder', 'Anti-saccades', '', 0, 10, 1), lgSld('picture', 'truMotionBlur', 'Anti-flou', '', 0, 10, 1),
    lgTgl('picture', 'motionEyeCare', 'Protection des yeux (mouvement)', ''), lgTgl('picture', 'eyeComfortMode', 'Mode confort des yeux', 'Plus chaud, plus reposant le soir'),
    lgChc('picture', 'aspectRatio', 'Format d’image', '', ASPECTS)
  ]; }},
  {id: 'sound', name: 'Son', icon: 'sound', title: 'Son', desc: 'Haut-parleurs de la TV et sorties audio.',
    lg: [['sound', ['soundMode','clearVoice','autoVolume','virtualSurround','soundOutput','audioBalance','soundOptimizer','soundOutputDigital','hdmiArcMode','eArcSupport','lgSoundSync','startupSound','tvPowerSound']]], build: function(){ return [
    lgChc('sound', 'soundMode', 'Mode son', '', SOUNDMODES),
    lgChc('sound', 'clearVoice', 'Voix claire', 'Rend les dialogues plus faciles à entendre', [['off','Désactivé'],['level1','Niveau 1'],['level2','Niveau 2'],['level3','Niveau 3']]),
    lgTgl('sound', 'autoVolume', 'Volume automatique', 'Égalise les pubs fortes et les scènes calmes'), lgTgl('sound', 'virtualSurround', 'Surround virtuel', ''),
    lgSld('sound', 'audioBalance', 'Balance', 'Gauche / droite', -50, 50, 1),
    lgChc('sound', 'soundOutput', 'Sortie son', 'Où le son est diffusé. Si la TV devient muette, choisis Haut-parleurs de la TV.', SOUNDOUT),
    lgChc('sound', 'soundOptimizer', 'Emplacement de la TV', '', [['normal','Normal'],['stand','Sur pied'],['wall_mount','Au mur']]),
    head('Audio numérique'),
    lgChc('sound', 'soundOutputDigital', 'Sortie son numérique', '', [['pcm','PCM'],['auto','Auto'],['passThrough','Pass-through']]),
    lgTgl('sound', 'hdmiArcMode', 'HDMI ARC', ''), lgTgl('sound', 'eArcSupport', 'eARC', ''), lgTgl('sound', 'lgSoundSync', 'LG Sound Sync', ''),
    lgTgl('sound', 'startupSound', 'Son au démarrage', ''), lgTgl('sound', 'tvPowerSound', 'Son à l’allumage', '')
  ]; }},
  {id: 'power', name: 'Alimentation et minuteries', icon: 'power', title: 'Alimentation et minuteries', desc: '',
    lg: [['option', ['quickStartMode','standByLight','logoLight','powerOnLight']], ['general', ['homeAutoLaunch']], ['time', ['autoClock','daylightSaving','sleepTimer','noOperationAutoOff','automaticStandBy','noSignalAutoOff','timeZone']]], info: '/api/poweron', build: function(){ var self = this, tz = (LGC.time || {}).timeZone; if (!self.appsAsked) { self.appsAsked = true; api('/api/apps', function(e, j){ if (j && j.launchPoints) { self.apps = j.launchPoints; if (settingsOn && cats[catIdx].id === 'power') renderCat(false); } }, 15000); } return [
    lgTgl('option', 'quickStartMode', 'Démarrage rapide', 'La TV s’allume en deux secondes au lieu d’un démarrage complet. Consomme un peu plus en veille. Activé est recommandé : ça fonctionne avec cet accueil et ne change rien au blocage des mises à jour LG.'),
    chc('À l’allumage, aller sur', 'Accueil = notre écran d’accueil. « Là où elle était » = le comportement de LG (l’entrée ou l’app quittée). S’applique au démarrage rapide et au démarrage complet.', function(){ var o = [['home','Accueil (recommandé)'],['last','Là où elle était'],['hdmi1','HDMI 1'],['hdmi2','HDMI 2'],['hdmi3','HDMI 3'],['hdmi4','HDMI 4']], cur = self.data && self.data.dest, seen = {}; (self.apps || []).filter(function(a){ return a.id && a.title && a.id !== 'com.webos.app.home' && a.id !== 'com.webos.app.fullhome' && (S.hide || []).indexOf(a.id) < 0 && !seen[a.id] && (seen[a.id] = 1); }).sort(function(x, y){ return x.title < y.title ? -1 : 1; }).forEach(function(a){ o.push(['app:' + a.id, 'App : ' + a.title]); }); if (cur && cur.indexOf('app:') === 0 && !seen[cur.slice(4)]) o.push([cur, 'App : ' + cur.slice(4)]); return o; }, function(){ return (self.data && self.data.dest) || 'home'; }, function(v){ self.data = self.data || {}; self.data.dest = v; api('/api/poweron?v=' + v, function(err, r){ toast(err ? 'Impossible de modifier ce réglage' : 'Enregistré'); }); }),
    lgTgl('option', 'standByLight', 'Voyant de veille', ''), lgChc('option', 'logoLight', 'Logo LG lumineux', '', LEVELS), lgTgl('option', 'powerOnLight', 'Voyant d’allumage', ''),
    head('Minuteries'),
    lgChc('time', 'sleepTimer', 'Minuterie de mise en veille', 'Éteint la TV après ce délai', SLEEPS),
    lgChc('time', 'noOperationAutoOff', 'Éteindre sans utilisation de la télécommande', 'En heures', [['off','Désactivé'],['3','3 h'],['6','6 h'],['12','12 h'],['24','24 h']]),
    lgChc('time', 'automaticStandBy', 'Veille automatique', 'En heures sans aucune activité', [['0','Désactivé'],['2','2 h'],['4','4 h'],['6','6 h'],['8','8 h']]),
    lgTgl('time', 'noSignalAutoOff', 'Éteindre en l’absence de signal', ''),
    head('Horloge'),
    lgTgl('time', 'autoClock', 'Régler l’heure automatiquement', ''), lgChc('time', 'daylightSaving', 'Heure d’été', '', [['auto','Automatique'],['on','Activé'],['off','Désactivé']]),
    inf('Fuseau horaire', function(){ return tz && tz.City ? tz.City + ' (' + (tz.Description || '') + ')' : '–'; }, 'Change le fuseau horaire dans Réglages LG (ancien) si tu déménages.'),
    head('Redémarrage'),
    act('Redémarrer la TV', 'Redémarre ; l’accueil revient en une minute environ', function(){ panelOpen('Redémarrer la TV ?', [['Redémarrer maintenant', '', function(){ panelClose(); apiPost('/api/reboot', '', function(){ toast('Redémarrage…'); }); }], ['Annuler', '', panelClose]]); })
  ]; }},
  {id: 'inputs', name: 'Entrées et HDMI', icon: 'hdmi', title: 'Entrées et HDMI', desc: 'Format d’image par port et contrôle des appareils.',
    lg: [['other', ['uhdDeepColorHDMI1','uhdDeepColorHDMI2','uhdDeepColorHDMI3','uhdDeepColorHDMI4','gameOptimizationHDMI1','gameOptimizationHDMI2','gameOptimizationHDMI3','gameOptimizationHDMI4','simplinkEnable','simplinkAutoPowerOn']],
         ['sound', ['inputAudioFormatHDMI1','inputAudioFormatHDMI2','inputAudioFormatHDMI3','inputAudioFormatHDMI4']]], build: function(){
    var o = [head('HDMI ULTRA HD Deep Colour (nécessaire pour la 4K HDR ; à désactiver si un appareil n’affiche rien)')], i, n;
    for (i = 1; i <= 4; i++) o.push(lgTgl('other', 'uhdDeepColorHDMI' + i, 'HDMI ' + i + ' Deep Colour', ''));
    o.push(head('Optimisation jeu (faible latence)')); for (i = 1; i <= 4; i++) o.push(lgTgl('other', 'gameOptimizationHDMI' + i, 'HDMI ' + i + ' optimisation jeu', ''));
    o.push(head('Format audio HDMI')); for (i = 1; i <= 4; i++) o.push(lgChc('sound', 'inputAudioFormatHDMI' + i, 'HDMI ' + i + ' audio', '', [['pcm','PCM'],['bitstream','Bitstream']]));
    o.push(head('Contrôle des appareils (SIMPLINK / HDMI-CEC)'));
    o.push(lgTgl('other', 'simplinkEnable', 'SIMPLINK', 'Permet aux appareils branchés d’allumer et de piloter la TV'), lgTgl('other', 'simplinkAutoPowerOn', 'Allumage automatique SIMPLINK', ''));
    return o; }},
  {id: 'remote', name: 'Télécommande et pointeur', icon: 'remote', title: 'Télécommande et pointeur', desc: 'Le bouton Réglages et le pointeur de la Magic Remote. LG ne permet pas vraiment de couper le pointeur : la première option demande à la télécommande de rester discrète (expérimental), les autres l’ajustent.', info: '/api/gear',
    lg: [['option', ['pointerSpeed','pointerSize','pointerShape','pointerAlignment']], ['other', ['cursorAutoRemover']]], build: function(){ var self = this; return [
    chc('Le bouton Réglages ouvre', 'Le bouton roue dentée de la télécommande', [['ours','Cet écran Réglages'],['lg','Le panneau rapide de LG']], function(){ return (self.data && self.data.gear) || 'ours'; }, function(v){ self.data = self.data || {}; self.data.gear = v; api('/api/gear?v=' + v, function(){ toast(v === 'ours' ? 'Le bouton Réglages ouvre maintenant cet écran' : 'Le bouton Réglages ouvre à nouveau le panneau de LG'); }); }),
    tgl('Retour depuis une app ramène à l’app précédente', 'Quand une app se ferme avec Retour, rouvre l’app ou l’entrée d’avant. S’il n’y en a pas, tu arrives sur l’accueil, comme d’habitude.', function(){ return !(self.data && self.data.chain === 'off'); }, function(b){ self.data = self.data || {}; self.data.chain = b ? 'on' : 'off'; api('/api/backchain?v=' + (b ? 'on' : 'off'), function(){ toast(b ? 'Retour ramène maintenant à l’app précédente' : 'Retour depuis une app ramène à nouveau à l’accueil'); }); }),
    chc('Quitter une app avec Retour', 'Chaque app décide de l’effet d’un appui sur Retour (Netflix l’ignore sur son écran d’accueil). Avec cette option, maintenir Retour ou l’appuyer deux fois vite fait sortir de l’app : vers l’app précédente, ou l’accueil s’il n’y en a pas.', [['both','Maintenir ou appuyer deux fois'],['hold','Maintenir Retour'],['double','Appuyer deux fois vite'],['off','Laisser l’app décider']], function(){ return (self.data && self.data.back && self.data.back.leave) || 'both'; }, function(v){ backOpt('leave', v); }),
    chc('Oublier où j’étais', 'Le bouton Retour peut te ramener aux apps et entrées utilisées. Choisis quand cette mémoire s’efface, pour retrouver une TV comme fraîchement allumée.', [['never','Jamais'],['saver','Au démarrage de la veille'],['saver_standby','Veille ou TV éteinte']], function(){ return (self.data && self.data.back && self.data.back.reset) || 'saver'; }, function(v){ backOpt('reset', v); }),
    chc('Oublier les apps quittées depuis longtemps', 'Retour saute les apps et entrées quittées depuis plus longtemps que ce délai.', [['0','Jamais'],['5','5 minutes'],['15','15 minutes'],['30','30 minutes'],['60','1 heure'],['240','4 heures']], function(){ return String((self.data && self.data.back && self.data.back.forget) || 0); }, function(v){ backOpt('forget', v); }),
    chc('Nombre de pas en arrière', 'Jusqu’où Retour peut remonter dans les apps utilisées.', [['1','1'],['2','2'],['3','3'],['5','5'],['8','8']], function(){ return String((self.data && self.data.back && self.data.back.depth) || 8); }, function(v){ backOpt('depth', v); }),
    chc('Apps gardées en mémoire', 'L’app affichée et la dernière utilisée restent en mémoire, pour revenir instantanément ; ouvrir une troisième app ferme la plus ancienne. Moins d’apps en mémoire = une TV plus rapide. Une app de musique laissée en lecture s’arrête quand elle est fermée. Les entrées comptent comme des apps ; l’accueil, AirPlay et les apps système de LG ne sont jamais fermés.', [['0','Sans limite'],['1','Seulement l’app actuelle'],['2','Actuelle + précédente (2)'],['3','3 apps'],['4','4 apps']], function(){ return String((self.data && self.data.back && self.data.back.keep !== undefined) ? self.data.back.keep : 2); }, function(v){ backOpt('keep', v); }),
    chc('Fermer les entrées quittées après', 'Une entrée HDMI laissée en arrière-plan occupe 50 à 60 Mo de mémoire. La fermer les libère ; y revenir prend 0,7 s au lieu de 0,3 s. Tes appareils restent connectés.', [['0','Jamais'],['2','2 minutes'],['5','5 minutes'],['15','15 minutes'],['60','1 heure']], function(){ return String((self.data && self.data.back && self.data.back.closeinputs !== undefined) ? self.data.back.closeinputs : 5); }, function(v){ backOpt('closeinputs', v); }),
    chc('Fermer les apps quittées après', 'Libère de la mémoire pour garder la TV rapide : une app de streaming laissée en arrière-plan est fermée après ce délai (Netflix seul occupe environ 125 Mo). Elle redémarre quand tu l’ouvres. La musique en arrière-plan s’arrête aussi : choisis Jamais si tu utilises une app de musique. Les apps de LG et les entrées ne sont jamais fermées.', [['0','Jamais'],['30','30 minutes'],['60','1 heure'],['120','2 heures'],['300','5 heures']], function(){ return String((self.data && self.data.back && self.data.back.closeidle !== undefined) ? self.data.back.closeidle : 120); }, function(v){ backOpt('closeidle', v); }),
    tgl('Masquer le pointeur de la Magic Remote', 'Deuxième protection, en plus de « Rendre invisible le pointeur de la Magic Remote » (Services et confidentialité) : dès que la télécommande affiche sa flèche (secousse, mouvement, molette), la TV la masque. Les clics et les boutons fonctionnent toujours.', function(){ return !(self.data && self.data.pointerhide === 'off'); }, function(b){ self.data = self.data || {}; self.data.pointerhide = b ? 'on' : 'off'; api('/api/pointerhide?v=' + (b ? 'on' : 'off'), function(){ toast(b ? 'Le pointeur est masqué' : 'Le pointeur se comporte à nouveau comme chez LG'); }); }),
    tgl('Pointeur seulement en secouant la télécommande', 'Expérimental. Demande à la Magic Remote de n’afficher la flèche qu’après une secousse, pas à chaque mouvement. Réappliqué tout seul à chaque réveil de la télécommande. Appuie d’abord sur un bouton de la télécommande, puis active cette option.', function(){ return !!(self.data && self.data.pointer === 'off'); }, function(b){ self.data = self.data || {}; self.data.pointer = b ? 'off' : 'on'; api('/api/pointer?v=' + (b ? 'off' : 'on'), function(err, j){ toast((j && j.msg) || (err ? 'Impossible de joindre la TV' : 'Fait')); }, 25000); }),
    tgl('Masquer le pointeur sur l’accueil et dans Réglages', 'Demande au navigateur de ne pas dessiner de flèche sur l’accueil et dans Réglages. LG dessine son propre pointeur par-dessus : il peut encore apparaître.', function(){ return !!S.ui.hideCursor; }, function(b){ setPath('ui.hideCursor', b); }),
    head('Options du pointeur LG'),
    lgChc('option', 'pointerSpeed', 'Vitesse du pointeur', '', [['slow','Lent'],['normal','Normal'],['fast','Rapide']]), lgChc('option', 'pointerSize', 'Taille du pointeur', '', [['small','Petit'],['medium','Moyen'],['large','Grand']]),
    lgChc('option', 'pointerShape', 'Forme du pointeur', '', [['a','Shape A'],['b','Shape B'],['c','Shape C'],['d','Shape D']]), lgTgl('option', 'pointerAlignment', 'Alignement du pointeur', 'Garde le pointeur sur l’élément choisi avec les flèches'),
    lgTgl('other', 'cursorAutoRemover', 'Masquer le pointeur après quelques secondes', 'LG masque le pointeur quand la télécommande ne bouge plus')
  ]; }},
  {id: 'access', name: 'Accessibilité', icon: 'access', title: 'Accessibilité', desc: '',
    lg: [['option', ['highContrast','audioGuidance','audioGuidanceSpeed','audioGuidanceVolume','audioGuidancePitch','menuTransparency','animationGuide','baloonHelp','focusedItemEnlarged']], ['sound', ['audioDescription','visualImpaired']], ['caption', ['captionEnable','hardOfHearing']]], build: function(){ return [
    lgTgl('caption', 'captionEnable', 'Sous-titres', 'Affiche les sous-titres quand le programme en a'), lgTgl('caption', 'hardOfHearing', 'Sous-titres pour malentendants', ''),
    head('Vision'),
    lgTgl('option', 'highContrast', 'Contraste élevé', ''), lgTgl('option', 'focusedItemEnlarged', 'Agrandir l’élément sélectionné', ''), lgTgl('option', 'menuTransparency', 'Transparence des menus', ''),
    lgTgl('option', 'audioGuidance', 'Guide audio', 'Lit les menus à voix haute'), lgChc('option', 'audioGuidanceSpeed', 'Vitesse du guide audio', '', [['verySlow','Très lent'],['slow','Lent'],['medium','Moyen'],['fast','Rapide'],['veryFast','Très rapide']]),
    lgChc('option', 'audioGuidanceVolume', 'Volume du guide audio', '', [['veryLow','Très bas'],['low','Bas'],['medium','Moyen'],['high','Élevé'],['veryHigh','Très élevé']]),
    lgChc('option', 'audioGuidancePitch', 'Tonalité du guide audio', '', [['veryLow','Très bas'],['low','Bas'],['medium','Moyen'],['high','Élevé'],['veryHigh','Très élevé']]),
    lgTgl('sound', 'audioDescription', 'Audiodescription', 'Description de ce qui se passe à l’écran'), lgTgl('sound', 'visualImpaired', 'Audio pour malvoyants', ''),
    head('Aide'), lgTgl('option', 'animationGuide', 'Guide animé', ''), lgTgl('option', 'baloonHelp', 'Bulles d’aide', '')
  ]; }},
  {id: 'net', name: 'Réseau', icon: 'net', title: 'Réseau', desc: '', info: '/api/net', lg: [['network', ['wolwowlOnOff','bleAdvertisingOnOff','allowMobileDeviceAccess']]], build: function(){ var self = this, j = this.data || {}, w = j.wired || {}, f = j.wifi || {}; if (!self.wifi && !self.wifiAsked) { self.wifiAsked = true; api('/api/wifi', function(err, x){ if (x) { self.wifi = x; if (settingsOn && cats[catIdx].id === 'net') renderCat(false); } }, 10000); } return [
    inf('Connexion', function(){ return w.state === 'connected' ? 'Ethernet' : f.state === 'connected' ? 'Wi-Fi' : 'Hors ligne'; }),
    inf('Adresse IP', function(){ return w.ipAddress || f.ipAddress || '–'; }),
    inf('Réseau Wi-Fi', function(){ return f.state === 'connected' ? (f.ssid || 'connected') : '–'; }),
    inf('Passerelle (box)', function(){ return w.gateway || f.gateway || '–'; }),
    inf('Wi-Fi', function(){ var s = (self.wifi && self.wifi.status && self.wifi.status.status) || ''; return !self.wifi ? '–' : s === 'serviceEnabled' ? 'on' : s ? s : '–'; }),
    inf('Réseaux Wi-Fi enregistrés', function(){ var l = (self.wifi && self.wifi.saved && self.wifi.saved.profileList) || []; if (!self.wifi) return '–'; return l.length ? l.map(function(p){ return p.wifiProfile && p.wifiProfile.ssid; }).join(', ') : 'none'; }, 'Les réseaux que la TV connaît. Pour en rejoindre un nouveau, utilise la dernière ligne.'),
    inf('DNS', function(){ return w.dns1 || f.dns1 || '–'; }),
    inf('Internet', function(){ return j.isInternetConnectionAvailable ? 'available' : 'indisponible'; }),
    lgTgl('network', 'wolwowlOnOff', 'Allumer par le réseau', 'Wake on LAN / Wi-Fi : ton téléphone ou ton ordinateur peut allumer la TV', 'true', 'false'),
    lgTgl('network', 'bleAdvertisingOnOff', 'Visibilité Bluetooth', 'Les téléphones proches peuvent trouver la TV'),
    lgTgl('network', 'allowMobileDeviceAccess', 'Autoriser la connexion des appareils mobiles', '', 'true', 'false'),
    act('Rejoindre un réseau Wi-Fi (Réglages LG)', 'Ouvre les Réglages de LG pour configurer le Wi-Fi', function(){ launch('com.palm.app.settings'); })
  ]; }},
  {id: 'access', name: 'Accès à distance', icon: 'remote', title: 'Accès à distance (SSH / Telnet)', desc: 'Comment trouver cette TV et s’y connecter depuis un ordinateur du même réseau. SSH est l’accès sûr et reste actif. Telnet est la porte de secours, sans mot de passe.', info: '/api/remote', build: function(){
    var self = this, j = this.data || {}, ssh = j.ssh || {}, tel = j.telnet || {}, ip = j.ethIp || j.wifiIp || 'l’adresse IP de la TV', rows = [];
    rows.push(head('Trouver cette TV'));
    rows.push(inf('Nom', j.host || '–'));
    rows.push(inf('Adresse IP (câble)', j.ethIp || 'non connecté', 'Celle-ci quand la TV est branchée par câble. Réserve-lui une adresse fixe dans ta box (réservation DHCP) pour qu’elle ne change jamais.'));
    rows.push(inf('Adresse IP (Wi-Fi)', j.wifiIp || 'non connecté'));
    rows.push(inf('Adresse MAC (câble)', j.ethMac || '–', 'À saisir dans la box pour réserver l’adresse ci-dessus.'));
    if (j.wifiMac) rows.push(inf('Adresse MAC (Wi-Fi)', j.wifiMac));
    rows.push(head('SSH (accès sécurisé)'));
    rows.push(inf('État', ssh.listening ? 'activé en permanence' : 'arrêté', 'SSH sert à installer et réparer le projet : il ne peut pas être coupé ici.'));
    rows.push(inf('Se connecter avec', 'ssh root@' + ip, 'À taper dans un terminal, sur un ordinateur du même réseau.'));
    rows.push(inf('Clés installées', String(ssh.keys === undefined ? '–' : ssh.keys), ssh.keys > 0 ? 'La connexion par clé fonctionne depuis l’ordinateur qui a la clé correspondante.' : 'Pas encore de clé : ajoute-en une avec  ssh-copy-id root@' + ip));
    rows.push(head('Telnet (sans mot de passe)'));
    rows.push(tgl('Telnet', 'Activé : n’importe qui sur ton réseau peut ouvrir un shell root avec  telnet ' + ip + '. It is the emergency way in if SSH ever breaks. Off: only SSH works. Turning it off needs an SSH key to be installed first, and turning the whole project off (revert.sh) turns it back on.', function(){ return !!tel.listening; }, function(b){
      if (!b && !self.confirmOff) { self.confirmOff = true; toast('Appuie à nouveau pour couper Telnet'); setTimeout(function(){ self.confirmOff = false; if (settingsOn && cats[catIdx].id === 'access') renderCat(false); }, 6000); renderCat(false); return; }
      self.confirmOff = false;
      api('/api/remote/telnet?v=' + (b ? 'on' : 'off'), function(err, r){ toast((r && r.msg) ? ('Telnet: ' + r.msg) : 'Impossible de modifier ce réglage'); setTimeout(function(){ if (settingsOn && cats[catIdx].id === 'access') renderCat(true); }, 1500); }, 20000); }));
    rows.push(inf('Se connecter avec', 'telnet ' + ip));
    rows.push(head('Pour les développeurs'));
    rows.push(inf('Page de débogage (DevTools)', j.devtools && j.devtools.on ? 'activée, port 9998' : 'off', 'Active seulement si le fichier DEBUG existe. Normalement coupée.'));
    rows.push(inf('Service d’assistance de la TV', 'port ' + ((j.api && j.api.port) || 8765), 'Utilisé par l’accueil et la page du téléphone. Seules la page du téléphone et les photos répondent aux autres appareils, et seulement avec le lien secret.'));
    return rows; }},
  {id: 'block', name: 'Blocage des pubs', icon: 'block', title: 'Blocage des pubs', desc: 'Comme Pi-hole : les adresses de ces listes deviennent injoignables pour toutes les apps de la TV. Une adresse de la liste toujours autorisée n’est jamais bloquée.', info: '/api/block', build: function(){
    var self = this, d = this.data || {}, lists = d.lists || [], out = [];
    out.push(inf('Adresses bloquées actuellement', num(d.blocked || 0), 'Chaque recherche d’adresse prend quelques millisecondes de plus par millier d’adresses.'));
    out.push(head('Listes de blocage'));
    lists.forEach(function(l){
      var sub = l.desc + '  (' + num(l.count) + ' adresses' + (l.kind === 'remote' ? (l.stamp ? ', mise à jour ' + fmtDate2(l.stamp) : ', pas encore téléchargée') : '') + ')';
      out.push(tgl(l.name, sub, function(){ return l.on; }, function(b){ l.on = b; toast(b ? 'Activation : ' + l.name + '…' : 'Désactivation : ' + l.name + '…');
        apiPost('/api/block/set?id=' + l.id + '&v=' + (b ? 'on' : 'off'), '', function(err, j){ if (err || !j || !j.lists) { toast('Impossible de modifier ce réglage'); } else { self.data = j; toast('Bloquées maintenant : ' + num(j.blocked) + ' adresses'); } if (settingsOn) renderCat(false); }, 90000); }));
    });
    out.push(head('Entretien'));
    out.push(act('Mettre à jour les listes téléchargées', 'La TV les met aussi à jour toute seule chaque semaine. Environ 30 secondes.', function(){ apiPost('/api/block/update', '', function(){ toast('Mise à jour des listes…'); setTimeout(function(){ if (settingsOn && cats[catIdx].id === 'block') renderCat(true); }, 30000); }); }));
    out.push(head('Tes propres listes'));
    out.push(inf('Adresses que tu as bloquées', num(d.custom || 0), 'Ajoute ou retire des adresses depuis ton téléphone : Galerie photo, Ajouter des photos depuis ton téléphone, puis descends jusqu’à Blocage des pubs.'));
    out.push(inf('Adresses toujours autorisées', num(d.allowCustom || 0), 'Une adresse de cette liste n’est jamais bloquée, même si une liste le demande. Utile si une app ne fonctionne plus.'));
    return out; }},
  {id: 'services', name: 'Services et confidentialité', icon: 'shield', title: 'Services et confidentialité', desc: 'Active ou coupe les services de LG en arrière-plan. Tout est réversible et réappliqué à chaque redémarrage.', info: '/api/svc', build: function(){
    var self = this, list = this.data instanceof Array ? this.data : [], out = [], g = '';
    list.forEach(function(s){
      if (s.group !== g) { g = s.group; out.push(head(g)); }
      if (s.locked) { out.push(inf(s.name, 'Toujours activé', s.desc)); return; }
      out.push(tgl(s.name, s.desc, function(){ return s.on; }, function(b){ s.on = b; toast((b ? 'Activation : ' : 'Désactivation : ') + s.name + '…');
        apiPost('/api/svc/set?id=' + s.id + '&v=' + (b ? 'on' : 'off'), '', function(err, j){ if (err || !(j instanceof Array)) { toast('Impossible de modifier ce réglage'); return; } self.data = j; toast('Fait'); if (settingsOn) renderCat(false); }, 60000); }));
    });
    if (!list.length) out.push(inf('Services', 'unavailable'));
    return out; }},
  {id: 'swupd', name: 'Mises à jour du logiciel', icon: 'update', title: 'Mises à jour du logiciel', desc: 'Garde cet accueil et le nettoyage à jour depuis le projet sur GitHub. Chaque installation fait d’abord une copie de sécurité ; si la nouvelle version ne démarre pas, l’ancienne revient toute seule.', info: '/api/update', build: function(){
    var self = this, j = this.data || {}, av = j.available, rows = [];
    function again(ms){ setTimeout(function(){ if (settingsOn && cats[catIdx].id === 'swupd') renderCat(true); }, ms); }
    function watch(n){ if (n <= 0) return; setTimeout(function(){ if (!(settingsOn && cats[catIdx].id === 'swupd')) return; api('/api/update', function(err, d){ if (d) { self.data = d; renderCat(false); } watch(n - 1); }, 5000); }, 4000); }
    if (j.busy) rows.push(inf('En cours', j.status || '…', 'L’accueil redémarre quelques secondes une fois la nouvelle version installée.'));
    if (j.resultKind) rows.push(inf(j.resultKind === 'ok' ? 'Dernière mise à jour' : 'La dernière mise à jour a échoué', j.result || '', 'Choisis « Effacer » plus bas pour retirer ce message.'));
    rows.push(head('Version'));
    rows.push(inf('Installée', j.installed || '–'));
    rows.push(inf('La plus récente sur GitHub', av ? av + '    ·  mise à jour disponible' : (j.error ? 'vérification impossible' : 'tu as la plus récente'), j.error || ''));
    rows.push(inf('Dernière vérification', function(){ var a = j.lastAgoSec; return a === null || a === undefined ? 'pas depuis l’allumage de la TV' : a < 90 ? 'à l’instant' : a < 5400 ? Math.round(a / 60) + ' min' : a < 172800 ? Math.round(a / 3600) + ' h' : Math.round(a / 86400) + ' jours'; }));
    if (av) rows.push(act('Installer ' + av + ' maintenant', 'La télécharge, fait une copie de sécurité, l’installe et redémarre l’accueil (environ 20 secondes). En cas de problème, l’ancienne version est remise.', function(){ if (j.busy) return; toast('Installation de ' + av + '…'); api('/api/update/apply', function(err){ if (err) { toast('Impossible de lancer la mise à jour'); return; } j.busy = true; j.status = 'starting'; renderCat(false); watch(15); }, 8000); }));
    rows.push(act('Rechercher des mises à jour', 'Regarde sur GitHub tout de suite', function(){ toast('Vérification…'); api('/api/update/check', function(err, r){ toast((r && r.msg) || 'Impossible de joindre la TV'); again(800); }, 50000); }));
    if (j.resultKind) rows.push(act('Effacer', 'Retire le message ci-dessus', function(){ api('/api/update/conf?k=ack&v=1', function(){ again(300); }); }));
    rows.push(head('Vérifications automatiques'));
    rows.push(chc('Quand une mise à jour est trouvée', 'Me prévenir : un message apparaît sur l’accueil et tu choisis quand installer. Installer toute seule : elle attend un moment calme (pendant la veille) et s’installe. Jamais : aucune vérification automatique.', [['notify', 'Me prévenir'], ['auto', 'Installer toute seule'], ['off', 'Ne jamais vérifier']], function(){ return self.data && self.data.mode || 'notify'; }, function(v){ self.data = self.data || {}; self.data.mode = v; api('/api/update/conf?k=mode&v=' + v, noop); }));
    rows.push(tgl('Vérifier à l’allumage', 'Une vérification discrète sur GitHub deux minutes après l’affichage de l’accueil.', function(){ return (self.data && self.data.startup) !== 'off'; }, function(b){ self.data = self.data || {}; self.data.startup = b ? 'on' : 'off'; api('/api/update/conf?k=startup&v=' + (b ? 'on' : 'off'), noop); }));
    rows.push(chc('Puis vérifier toutes les', 'Tant que la TV reste allumée ou en veille rapide', [[6, '6 heures'], [12, '12 heures'], [24, '1 jour'], [72, '3 jours'], [168, '1 semaine']], function(){ return self.data && self.data.every !== undefined ? Number(self.data.every) : 12; }, function(v){ self.data = self.data || {}; self.data.every = v; api('/api/update/conf?k=every&v=' + v, noop); }));
    var ns = j.notes instanceof Array ? j.notes : [], shown = [];
    function vnew(a, b){ var x = String(a).split('.'), y = String(b).split('.'), i, p, q; for (i = 0; i < Math.max(x.length, y.length); i++) { p = parseInt(x[i], 10) || 0; q = parseInt(y[i], 10) || 0; if (q !== p) return q > p; } return false; }
    ns.forEach(function(e){ if (e && e.v && (av ? vnew(j.installed, e.v) : shown.length < 5)) shown.push(e); });
    rows.push(head(av ? 'Nouveautés de la ' + av : 'Changements récents'));
    shown.forEach(function(e){ rows.push(inf(e.v + '    ' + (e.title || ''), e.date || '', (e.notes instanceof Array ? e.notes.join('   •   ') : ''))); });
    if (!shown.length) rows.push(inf('Notes de version', 'aucune pour l’instant'));
    if (j.hasBackup) { rows.push(head('En cas de problème')); rows.push(act('Revenir à la version précédente', 'Remet la copie de sécurité d’avant la dernière mise à jour et redémarre l’accueil.', function(){ toast('Retour en arrière…'); api('/api/update/rollback', function(){ watch(15); }, 8000); })); }
    rows.push(inf('Source', (j.repo || '') + '  (' + (j.branch || '') + ')', 'Seul le code de la TV est remplacé. Tes photos, tes réglages et tes listes de blocage ne sont jamais touchés. Les mises à jour du firmware LG restent bloquées.'));
    return rows; }},
  {id: 'appupd', name: 'Mises à jour des apps', icon: 'update', title: 'Mises à jour des apps', desc: 'La TV met à jour tes apps toute seule : LG ne demande plus « mettre à jour cette app ? » à l’ouverture. Les mises à jour du système (firmware) restent bloquées.', info: '/api/appupdates', build: function(){
    var self = this, j = this.data || {}, apps = j.apps || [], pend = (j.pending || []).length;
    var rows = [
    tgl('Mettre à jour les apps automatiquement', 'Activé : la TV télécharge et installe les mises à jour des apps en arrière-plan. Désactivé : LG demande avant d’ouvrir une app qui a une mise à jour.', function(){ return (self.data && self.data.mode) !== 'manual'; }, function(b){ self.data = self.data || {}; self.data.mode = b ? 'auto' : 'manual'; api('/api/appupdates/mode?v=' + (b ? 'auto' : 'manual'), function(){ toast(b ? 'Les apps se mettent maintenant à jour toutes seules' : 'LG demandera avant de mettre à jour les apps'); }); }),
    tgl('Vérifier à l’allumage', 'Une vérification discrète 30 secondes après l’affichage de l’accueil : les mises à jour sont faites avant que tu le remarques.', function(){ return (self.data && self.data.startup) !== 'off'; }, function(b){ self.data = self.data || {}; self.data.startup = b ? 'on' : 'off'; api('/api/appupdates/conf?k=startup&v=' + (b ? 'on' : 'off'), noop); }),
    chc('Puis vérifier toutes les', 'Tant que la TV reste allumée ou en veille rapide', [[0, 'Jamais'], [1, '1 heure'], [3, '3 heures'], [6, '6 heures'], [12, '12 heures'], [24, '24 heures']], function(){ return self.data && self.data.every !== undefined ? self.data.every : 6; }, function(v){ self.data = self.data || {}; self.data.every = v; api('/api/appupdates/conf?k=every&v=' + v, noop); }),
    inf('Signalées par LG', pend ? pend + (pend === 1 ? ' app' : ' apps') : 'none', 'Les apps que LG signale pour une mise à jour. La TV les installe elle-même si les mises à jour automatiques sont activées.'),
    inf('Dernière vérification', function(){ var a = j.lastCheckAgoSec; return a === null || a === undefined ? 'depuis le dernier redémarrage : pas encore' : a < 90 ? 'à l’instant' : a < 5400 ? Math.round(a / 60) + ' min' : Math.round(a / 3600) + ' h'; }),
    act('Rechercher des mises à jour d’apps', 'Demande à la TV de vérifier tout de suite', function(){ api('/api/appupdates/check', function(err, r){ toast((r && r.msg) || 'Impossible de joindre la TV'); setTimeout(function(){ if (settingsOn && cats[catIdx].id === 'appupd') renderCat(true); }, 10000); }, 30000); }),
    inf('Mises à jour du système', 'Bloquées', 'Les mises à jour du firmware sont coupées et revérifiées toutes les 5 minutes. Elles ne peuvent pas être activées d’ici.'),
    head('Apps installées (' + apps.length + ')')];
    apps.forEach(function(a){ rows.push(inf(a.title, a.version + (a.pending ? '    ·  mise à jour en attente' : ''))); });
    return rows; }},
  {id: 'about', name: 'À propos et mises à jour', icon: 'info', title: 'À propos et mises à jour', desc: '', info: '/api/sysinfo', lg: [['support', ['automaticUpdate']], ['option', ['appUpdateMode']]], build: function(){ var self = this, j = this.data || {}, lg = j.lg || {}, m = j.mem || {};
    if (!self.askedHealth) { self.askedHealth = true; api('/api/health', function(e1, h){ if (h) { self.health = h; if (settingsOn && cats[catIdx].id === 'about') renderCat(false); } }, 20000); api('/api/caps', function(e2, c){ if (c) { self.caps = c; if (settingsOn && cats[catIdx].id === 'about') renderCat(false); } }, 20000); }
    return [
    inf('Modèle', function(){ return lg.modelName || '–'; }), inf('Firmware', function(){ return lg.firmwareVersion || '–'; }), inf('webOS SDK', function(){ return lg.sdkVersion || '–'; }),
    inf('Mémoire libre', function(){ return (m.availMB || 0) + ' sur ' + (m.totalMB || 0) + ' Mo'; }), inf('Swap utilisé', function(){ return (m.swapUsedMB || 0) + ' Mo'; }),
    inf('Allumée depuis', function(){ var s = j.uptime || 0, h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60); return h + ' h ' + mi + ' min'; }), inf('Processus', function(){ return String(j.procs || '–'); }),
    head('Autocontrôle'),
    inf('Tout est en place', function(){ var h = self.health; if (!h) return 'checking…'; return h.fail ? h.fail + ' problème' + (h.fail > 1 ? 's' : '') : h.warn ? 'tout va bien, ' + h.warn + ' remarque' + (h.warn > 1 ? 's' : '') : 'les ' + h.pass + ' contrôles sont bons'; }, function(){ var h = self.health; if (!h) return ''; var bad = (h.checks || []).filter(function(c){ return c.s !== 'ok'; }).map(function(c){ return c.n + ': ' + c.m; }); return bad.length ? bad.join('   •   ') : 'Montages, surveillances, blocage des pubs, verrou des mises à jour et SSH viennent d’être vérifiés.'; }),
    inf('Cette TV prend en charge', function(){ var c = self.caps; if (!c) return 'checking…'; var k = Object.keys(c).filter(function(x){ return x.indexOf('feature_') === 0; }), n = k.filter(function(x){ return c[x] === 'yes'; }).length; return n + ' sur ' + k.length + ' fonctions'; }, function(){ var c = self.caps; if (!c) return ''; var no = Object.keys(c).filter(function(x){ return x.indexOf('feature_') === 0 && c[x] !== 'yes'; }).map(function(x){ return x.slice(8).replace(/_/g, ' ') + ' (' + c[x] + ')'; }); return (c.webos_release || '') + (c.arch ? ', ' + c.arch : '') + (c.ram_mb ? ', ' + c.ram_mb + ' Mo' : '') + (no.length ? '.   Not available here: ' + no.join(', ') : '.   Every feature is available on this TV.'); }),
    head('Garde mémoire'),
    inf('Garde', function(){ var g = j.guard || {}; return !g.running ? 'off' : g.level === 'ok' ? 'en surveillance, tout va bien' : g.level === 'low' ? 'BAS : fermeture des apps inutilisées' : 'CRITIQUE : photos de l’accueil retirées'; }, 'Vérifie la mémoire libre et le swap toutes les 10 secondes et intervient avant que la TV ralentisse. Interrupteur dans Services et confidentialité.'),
    inf('Mémoire libre la plus basse depuis l’allumage', function(){ var g = j.guard || {}; return g.minAvailMB === null || g.minAvailMB === undefined ? '–' : g.minAvailMB + ' Mo'; }),
    inf('Swap maximal depuis l’allumage', function(){ var g = j.guard || {}; return g.maxSwapMB === null || g.maxSwapMB === undefined ? '–' : g.maxSwapMB + ' sur ' + (g.swapTotalMB || 0) + ' Mo'; }),
    inf('Nombre d’interventions', function(){ var g = j.guard || {}; return (g.lowEpisodes || 0) + ' bas, ' + (g.criticalEpisodes || 0) + ' critique'; }, function(){ var g = j.guard || {}; return g.lastAction ? 'Dernière : ' + g.lastAction : 'Aucune intervention depuis l’allumage de la TV.'; }),
    chc('Profil mémoire', 'Sévérité de la garde. Automatique choisit selon la mémoire de la TV (moins de 800 Mo = Faible : aucune photo sur l’accueil).', [['auto', 'Automatique'], ['roomy', 'Large'], ['standard', 'Standard'], ['weak', 'Faible']], function(){ return (j.guard && j.guard.setting) || 'auto'; }, function(v){ j.guard = j.guard || {}; j.guard.setting = v; api('/api/mem/conf?v=' + v, function(){ toast('Profil : ' + v); }); }),
    head('Les mises à jour sont bloquées exprès'),
    inf('Mises à jour automatiques du système', function(){ return (LGC.support || {}).automaticUpdate === 'off' ? 'Désactivées (verrouillé)' : 'ACTIVÉES – vont être coupées'; }, 'Une mise à jour du firmware pourrait retirer l’accès root et ramener les pubs de LG : c’est donc coupé et les serveurs de mise à jour sont bloqués.'),
    inf('Mises à jour automatiques des apps', function(){ return (LGC.option || {}).appUpdateMode === 'manual' ? 'Manuelles (verrouillé)' : 'Automatiques – vont être coupées'; }),
    inf('Accueil', function(){ return 'tv-debloat launcher'; }, 'Tout annuler : lance revert.sh depuis le PC, ou supprime /var/lib/webosbrew/init.d/zz-debloat et redémarre.')
  ]; }},
  {id: 'lgall', name: 'Réglages LG (ancien)', icon: 'grid', title: 'Réglages LG (ancien)', desc: 'Presque tout est dans cet écran. L’application Réglages de LG reste là pour le Wi-Fi, les comptes, la recherche des chaînes et le reste.', build: function(){ return [
    act('Ouvrir les Réglages LG', 'L’application Réglages complète de LG', function(){ launch('com.palm.app.settings'); })
  ]; }}
];

function renderCats(){
  var box = $('setcats'); box.innerHTML = '';
  cats.forEach(function(c, i){ var d = el('div', 'scat', ICON[c.icon] + '<span></span>'); d.lastChild.textContent = c.name; c._el = d; box.appendChild(d); });
  catClass();
}
function catClass(){
  cats.forEach(function(c, i){ c._el.className = 'scat' + (i === catIdx ? (sArea === 'cats' ? ' foc' : ' cur') : ''); });
  var box = $('setcatsbox'), e = cats[catIdx]._el, h = box.clientHeight, bot = e.offsetTop + e.offsetHeight, want = bot > h ? bot - h + 8 : 0;
  catY = want; $('setcats').style.transform = want ? 'translate3d(0,' + (-want) + 'px,0)' : 'translate3d(0,0,0)';
  // while the rail is folded, the name of the highlighted icon floats next to it (the rail itself clips, so it is a separate element)
  var tip = $('cattip'), showTip = sArea === 'cats' && !paneOpen;
  cls($('settings'), 'tip', showTip);
  if (showTip) { tip.textContent = cats[catIdx].name; tip.style.top = (box.offsetTop + e.offsetTop - want + e.offsetHeight / 2 - tip.offsetHeight / 2) + 'px'; }
}
function renderCat(reload){
  var c = cats[catIdx];
  function draw(){
    $('settitle').textContent = c.title; $('setdesc').textContent = c.desc || '';
    var box = $('setrows'); box.innerHTML = ''; sRows = [];
    var items = c.build.call(c);
    items.forEach(function(it){
      if (it.show && !it.show()) return;
      if (it.type === 'thumbs') { renderThumbs(box); return; }
      var r = rowEl(it); box.appendChild(r); if (it.type !== 'head') sRows.push([r]);
    });
    regroupThumbs();      // thumbs group their cells into visual rows
    if (sArea === 'pane') sFocus(Math.min(sR, sRows.length - 1), sC, true);
  }
  if (reload !== false && (c.lg || c.info)) {
    $('settitle').textContent = c.title; $('setdesc').textContent = 'Chargement…'; $('setrows').innerHTML = ''; sRows = [];
    var tok = ++renderCat.tok;
    var done = function(){ if (tok === renderCat.tok && settingsOn) draw(); };
    var step2 = function(){ if (c.info) api(c.info, function(err, j){ c.data = j || {}; done(); }, 20000); else done(); };
    if (c.lg) lgLoadMany(c.lg, step2); else step2();
  } else draw();
}
renderCat.tok = 0;
function rowEl(it){
  if (it.type === 'head') { var h = el('div', 'shead'); h.textContent = it.label; it._el = h; return h; }
  var r = el('div', 'srow' + (it.type === 'action' || it.type === 'text' ? ' act' : '')), lab = el('div', 'lab'), val = el('div', 'val');
  var d = typeof it.desc === 'function' ? it.desc() : it.desc;
  lab.innerHTML = '<span></span>' + (d ? '<small></small>' : ''); lab.firstChild.textContent = it.label; if (d) lab.lastChild.textContent = d;
  r.appendChild(lab); r.appendChild(val); r._it = it; it._el = r; paintRow(it); return r;
}
function paintRow(it){
  var val = it._el.lastChild, t = it.type;
  if (t === 'toggle') val.innerHTML = '<div class="tg' + (it.get() ? ' on' : '') + '"></div>';
  else if (t === 'choice') { var v = it.get(), lab = String(v), o = optsOf(it); for (var i = 0; i < o.length; i++) if (String(o[i][0]) === String(v)) lab = o[i][1]; val.innerHTML = '<span class="ch">◀&nbsp; <b></b> &nbsp;▶</span>'; val.querySelector('b').textContent = lab; }
  else if (t === 'slider') { var s = it.get(), pct = Math.max(0, Math.min(100, (s - it.min) * 100 / (it.max - it.min))); val.innerHTML = '<div class="sl"><i style="width:' + pct + '%"></i></div><span>' + s + '</span>'; }
  else if (t === 'info') val.textContent = typeof it.value === 'function' ? it.value() : it.value;
  else if (t === 'text') val.textContent = it.get();
  else if (t === 'action') val.textContent = it.val || '▶';
}
function thumbCell(n){
  var d = el('div', 'gt'), st = Stage.make(), im = st.lastChild; d.appendChild(st);
  im.onload = function(){ Stage.place(st, im.naturalWidth, im.naturalHeight, crops[n]); };
  im.src = thumbUrl(n); d._it = {type: 'thumb', name: n}; return d;
}
function renderThumbs(box){
  var g = el('div', 'gthumbs'); box.appendChild(g);
  photos.forEach(function(n){ g.appendChild(thumbCell(n)); });
  if (!photos.length) { var e = el('div', 'srow', 'Pas encore de photos. Choisis « Ajouter des photos depuis ton téléphone ».'); g.appendChild(e); }
  g._isThumbs = true;
}
function regroupThumbs(){
  var g = $('setrows').querySelector('.gthumbs'); if (!g) return;
  var cells = [].slice.call(g.querySelectorAll('.gt')), top = -1, row = null;
  cells.forEach(function(c){ if (c.offsetTop !== top) { top = c.offsetTop; row = []; sRows.push(row); } row.push(c); });
}
function sFocus(r, c, keep){
  if (!sRows.length) return;
  var old = sRows[sR] && sRows[sR][sC]; if (old) old.className = old.className.replace(' foc', '');
  sR = Math.max(0, Math.min(sRows.length - 1, r)); sC = Math.max(0, Math.min(sRows[sR].length - 1, c));
  var e = sRows[sR][sC]; e.className += ' foc';
  var pane = $('setpane'), pr = pane.getBoundingClientRect(), er = e.getBoundingClientRect(), fs = parseFloat(getComputedStyle(document.documentElement).fontSize);
  var rel = er.bottom + setY - pr.top;           // position inside the un-scrolled content
  var h = pr.height, want = rel > h - 2 * fs ? rel - h + 2 * fs : 0;
  setY = want; $('setinner').style.transform = want ? 'translate3d(0,' + (-want) + 'px,0)' : 'translate3d(0,0,0)';
}
function setArea(a){ sArea = a; catClass(); if (a === 'pane') { sFocus(0, 0); } else { var o = sRows[sR] && sRows[sR][sC]; if (o) o.className = o.className.replace(' foc', ''); } }
function paneSet(on){ paneOpen = on; cls($('settings'), 'open', on); catClass(); }
// OK on an icon of the rail: unfold that category next to the rail and move into it
function openPane(){ paneSet(true); sArea = 'pane'; sR = sC = 0; setY = 0; $('setinner').style.transform = ''; catClass(); renderCat(true); }
var BRV = null;
function brLoad(){ api('/api/brightness', function(err, j){ if (j && j.brightness) { BRV = j.brightness; if (settingsOn) renderCat(false); } }); }
function openSettings(id){
  if (settingsOn) return;
  brLoad();
  settingsOn = true; paneOpen = false; $('settings').className = 'on'; mpush('settings'); clearTimeout(idleT);
  if (!$('setcats').firstChild) renderCats();
  var named = false;
  catIdx = 0;
  if (id) for (var i = 0; i < cats.length; i++) if (cats[i].id === id) { catIdx = i; named = true; }
  sArea = 'cats'; sR = sC = 0; setY = 0; $('setinner').style.transform = ''; catClass();
  if (named) openPane();
}
function closeSettings(){
  settingsOn = false; mpop('settings'); $('settings').className = '';
  if (SETMODE) { apiPost('/api/settings/close', ''); return; }
  activity(); refreshPhotos(function(){ if (!hasBg()) bgApply(true); });
}
function adjust(it, dir){
  var t = it.type;
  if (t === 'toggle') { it.set(!it.get()); }
  else if (t === 'choice') { var o = optsOf(it), i = 0; for (var k = 0; k < o.length; k++) if (String(o[k][0]) === String(it.get())) i = k; i = Math.max(0, Math.min(o.length - 1, i + dir)); if (String(o[i][0]) === String(it.get())) return true; it.set(o[i][0]); }
  else if (t === 'slider') { var v = Math.max(it.min, Math.min(it.max, it.get() + dir * it.step * (adjust.mult || 1))); if (v === it.get()) return true; if (it.local) it.local(v); it.set(v); }
  else return false;
  paintRow(it); return true;
}
function settingsKey(k, e){
  if (sArea === 'cats') {
    if (k === 38 && catIdx > 0) { catIdx--; catClass(); if (paneOpen) renderCat(true); }
    else if (k === 40 && catIdx < cats.length - 1) { catIdx++; catClass(); if (paneOpen) renderCat(true); }
    else if (k === 39 || k === 13) { if (!paneOpen) openPane(); else if (sRows.length) setArea('pane'); }
    else if (k === 461 || k === 27 || k === 8 || k === 37) { if (paneOpen) paneSet(false); else closeSettings(); }
    return;
  }
  var cell = sRows[sR] && sRows[sR][sC], it = cell && cell._it, multi = sRows[sR] && sRows[sR].length > 1 || (it && it.type === 'thumb');
  adjust.mult = (k === 37 || k === 39) ? boost(k) : 1;
  if (k === 38) { if (sR > 0) { var nr = sR - 1, x = cell.getBoundingClientRect().left, b = 0, bd = 1e9; for (var i = 0; i < sRows[nr].length; i++) { var d = Math.abs(sRows[nr][i].getBoundingClientRect().left - x); if (d < bd) { bd = d; b = i; } } sFocus(nr, b); } }
  else if (k === 40) { if (sR < sRows.length - 1) { var nr2 = sR + 1, x2 = cell.getBoundingClientRect().left, b2 = 0, bd2 = 1e9; for (var j = 0; j < sRows[nr2].length; j++) { var d2 = Math.abs(sRows[nr2][j].getBoundingClientRect().left - x2); if (d2 < bd2) { bd2 = d2; b2 = j; } } sFocus(nr2, b2); } }
  else if (k === 37) { if (multi) { if (sC > 0) sFocus(sR, sC - 1); else setArea('cats'); } else if (it.type === 'choice' || it.type === 'slider') adjust(it, -1); else setArea('cats'); }
  else if (k === 39) { if (multi) { if (sC < sRows[sR].length - 1) sFocus(sR, sC + 1); } else adjust(it, 1); }
  else if (k === 13) {
    if (it.type === 'thumb') thumbMenu(it.name);
    else if (it.type === 'toggle') adjust(it, 1);
    else if (it.type === 'choice') choicePanel(it);      // OK opens the list of choices (◀ ▶ still step through them)
    else if (it.type === 'action' || it.type === 'text') it.run();
  }
  else if (k === 461 || k === 27 || k === 8) { paneSet(false); setArea('cats'); }
}
// OK on a ◀ ▶ row: the whole list, the current one ticked; OK picks, Back leaves it unchanged
function choicePanel(it){
  var o = optsOf(it), cur = String(it.get()), at = 0;
  panelOpen(it.label, o.map(function(x, i){ if (String(x[0]) === cur) at = i; return [(String(x[0]) === cur ? '✓  ' : '') + x[1], '', function(){ panelClose(); if (String(x[0]) !== String(it.get())) it.set(x[0]); paintRow(it); }]; }));
  panelFocus(at);
}
function thumbMenu(name){
  panelOpen('Photo', [
    ['Ajuster le cadrage', 'déplacer / zoomer, avec l’accueil par-dessus', function(){ panelClose(); edOpen(name); }],
    ['Mettre en fond de l’accueil', '', function(){ panelClose(); var i = photos.indexOf(name); if (i >= 0 && !SETMODE) { S.bg.on = true; saveSettings(); bgShow(i); toast('Fond modifié'); } else toast('Ferme les Réglages pour le voir'); }],
    ['Supprimer cette photo', '', function(){ panelOpen('Supprimer cette photo ?', [['Oui, supprimer', '', function(){ panelClose();
        api('/api/delete?name=' + encodeURIComponent(name), function(err){ if (err) return toast('Suppression impossible'); photos = photos.filter(function(n){ return n !== name; }); delete crops[name]; if (bgIx >= photos.length) bgIx = 0; renderCat(false); toast('Photo supprimée'); if (!photos.length && !SETMODE) bgApply(true); }); }], ['Annuler', '', panelClose]]); }],
    ['Annuler', '', panelClose]]);
}

/* ================= photo framing editor (TV remote) ================= */
// The photo fills the screen exactly as it will on Home / the screensaver. Arrow keys move the view, OK switches to zoom,
// Back opens the menu. A see-through copy of Home lies on top so you can see what the clock and the app row will cover.
var ed = null;
function ghostBuild(done){
  function go(){
    var g = $('ghost'); g.innerHTML = '';
    var v = $('view').cloneNode(true); v.style.transform = 'none';
    [].forEach.call(v.querySelectorAll('.foc'), function(n){ n.className = n.className.replace(' foc', ''); });
    g.appendChild(v); done();
  }
  if (!apps.length) { loadApps(function(){ lastT = ''; tick(); wxRender(); go(); }); } else { tick(); go(); }
}
function edOpen(name){
  var c0 = crops[name] || null;
  ed = {name: name, c: Stage.norm(c0 && c0.x !== undefined ? c0 : Stage.auto(c0)), orig: c0, mode: 'move', ghost: true, im: null, nw: 0, nh: 0, st: null};
  ed.c.a = c0 && c0.a; ed.c.e = c0 && c0.e;
  $('edstage').innerHTML = ''; $('edinfo').textContent = 'Chargement…'; $('editor').className = 'on'; mpush('editor'); edMode();
  ghostBuild(function(){ cls($('ghost'), 'on', ed && ed.ghost); });
  var im = new Image(); if (!MOCK) im.crossOrigin = 'anonymous';
  im.onload = function(){
    if (!ed || ed.name !== name) return;
    var st = Stage.make(); st.lastChild.src = im.src; $('edstage').appendChild(st);
    ed.im = im; ed.nw = im.naturalWidth; ed.nh = im.naturalHeight; ed.st = st; ed.c = Stage.norm(ed.c, ed.nw, ed.nh);
    if (!ed.c.e && !MOCK) { var e0 = Stage.sample(im, 5); if (e0) ed.c.e = e0; }      // measured now so the edge fade is visible while you move the photo
    edRender();
  };
  im.onerror = function(){ toast('Impossible de charger la photo'); edClose(); };
  im.src = httpPhotoUrl(name);
}
function edMode(){ $('edmode').textContent = ed && ed.mode === 'zoom' ? 'Zoom : ▲ avant  ▼ arrière' : 'Déplacer'; }
function edRender(){
  if (!ed || !ed.st) return;
  Stage.place(ed.st, ed.nw, ed.nh, ed.c);
  $('edinfo').textContent = 'Zoom ' + ed.c.z.toFixed(2) + '×   ·   ' + Math.round(ed.c.x * 100) + ' % horizontal, ' + Math.round(ed.c.y * 100) + ' % vertical';
}
function edKey(k){
  if (k === 461 || k === 27 || k === 8) { edMenu(); return; }
  if (k === 13) { ed.mode = ed.mode === 'move' ? 'zoom' : 'move'; edMode(); return; }
  var d = k === 37 ? [-1, 0] : k === 39 ? [1, 0] : k === 38 ? [0, -1] : k === 40 ? [0, 1] : null;
  if (!d || !ed.st) return;
  var m = boost(k), c = ed.c;
  if (ed.mode === 'zoom' && d[1]) { c.z = Stage.clamp(c.z * (d[1] < 0 ? 1 + 0.035 * m : 1 / (1 + 0.035 * m)), Stage.minZoom(ed.nw, ed.nh), 3.5); }
  else { var g = Stage.geom(ed.nw, ed.nh, c); c.x = Stage.clamp(c.x + d[0] * 0.012 * m / g.w, 0, 1); c.y = Stage.clamp(c.y + d[1] * 0.012 * m / g.h, 0, 1); }
  edRender();
}
function edMenu(){
  panelOpen('Cadrage de la photo', [
    ['Enregistrer', '', function(){ panelClose(); edSave(); }],
    ['Continuer', '', panelClose],
    ['Accueil par-dessus', ed.ghost ? 'showing' : 'hidden', function(){ ed.ghost = !ed.ghost; cls($('ghost'), 'on', ed.ghost); panelClose(); }],
    ['Revenir au cadrage automatique', '', function(){ var a = Stage.auto(ed.c); ed.c.x = a.x; ed.c.y = a.y; ed.c.z = 1; delete ed.c.e; panelClose(); edRender(); }],
    ['Annuler les modifications', '', function(){ panelClose(); edClose(); }]]);
}
function edSave(){
  var name = ed.name, c = {x: Math.round(ed.c.x * 1000) / 1000, y: Math.round(ed.c.y * 1000) / 1000, z: Math.round(ed.c.z * 1000) / 1000};
  if (ed.c.a) c.a = ed.c.a;
  var e = (!MOCK && ed.im) ? Stage.sample(ed.im, 5) : null; if (e) c.e = e; else if (ed.c.e) c.e = ed.c.e;
  crops[name] = c;
  apiPost('/api/crop?name=' + encodeURIComponent(name), JSON.stringify(c), function(err){ toast(err ? 'Impossible d’enregistrer le cadrage' : 'Cadrage enregistré'); });
  edClose();
  if (!SETMODE && photos[bgIx] === name) bgShow(bgIx);
  if (settingsOn) renderCat(false);
}
function edClose(){ mpop('editor'); $('editor').className = ''; $('ghost').innerHTML = ''; $('edstage').innerHTML = ''; ed = null; }

/* ================= input ================= */
var KEYS = {37: 'L', 38: 'U', 39: 'R', 40: 'D'};
// Back on Home returns to the app / input you were in before Home (the TV side remembers it: lastapp.sh)
function goBack(){ api('/api/back', function(err, j){ if (err) return toast('Impossible de joindre la TV'); if (!j || !j.back) toast('Rien à quoi revenir pour l’instant'); }); }
function onKey(e){
  var k = e.keyCode, wasSaver = saverOn;
  activity();
  if (wasSaver) { saverStop(); e.preventDefault(); return; }
  var m = mtop();
  if (m === 'keypad') { keypadKey(k, e); e.preventDefault(); return; }
  if (m === 'qr') { if (k === 461 || k === 27 || k === 8 || k === 13) qrClose(); e.preventDefault(); return; }
  if (m === 'panel') {
    if (k === 38) panelFocus(pIdx - 1); else if (k === 40) panelFocus(pIdx + 1);
    else if (k === 13) { var d = pItems[pIdx]; if (d && d._pick) d._pick(); }
    else if (k === 461 || k === 27 || k === 8 || k === 37) panelClose();
    e.preventDefault(); return;
  }
  if (m === 'editor') { edKey(k); e.preventDefault(); return; }
  if (m === 'settings') { settingsKey(k, e); e.preventDefault(); return; }
  if (m === 'tedit') { tedKey(k, e); e.preventDefault(); return; }
  if (SETMODE) return;
  if (k === 461 || k === 27 || k === 8) { goBack(); e.preventDefault(); return; }
  if (KEYS[k]) { move(KEYS[k]); e.preventDefault(); }
  else if (k === 13) {
    e.preventDefault(); if (e.repeat || okT) return;
    var cur = rows[R] && rows[R][C];
    if (!cur || !cur._app || !e.type) { activate(); return; }      // buttons (and synthetic calls) open at once; apps wait for the release: short = open, long = edit
    okT = setTimeout(function(){ okT = null; okLong = true; tedOpen(); }, OK_LONG);
  }
}
/* ================= long press OK: edit an app in place (favourite, hide, move) ================= */
var OK_LONG = 700, okT = null, okLong = false, ted = null, tedSilent = false;
function onKeyUp(e){
  if (e.keyCode !== 13) return;
  if (okT) { clearTimeout(okT); okT = null; if (!mtop()) activate(); }
  okLong = false;
}
var SVG_STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/></svg>',
    SVG_HIDE = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>',
    SVG_L = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>', SVG_R = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
function tedOpen(){
  var t = rows[R] && rows[R][C]; if (!t || !t._app || mtop()) return;
  ted = {id: t._app.id, sel: -1}; mpush('tedit'); tedDraw();
}
function tedTile(){ for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) if (rows[r][c]._app && rows[r][c]._app.id === ted.id) return [r, c]; return null; }
// (re)draws the edit decorations on the tile of ted.id, wherever it is now
function tedDraw(){
  [].forEach.call(document.querySelectorAll('.tile.nbl,.tile.nbr'), function(n){ cls(n, 'nbl', false); cls(n, 'nbr', false); });
  [].forEach.call(document.querySelectorAll('.tile.edit'), function(n){ cls(n, 'edit', false); cls(n, 'onbtn', false); [].slice.call(n.querySelectorAll('.tmenu,.tarr')).forEach(function(x){ n.removeChild(x); }); });
  if (!ted) return;
  var p = tedTile(); if (!p) { tedClose(); return; }
  focusItem(p[0], p[1]); var t = rows[p[0]][p[1]], fav = S.dock.indexOf(ted.id) >= 0, sib = tedSiblings();
  var m = el('div', 'tmenu'), b1 = el('div', 'tb star' + (fav ? ' on' : ''), SVG_STAR), b2 = el('div', 'tb del', SVG_HIDE);
  if (ted.sel === 0) b1.className += ' foc'; if (ted.sel === 1) b2.className += ' foc';
  m.appendChild(b1); m.appendChild(b2); t.appendChild(m);
  var i = sib.indexOf(ted.id);
  if (i > 0) { var l = el('div', 'tarr l', SVG_L); t.appendChild(l); }
  if (i >= 0 && i < sib.length - 1) { var r2 = el('div', 'tarr r', SVG_R); t.appendChild(r2); }
  cls(t, 'edit', true); cls(t, 'onbtn', ted.sel >= 0);
  rows[p[0]].forEach(function(n, i){ if (i !== p[1]) cls(n, i < p[1] ? 'nbl' : 'nbr', true); });      // the rest of the line steps aside so the arrows have room
  $('htitle').textContent = (t._app.title || t._app.id);
  $('hsub').textContent = ted.sel < 0 ? '◀ ▶ pour déplacer  ·  ▲ favori ou masquer  ·  OK pour terminer'
    : ted.sel === 0 ? (fav ? 'OK pour retirer des favoris' : (S.dock.length >= FAV_MAX ? FAV_MAX + ' favoris au maximum : retires-en un d’abord' : 'OK pour ajouter aux favoris')) + '  ·  ▼ pour revenir'
    : (t._app.removable ? 'OK pour désinstaller ou masquer cette app' : 'OK pour masquer cette app (les apps de LG ne se désinstallent pas)') + '  ·  ▼ pour revenir';
}
// the ids of the row group the tile belongs to (favourites, or the whole grid), in display order
function tedSiblings(){ if (S.dock.indexOf(ted.id) >= 0) return S.dock.slice(); return [].map.call($('grid').children, function(n){ return n._app.id; }); }
function tedMove(d){
  var sib = tedSiblings(), i = sib.indexOf(ted.id), j = i + d; if (i < 0 || j < 0 || j >= sib.length) return;
  sib[i] = sib[j]; sib[j] = ted.id;
  tedSilent = true; setPath(S.dock.indexOf(ted.id) >= 0 ? 'dock' : 'order', sib); tedSilent = false;
  buildApps(apps); tedDraw();
}
function tedFav(){
  var d = S.dock.slice(), k = d.indexOf(ted.id);
  if (k >= 0) d.splice(k, 1); else { if (d.length >= FAV_MAX) { toast(FAV_MAX + ' favoris au maximum : retires-en un d’abord'); return; } d.push(ted.id); }
  tedSilent = true; setPath('dock', d); tedSilent = false; buildApps(apps); tedDraw();
  toast(k >= 0 ? 'Retirée des favoris' : 'Ajoutée aux favoris');
}
function tedHide(){
  var id = ted.id, p = tedTile(), h = S.hide.slice(), d = S.dock.filter(function(x){ return x !== id; });
  if (h.indexOf(id) < 0) h.push(id);
  tedSilent = true; if (d.length !== S.dock.length) setPath('dock', d); setPath('hide', h); tedSilent = false;
  tedClose(); buildApps(apps); if (p) focusItem(p[0], p[1]);
  toast('App masquée. Réglages › Accueil et veille › Apps masquées pour la remettre');
}
// the bin: uninstall (apps LG marks as removable) or only hide from Home; asked in a small list so nothing goes by accident
function tedBin(){
  var p = tedTile(); if (!p) return; var a = rows[p[0]][p[1]]._app, nm = a.title || a.id, l = [];
  if (a.removable) l.push(['Désinstaller ' + nm, 'supprime l’app de la TV', function(){ panelClose(); tedUninstall(a); }]);
  l.push(['Masquer de l’accueil', 'se remet dans Réglages', function(){ panelClose(); tedHide(); }]);
  l.push(['Annuler', '', function(){ panelClose(); }]);
  panelOpen(nm, l);
}
function tedUninstall(a){
  var nm = a.title || a.id; toast('Désinstallation de ' + nm + '…');
  api('/api/uninstall?id=' + encodeURIComponent(a.id), function(err, j){
    if (err || !j || j.returnValue === false) { toast('Impossible de désinstaller ' + nm + (j && j.errorText ? ' (' + j.errorText + ')' : '')); return; }
    var id = a.id, p = tedTile();
    tedSilent = true;
    if (S.dock.indexOf(id) >= 0) setPath('dock', S.dock.filter(function(x){ return x !== id; }));
    if ((S.order || []).indexOf(id) >= 0) setPath('order', S.order.filter(function(x){ return x !== id; }));
    tedSilent = false;
    apps = apps.filter(function(x){ return x.id !== id; }); favApps = null;
    tedClose(); buildApps(apps); if (p) focusItem(p[0], p[1]);
    toast(nm + ' est désinstallée');
    setTimeout(function(){ loadApps(); }, 4000);      // LG's own list, once the removal has finished
  }, 65000);
}
function tedClose(){ if (!ted) return; ted = null; mpop('tedit'); tedDraw(); if (rows[R] && rows[R][C]) setHero(rows[R][C]); }
function tedKey(k, e){
  if (k === 13) { if (okLong || (e && e.repeat)) return; if (ted.sel === 0) tedFav(); else if (ted.sel === 1) tedBin(); else tedClose(); return; }
  if (k === 461 || k === 27 || k === 8) { if (ted.sel >= 0) { ted.sel = -1; tedDraw(); } else tedClose(); return; }
  if (k === 38) { if (ted.sel < 0) { ted.sel = 0; tedDraw(); } return; }
  if (k === 40) { if (ted.sel >= 0) { ted.sel = -1; tedDraw(); } return; }
  if (k === 37 || k === 39) { if (ted.sel >= 0) { ted.sel = k === 37 ? 0 : 1; tedDraw(); } else tedMove(k === 37 ? -1 : 1); }
}
document.addEventListener('keydown', onKey);
document.addEventListener('keyup', onKeyUp);
// the Magic Remote's scroll wheel (which is also what makes the pointer appear) moves the highlight up / down, like the arrow keys, in lists, panels and Settings
var wheelAt = 0;
document.addEventListener('wheel', function(e){
  var now = Date.now(); if (now - wheelAt < 90) return; wheelAt = now;
  var k = e.deltaY > 0 ? 40 : e.deltaY < 0 ? 38 : 0; if (!k) return;
  onKey({keyCode: k, preventDefault: function(){ try { e.preventDefault(); } catch (x) {} }});
});
document.addEventListener('mousemove', function(){ if (saverOn) saverStop(); activity(); });
function upTo(n, re, stop){ while (n && n !== stop) { if (n.className && re.test(n.className)) return n; n = n.parentNode; } return null; }
// pointer (if it ever shows): hover moves the highlight on Home and on the Settings rail, a click does what OK does
document.addEventListener('mouseover', function(e){
  if (saverOn) return;
  var m = mtop();
  if (m === 'settings') { if (paneOpen || sArea !== 'cats') return; var c = upTo(e.target, /(^| )scat( |$)/, document.body); if (c) for (var i = 0; i < cats.length; i++) if (cats[i]._el === c && catIdx !== i) { catIdx = i; catClass(); } return; }
  if (SETMODE || m) return;
  var n = upTo(e.target, /(^| )(tile|hbtn)( |$)/, document.body);
  if (n) for (var r = 0; r < rows.length; r++) for (var q = 0; q < rows[r].length; q++) if (rows[r][q] === n) { focusItem(r, q); return; }
});
// pop-up lists (inputs, network, photo menu...), the number pad and the QR page also answer the pointer
$('panel').addEventListener('mouseover', function(e){ var n = upTo(e.target, /(^| )pitem( |$)/, this); if (n) { var i = pItems.indexOf(n); if (i >= 0 && i !== pIdx) panelFocus(i); } });
$('panel').addEventListener('click', function(e){
  var n = upTo(e.target, /(^| )pitem( |$)/, this);
  if (n) { var i = pItems.indexOf(n); if (i >= 0) { panelFocus(i); if (n._pick) n._pick(); } } else if (e.target === this) panelClose();
});
$('keym').addEventListener('click', function(e){ var n = upTo(e.target, /(^| )kk( |$)/, this); if (n) { var i = kBtns.indexOf(n); if (i >= 0) { kIdx = i; keypadDraw(); keypadKey(13, null); } } });
$('qrm').addEventListener('click', function(){ qrClose(); });
$('settings').addEventListener('click', function(e){
  if (mtop() !== 'settings') return;
  var c = upTo(e.target, /(^| )scat( |$)/, this);
  if (c) { for (var i = 0; i < cats.length; i++) if (cats[i]._el === c) { catIdx = i; openPane(); } return; }
  var rw = upTo(e.target, /(^| )(srow|gt)( |$)/, this);
  if (rw) for (var r = 0; r < sRows.length; r++) for (var q = 0; q < sRows[r].length; q++) if (sRows[r][q] === rw) { sArea = 'pane'; catClass(); sFocus(r, q); settingsKey(13); }
});
document.addEventListener('click', function(e){
  var n = e.target; while (n && n !== document.body) { if (n.className && /(^| )(tile|hbtn)( |$)/.test(n.className)) break; n = n.parentNode; }
  if (!n || n === document.body || mstack.length) return;
  for (var r = 0; r < rows.length; r++) for (var c = 0; c < rows[r].length; c++) if (rows[r][c] === n) { focusItem(r, c); activate(); }
});

/* ================= lifecycle ================= */
function netLabel(){ api('/api/net', function(err, j){ if (!j || !j.returnValue) return; $('netlabel').textContent = (j.wired && j.wired.state === 'connected') ? 'Ethernet' : (j.wifi && j.wifi.state === 'connected') ? 'Wi-Fi' : 'Hors ligne'; }); }
var appsAt = 0;
function onShow(){
  tick(); activity();
  api('/api/saver/take', function(err, j){ if (j && j.take && S.saver.on) saverStart(); });      // LG's own screensaver was replaced by ours (saver-take.sh)
  if (Date.now() - appsAt > 60000) { appsAt = Date.now(); loadApps(function(ok){ if (ok) focusItem(Math.min(1, rows.length - 1), 0); }); }
  wxLoad(false); loadSettings(); refreshPhotos(function(ch){ if (ch) bgApply(true); });
  if (photos.length && S.bg.on && Date.now() - bgAt > Math.max(1, S.bg.everyMin) * 60000) bgShow(bgIx + 1);
  netLabel(); if (!SETMODE) ecoRead();
}
function onHide(){ clearTimeout(idleT); if (saverOn) saverStop(); if (mtop() === 'panel') panelClose(); }

if (INPMODE) {
  /* ---- Inputs overlay: only the Inputs list (opened by the Input / Guide keys); a second press of the key (webOSRelaunch) closes it ---- */
  document.documentElement.className = 'mode-settings'; cls(document.body, 'mode-settings', true);
  loadSettings(function(){ openInputs(); });
  var inpAt = Date.now(); document.addEventListener('webOSRelaunch', function(){ if (Date.now() - inpAt > 1500) panelClose(); });
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ api('/api/qs?m=inputs-painted', noop); }); });
} else if (SETMODE) {
  /* ---- Settings overlay: only the Settings screen; Back at the top level closes the page ---- */
  document.documentElement.className = 'mode-settings'; cls(document.body, 'mode-settings', true);
  tick();
  loadSettings(function(){ refreshPhotos(function(){ if (settingsOn && cats[catIdx].id === 'gallery') renderCat(false); }); });
  openSettings(); var T1 = Date.now();
  // the Settings key while we are open: WebAppMgr launches the running page again and tells it so (webOSRelaunch) -> close (not in the first 1.5 s, in case the first launch sends one too)
  var setAt = Date.now(); document.addEventListener('webOSRelaunch', function(){ if (Date.now() - setAt > 1500) closeSettings(); });
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ var t = window.performance && performance.timing || {}, n = t.navigationStart || 0; api('/api/qs?m=settings-painted_nav=' + (Date.now() - n) + '_dom=' + (t.domContentLoadedEventEnd - n) + '_load=' + (t.loadEventEnd - n) + '_resp=' + (t.responseEnd - n) + '_dl=' + (t.domLoading - n) + '_script=' + (t.domInteractive - n) + '_js0=' + (T0 - n) + '_js1=' + (T1 - n), noop); }); });     // first frame is on screen: lets the TV log how long the key took
  if (MOCK && /settings=(\w+)/.test(location.search)) setTimeout(function(){ for (var i = 0; i < cats.length; i++) if (cats[i].id === /settings=(\w+)/.exec(location.search)[1]) { catIdx = i; } catClass(); openPane(); if (/row=(\d+)/.test(location.search)) sFocus(parseInt(/row=(\d+)/.exec(location.search)[1], 10), 0); }, 1200);
} else {
  document.addEventListener('visibilitychange', function(){ if (document.hidden) onHide(); else { if (!settingsOn) focusItem(1, 0); onShow(); } });
  document.addEventListener('webOSRelaunch', function(){ if (saverOn) saverStop(); while (mstack.length) { var t = mtop(); if (t === 'settings') closeSettings(); else if (t === 'panel') panelClose(); else if (t === 'qr') qrClose(); else if (t === 'keypad') keypadClose(); else if (t === 'editor') edClose(); else mstack.pop(); } focusItem(1, 0); onShow(); });
  window.addEventListener('resize', function(){ layoutRows(); });
  // the Settings overlay sits on top of Home without hiding it, so Home never gets a "visible" event: pick up what changed when the overlay closes
  window.addEventListener('focus', function(){ if (document.hidden || saverOn) return; updPoll(); loadSettings(); refreshPhotos(function(ch){ if (ch) { if (!hasBg()) bgApply(true); else if (photos[bgIx]) bgShow(bgIx); } }); });
  setInterval(function(){ if (!document.hidden) tick(); }, 1000);
  setInterval(function(){ if (!document.hidden) wxLoad(false); }, 60000);
  // pick up changes made from the phone page (settings, uploads, framing): cheap local calls every 30 s while Home is visible
  setInterval(function(){ if (document.hidden || saverOn || ed) return; loadSettings(); refreshPhotos(function(ch){ if (ch) { if (!hasBg()) bgApply(true); if (settingsOn && cats[catIdx].id === 'gallery') renderCat(false); } }); }, 30000);

  /* ================= start ================= */
  tick(); appsAt = Date.now(); focusItem(0, 0);
  loadSettings(function(){
    wxLoad(true);
    refreshPhotos(function(){ bgPickNew(); bgSchedule(); });
  });
  loadApps(function(ok){
    layoutRows(); focusItem(Math.min(1, rows.length - 1), 0);
    api('/api/ready', function(){ dlog('ready apps=' + apps.length + ' ok=' + ok + ' ua=' + navigator.userAgent.slice(-40)); });
  });
  setTimeout(function(){ api('/api/ready', noop); }, 4000);    // ready even if the app list is slow, so the 30 s Home watchdog only trips when the API is gone
  netLabel(); if (!SETMODE) ecoRead(); activity();
  // fast path of the Settings key (api.sh /api/ui/*): while Home is in front the compositor hands the key to this page, which opens its own Settings instead of a second page
  function uiWait(){
    if (MOCK) return;
    xhr('GET', API + '/api/ui/wait', null, function(err, j){
      if (j && j.cmd === 'settings') { api('/api/ui/ack', noop, 3000); uiSettings(); }
      else if (j && (j.cmd === 'lowmem' || j.cmd === 'normal')) memMode(j.cmd === 'lowmem');
      setTimeout(uiWait, err ? 3000 : 30);
    }, 110000);
  }
  function memMode(on){ if (LOWMEM === on) return; LOWMEM = on; dlog('memory mode ' + (on ? 'low' : 'normal')); bgApply(true); }
  function uiSettings(){
    if (settingsOn) { closeSettings(); return; }
    if (saverOn) saverStop();
    while (mstack.length) { var t = mtop(); if (t === 'panel') panelClose(); else if (t === 'qr') qrClose(); else if (t === 'keypad') keypadClose(); else if (t === 'editor') edClose(); else mstack.pop(); }
    openSettings(); api('/api/qs?m=inhome-settings-open', noop);
  }
  setTimeout(uiWait, 1500);
  setTimeout(updPoll, MOCK ? 1200 : 25000); setInterval(function(){ if (!document.hidden && !saverOn) updPoll(); }, 600000);
  if (MOCK && /saver/.test(location.search)) setTimeout(saverStart, 1200);
  if (MOCK && /settings=(\w+)/.test(location.search)) setTimeout(function(){ openSettings(/settings=(\w+)/.exec(location.search)[1]); setArea('pane'); if (/row=(\d+)/.test(location.search)) sFocus(parseInt(/row=(\d+)/.exec(location.search)[1], 10), 0); }, 1500);
  if (MOCK && /rail=1/.test(location.search)) setTimeout(function(){ openSettings(); }, 1500);
  if (MOCK && /edit=(\S+?)(&|$)/.test(location.search)) setTimeout(function(){ edOpen(/edit=(\S+?)(&|$)/.exec(location.search)[1]); }, 1500);
}
applyUi();
window.__tvhome = {set: setPath, saver: saverStart, stop: saverStop, bg: function(){ bgShow(bgIx + 1); }, settings: openSettings, photos: function(){ return photos.length; }, S: function(){ return S; }, wx: function(){ return wx; }, crops: function(){ return crops; }, edit: edOpen, key: function(k){ document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: k})); document.dispatchEvent(new KeyboardEvent('keyup', {keyCode: k})); }};
})();
