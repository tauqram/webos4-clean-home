#!/bin/sh
# saver-take.sh - LG's own screensaver (no signal on an input, or LG's idle timer) just appeared: swap it for ours.
# Closes LG's saver, brings Home to the front and tells the page (/tmp/saver-now, read by /api/saver/take when the page is shown) to start our screensaver.
# Does nothing when our screensaver is switched off in Settings (then LG's stays), or state/saver-lg exists, or it ran in the last 10 s.
#
# `saver-take.sh release [now]` - give LG's power service (tvpower) its normal state back. tvpower starts LG's saver from a state it calls
# "Active / processing: Screen Saver Ready" and waits there until it has seen the saver start. Our swap closes the saver within a quarter of a second,
# before that, so tvpower stayed in that state for good; from then on every Power press waited ~10 s and ended in a FULL shutdown, even with
# Quick Start+ on (slow off, slow cold start showing LG's old Home). tvpower refuses turnOnScreen while it is in that state ("power is busy").
# What works (tools/saver-unstick-test.sh on the C9, 2026-11-06): launch LG's saver once more while our swap looks away: tvpower goes back to plain
# "Active" within a second and the saver leaves by itself without being seen; Power was instant again and the TV woke in 2-3 s.
# `now` = at once; without it (the home-on.sh watchdog, every 20 s) only on a second sighting 15 s or more apart, because a real saver launch passes
# through that state in well under a second. Since 2026.11.06.13 this is only the fallback: saverdeny.sh asks tvpower not to start LG's saver while our
# Home is in front, and release is no longer run right after a swap nor while our own screensaver is on screen (it interrupted it and showed LG's saver).
. /media/developer/tv-debloat/common.sh
SAVER=com.webos.app.screensaver
stuck() { p=$(lun luna://com.webos.service.tvpower/power/getPowerState '{}' | tr -d '\n'); case "$p" in *'"Active"'*) ;; *) return 1;; esac; case "$p" in *'Screen Saver Ready'*|*ScreenSaverReady*) return 0;; esac; return 1; }
saver_up() { lun luna://com.webos.applicationManager/running '{}' | grep -q "\"id\": *\"$SAVER\""; }
if [ "$1" = release ]; then
  [ -e "$D/DISABLE" ] && exit 0
  [ "$2" != swap ] && [ -e /tmp/saver-on ] && exit 0               # never while OUR screensaver is on screen: relaunching LG's saver would interrupt it (Sam, .12)
  stuck || { rm -f /tmp/ssr-seen; exit 0; }
  saver_up && exit 0                                               # LG's saver is really there: tvpower is not stuck, the swap will deal with it
  if [ "$2" != now ] && [ "$2" != swap ]; then
    n=$(cut -d. -f1 /proc/uptime); s=$(cat /tmp/ssr-seen 2>/dev/null)
    [ -n "$s" ] || { echo "$n" > /tmp/ssr-seen; exit 0; }
    [ $((n - s)) -ge 15 ] || exit 0
  fi
  rm -f /tmp/ssr-seen
  mkdir /tmp/saver-unstick.lock 2>/dev/null || exit 0
  cut -d. -f1 /proc/uptime > /tmp/saver-unstick                    # the swap below leaves LG's saver alone for 20 s
  fg=$(lun luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p' | head -1)
  lun luna://com.webos.applicationManager/launch "{\"id\":\"$SAVER\"}" >/dev/null
  i=0; ok=no
  while [ $i -lt 10 ]; do sleep 1; i=$((i+1)); stuck || { ok=yes; break; }; done
  sleep 1
  [ $ok = yes ] && saver_up && lun luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$SAVER\"}" >/dev/null     # only once tvpower has let go
  now=$(lun luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p' | head -1)
  [ "$2" != swap ] && [ "$fg" = "$HOME_ID" ] && [ "$now" != "$HOME_ID" ] && lun luna://com.webos.applicationManager/launch "{\"id\":\"$HOME_ID\"}" >/dev/null
  log "saver-take: power service was stuck in 'Screen Saver Ready' ($2), relaunched LG's saver once: released=$ok after ${i}s (front: $fg -> $now)"
  rmdir /tmp/saver-unstick.lock
  exit 0
fi
[ -e "$STATE/saver-lg" ] && exit 0
n=$(cut -d. -f1 /proc/uptime); u=$(cat /tmp/saver-unstick 2>/dev/null || echo -99)
[ $((n - u)) -ge 20 ] || exit 0                                     # that is our own unsticking launch (release above): leave it alone
python -c "
import json, sys
try: s = json.load(open('$STATE/settings.json'))
except Exception: s = {}
sys.exit(0 if (s.get('saver') or {}).get('on', True) else 1)" 2>/dev/null || exit 0
now=$(cut -d. -f1 /proc/uptime); last=$(cat /tmp/saver-take.last 2>/dev/null || echo -99)
[ $((now - last)) -ge 10 ] || exit 0
echo $now > /tmp/saver-take.last
# Was OUR screensaver on when LG's came (tvpower's own idle timer does not know about ours)? /tmp/saver-on exists while ours runs (backlight.sh);
# if the page already stopped it because LG's window covered it, backlight.sh restore stamped /tmp/saver-off.at a moment ago.
on_fresh() { [ -e /tmp/saver-on ] && [ -z "$(find /tmp/saver-on -mmin +1 2>/dev/null)" ]; }      # the page refreshes it every minute while ours runs
ours=no; on_fresh && ours=yes
o=$(cut -d. -f1 /tmp/saver-off.at 2>/dev/null); [ -n "$o" ] && [ $((now - o)) -le 6 ] && ours=yes
log "saver-take: LG's screensaver appeared, showing ours (ours already on: $ours)"
# Where was the TV (Sam, 2026-11-11: paused on Canal+, woke up on Home)? LG's saver is a window over the app, the app stays the foreground app.
# Remember it in /tmp/saver-return: the page asks /api/saver/back when a key wakes our saver and that app is launched again (it is still resident,
# so it comes back where it was). Home in front: keep whatever is there (the page forgets it when it starts a saver of its own).
fg=$(lun luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId" *: *"\([^"]*\)".*/\1/p' | head -1)
case "$fg" in ''|"$HOME_ID"|"$SET_ID"|"$INP_ID"|com.webos.app.screensaver*|com.webos.app.quicksettings|com.webos.app.notification*|com.webos.app.splash) ;;
  *) echo "$fg" > /tmp/saver-return; log "saver-take: will return to $fg when the saver ends";; esac
# Let tvpower see LG's saver start BEFORE closing it (2026.11.06.16): closed too early, tvpower stays in "Active / Screen Saver Ready" (slow Power key,
# full shutdown). Wait (0.2 s steps, at most 2 s) until it leaves that state, then close. The .15 version closed at once and relaunched the saver to
# free tvpower, so LG's saver flashed twice; this way it shows once, briefly. If tvpower is still stuck after the close, `release swap` frees it
# the .15 way, still before our screensaver starts (so ours is never interrupted).
i=0; while [ $i -lt 10 ] && stuck; do usleep 200000; i=$((i+1)); done
lun luna://com.webos.applicationManager/closeByAppId '{"id":"com.webos.app.screensaver"}' >/dev/null
log "saver-take: closed LG's saver after $((i / 5)).$((i % 5 * 2)) s ($(stuck && echo 'tvpower still waiting' || echo 'tvpower free'))"
i=0; while [ $i -lt 6 ] && saver_up; do usleep 500000; i=$((i+1)); done
sh "$0" release swap
up > /tmp/saver-now
if [ $ours = yes ]; then
  # 2026.11.06.22 (Sam: "ça a scintillé, deux veilles, retour à l'accueil, puis une autre veille"): relaunching Home made the page stop our running
  # saver (webOSRelaunch) and start a fresh one. Home is still underneath LG's closed saver, so do not relaunch it: if the page kept its saver,
  # nothing happens; if it stopped it when LG's window covered it, it is shown again and /tmp/saver-now restarts ours. Fallback after 3 s: nobody
  # took /tmp/saver-now and our saver is not on -> relaunch Home the old way, so the TV can never stay on a bare Home without a saver.
  i=0; while [ $i -lt 6 ] && [ -e /tmp/saver-now ]; do usleep 500000; i=$((i+1)); done
  if [ ! -e /tmp/saver-now ]; then log "saver-take: Home came back by itself and restarted our saver"
  elif on_fresh; then rm -f /tmp/saver-now; log "saver-take: our saver kept running, Home not relaunched"
  else rm -f /tmp/saver-now; up > /tmp/saver-now; lun luna://com.webos.applicationManager/launch "{\"id\":\"$HOME_ID\"}" >/dev/null; log "saver-take: Home did not come back, relaunched it"
  fi
else
  lun luna://com.webos.applicationManager/launch "{\"id\":\"$HOME_ID\"}" >/dev/null
fi
