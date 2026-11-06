#!/bin/sh
# saverhide.sh apply|undo|status - make LG's own screensaver app draw NOTHING (Sam: "je ne veux jamais la voir").
# Why not just block it: LG's power service (tvpower) launches it after a few idle minutes and waits until it has seen it start; when we closed it too
# early, tvpower stayed stuck and the Power key became slow (full shutdown). So the app must still start, but invisibly.
# How: its window is transparent by default; MainView.qml paints it black and loads the particle / ad view when it enters "Mode_ScreenSaver" (and a black
# mask in "Mode_PIG"). We bind-mount a copy of MainView.qml (generated here on the TV from LG's own file, never stored in our repo) in which those three
# lines keep the window transparent and load nothing. The app is read each time it starts, so no restart is needed. saver-take.sh still swaps it for
# our screensaver as before; now nobody sees it in between.
# Safety: the copy is only mounted if each of the three edits matched exactly once and the braces balance like the original; `undo` (also home-off.sh and
# revert.sh) unmounts it. A reboot without our init hook is stock.
. /media/developer/tv-debloat/common.sh
ORIG=/usr/palm/applications/com.webos.app.screensaver/qml/Containers/MainView.qml
GEN=$STATE/lgsaver/MainView.qml
mounted() { mount | grep -q " $ORIG "; }
bal() { echo $(( $(tr -cd '{' < "$1" | wc -c) - $(tr -cd '}' < "$1" | wc -c) )); }
build() {
  mkdir -p "$STATE/lgsaver"
  # inside the Mode_ScreenSaver case: window stays transparent, nothing is loaded; inside Mode_PIG: no black mask
  awk '
    /case "Mode_ScreenSaver":/ { ss = 1 }
    /case "Mode_PIG":/         { pig = 1 }
    ss && /rootWindow\.color = "black";/          { sub(/"black"/, "\"transparent\""); n1++ }
    ss && /loader\.sourceComponent = mode1;/      { sub(/mode1;/, "undefined;   // tv-debloat: draw nothing"); n2++ }
    pig && /pigMasker\.visible = true;/           { sub(/true;/, "false;   // tv-debloat: draw nothing"); n3++ }
    /break;/ { ss = 0; pig = 0 }
    { print }
    END { if (n1 != 1 || n2 != 1 || n3 != 1) { print "tv-debloat: markers " n1 "," n2 "," n3 > "/dev/stderr"; exit 3 } }
  ' "$ORIG" > "$GEN.new" || { rm -f "$GEN.new"; return 1; }
  [ "$(bal "$GEN.new")" = "$(bal "$ORIG")" ] || { rm -f "$GEN.new"; echo "braces differ"; return 1; }
  [ "$(wc -l < "$GEN.new")" = "$(wc -l < "$ORIG")" ] || { rm -f "$GEN.new"; echo "line count differs"; return 1; }
  chmod 644 "$GEN.new"; mv -f "$GEN.new" "$GEN"
}
case ${1:-status} in
  apply)
    [ -e "$D/DISABLE" ] && exit 0
    [ -e "$STATE/saverhide-off" ] && { echo "off (state/saverhide-off)"; exit 0; }
    [ -f "$ORIG" ] || { echo "no LG screensaver app here"; exit 0; }
    mounted && { echo "already active"; exit 0; }
    build || { log "saverhide: refused, LG's file does not look as expected"; echo "refused"; exit 1; }
    mount --bind "$GEN" "$ORIG" && log "saverhide: LG's screensaver now draws nothing" && echo active;;
  undo)
    mounted && { umount "$ORIG" 2>/dev/null || umount -l "$ORIG"; log "saverhide: LG's screensaver restored"; }
    echo off;;
  status) mounted && echo active || echo off;;
  build) build && diff "$ORIG" "$GEN";;   # prints the three changed lines, mounts nothing
esac
