#!/bin/sh
# saver-unstick-test.sh - can LG's power service leave "Screen Saver Ready" if its screensaver is allowed to really start before we close it?
# Run: ./tv.sh -s < tools/saver-unstick-test.sh        (about 20 s; LG's screensaver shows for a few seconds, then Home comes back)
# Reversible: our swap is paused with the existing flag state/saver-lg during the test and the flag is removed at the end. If the test is cut off,
# remove it by hand: ./tv.sh "rm -f /media/developer/tv-debloat/state/saver-lg"
D=/media/developer/tv-debloat; S=$D/state
ps() { luna-send -n 1 -w 2000 luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null 2>/dev/null | tr -d '\n'; echo; }
t() { cut -d' ' -f1 /proc/uptime; }
had=0; [ -e $S/saver-lg ] && had=1
touch $S/saver-lg
echo "$(t) before: $(ps)"
echo "$(t) launch LG screensaver: $(luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.screensaver"}' </dev/null 2>&1)"
i=0; while [ $i -lt 8 ]; do sleep 1; i=$((i+1)); echo "$(t) +${i}s: $(ps)"; done
echo "$(t) close it: $(luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{"id":"com.webos.app.screensaver"}' </dev/null 2>&1)"
i=0; while [ $i -lt 5 ]; do sleep 1; i=$((i+1)); echo "$(t) after close +${i}s: $(ps)"; done
echo "$(t) turnOnScreen: $(luna-send -n 1 luna://com.webos.service.tvpower/power/turnOnScreen '{}' </dev/null 2>&1)"
sleep 1; echo "$(t) final: $(ps)"
[ $had = 1 ] || rm -f $S/saver-lg
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.fullhome"}' </dev/null >/dev/null 2>&1
echo "done (our screensaver swap is back on)"
