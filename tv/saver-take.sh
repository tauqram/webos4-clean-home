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
# `now` = right after our own close; without it (the home-on.sh watchdog, every 20 s) only on a second sighting 15 s or more apart, because a real
# saver launch passes through that state in well under a second.
. /media/developer/tv-debloat/common.sh
SAVER=com.webos.app.screensaver
stuck() { p=$(lun luna://com.webos.service.tvpower/power/getPowerState '{}' | tr -d '\n'); case "$p" in *'"Active"'*) ;; *) return 1;; esac; case "$p" in *'Screen Saver Ready'*|*ScreenSaverReady*) return 0;; esac; return 1; }
saver_up() { lun luna://com.webos.applicationManager/running '{}' | grep -q "\"id\": *\"$SAVER\""; }
if [ "$1" = release ]; then
  [ -e "$D/DISABLE" ] && exit 0
  stuck || { rm -f /tmp/ssr-seen; exit 0; }
  saver_up && exit 0                                               # LG's saver is really there: tvpower is not stuck, the swap will deal with it
  if [ "$2" != now ]; then
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
  [ "$fg" = "$HOME_ID" ] && [ "$now" != "$HOME_ID" ] && lun luna://com.webos.applicationManager/launch "{\"id\":\"$HOME_ID\"}" >/dev/null
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
log "saver-take: LG's screensaver appeared, showing ours"
up > /tmp/saver-now
lun luna://com.webos.applicationManager/closeByAppId '{"id":"com.webos.app.screensaver"}' >/dev/null
lun luna://com.webos.applicationManager/launch "{\"id\":\"$HOME_ID\"}" >/dev/null
# hand tvpower its normal state back (see release above), in the background so the watchers that called us are not held up
( sleep 2; sh "$0" release now ) </dev/null >/dev/null 2>&1 &
