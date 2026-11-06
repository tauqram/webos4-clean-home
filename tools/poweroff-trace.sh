#!/bin/sh
# poweroff-trace.sh - READ-ONLY: records what happens when the TV is turned off with the remote (why it takes ~10 s).
# Usage from the PC:   ./tv.sh -s < tools/poweroff-trace.sh      then press Power ONCE within 60 s, wait until the screen is black,
#                      turn the TV back on, and read the result:  ./tv.sh 'cat /media/developer/tv-debloat/state/poweroff-trace.txt'
# It changes nothing: it only listens (system log, power state, app events, process list) for 90 s, then stops by itself.
OUT=/media/developer/tv-debloat/state/poweroff-trace.txt
: > $OUT
setsid sh -c '
OUT='"$OUT"'
t() { cut -d" " -f1 /proc/uptime; }
echo "start $(t) $(date)" >> $OUT
cat /proc/meminfo | head -3 >> $OUT; grep -E "SwapTotal|SwapFree" /proc/meminfo >> $OUT
luna-send -n 1 luna://com.webos.applicationManager/getForegroundAppInfo "{}" </dev/null >> $OUT 2>&1
luna-send -i luna://com.webos.service.tvpower/power/getPowerState "{\"subscribe\":true}" </dev/null 2>/dev/null | while read -r l; do echo "$(t) POWER $l" >> $OUT; done &
P1=$!
luna-send -i luna://com.webos.applicationManager/getAppLifeEvents "{\"subscribe\":true}" </dev/null 2>/dev/null | while read -r l; do echo "$(t) LIFE $l" >> $OUT; done &
P2=$!
tail -n 0 -F /var/log/messages 2>/dev/null | while read -r l; do echo "$(t) LOG $l" >> $OUT; done &
P3=$!
tail -n 0 -F /media/developer/tv-debloat/state/tv-debloat.log 2>/dev/null | while read -r l; do echo "$(t) OURS $l" >> $OUT; done &
P4=$!
i=0
while [ $i -lt 180 ]; do
  usleep 500000; i=$((i+1))
  # every 2 s: the 6 busiest processes (to see who is working while the TV shuts down)
  [ $((i % 4)) = 0 ] && { echo "$(t) TOP" >> $OUT; top -b -n 1 2>/dev/null | sed -n "5,11p" >> $OUT; sync; }
done
echo "end $(t)" >> $OUT
for p in $P1 $P2 $P3 $P4; do kill $p 2>/dev/null; done
sync
' </dev/null >/dev/null 2>&1 &
echo "Enregistrement lance pour 90 s. Appuie UNE fois sur Power maintenant."
