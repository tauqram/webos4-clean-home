#!/bin/sh
# saver-power-info.sh - READ-ONLY: how LG's screensaver app talks to the power service (tvpower).
# Why: on the C9 the power state stays "Active / processing: Screen Saver Ready" after our saver-take.sh closed LG's screensaver, and from then on
# the Power key takes ~10 s and ends in a full shutdown even with Quick Start+ on. We need the call LG's saver makes when it ends, to make it ourselves.
# Run: ./tv.sh -s < tools/saver-power-info.sh > saver-power-info.txt
echo "=== uptime $(cut -d' ' -f1 /proc/uptime)"
echo "=== power state now"
luna-send -n 1 luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null
echo; echo "=== quickStartMode"
luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{"category":"option","keys":["quickStartMode"]}' </dev/null
echo; echo "=== screensaver settings"
luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{"category":"general","keys":["screenSaverEnabled","noSignalScreenSaver","screenSaverTime"]}' </dev/null
echo; echo "=== tvpowerd binary"
B=$(ls /usr/sbin/tvpowerd /usr/bin/tvpowerd 2>/dev/null | head -1); echo "$B"
[ -n "$B" ] && strings "$B" | grep -i -E "saver|ScreenSaver" | sort -u | head -80
echo "=== screensaver app folder"
A=/usr/palm/applications/com.webos.app.screensaver
ls -R "$A" 2>/dev/null | head -60
echo "=== tvpower calls in the screensaver app (qml/js only)"
for f in $(find "$A" -name '*.qml' -o -name '*.js' 2>/dev/null | head -80); do
  grep -n -i -E "tvpower|power/|ScreenSaver(Ready|Response|Off|On)|activeScreenSaver|closeScreenSaver" "$f" 2>/dev/null | sed "s#^#${f#$A/}: #" | head -20
done
echo "=== tvpower calls in the compositor's screensaver view"
for f in /usr/lib/qt5/qml/YSM/ScreenSaver/*.qml /usr/lib/qt5/qml/YSM/ScreenSaver/*.js; do
  [ -f "$f" ] && grep -n -i -E "tvpower|power/|lunaCall|ScreenSaver(Ready|Response)" "$f" | sed "s#^#$(basename "$f"): #" | head -20
done
echo "=== recent saver / power lines in our log"
grep -E "saver-take|power " /media/developer/tv-debloat/state/tv-debloat.log | tail -10
