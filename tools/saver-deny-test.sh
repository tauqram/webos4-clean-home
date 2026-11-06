#!/bin/sh
# saver-deny-test.sh - can we tell LG's power service "no screensaver now" so it never launches LG's saver (and never gets stuck)?
# tvpowerd has registerScreenSaverRequest / responseScreenSaverRequest (an app is asked before the saver starts) and requestScreenSaver (start the flow now).
# Run: ./tv.sh -s < tools/saver-deny-test.sh     (about 40 s). Our swap is paused with state/saver-lg during the test and restored at the end.
# If the test fails, LG's saver may show for a moment at the end (the test then frees the power service the old way).
D=/media/developer/tv-debloat; S=$D/state; OUT=/tmp/saver-deny.txt; : > $OUT
t() { cut -d' ' -f1 /proc/uptime; }
pst() { luna-send -n 1 -w 2000 luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null 2>/dev/null | tr -d '\n'; echo; }
had=0; [ -e $S/saver-lg ] && had=1; touch $S/saver-lg
echo "$(t) before: $(pst)"
# the client: print every message, answer every request with ack:false
( luna-send -i luna://com.webos.service.tvpower/power/registerScreenSaverRequest '{"subscribe":true,"clientName":"tvdebloat"}' </dev/null 2>&1 | while read -r l; do
    echo "$(t) CLIENT GOT: $l" >> $OUT
    ts=$(printf %s "$l" | sed -n 's/.*"timestamp" *: *\([0-9]*\).*/\1/p')
    if [ -n "$ts" ]; then
      r=$(luna-send -n 1 -w 2000 luna://com.webos.service.tvpower/power/responseScreenSaverRequest "{\"clientName\":\"tvdebloat\",\"ack\":false,\"timestamp\":$ts}" </dev/null 2>&1)
      echo "$(t) ANSWERED ack:false ts=$ts -> $r" >> $OUT
    fi
  done ) &
sleep 2
echo "$(t) requestScreenSaver: $(luna-send -n 1 -w 3000 luna://com.webos.service.tvpower/power/requestScreenSaver '{}' </dev/null 2>&1)"
i=0; while [ $i -lt 12 ]; do sleep 1; i=$((i+1)); echo "$(t) +${i}s: $(pst) saver_running=$(luna-send -n 1 luna://com.webos.applicationManager/running '{}' </dev/null 2>/dev/null | grep -c com.webos.app.screensaver)"; done
echo "=== client log"; cat $OUT
# clean up: stop the client (by pid of its luna-send, found by its unique client name)
for p in $(ps 2>/dev/null | awk '/registerScreenSaverRequest/ && /tvdebloat/ && !/awk/ {print $1}'); do case "$p" in *[!0-9]*) ;; *) kill "$p" 2>/dev/null;; esac; done
# if the power service is stuck after all, free it the old way
if pst | grep -q 'Screen Saver Ready'; then
  echo "$(t) still stuck: freeing it by launching LG's saver once"
  luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.screensaver"}' </dev/null >/dev/null 2>&1; sleep 3
  luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.fullhome"}' </dev/null >/dev/null 2>&1
fi
echo "$(t) final: $(pst)"
[ $had = 1 ] || rm -f $S/saver-lg
echo done
