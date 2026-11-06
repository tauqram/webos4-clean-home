#!/bin/sh
# poweroff-trace.sh - READ-ONLY: records what happens when the TV is turned off with the remote (why it takes ~10 s).
# Usage from the PC:   ./tv.sh -s < tools/poweroff-trace.sh      then press Power ONCE within 60 s, wait until the screen is black,
#                      turn the TV back on, and read the result ON THE TV with `sh poweroff-trace.sh show` (tv.sh -s drops arguments), or from the PC:
#                      ./tv.sh 'cd /media/developer/tv-debloat/state; cat /proc/uptime poweroff-trace.txt poweroff-dmesg.txt poweroff-messages.txt'
# It changes nothing: it only listens for 120 s, then stops by itself. Everything is written to flash and synced every half second, so the
# last moments before a full shutdown survive it:
#   poweroff-trace.txt      power state (subscription AND a poll every 0.5 s), app life events, processes stuck in D state, busiest processes
#   poweroff-dmesg.txt      the last 80 kernel lines, rewritten every 0.5 s (the kernel says here if suspend / freezing failed)
#   poweroff-messages.txt   a copy of /var/log/messages, rewritten every 0.5 s (it is a tiny file that rotates)
S=/media/developer/tv-debloat/state
if [ "$1" = show ]; then
  echo "=== uptime now: $(cut -d' ' -f1 /proc/uptime) s ($(date)) ==="
  cat $S/poweroff-trace.txt; echo "=== dmesg ==="; cat $S/poweroff-dmesg.txt; echo "=== messages ==="; cat $S/poweroff-messages.txt
  exit 0
fi
: > $S/poweroff-trace.txt; : > $S/poweroff-dmesg.txt; : > $S/poweroff-messages.txt
setsid sh -c '
S='"$S"'; OUT=$S/poweroff-trace.txt
t() { cut -d" " -f1 /proc/uptime; }
echo "start $(t) $(date)" >> $OUT
head -3 /proc/meminfo >> $OUT; grep -E "SwapTotal|SwapFree" /proc/meminfo >> $OUT
cat /sys/power/state >> $OUT 2>&1
luna-send -n 1 luna://com.webos.applicationManager/getForegroundAppInfo "{}" </dev/null >> $OUT 2>&1
luna-send -i luna://com.webos.service.tvpower/power/getPowerState "{\"subscribe\":true}" </dev/null 2>/dev/null | while read -r l; do echo "$(t) POWER $l" >> $OUT; done &
P1=$!
luna-send -i luna://com.webos.applicationManager/getAppLifeEvents "{\"subscribe\":true}" </dev/null 2>/dev/null | while read -r l; do echo "$(t) LIFE $l" >> $OUT; done &
P2=$!
i=0; last=""
while [ $i -lt 240 ]; do
  usleep 500000; i=$((i+1))
  ps=$(luna-send -n 1 -w 400 luna://com.webos.service.tvpower/power/getPowerState "{}" </dev/null 2>/dev/null | tr -d "\n ")
  [ "$ps" != "$last" ] && { echo "$(t) POLL $ps" >> $OUT; last=$ps; }
  dmesg 2>/dev/null | tail -n 80 > $S/poweroff-dmesg.txt.new && mv -f $S/poweroff-dmesg.txt.new $S/poweroff-dmesg.txt
  [ -f /var/log/messages ] && cp /var/log/messages $S/poweroff-messages.txt.new && mv -f $S/poweroff-messages.txt.new $S/poweroff-messages.txt
  d=$(ps 2>/dev/null | awk "\$4 ~ /^D/ {print \$1\":\"\$5}" | tr "\n" " ")
  [ -n "$d" ] && echo "$(t) DSTATE $d" >> $OUT
  [ $((i % 4)) = 0 ] && { echo "$(t) TOP" >> $OUT; top -b -n 1 2>/dev/null | sed -n "8,12p" >> $OUT; }
  sync
done
echo "end $(t)" >> $OUT
kill $P1 $P2 2>/dev/null
sync
' </dev/null >/dev/null 2>&1 &
echo "Enregistrement lance pour 120 s. Appuie UNE fois sur Power maintenant."
