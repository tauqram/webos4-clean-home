#!/bin/sh
# lg-saver-dump.sh - READ-ONLY: prints the QML of LG's screensaver app and of the compositor's screensaver view, to make LG's saver invisible
# (a bind-mounted copy that draws nothing) while tvpower still sees it start. LG's files are only read here: never commit their content.
# Run: ./tv.sh -s < tools/lg-saver-dump.sh > lg-saver-dump.txt
A=/usr/palm/applications/com.webos.app.screensaver
echo "=== appinfo.json"; cat $A/appinfo.json; echo
for f in qml/main.qml qml/Containers/MainView.qml qml/Containers/ScreenSaver.qml qml/Controllers/UIController.qml qml/Controllers/AppLifeCycleController.qml; do
  echo "=== $f ($(wc -l < $A/$f 2>/dev/null) lines)"; head -c 9000 $A/$f 2>/dev/null; echo
done
echo "=== /usr/lib/qt5/qml/YSM/ScreenSaver/"; ls -la /usr/lib/qt5/qml/YSM/ScreenSaver/ 2>&1
f=/usr/lib/qt5/qml/YSM/ScreenSaver/ScreenSaverView.qml; echo "=== $f ($(wc -l < $f 2>/dev/null) lines)"; head -c 12000 $f 2>/dev/null; echo
echo "=== mounts on these paths"; mount | grep -E "screensaver|ScreenSaver" || echo none
