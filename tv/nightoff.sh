#!/bin/sh
# nightoff.sh win | set <off|FROM-TO> | tick | wake - "full shutdown at night" (Settings -> Power & timers).
#   Between FROM and TO o'clock (e.g. 22-7) LG's Quick Start+ (option.quickStartMode) is switched OFF, so turning the TV off really powers it down;
#   outside those hours it is switched back ON, so the TV wakes in two seconds. LG reads the switch when the TV is turned off, so it only has to be right
#   at that moment: the home-on.sh watchdog runs `tick` every minute while the TV is on. Off by default (no state/nightoff.conf): nothing is touched.
#   `tick` also writes one log line per hour when it finds itself running while the TV is in standby (to learn whether our loops keep running in
#   Quick Start+ standby). `wake` (lastapp.sh, when the TV comes back from standby) and `tick` also run the catch-up below: a TV that was already in
#   quick-start standby when the night began is restarted once when it is turned on again. Nothing happens while DISABLE exists.
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
# local time: LG's system service knows the TV's time zone (the shell's date may be UTC). hm prints "HOUR MINUTE".
hm() {
  t=$(lun luna://com.palm.systemservice/time/getSystemTime '{}' | tr -d '\n' | sed -n 's/.*"localtime" *: *{\([^}]*\)}.*/\1/p')
  h=$(printf %s "$t" | sed -n 's/.*"hour" *: *\([0-9]*\).*/\1/p'); m=$(printf %s "$t" | sed -n 's/.*"minute" *: *\([0-9]*\).*/\1/p')
  [ -n "$h" ] || { h=$(date +%H); m=$(date +%M); }
  echo "$(num "$h") $(num "${m:-0}")"
}
hour() { set -- $(hm); echo "$1"; }
pstate() { lun luna://com.webos.service.tvpower/power/getPowerState '{}' | sed -n 's/.*"state" *: *"\([^"]*\)".*/\1/p'; }
qsmode() { lun luna://com.webos.settingsservice/getSystemSettings '{"category":"option","keys":["quickStartMode"]}' | sed -n 's/.*"quickStartMode" *: *"\([^"]*\)".*/\1/p'; }
# seconds cpu0 has been awake since boot (its /proc/stat counters stop while the TV sleeps; cpu0 is never unplugged): wall time minus this = time asleep
awake() { awk '$1=="cpu0"{s=0; for(i=2;i<=NF;i++) s+=$i; printf "%d\n", s/100; exit}' /proc/stat; }
# Catch-up for a TV that was ALREADY in Quick Start+ standby when the night started: LG only reads the switch at power-off, so that TV slept through the
# night in quick-start standby and would wake in two seconds with yesterday's memory. When it is turned on again, we restart it once instead, so it
# starts fresh exactly as after a real shutdown. /tmp/nightoff.seen = "epoch awake-seconds local-seconds-of-day quickstart", written every minute while the TV is on.
# We restart only if ALL hold: the TV is on now (power state Active), the last on-minute is at least 10 min old, the TV really slept or ran in standby in
# between (10 min without cpu0 time, or a standby tick was logged), quick start was ON at that last on-minute, the start of the night (FROM) lies in the
# gap, and no catch-up restart happened in the last 30 min (state/nightoff.reboot). Switch: state/nightoff-catchup-off.
catchup() {   # $1 = night window FROM-TO; returns 3 when it restarts the TV
  [ -e "$STATE/nightoff-catchup-off" ] && return 0
  [ -r /tmp/nightoff.seen ] || return 0
  [ "$(pstate)" = Active ] || return 0
  set -- "$1" $(cat /tmp/nightoff.seen); [ -n "$5" ] || return 0
  now=$(date +%s); gap=$((now - $2)); slept=$((gap - ($(awake) - $3)))
  [ "$gap" -ge 600 ] || return 0
  [ "$5" = on ] || return 0
  sb=no; [ -e /tmp/nightoff.sbseen ] && sb=yes
  [ "$slept" -ge 600 ] || [ $sb = yes ] || return 0
  nb=$(( $(num "${1%-*}") * 3600 - $4 )); [ "$nb" -gt 0 ] || nb=$((nb + 86400))
  [ "$gap" -ge "$nb" ] || return 0
  last=$(cat "$STATE/nightoff.reboot" 2>/dev/null); [ -n "$last" ] && [ $((now - last)) -lt 1800 ] && [ $((now - last)) -ge 0 ] && return 0
  echo "$now" > "$STATE/nightoff.reboot"; rm -f /tmp/nightoff.seen /tmp/nightoff.sbseen
  log "nightoff: the TV slept through the start of the night in quick-start standby (off for $((gap / 60)) min, asleep $((slept / 60)) min, standby ticks $sb): restarting it once for a fresh start"
  sync; sleep 1
  luna-send -n 1 -w 5000 luna://com.webos.service.sleep/shutdown/machineReboot '{"reason":"remoteKey"}' </dev/null >/dev/null 2>&1 || reboot
  return 3
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
  tick|wake) [ -e "$D/DISABLE" ] && exit 0
       w=$(win); [ "$w" = off ] && exit 0
       mkdir /tmp/nightoff.lock 2>/dev/null || exit 0
       trap 'rmdir /tmp/nightoff.lock 2>/dev/null' EXIT
       catchup "$w"; [ $? = 3 ] && exit 0
       set -- $(hm); h=$1; mm=$2; want=on; innight "$h" "${w%-*}" "${w#*-}" && want=off
       ps=$(pstate)
       if [ -n "$ps" ] && [ "$ps" != Active ]; then
         touch /tmp/nightoff.sbseen
         [ "$(cat /tmp/nightoff.sb 2>/dev/null)" != "$h" ] && { echo "$h" > /tmp/nightoff.sb; log "nightoff: still running at ${h}h while the TV is in '$ps'"; }
       fi
       cur=$(qsmode)
       if [ -n "$cur" ] && [ "$cur" != "$want" ]; then
         lun luna://com.webos.settingsservice/setSystemSettings "{\"category\":\"option\",\"settings\":{\"quickStartMode\":\"$want\"}}" >/dev/null
         log "nightoff: quick start $cur -> $want (${h}h, full shutdown $w)"; cur=$want
       fi
       # remember this on-minute (see catchup); only while the TV is really on
       [ "$ps" = Active ] && [ -n "$cur" ] && { echo "$(date +%s) $(awake) $((h * 3600 + mm * 60)) $cur" > /tmp/nightoff.seen.new && mv -f /tmp/nightoff.seen.new /tmp/nightoff.seen; rm -f /tmp/nightoff.sbseen; }
       ;;
esac
