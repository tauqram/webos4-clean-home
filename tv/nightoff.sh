#!/bin/sh
# nightoff.sh win | set <off|FROM-TO> | tick - "full shutdown at night" (Settings -> Power & timers).
#   Between FROM and TO o'clock (e.g. 22-7) LG's Quick Start+ (option.quickStartMode) is switched OFF, so turning the TV off really powers it down;
#   outside those hours it is switched back ON, so the TV wakes in two seconds. LG reads the switch when the TV is turned off, so it only has to be right
#   at that moment: the home-on.sh watchdog runs `tick` every minute while the TV is on. Off by default (no state/nightoff.conf): nothing is touched.
#   `tick` also writes one log line per hour when it finds itself running while the TV is in standby (to learn whether our loops keep running in
#   Quick Start+ standby; if they do, a TV left in standby at FROM could later be powered down for real). Nothing happens while DISABLE exists.
. /media/developer/tv-debloat/common.sh
CONF=$STATE/nightoff.conf
num() { v=$(printf %s "$1" | sed 's/^0*//'); echo "${v:-0}"; }
win() {
  w=$(cat "$CONF" 2>/dev/null)
  case $w in
    [0-9]-[0-9]|[0-9]-[0-9][0-9]|[0-9][0-9]-[0-9]|[0-9][0-9]-[0-9][0-9])
      f=$(num "${w%-*}"); t=$(num "${w#*-}")
      [ "$f" -le 23 ] && [ "$t" -le 23 ] && [ "$f" != "$t" ] && { echo "$f-$t"; return; };;
  esac
  echo off
}
# local hour: LG's system service knows the TV's time zone (the shell's date may be UTC)
hour() {
  h=$(lun luna://com.palm.systemservice/time/getSystemTime '{}' | tr -d '\n' | sed -n 's/.*"localtime" *: *{[^}]*"hour" *: *\([0-9]*\).*/\1/p')
  [ -n "$h" ] || h=$(date +%H)
  num "$h"
}
innight() {   # $1 = hour, $2 = FROM, $3 = TO
  if [ "$2" -lt "$3" ]; then [ "$1" -ge "$2" ] && [ "$1" -lt "$3" ]
  else [ "$1" -ge "$2" ] || [ "$1" -lt "$3" ]; fi
}
case ${1:-win} in
  win) win;;
  set) case $2 in
         off) rm -f "$CONF"; log "nightoff: off"; echo '{"night":"off"}';;
         *-*) printf %s "$2" > "$CONF.new" && mv -f "$CONF.new" "$CONF"
              w=$(win); if [ "$w" = off ]; then rm -f "$CONF"; echo '{"error":"bad hours"}'; exit 1; fi
              echo "$w" > "$CONF"; log "nightoff: full shutdown from $w"; sh "$0" tick; printf '{"night":"%s"}' "$w";;
         *) echo '{"error":"bad hours"}'; exit 1;;
       esac;;
  tick) [ -e "$D/DISABLE" ] && exit 0
       w=$(win); [ "$w" = off ] && exit 0
       h=$(hour); want=on; innight "$h" "${w%-*}" "${w#*-}" && want=off
       ps=$(lun luna://com.webos.service.tvpower/power/getPowerState '{}' | sed -n 's/.*"state" *: *"\([^"]*\)".*/\1/p')
       if [ -n "$ps" ] && [ "$ps" != Active ] && [ "$(cat /tmp/nightoff.sb 2>/dev/null)" != "$h" ]; then
         echo "$h" > /tmp/nightoff.sb; log "nightoff: still running at ${h}h while the TV is in '$ps'"
       fi
       cur=$(lun luna://com.webos.settingsservice/getSystemSettings '{"category":"option","keys":["quickStartMode"]}' | sed -n 's/.*"quickStartMode" *: *"\([^"]*\)".*/\1/p')
       [ -n "$cur" ] || exit 0
       [ "$cur" = "$want" ] && exit 0
       lun luna://com.webos.settingsservice/setSystemSettings "{\"category\":\"option\",\"settings\":{\"quickStartMode\":\"$want\"}}" >/dev/null
       log "nightoff: quick start $cur -> $want (${h}h, full shutdown $w)";;
esac
