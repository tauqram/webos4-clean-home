#!/bin/sh
# saverdeny.sh start|stop|status - answer "not now" when LG's power service (tvpower) asks whether it may start LG's screensaver while OUR Home
# (or one of our overlays) is in front. Our Home has its own screensaver, so LG's is never wanted there.
# Why: tvpower launches LG's saver from "Active / processing: Screen Saver Ready" and stays in that state until it has seen the saver start; our swap
# (saver-take.sh) closed it too early, tvpower stayed stuck, and every Power press then took ~10 s and ended in a FULL shutdown (slow cold start).
# tvpowerd offers registerScreenSaverRequest / responseScreenSaverRequest: a registered client is asked before the saver starts. Registering was
# accepted on the C9 ({"subscribed":true}); the request message itself has NOT been seen yet, so every message is logged (first 300 characters)
# and so is our answer, to learn its exact shape. On other inputs (no signal, ...) we answer yes: LG's saver starts and saver-take.sh swaps it as before.
# Undo: `sh saverdeny.sh stop` (also run by home-off.sh / revert.sh); nothing is written outside /tmp and our log.
. /media/developer/tv-debloat/common.sh
PIDF=/tmp/saverdeny.pid; NAME=tvdebloat
alive() { [ -f $PIDF ] && kill -0 "$(cat $PIDF 2>/dev/null)" 2>/dev/null; }
case ${1:-start} in
  stop) touch /tmp/saverdeny.stop; [ -f $PIDF ] && kill "$(cat $PIDF)" 2>/dev/null; rm -f $PIDF
        for p in $(pgrep -f "registerScreenSaverRequest"); do kill "$p" 2>/dev/null; done
        log "saverdeny: stopped"; exit 0;;
  status) alive && echo running || echo stopped; exit 0;;
esac
[ -e "$D/DISABLE" ] && exit 0
alive && exit 0
rm -f /tmp/saverdeny.stop
( while [ ! -e /tmp/saverdeny.stop ]; do
    luna-send -i luna://com.webos.service.tvpower/power/registerScreenSaverRequest "{\"subscribe\":true,\"clientName\":\"$NAME\"}" </dev/null 2>/dev/null | while read -r l; do
      case "$l" in *'"subscribed"'*) case "$l" in *timestamp*) ;; *) continue;; esac;; esac
      log "saverdeny: tvpower asks: $(printf %s "$l" | cut -c1-300)"
      ts=$(printf %s "$l" | sed -n 's/.*"timestamp" *: *\("[^"]*"\|[0-9][0-9]*\).*/\1/p')      # sent back exactly as received (string or number)
      fg=$(cat /tmp/fgnow 2>/dev/null)
      case "$fg" in ''|"$HOME_ID"|"$SET_ID"|"$INP_ID"|com.webos.app.quicksettings) ack=false;; *) ack=true;; esac
      [ -n "$ts" ] && tsj=",\"timestamp\":$ts" || tsj=""
      r=$(lun luna://com.webos.service.tvpower/power/responseScreenSaverRequest "{\"clientName\":\"$NAME\",\"ack\":$ack$tsj}" | tr -d '\n' | cut -c1-200)
      log "saverdeny: answered ack=$ack (front: ${fg:-none}) -> $r"
    done
    [ -e /tmp/saverdeny.stop ] || sleep 10      # tvpower restarted or refused: try again
  done ) </dev/null >/dev/null 2>&1 &
echo $! > $PIDF
log "saverdeny: registered with tvpower as $NAME (pid $(cat $PIDF))"
