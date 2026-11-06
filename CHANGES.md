# CHANGES.md - everything done to the TV (10.0.0.63) and how to undo it

Quick undo, in order of preference:

1. **`./revert.sh`** from this folder (or `ssh root@10.0.0.63 sh /media/developer/tv-debloat/revert.sh`).
   Puts LG's Home back, undoes every debloat item, renames the init hook, creates the `DISABLE` flag, reboots.
   `--no-reboot` skips the reboot. Works the same over Telnet (`telnet 10.0.0.63`, no password).
2. **Delete/rename one file and reboot:** `/var/lib/webosbrew/init.d/zz-debloat`
   (or `touch /media/developer/tv-debloat/DISABLE` - boot then does nothing).
3. **Automatic:** the launcher hands Home back to LG's if it has not reported ready within 30 s of being started, or if its
   local API is dead for 60 s. Four unfinished boots in a row create `DISABLE` by themselves.
4. LG factory reset (last resort; also removes root).

`revert.sh` was tested as a no-op before the first real change: system state (hosts, mounts, Upstart jobs, LG prefs, init.d,
processes) was byte-identical before and after (`results/snap-*-revert-test.txt`).

## What is installed on the TV

| What | Where | Undo |
|---|---|---|
| SSH public key of this PC | `/home/root/.ssh/authorized_keys` (+ dir, mode 700/600) | delete the file, reboot (Homebrew then restores the `alpine` password) |
| All our scripts, the launcher page, photos, backups, logs | `/media/developer/tv-debloat/` | `revert.sh` leaves them (inert); `rm -r` them if you want them gone |
| Boot hook (the ONE init script) | `/var/lib/webosbrew/init.d/zz-debloat` | `revert.sh` renames it to `zz-debloat.disabled` |
| Backups of files a change could touch | `/media/developer/tv-debloat/backup/` (`general`, `option`, `hosts`, 3 Upstart confs) | - |

`/media/developer/tv-debloat/` layout: `boot.sh` (started by the hook), `debloat.sh`, `home-on.sh`, `home-off.sh`,
`home-standin.sh`, `api.sh`, `common.sh`, `revert.sh`, `launcher/` (index.html, appinfo.json, photos/), `state/` (log, flags), flags
`DISABLE` (everything off) and `DEBUG` (launcher page inspectable via DevTools - remove the file to close that).

## Runtime changes (RAM only - a reboot without the init hook removes all of them)

| # | Change | Command (run by `debloat.sh apply <item>` / `home-on.sh`) | Undo (`debloat.sh undo <item>` / `home-off.sh`) |
|---|---|---|---|
| 2 | Ad servers blocked in the RAM hosts file | `echo "127.0.0.1 us.ad.lgsmartad.com us.info.lgsmartad.com nl.ad.lgsmartad.com nl.info.lgsmartad.com eic.ads.lgtvcommon.com media.bidr.io # tv-debloat" >> /etc/hosts` (+ `::1` line) | remove lines containing `# tv-debloat` |
| 3 | `remotelogger` stopped | `initctl stop remotelogger` | `initctl start remotelogger` |
| 4 | `nudge` stopped | `initctl stop nudge` | `initctl start nudge` |
| 5 | `contentminer` stopped | `initctl stop contentminer` | `initctl start contentminer` |
| 7 | `admanager` replaced by a do-nothing stub | `mount --bind /media/developer/tv-debloat/stub-noop /usr/sbin/admanager`, kill running copy | `umount /usr/sbin/admanager` |
| 1 | LG's own toggles (persisted by LG's settings service) | `luna-send .../com.webos.settingsservice/setSystemSettings {"category":"general","settings":{"homePromotion":"off","aiNudge":"off","adCookie":"off","personalRecommend":{"changedByUser":true,"value":"off"}}}` | same call with the originals: `homePromotion on, aiNudge on, adCookie on, personalRecommend {changedByUser:false,value:on}` |
| L | LG's screensaver off while the launcher is Home (ours replaces it) | `setSystemSettings {"category":"general","settings":{"screenSaverEnabled":"off"}}` | `screenSaverEnabled: "on"` (done by `home-off.sh`) |
| H | LG's Home replaced by the launcher | `mount --bind home-standin.sh /usr/bin/com.webos.app.fullhome`; kill LG's Home once; SAM starts the stand-in, which asks the web app manager to open `launcher/` as `com.webos.app.fullhome` (`luna://com.palm.webappmanager/launchApp`) | kill stand-in, `umount /usr/bin/com.webos.app.fullhome`, `killApp`, relaunch LG Home |
| A | Local API for the launcher **and the phone page** | `tcpsvd -c 6 0.0.0.0 8765 timeout -t 120 sh api.sh`. Loopback: apps list, launch by id, network status, LG settings get/set (whitelisted categories), settings/photos/delete, ready/log pings. **LAN: only the phone page and photo/settings routes, only with the secret token** (see README, security model) | kill `tcpsvd` |

Not touched (as agreed): Homebrew Channel, "block system updates", SSH/Telnet settings, networking, inputs, Settings, the remote,
`acr2` (Live Plus was already off), `rdxd`/`uploadd`/`crashreportd` (Homebrew already neuters them), voice, AirPlay, casting.

## Experiments that were cleaned up
- Test web app `com.tristan.hometest` (WAM-launched, folders under `/media/developer/tv-debloat/launcher-test` and
  `/media/developer/apps/usr/palm/applications/com.tristan.hometest`) - both folders removed, app killed.
- A throwaway Python log receiver in `/tmp` (removed).
- Benchmarks and health checks opened and closed Settings, YouTube, Netflix and HDMI 1 several times.

## Read-only things that were run
`tv-inspect.sh`, `tv-inspect-2.sh`, process/mount/log inspection, `listLaunchPoints`, `running`, `getForegroundAppInfo`,
`getSystemSettings`; DNS lookups of the ad hostnames against the TV's resolver.

## Chronology of the real changes
1. Generated `~/.ssh/id_ed25519` on the PC; installed the public key on the TV (one password login with Homebrew's default).
2. Deployed scripts to `/media/developer/tv-debloat/`; saved backups; **tested `revert.sh` as a no-op**.
3. Applied, one at a time, each followed by the health check (`tools/check.sh`: Settings, Home, Netflix, HDMI 1 all open): hosts → remotelogger → nudge → contentminer → admanager stub → LG toggles. All passed.
4. Home takeover test (runtime), cold-start test, Inputs panel, screensaver, Home-key relaunch.
5. Installed `zz-debloat`; rebooted; verified everything came back unattended (launcher ready 57 s after boot start).

## Added in round 2 (gallery, phone page, new Settings, more services)

| What | Where / command | Undo |
|---|---|---|
| Voice stack stopped (remote mic button, voice search) | `initctl stop voiceinput voiceconductor`; stub bind-mount over `/usr/sbin/nlpmanager` (`debloat.sh apply voice`) | `debloat.sh undo voice` |
| ThinQ / IoT and HomeKit helpers stopped | stub bind-mounts over `/usr/sbin/iot-client`, `ocf-onboarding`, `homekit`; kill `ocf_memcheck.sh` (`debloat.sh apply iot`) | `debloat.sh undo iot` |
| Tips app closed (LG keeps it resident) | `closeByAppId` + WAM `killApp` on `com.webos.app.tips` (`debloat.sh apply idleapps`); it starts again if opened | nothing to undo |
| Launcher settings (weather location/ZIP, units, screensaver, background, clock) | `/media/developer/tv-debloat/state/settings.json`, written by the launcher or the phone page | delete the file |
| Photo gallery | `/media/developer/tv-debloat/launcher/photos/` (+ `thumbs/`): your photos, resized on the PC or cropped on the phone | delete the folder contents |
| Phone link token | `state/token` (96-bit random) | *Settings -> Photo gallery -> Reset phone link* or delete the file (a new one is created) |
| LG settings written **only when you change them in our Settings screen** | picture (mode, backlight, contrast, brightness, color, sharpness, energy saving), sound (mode, Clear Voice, auto volume, virtual surround), power (Quick Start, Home on power-on, standby light, logo light, no-signal auto-off) via `com.webos.settingsservice/setSystemSettings` | change them back in our screen or LG's Settings; values are never changed by the install itself |

Tried and **dropped** (no measurable benefit): `sysctl vm.swappiness=30` (reverted to 100); killing the Google Assistant web app (LG's preload manager relaunches it every ~20 s).
Not touched on purpose: AirPlay, casting, the on-screen keyboard (`MaliitServer`), `inputcommon` (the Input key), LG's CRIU app preloading.

Verified for this round: full `revert.sh --no-reboot` returned hosts, mounts, Upstart jobs, LG toggles and init.d to the stock snapshot; reboot with the init hook re-applied everything
unattended (launcher ready 60 s after boot start); `tools/check.sh`, the 30 s ready-timeout fallback, the crash-loop guard and the API self-heal all passed (`results/safety-test-2.txt`).

## Added in round 3 (2026-10-26: speed, services switches, ad lists, our Settings on the remote, photo framing)

| What | Where / command | Undo |
|---|---|---|
| Launcher code runs from RAM | `/tmp/tv-launcher` (copy made by `home-on.sh`; photos bind-mounted in); WAM loads that folder, flash copy is the fallback | `home-off.sh` / reboot (tmpfs); `revert.sh` removes it |
| LG app pre-loading trimmed | `preloadmanager/setPreloadPolicy` isEnabled false for Assistant, Browser, Tips, Vudu, Amazon, Pooq (originals in `state/preload.orig`) | `debloat.sh undo preload` or reboot |
| Idle LG apps closed | Tips / Assistant / Browser killed when resident (`debloat.sh apply idleapps`) | none needed (start on demand) |
| LG updates blocked and locked | `support.automaticUpdate=off`, `option.appUpdateMode=manual`, hosts `snu.lge.com snu-dev.lge.com su.lge.com su-dev.lge.com su-ssl.lge.com nsu.lge.com` (`# tvd-update`), `initctl stop update`; re-checked every 5 min | `debloat.sh undo updates` (revert.sh does it); Homebrew's own hosts block stays |
| Services catalog with switches | `services.tsv`, `state/svc.conf`; Settings -> Services & privacy; `epg` (TV guide downloader) available, off by default | switch off in Settings, or `debloat.sh undo <item>` |
| Pi-hole style ad blocking | `blocklist.sh`: hosts block between `# tv-debloat begin/end` (about 4,400 names by default, cap 9,000), lists in `blocklists/`, downloads in `state/lists/`, your lists `state/block-custom.txt` / `block-allow.txt`; remote lists refresh weekly | `blocklist.sh remove` (also `debloat.sh undo hosts`) |
| Remote Settings key opens our Settings | `settings-hook.sh` (log watcher, started by `home-on.sh`), `settings-open.sh` (overlay page `tv.debloat.settings`) | `settings-hook.sh stop`, or Settings -> Remote -> "Settings button opens: LG's quick panel" (`state/gear-lg`) |
| LG Settings values written from our screens, now with correct value sets | Picture, Sound, Power & timers, Inputs, Accessibility, Network, Remote pages (about 90 keys, all re-tested with `tools/lg-settings-test.sh`: 91 accepted) | change back in our screen |
| Photo framing (x, y, zoom, edge colours) | `state/crops/NAME.json`, edited on the TV or the phone page; photos stored whole | Settings -> Photo -> Adjust framing -> Reset to automatic |

Bug fixes: Clear Voice sent `on` (valid: `off/level1/level2/level3`), Sound mode offered invalid `cinema/clearVoice`, LG logo light sent `on` (valid: `off/low/medium/high`). During the tests Clear Voice was set to level 2 once and put back to Off.
Quick Start was already on (`option.quickStartMode`), left on; it is a normal power state and does not conflict with the init hook (nothing re-runs on wake; RAM-only changes stay).
Tried and dropped: hiding the Magic Remote pointer through `com.webos.service.mrcu/activateMotionSensor {"activate":false}`: the TV accepts it, the arrow still appears (tested with the owner's remote). Not offered in the UI.
A mistake worth remembering: full-size photos (3.6 MP) made the Home page grow to 152 MB and the TV swap until SSH timed out; stored photos are now capped to 2.6 MP and Home frees its background during the screensaver.
Measured (`tools/bench-quick.sh`, 3 reps, `results/before-r3.txt` vs `after-r3.txt`): YouTube cold open median 2512 -> 1284 ms; Netflix 1498 -> 1679 ms (noise); Home 1232 -> 1214 ms; RAM available and swap about the same. The RAM copy gives no measurable Home start gain (flash was already in page cache); the pre-loading trim helps app launches.
`tools/safety-test.sh` (results/safety-test-3.txt): API watchdog and crash-loop guard pass; test A now ends at the "no launcher files" early exit. `tools/check.sh`: ALL CHECKS PASSED (includes our Settings overlay).

## Added in round 4 (2026-10-26: Back on Home, pointer switch)

| What | Where / command | Undo |
|---|---|---|
| Back on Home returns to the last app / input | `lastapp.sh` (subscribes to SAM `getForegroundAppInfo`, keeps the newest non-Home app in `/tmp/lastapp`), `api.sh /api/back`, `goBack()` in `app.js` (keys 461 / Esc / Backspace on Home when nothing is open). Started by `home-on.sh` and the 5-min sweep | `lastapp.sh stop` (also done by `home-off.sh` / `revert.sh`); RAM only |
| Back from an app returns to the previous app (Home if none) | `backchain.sh` + `keywatch.py` (read-only reader of the remote's evdev devices, reports KEY_BACK), history in `/tmp/appstack` kept by `lastapp.sh` (closed apps skipped). After Back, if the app quit and Home is in front 2 s later, the previous entry is launched. Switch: Settings -> Remote & pointer, flag `state/backchain-off`, `/api/backchain` | switch off in Settings, or `backchain.sh stop` (also `home-off.sh` / `revert.sh`); RAM only |
| Experimental pointer switch (Settings -> Remote & pointer -> "Pointer only when I shake the remote") | `pointer.sh off|on`: `mrcu/cursor/setWakeUpCondition {"condition":"shake"}` + `activateMotionSensor {"activate":false}`, re-applied by a 10 s watcher whenever the remote reconnects; flag `state/pointer-off`; `/api/pointer` | switch it off in Settings, or `sh pointer.sh on`; `revert.sh` runs it; a TV restart also resets it |

Verified: foreground tracking (hdmi2 -> Home -> `/api/back` returned to hdmi2), injected Back key (461) on the real Home page returned to hdmi2, `pointer.sh off/on` round trip with the remote asleep (flag + watcher start/stop), `tools/check.sh`: ALL CHECKS PASSED.
**Not verified:** whether the shake setting actually stops the arrow showing (the remote was asleep, so the TV could not accept the request during testing), and the physical remote's Back key (only an injected 461 was tested).

Back chain verified with injected Back key events written to the IR remote's evdev device (`/dev/input/event1`, 16-byte input_event, KEY_BACK=158): app quits to Home -> previous app opens; app keeps the key -> nothing; nothing before it -> stays on Home; switch off -> Home. Pointer switch was turned ON at the owner's request (2026-10-26); applies when the remote wakes. Physical remote not tested by the agent.

## Round 5 (2026-10-26): Settings key speed, icon rail Settings, quick-settings parity, screensaver dimming, pointer parking

| What | Where / command | Undo |
|---|---|---|
| Settings key handled earlier and LG's panel closed with the call that works | `settings-hook.sh` now starts on lginput2's `NL_BUTTON_CLICK KEY_SETTINGS` log line (about 0.5 s before LG's panel is drawn), opens our overlay at once (`settings-open.sh launch`, no "is it open" round trips; `/tmp/set-vis` tracks our overlay from its visible/hidden log events, `/tmp/gear-claim` marks the press) and closes LG's panel with `luna://com.webos.service.systemUIManager/closeByAppId {"appId":"com.webos.app.quicksettings"}`. The old call (`com.webos.surfacemanager/closeByAppId`) answers "This API is not supported", so LG's panel used to stay until our overlay took focus | `settings-hook.sh stop`, or Settings -> Remote -> Settings button opens LG's panel |
| Settings = icon rail | `index.html` (`#settings` is a 10 rem rail, `.open` unfolds the pane), `app.js` (`paneOpen`, `openPane`, `paneSet`, keys: OK/Right unfold, Back folds, Back on the folded rail closes). Mouse hover/click on rail icons and rows | revert the commit |
| "Quick settings" category (first icon) | Same shortcuts as LG's quick panel (read from its QML, `/usr/lib/qt5/qml/QuickSettings/QuickSettings.qml`): picture mode, aspect ratio, sound mode, sound out, sleep timer, network, all settings | - |
| Screensaver dimming | `saver.dim` (0-80 %, default 45), a black layer (`#sdim`) under the clock; Settings -> Home & Screensaver. It dims the picture, not the TV backlight | set it to 0 |
| Pointer parked | `pointer.sh` also calls `mrcu/cursor/setPosition 1919,1079` (arrow cut off in the corner); the scroll wheel wakes the arrow where it last was. UNVERIFIED (remote asleep during tests) | `pointer.sh on` |

Facts: LG's quick panel is not a process; it lives in surface-manager (QML), preloaded at boot by `/usr/lib/qt5/qml/KeyFilters/appLaunch.js`, which launches it through `systemUIManager /launch` on `Key_webOS_Settings`; a QML replacement would need a surface-manager restart (not done on purpose). `getForegroundAppInfo` does not list overlays. Load average on the dev TV is about 30 (swap), which adds about 1 s of latency to every luna call.

## Round 5b (2026-10-26): app updates, system updates locked harder

| What | Where / command | Undo |
|---|---|---|
| Apps update themselves (no "update this app?" prompt) | `appupdate.sh`: sets `option.appUpdateMode=auto` (LG's own auto-update; our old `updates` item forced `manual`), lists installed apps + waiting updates (`com.webos.appUpdateService/statusAll`), "check now" = an activity-manager activity whose callback is `appUpdateService/check` (that method answers only to activitymanager). `home-on.sh` asks 3 min after start and every 6 h; Settings -> **App updates** (toggle, check now, installed apps with versions); API `/api/appupdates[/mode|/check]` | Settings -> App updates -> off, or `sh appupdate.sh mode manual` (remembered in `state/appupdate-manual`) |
| System (firmware) updates: fifth layer | `debloat.sh updates` now also bind-mounts a do-nothing stub over `/usr/sbin/update` (the `com.webos.service.update` program), so nothing can start it; status shows `BLOCKED (4/4)`; the API already refuses `automaticUpdate`/`appUpdateMode`/`softwareUpdate` keys; the 5-min sweep re-applies all of it | `debloat.sh undo updates` (revert.sh does it) |

Verified: mode switch, check request accepted, API routes, stub mounted, `tools/check.sh` ALL CHECKS PASSED. NOT verified: that an update actually installs. On the dev TV two apps (Peacock 6.4.202, Prime Video 4.5.25) stay in `statusAll` with status `Y` and unchanged versions 90 s after a check in auto mode, with and without our hosts block, so either those are not real updates (the meaning of `Y` is unknown) or the store does not deliver to this TV. Facts: all 13 user apps carry `checkUpdateOnLaunch:true` (the source of the prompt); `appUpdateService/check` needs `$activity.activityId`; `luna-send -a` cannot fake the caller id.

## Round 6 (2026-10-26): portability, rootless pack, audit, README

| What | Where / command | Undo |
|---|---|---|
| TV address in one git-ignored file | `tv.conf` (`TV_IP`, `TV_USER`), read by `tv-env.sh`; `tv.sh`, `revert.sh`, `tools/deploy.sh`, `tools/cdp.js`, `tools/preview.js` no longer hard-code an address | PC-side only |
| Guided installer + read-only compatibility report | `install.sh <ip> [--check] [--yes]`, `tools/diagnose.sh` | PC-side; each install stage prints its own undo |
| Rootless pack | `rootless/README.md`, `tools/export-blocklist.js` (dist/ lists for Pi-hole/AdGuard/hosts), `tools/make-ipk.js` + `tv/launcher/rootless.js` (experimental dev-mode app; one hook line in `xhr()` in `app.js`, inactive on the rooted TV) | PC-side only |
| LG's unused stock Home no longer pre-loaded | `debloat.sh` `PRELOAD_OFF` + `com.webos.app.home` (runtime preload policy; original flag saved in `state/preload.orig`) | `debloat.sh undo preload` |
| Key test without the remote | `tools/keys-test.sh` (injects evdev KEY_BACK and the KEY_SETTINGS log line): 7/7 passed | - |
| Audit and README | `docs/AUDIT.md` (measurements, findings, 17-item backlog), `README.md` (summary, pictures, features, performance, install), `docs/images/` (10 pictures made with `PV_PUBLIC=1`, each looked at before committing) | - |
| Agent rules | `AGENTS.md` / `CLAUDE.md`: commit incrementally with a detailed log, push once at the end of a task | - |

TV-side runtime effect of this round: only the preload policy for `com.webos.app.home`. `tools/check.sh`: ALL CHECKS PASSED after it.

## Round 7 (2026-10-26): real backlight dimming in the screensaver

| What | Where / command | Undo |
|---|---|---|
| Screensaver lowers the TV's REAL backlight | `tv/backlight.sh dim <pct>|hold|restore|sweep|status`: sets `picture.backlight` (percent of its value, floor 5) for the picture context active when the screensaver starts (Home = input "default"), remembers value + context in `state/backlight.orig` / `.dim`. Settings -> Home & Screensaver -> **Screensaver backlight** (default 50 %, 100 = off) and **Screensaver dimming** (software layer, default now 30 %). API `/api/backlight` | set the slider to 100; `sh backlight.sh restore` |
| Five independent ways back to full backlight | page on wake (`blRestore`), `lastapp.sh` when anything but Home comes to the front, `boot.sh` at boot, the watchdog sweep (marker `/tmp/saver-on` older than 3 min), `home-off.sh`/`revert.sh` | - |

Verified on the TV: dim 100 -> 40 -> restore; sweep restores when the marker is gone and leaves a fresh dim alone; floor (1 % -> 10 % of 100); switching to HDMI 2 restores Home's own context (LG keeps backlight per input: the first version restored into the wrong context, fixed by storing the dimension). Note: the dim is NOT visible to me; whether it looks right is for you to judge.

## Round 7b: app updates in the background, controlled from Settings

| What | Where / command | Undo |
|---|---|---|
| Quiet background check on start and then every N hours | `appupdate.sh due` (cheap, no luna call) asked by the launcher watchdog every 20 s: once per boot 30 s after the launcher is ready (`startup=on`), then every `every` hours (default 6, 0 = never); manual mode never checks. Settings -> App updates: **Update apps automatically**, **Check when the TV starts**, **Then check every**, **Check for app updates now**. State `state/appupdate.conf`, API `/api/appupdates/conf?k=startup|every&v=` | Settings, or edit `state/appupdate.conf` |

Verified: conf get/set through the API, `due` for boot-like, just-checked, 4 h-ago/3 h and 6 h cases. The list label changed from "Updates waiting" to "Flagged by LG": Peacock and Prime Video have been flagged (`status:"Y"`) for over four hours with unchanged versions, so that list is not proof that an update exists.

## Round 7c: LG's quick panel switched off inside the compositor, pointer attempts, wheel and click support

| What | Where / command | Undo |
|---|---|---|
| LG's quick panel never opens; scroll-wheel pointer key and mouse events switched off (best effort) | `tv/qspatch.sh` (services item `qspatch`, default on, group "Remote & Settings"): patched copies of `/usr/lib/qt5/qml/KeyFilters/appLaunch.js` (`openSettings` returns at once) and `systemUi.js` (`compositor.mouseEventEnabled=false` in `init()`, `Key_webOS_CursorShow` swallowed in three handlers, all try/catch) generated on the TV from its own files into `/tmp/keyfilters-patched`, bind-mounted, `initctl restart surface-manager` (about 10 s black), health check, automatic rollback, 180 s reboot watchdog, `state/qspatch.trying` boot guard | Settings -> Services & privacy switch, `sh qspatch.sh undo`, `./revert.sh`, or a reboot (stock) |
| Pointer: wheel scrolls, hover and click everywhere | `app.js`: `wheel` -> same handler as Up/Down; hover/click on pop-up lists, number pad, QR page, Settings rail/rows, Home tiles | - |

Verified: apply, undo and re-apply through the Settings API (each about 10 s, UI healthy), `tools/check.sh` and `tools/keys-test.sh` pass with the patch active; the build prints exactly the intended diff. NOT verified: that the real gear key shows only our panel, and that the wheel no longer shows the arrow (the agent cannot press the key or see the screen). An injected wheel/move/click test reached the Home page neither with nor without the patch, so it proves nothing.

## Round 8: snappiness and memory (everything measured on the dev TV, raw output in `results/r8-*.txt`)

### 8a: swap less (`vmtune`)

| What | Where / command | Undo |
|---|---|---|
| `vm.swappiness` 100 -> 20 (LG's swap `eswap` is a dm-linear device: the first 600 MB are **zram = compressed RAM**, only the last ~100 MB are eMMC; the first version of this note wrongly claimed 3.7 GB had been written to flash) | `debloat.sh` item `vmtune` (services.tsv, group "Memory & speed", default on), value in `VM_SWAPPINESS`, original kept in `state/vm.orig`, re-applied by the sweep; `/proc/sys` only | Settings -> Services & privacy switch, `sh debloat.sh undo vmtune`, `./revert.sh`, or a reboot (stock) |

Measured with the same cycle (YouTube, Netflix, HDMI 2, Home; `results/r8-swappiness.txt`): swap-ins 6972 / 5347 / 4025, swap-outs 20192 / 12647 / 12538, major faults 7490 / 5705 / 4387 at swappiness 100 / 40 / 15. Fewer flash writes and fewer stalls; the Settings-key latency itself did not change (see 8b). Verified: apply, undo, re-apply, `tools/check.sh` passes. Value 20 chosen as a middle between the measured 40 and 15; not measured on its own.

### 8b: the Settings key opens Settings from inside the compositor

Where the time went (`tools/settings-latency.sh`, key-to-visible 1.2-2.3 s idle, 2.8 s when the TV was short of RAM): the launch itself is only 80-100 ms; the Settings hook saw the key **0.6-0.9 s late** because BusyBox `tail -F` polls the log once a second; then the page needs about 1.05 s (about 450 ms of that is WebAppMgr creating the page before our HTML arrives, 65 ms is our JavaScript).

| What | Where / command | Undo |
|---|---|---|
| `qspatch` now patches two of LG's compositor scripts with our own snippets (`tv/qs/*.js`, inserted by awk on the TV, LG's code is not in the repo): `appLaunch.js` `openSettings()` calls WebAppMgr `launchApp` itself through `lunaCall` (key to launch 90 ms, measured); a second press launches the running page again, WebAppMgr sends it `webOSRelaunch` and the page closes itself; LG's quick panel pre-load at compositor start is removed (never shown); `systemUi.js` reports in | `tv/qspatch.sh`, `tv/qs/`, `app.js` (SETMODE: `webOSRelaunch`), `api.sh` (`/api/qs`, `/api/qsdump`, `/api/settings/launch`) | `sh qspatch.sh undo`, Services switch, `./revert.sh`, reboot (stock) |
| The shell hook is now only the fallback: when the compositor did not "claim" the key within 2 s the hook opens / closes Settings as before | `settings-hook.sh` | - |
| `qspatch.sh` safety: it only reports success when each patched script has run (`/api/qs?e=loaded`), otherwise it rolls back (this saved us once: a typo in a snippet was rolled back automatically); a build is applied at boot only if the very same build already ran on this TV (`state/qspatch.verified`); a failed rollback keeps `qspatch.trying` so the next boot backs off | `qspatch.sh` | - |
| Settings page starts without the 57 KB QR library (loaded when the QR page opens) | `index.html`, `app.js` `withQr()` | - |

Bugs found and fixed on the way: **boot-time apply never worked**: `debloat.sh apply` (which includes qspatch) runs before `home-on.sh`, but `qspatch` waited for the launcher to report ready, so it always rolled back, and after a failed rollback it rebooted without leaving its "tried" mark, which made a boot loop (it ran 3 boots until I stopped it by hand; the crash-loop guard would have ended it at the 4th with `DISABLE`). Boot mode no longer waits for the launcher. The `compositor` object does **not** exist in `systemUi.js` (ReferenceError): the Round 7c pointer lines in that script never did anything; only the "swallow CursorShow" return value ran.

Pointer, tested properly this time (a probe inside the QML file `StarfishKeyFilter.qml`): `compositor.cursorVisible` is **read-only** ("Cannot assign to read-only property") and `compositor.mouseEventEnabled` is already false and does not gate the Magic Remote pointer. The compositor object offers `setEnableCursorChange`, `setMouseFocus`, `updateCursorFocus`, `mouseEventEnabled`; none hides the arrow. The pointer part was removed from the patch. Remaining leads are in docs/AUDIT.md.

### 8c: Back-button history options and the optional background-app closer

| What | Where / command | Undo |
|---|---|---|
| Back history is wiped when the screensaver starts (ours: the page tells `/api/history?v=saver`; LG's own: `lastapp.sh` sees `com.webos.app.screensaver*` in front) so the TV feels freshly turned on; options in Settings -> Remote & pointer: "Forget where I was" (never / screensaver / screensaver or TV off, default screensaver), "Forget apps I left a while ago" (never / 5 min ... 4 h), "How many steps Back can go" (1-8) | `tv/lastapp.sh` (entries are now `id epoch`, `clear`, `why`, `conf`, state in `state/back.conf`), `api.sh` `/api/history`, `/api/gear` returns `back`, `app.js` | set "Forget where I was" to Never, or delete `state/back.conf` |
| "Close apps I left on Home after" 10 min .. 3 h (default **never**): a streaming app that stayed in the background that long is closed (frees its memory, Netflix about 125 MB); LG's apps (`com.webos.*`, `com.palm.*`), inputs, Home, Settings and the app on screen are never touched; checked every 2 minutes | `lastapp.sh reap`, `state/back.conf` `closeidle` | set it to Never |

Verified on the TV with real apps: options and expiry logic (all cases printed), `why saver|standby`, bad values rejected, a real "history cleared (saver)" line when the owner's screensaver started, `closeidle=1` closed Netflix after one minute and left HDMI 2, Home and the foreground app alone. NOT verified: the standby trigger (the power state reports `Active`; the standby values are guessed from the names), the physical gear key.

### 8d: boot test of the patched compositor

Rebooted the TV twice: first boot correctly **refused** a build that had not been proven on a running TV (`qspatch: this build was never proven ...`), after proving it live the second boot applied it at 66 s uptime (7 s), launcher ready at 83 s, boot counter reset, `tools/check.sh` and `tools/keys-test.sh` pass. Compositor memory with LG's quick panel no longer pre-loaded: 56.6 / 56.7 MB (stock, two restarts) vs 52.6 MB (patched), `results/r8-compositor-ab.txt`.

### 8e: acr2 stub, the way back re-proven (two bugs found), final numbers

| What | Where / command | Undo |
|---|---|---|
| `acr2` (LG's viewing recognition, an on-demand service that exists on this firmware) is stubbed with the `contentminer` item, like `admanager`. `adoverlay-service`, `service-logger` and `sportsalarm` (in cleanyourtv-WebOS) do not exist on webOS 4.5 | `debloat.sh` | same switch, `undo`, `./revert.sh` |
| Guide downloader (`iepg`, `broadcast-conf-downloader`) switched off on the dev TV through Settings -> Services (the owner only streams); saves about 7 MB; catalog default stays off for other TVs | `state/svc.conf` `epg=on` | Settings switch |

**`revert.sh` re-proven with the round 8 items, two bugs found and fixed** (`results/r8-revert-test.txt`):
1. `qspatch undo` waited for our launcher to report ready, but `revert.sh` has already given LG's Home back, so the undo "failed", rolled back and **rebooted the TV in the middle of the revert** (it came back stock because `DISABLE` was already set, but the init hook had not been renamed yet). `restart_ui` now only waits for a launcher when ours is the mounted Home.
2. The boot sweep (`debloat.sh sweep` every 20 s for 5 minutes, then every 5 minutes from the Home watchdog) **re-applied the stubs after the revert** when the revert ran in the first minutes after boot. `debloat.sh apply|sweep` now refuse while `DISABLE` exists.
After the fix: no stub mounts, no hosts block, swappiness 100, LG's Home and LG's remotelogger/nudge/contentminer/voice/iepg services running again; then the init hook and boot restored the working state. `tools/safety-test.sh` passes (`results/r8-safety-test.txt`; the first run showed an admanager stub while LG Home was active because the boot sweep of a TV rebooted minutes earlier was still running, the rerun showed 0).

**Before / after** (same `tools/bench-quick.sh`, 3 reps, `results/r8-base-bench.txt` vs `results/r8-after-bench.txt`): YouTube cold launch median 1376 -> 1252 ms, Netflix 1932 -> 1723 ms, Home 1353 -> 1567 ms: all inside the usual +-0.3 s noise, i.e. no change. Swap in use at the end of the same cycle 240 -> 174 MB. Settings key to visible: about 2.0 s (0.6-0.9 s of log-polling lag + 1.05 s page) -> about 1.2 s (90 ms + 1.05 s page), the physical key itself untested.

## Round 9: the real remote recorded, Back and pointer fixed, LG menus replaced (2026-10-27)

The owner pressed every button with `tools/remote-recorder.py` running (read-only evdev + log recorder, `results/` has the decoded table in AGENTS.md). What it showed:
the Magic Remote sends Linux key codes on `LGE M-RCU - Builtin [0]`: digits 2-11, arrows 103/105/106/108, OK 28, **Back 412** (158 is the IR remote), Home 773, gear 139, Input 241, mute/vol 113/114/115, channel 402/403, colours 398-401, play 207, pause 119, `-` 771 (opens LG's Live Menu), mic 1083 (opens LG's voice app), `123` 994 (on-screen remote), power 1021, click 272, wheel = REL 8, pointer = ABS 0/1, and two custom codes from the remote driver: **1198 = show the pointer, 1199 = hide the pointer**.

| What | Where / command | Undo |
|---|---|---|
| **Pointer hidden**: a watcher reads the remote's devices and the moment it sees 1198 it writes 1199 into the same device, so the arrow flickers for a split second instead of staying. No grab, so if it dies nothing breaks. Switch in Settings -> Remote & pointer "Hide the Magic Remote pointer" (default on). Owner confirmed: "the arrow appears but disappears almost instantly" | `tv/pointerhide.py`, `tv/pointerhide.sh`, started by `home-on.sh` and the sweep, `/api/pointerhide`, `state/pointerhide-off` | the Settings switch, `sh pointerhide.sh stop`, `revert.sh`, reboot |
| **Back**: the Back chain only knew the IR code 158, so it never reacted to the Magic Remote (412). `keywatch.py` now listens to both and rescans devices every 3 s; **holding Back (0.8 s) or pressing it twice within 1.2 s leaves the app** (to the previous app of the history, or Home); when an app quits on Back and the TV lands somewhere else (YouTube -> HDMI 2) it is moved to the same target; option "Leave an app with Back" (hold or twice / hold / twice / let the app decide) | `tv/keywatch.py`, `tv/backchain.sh`, `lastapp.sh conf leave`, `app.js` | set the option to "Let the app decide" |
| **LG's screensaver on an input (no signal) is replaced by ours**: the log watcher sees `com.webos.app.screensaver` become visible, closes it, brings Home up and the page starts our screensaver (`/tmp/saver-now` read by `/api/saver/take` when the page is shown). Tested by launching LG's saver on HDMI 1: ours was up 2-9 s later | `tv/saver-take.sh`, `settings-hook.sh` (LGSAVER), `api.sh`, `app.js` `onShow` | `state/saver-lg` keeps LG's, or switch our screensaver off |
| **Same brightness everywhere**: LG keeps `picture.backlight` per input x picture mode, so dimming Home left HDMI bright. `brightness.sh` sets the chosen value in whatever context comes to the front (lastapp calls it on every foreground change) and remembers each context's original (`state/brightness.orig`); Settings -> Picture "Same brightness everywhere" | `tv/brightness.sh`, `lastapp.sh`, `/api/brightness`, `app.js` | set it to Off (restores every remembered original), `revert.sh` |
| **LG's Input picker and Guide / Live Menu are replaced by our Inputs panel** (an overlay page `inputs.html`, same toggle trick as Settings: the second press closes it): the compositor patch swaps LG's `quickinputpicker` launch (2 call sites) and the two Live Menu launches in `appLaunch.js` | `tv/qs/appLaunch.head.js` (`tvdOpenOverlay`), `qspatch.sh` awk (`q == 2, g == 2` or the build is refused), `common.sh` (`overlay_appdesc`, `inputs_appdesc`, `mkhtml`), `settings-open.sh [launch\|close] inputs`, `app.js` (`INPMODE`) | `qspatch.sh undo` |

Verified: pointer watcher counters (32 shows, 32 hides) and the owner's report; Back leave logic reached Home from Netflix through the real code path (the held / double timing could only be exercised with injected keys, which this kernel echoes twice: the owner has to confirm with the real remote); LG saver swap; brightness set in Home, HDMI 1-3 and Live TV contexts; Inputs overlay opens, paints (`inputs-painted`) and closes on a second launch; the patch applies with the replacement counts. NOT verified: the physical Input / Guide keys (injection did not reach the handler), Back hold / double on the real remote.

### 9b: RAM audit (measured on the dev TV, `results/r9-*`)

Memory by process (PSS + swapped, MB): YouTube (`cobalt`) 83 while resident, HDMI input app 57, WebAppMgr 38 + 33 + 13, surface-manager 35, MaliitServer 19, tvservice 20, ss.gateway 20 (Homebrew, kept), pbs 16 (holds a 16 MB EPG database in `/tmp/epg`: left alone, Live TV needs it), SettingsService 14. Kernel: slab 44 MB, page tables 11 MB, CMA 168 MB reserved for video (not usable). **LG's swap `eswap` is zram (600 MB compressed RAM) + about 100 MB of eMMC**, so the claim in 8a that the TV had written 3.7 GB to flash was wrong (corrected everywhere); swappiness 20 still cuts swapping by 40 % (compression work, stalls).

| What | Result | Where | Undo |
|---|---|---|---|
| **Close HDMI input apps left in the background** (default after 5 min, option "Close inputs I left after"): closing hdmi1+hdmi2 while on Home raised MemAvailable 235 -> 326 MB (**+91 MB**); returning to an input takes about 0.75 s instead of 0.3 s (measured 3 rounds) | `lastapp.sh reap` (`closeinputs`), already-running inputs are seeded at start, `app.js` row | set it to Never |
| Streaming apps left in the background are closed after 2 hours (was off; option "Close apps I left on Home after", Never / 30 min / 1 h / 2 h / 5 h); Netflix holds about 125 MB, YouTube 83 MB | `lastapp.sh reap` (`closeidle`, default 120) | set it to Never (use this if you play music in the background) |
| LG's Assistant and Browser apps: already kept closed by `idleapps` (checked: not running) | - | - |

Tried and dropped: keeping a hidden Settings page alive for instant pop-ups: WebAppMgr has `pauseApp` (hides the page, keeps it running) but a later `launchApp` does not show it again and there is no resume / show call, so a paused page cannot be re-shown; the 450 ms of page creation stays. Not touched on purpose: MaliitServer (the on-screen keyboard of LG's web apps), pbs, the WebAppMgr command-line cache sizes (`--skia-image-cache-size-mb=40` etc. are maxima, changing them means restarting every web app and editing the Upstart job).

## Round 10: invisible pointer (picture swap), saver swap no longer depends on the log, compositor patch re-proven (2026-10-27)

| What | Where / command | Undo |
|---|---|---|
| **Pointer made invisible at the source**: the compositor draws the Magic Remote arrow from LG's pictures `/usr/share/im/cursorType*.png` (255 files: arrow, hover, hold, entrance / exit animation, 3 sizes). `cursorclear.py` builds a RAM copy of that folder where every `cursorType*.png` is a fully transparent PNG of the same size (the 3 other files are copied), `cursorclear.sh` bind-mounts it over `/usr/share/im`. Nothing is grabbed or intercepted, the remote, wheel and clicks are untouched, LG's read-only folder is not modified. New debloat item `cursorclear` (Settings -> Services & privacy, group "Remote & Settings", default on), applied BEFORE `qspatch` so the compositor restart at boot already loads the transparent pictures. `pointerhide` (the 1198 / 1199 trick) stays as a second layer | `tv/cursorclear.sh`, `tv/cursorclear.py`, `tv/debloat.sh` (`do_cursorclear`), `tv/services.tsv`, `app.js` text | Settings -> Services & privacy -> switch it off, or `sh debloat.sh undo cursorclear` (a running compositor may keep the pictures it already loaded until its next restart), or reboot without the hook; `revert.sh` runs the same undo |
| **LG's screensaver swap no longer relies on the log**: `lastapp.sh` also subscribes to SAM's `running` list, which names `com.webos.app.screensaver` while it exists, and calls `saver-take.sh` (10 s throttle). Before, only the `tail -F /var/log/messages` watcher in `settings-hook.sh` saw it, and that log is tiny, rotates and sometimes does not exist, so a missed line left LG's saver on screen | `tv/lastapp.sh` (`PIDS`) | `lastapp.sh stop` |
| **Compositor patch (`qspatch`) was OFF after the last reboot**: the boot-time attempt on the previous boot failed and rolled back (the `undo` bug fixed in round 8e), and the boot path refuses a build that was never proven on a running TV, so the Settings / Input / Guide key patches were not active. Applied once from ssh (`qspatch.sh apply`: UI healthy in about 20 s, `state/qspatch.verified` written), so the next boots apply it by themselves | `qspatch.sh apply` | Settings -> Services -> "Hide LG's quick panel" off |

Measured / verified: the generated PNG decodes (sharp) to 90 x 128 x RGBA with all 46,080 bytes zero; 255 pictures cleared, 16 distinct sizes, the RAM copy is about 1 MB; `debloat.sh undo cursorclear` / `apply` / `sweep` / `status` cycle; `tools/check.sh` ALL CHECKS PASSED after the compositor restart; LG's saver launched on HDMI 1 was replaced by Home in about 2 s (LG's saver visible for 0.8 s). NOT verified: that the arrow is really gone on the physical remote (the remote was asleep, `mrcu getConnectionStatus` said not connected; an injected 1198 + move did not read any picture, so it is unknown whether the compositor loads the pictures at start or on demand), the boot order (the next reboot has to show `cursorclear: on` BEFORE `qspatch: restarting surface-manager` in `state/tv-debloat.log`), and LG's real no-signal saver (a 13-minute wait on HDMI 3 did not trigger it).

Tried and dropped: a grab-and-re-emit evdev proxy (clone `LGE M-RCU - Builtin [n]` through /dev/uinput and drop the pointer axes). A harmless probe showed the compositor opens `/dev/input/event0-5` once at start and does NOT open a device created later (only our own watcher did), so a proxy would leave the remote dead unless it also owned the devices before the compositor starts. Other leads: `general.noSignalScreenSaver` is `on` (LG's no-signal saver; left on because its appearance is the signal our swap uses), `other.cursorAutoRemover` already `on`, no LG setting hides the pointer (only `pointerShape/Size/Speed/Alignment`).

## Round 11: Back works while an app loads, brightness is right before the picture shows, only two apps stay in memory (2026-10-27)

Measured first (`getAppLifeEvents` + the log, Spotify and Netflix launched from Home): SAM sends `splash` 0.05 s after the launch call, the app is only in front (`foreground`, window visible) **1.7 s (Spotify) / 3.3 s (Netflix) later**, and until then the foreground is still Home. During that time Back goes to the Home page (which relaunched the newest history entry through `/api/back`) or to a splash that cannot use it, so nothing happened until the app was loaded. For brightness: the context flips (`default` -> `hdmi1`, ...) 2.1 s after the launch and LG's settings service pushes a message at that instant; the old hook only reacted to the foreground event, then slept 1 s, then did two luna calls: the panel showed the context's own (bright) value for about 0.9 s.

| What | Where / command | Undo |
|---|---|---|
| **Back while an app is loading cancels the launch**: `lastapp.sh` subscribes to SAM's app life events; `splash` writes `/tmp/launching` (`app|foreground when it started|uptime`), `foreground` / `close` clears it, `foreground` also keeps `/tmp/fgnow`. `lastapp.sh cancel` (Back, hold or double-tap, and `/api/back` from the Home page, idempotent for 3 s) closes the loading app and launches where the launch started (Home or the app you were in). Measured: Home in front 0.6 s after the key | `tv/lastapp.sh` (`cancel`, `PIDL`), `tv/backchain.sh`, `tv/api.sh` `/api/back` | `backchain-off` switch in Settings, or `lastapp.sh stop` |
| **Back that makes an app quit is corrected within 0.1 s** (was a fixed 1.5 s wait): `backchain.sh` watches `/tmp/fgnow` every 0.1 s for 3 s and redirects the landing to the previous app; the foreground is no longer asked with a luna call before acting | `tv/backchain.sh` | same |
| **Brightness enforced before the picture shows**: `brightness.sh seed` writes the wanted value into all 15 inputs x 28 picture modes (418 rows differed, 37 s, background `nice`; `state/brightness.seeded` remembers the value, `brightness.sh due` re-runs it after a boot where it differs) so no context holds another value; `brightness.sh handle` is the safety net: `lastapp.sh` subscribes to `settingsservice/getSystemSettings {category:picture,keys:[backlight],subscribe:true}` and fixes any context that still differs the moment LG pushes the switch (messages from our own `lunasend` calls are ignored, so a value set by hand sticks). The old foreground hook (`sleep 1; apply`) is gone. Switching HDMI 2/3 (never visited, game / eco modes), Home and Netflix showed the wanted value on every context message, zero corrections needed. `set off` restores every remembered original (420 rows, 13 s); the API runs it in the background | `tv/brightness.sh`, `tv/lastapp.sh` (`PIDB`), `tv/api.sh` | Settings -> Picture -> Same brightness everywhere -> Off |
| **Only two apps stay in memory** (option **Apps kept in memory**, Settings -> Remote & pointer, default 2 = the app in front + the last one; 0 = no limit, up to 4): when an app or input comes to the front `lastapp.sh evict` keeps the newest N entries of the history and closes every other running app. Never closed: Home, our overlays, AirPlay, Homebrew, LG's Settings and all other `com.webos.*` / `com.palm.*` system apps; HDMI / AV inputs count as apps. Evicts when the app is really in front (not on the splash), so cancelling a launch costs nothing. Opening Netflix, YouTube, Spotify in turn left YouTube + Spotify and closed Netflix; the LG-preloaded HDMI apps that come back are closed again at the next switch | `tv/lastapp.sh` (`evict`, `keep`), `app.js` row | set the option to No limit |
| Tests: `tools/keys-test.sh` D (Back during the splash: Home within 3 s, loading app closed) and E (oldest app closed, app in front kept); B (landing on Home is redirected to the previous app) fixed again after a "never override Home" guard broke it | `tools/keys-test.sh` | - |

Not solved / honest limits: LG's own memory manager (`memchute`, `/etc/palm/memorymanager-conf.json`) still closes background apps by itself when memory is short (seen: Spotify closed with `reason: memoryReclaim` when Netflix started; YouTube vanished while Spotify launched), so "the last app stays" is best effort; its thresholds were not touched. YouTube stays on LG's preload list (a favorite). The splash window is the only phase where Back is cancelled: after the app is in front, the app decides what Back does (hold or double-tap leaves). Real Magic Remote Back (code 412) goes through the same `BACK` event as the injected IR code 158 in the tests, but was not pressed by hand. The `closeinputs` (5 min) and `closeidle` (2 h) timers still run on top of the 2-app rule.

## Added in round 12 (2026-10-27: boot fix, self-update from GitHub, change notes)

| What | Where / command | Undo |
|---|---|---|
| **Boot bug fixed** (the TV came up on LG's Home after a restart): `qspatch.sh restart_ui` had the boot check inverted, waited 45 s for a launcher that starts later, rolled back, rebooted, and the next boots skipped the compositor patch. Now it returns at once in boot mode. Re-applied once from ssh (`sh qspatch.sh apply`, build proven in `state/qspatch.verified`). | `tv/qspatch.sh` | `sh qspatch.sh undo` |
| **Software updates from GitHub**: `selfupdate.sh check/apply/rollback/auto/due/json/conf`; loopback API `/api/update`, `/check`, `/apply`, `/rollback`, `/conf`; watchdog check in `home-on.sh` (startup + every N h, `auto` mode installs when idle); Settings -> **Software updates** (version, newest, check now, install, mode Tell me / Install by itself / Never, interval, what is new, go back); a note on Home when an update is ready. Every install: syntax-vet, backup to `backup/code-<v>.tgz`, file-by-file `mv`, restart only what changed, health wait, automatic roll-back. | `tv/selfupdate.sh`, `tv/api.sh`, `tv/home-on.sh`, `tv/launcher/app.js` + `index.html` | Settings -> Software updates -> mode "Never check"; or `sh selfupdate.sh conf mode off`; `selfupdate.sh rollback` restores the last backup; `revert.sh` as always |
| **Change notes**: `tv/VERSION` + `tv/notes.json` (plain language, newest first) are what the TVs read from GitHub; `tools/release-check.js` is the gate (also run by `deploy.sh`); the rule for agents is in AGENTS.md section 11 and CLAUDE.md. | `tv/VERSION`, `tv/notes.json`, `tools/release-check.js` | - |
| **Ad service re-stubbed right after every Home restart**: `home-off.sh` lifts the `admanager` stub for LG's Home and nothing put it back until the 5-minute sweep (seen: pid running after a self-update test). `home-on.sh` now runs `debloat.sh sweep admanager` once the launcher is ready (skipped when that switch is off). Verified: STUBBED, no process, right after a cycle. | `tv/home-on.sh` | - |
| `install.sh --auto-update` sets the update mode to "Install by itself" for TVs set up for other people | `install.sh` | Settings -> Software updates |

Tested on the dev TV with a local test source (`conf local=...`): update installs and the file list is cleaned, a script with a syntax error is refused before anything changes, a launcher with a JavaScript error is rolled back automatically (about 2 min, LG's Home shows meanwhile), `tools/check.sh` passes afterwards. A real GitHub download and forced reinstall was tested after the push (round 13). NOT tested: a really different version from GitHub, `mode=auto` over days. A full reboot with the new code was tested: qspatch applied at boot (7 s), launcher up at 86 s, ad service stubbed.

## Added in round 13 (2026-10-27: Settings from Home in about 0.2 s, LG's leftover menus closed)

| What | Where / command | Undo |
|---|---|---|
| **Settings key fast path**: the compositor sends one GET to `/api/ui/settings-key`; with Home in front the Home page opens its own Settings through a FIFO long-poll (`/api/ui/wait`, ack `/api/ui/ack`), otherwise the API launches the overlay as before. About 0.2-0.35 s instead of 1.0-1.4 s from Home; overlay path unchanged. Verified with injected KEY_SETTINGS: open, toggle-close, HDMI 1 in front -> overlay opens and toggles closed. The compositor patch was re-applied twice (`qspatch.sh reapply`, each proven by the loaded-check). | `tv/api.sh`, `tv/qs/appLaunch.head.js`, `tv/launcher/app.js` | `sh qspatch.sh undo` (the shell hook then opens the overlay); the page code is harmless without the patch |
| **Debloat item `lgmenus`** (Settings -> Services & privacy -> "Close LG's leftover menus", default on): closes the voice assistant, the hidden Mute x3 menu and Input Hub the instant SAM announces them | `tv/debloat.sh` (`do_lgmenus`, flag `state/lgmenus.on`), `tv/lastapp.sh`, `tv/services.tsv` | `sh debloat.sh undo lgmenus` or the switch; `revert.sh` undoes it with the rest |
| Round 13 measurements and the "why not keep Settings hot" numbers | AGENTS.md "Round 13 facts" | - |

Not verified: the real remote's gear / mic / Mute x3 / Input Hub buttons (injected gear key and direct launches only); `mode=auto` self-update over days.

## Added in round 14 (2026-10-27: memory guard)

| What | Where / command | Undo |
|---|---|---|
| **Memory guard** (debloat item `memguard`, Services switch "Watch memory and protect the TV", default on): a 10 s loop reading /proc only; percentages of RAM by profile; low closes apps beyond the newest (`lastapp.sh evict 1`), critical also makes the Home page drop its photos (FIFO `lowmem`) and drops the page cache; steps down after 3 calm samples; history in RAM. Settings -> About & updates shows state, lowest free, most swap, episodes, last action and the profile choice (Automatic / Roomy / Standard / Weak). Proven with a 170 MB RAM hog: low, critical, photos dropped, recovery. | `tv/memguard.sh`, `tv/debloat.sh` (`do_memguard`), `tv/lastapp.sh` (`evict [N]`), `tv/api.sh` (`/api/mem`, `/api/mem/conf`, `guard` in sysinfo), `tv/launcher/app.js` (LOWMEM), `tv/services.tsv` | `sh debloat.sh undo memguard` or the switch; `revert.sh` stops it with the rest |

Not verified: the guard on a genuinely weaker TV (only simulated with the Weak profile and a RAM hog); effect of `drop_caches` on responsiveness (unmeasured).

## Added in round 15 (2026-10-27: faster boot, start-up cover, Remote access, Network)

| What | Where / command | Undo |
|---|---|---|
| **Two-phase boot**: debloat.sh apply-early (cursorclear, qspatch) -> home-on -> apply-late (the rest); sleep 5 -> 2 in boot.sh, sleep 3 -> 1 and 0.5 s ready polling in home-on.sh. Our Home ready at 59.9 s (was 79 s). | tv/boot.sh, tv/debloat.sh, tv/home-on.sh | revert.sh / DISABLE as always |
| **Start-up cover** (debloat item bootcover, Services switch, default on): cover.sh shows launcher/cover.html as an opaque overlay when nothing or LG's Home is in front, again after qspatch's compositor restart, and hides it when our Home is ready | tv/cover.sh, tv/launcher/cover.html, tv/common.sh (cover_appdesc), tv/boot.sh, tv/home-on.sh, tv/home-off.sh, tv/qspatch.sh, tv/api.sh (/api/cover/hide) | the switch, or touch state/cover-off |
| **cursorclear flash cache** (state/im-clear-cache, about 1 MB): mounted directly, no RAM copy, no rebuild at boot | tv/cursorclear.sh | sh cursorclear.sh off (the cache stays) |
| **Settings -> Remote access**: name, IPs, MACs, ssh / telnet commands, key count, Telnet switch (refused without an SSH key; SSH locked on); revert.sh turns Telnet back on | tv/remote.sh, tv/api.sh (/api/remote, /api/remote/telnet), tv/launcher/app.js, tv/revert.sh | sh remote.sh telnet on |
| **Settings -> Network** shows router, Wi-Fi radio and saved networks (read-only) | tv/wifi.sh, tv/api.sh (/api/wifi), tv/launcher/app.js | - |
| **vmtune: swap read-ahead off** (vm.page-cluster 0, original saved in state/vm.pc.orig) | tv/debloat.sh | sh debloat.sh undo vmtune |

Tested: remote json, Telnet off/on (SSH untouched), cursorclear off / build 0.6 s / cached 0.12 s, cover shown and hidden at runtime, both boot phases run for real, two cold reboots (Home ready 79 s -> 59.9 s). NOT verified: the cover on a cold boot that starts on Home, (a boot that starts on an input ends on our Home: see AGENTS.md Round 15), Wi-Fi joining (not built), the page-cluster benefit.

## Added in round 16 (2026-10-27: power-on destination, screensaver defaults, portability tools)

| What | Where / command | Undo |
|---|---|---|
| **Settings -> Power & timers -> "When the TV turns on, go to"** (Home default / Where it was / HDMI 1-4): poweron.sh, called by lastapp.sh on Active after standby / Screen Off / suspend and by boot.sh at the end of a full start; also sets LG's homeAutoLaunch | tv/poweron.sh, tv/lastapp.sh, tv/boot.sh, tv/api.sh (/api/poweron), tv/launcher/app.js | choose "Where it was" |
| **Screensaver defaults**: photo every 300 s (choices 12 s - 15 min), backlight 40 % of normal (row shows the real number), dim 20 | tv/launcher/app.js (DEFAULTS, Home & Screensaver) | change the rows; stored values win |
| **LG screensaver safety net**: third independent check every 20 s in the home-on.sh watchdog | tv/home-on.sh | - |
| **Brightness**: re-enabled at 35 (it had been switched off); API changes are now logged | state/brightness (TV only), tv/api.sh | Settings -> Picture -> Same brightness everywhere -> Off |
| **Self-check + capabilities**: health.sh (/api/health, About -> Self-check, sweep logs non-ok checks), caps.sh (/api/caps, state/caps.conf, install.sh prints it) | tv/health.sh, tv/caps.sh, tv/api.sh, tv/home-on.sh, tv/launcher/app.js, install.sh | - |
| **Remote emulator probe**: tools/emulator-probe.sh [--effect] runs tv/keys.py on any TV (device discovery by capability, native event size, round trip, optional Home effect); keywatch.py uses the native event size; install.sh offers the probe | tv/keys.py, tools/emulator-probe.sh, tv/keywatch.py, install.sh | - |

Tested on the dev TV: poweron home / last / hdmi2 / home through screen-off-on cycles, the saver swap and the new poll check against a real LG screensaver, emulator probe (EMULATOR OK incl. effect), caps.sh and health.sh (17 checks ok). NOT verified: a real cold boot that starts on Home with the cover, a TV with a 64-bit CPU or webOS 5+ (probe and caps are written for them but untried), the power-on destination after a real standby (only Screen Off / On was exercised).

## Added in round 17 (2026-10-27: power-on app, one backlight control, saver text and burn-in, systemd groundwork)

| What | Where / command | Undo |
|---|---|---|
| **Power-on destination can be any installed app** (app:<id>) | tv/poweron.sh, tv/launcher/app.js (Power & timers) | choose Home |
| **One backlight slider** applied to every input and app (LG's per-input Backlight row hidden; LG Brightness renamed Black level); set to 100 on this TV; a re-seed now restarts itself when the value changes mid-run | tv/launcher/app.js (brSld), tv/brightness.sh | slider to any value; the API still accepts v=off |
| **Screensaver backlight is an absolute level** (default 15), dim 20; saver text about 35 % bigger; Home header text bigger and the duplicate date removed | tv/backlight.sh, tv/api.sh, tv/launcher/app.js, tv/launcher/index.html | Settings -> Home & Screensaver |
| **Burn-in protection without photos**: slow full-screen glow (200 s loop) + the clock moves every 30 s | tv/launcher/index.html (#sglow), tv/launcher/app.js (drift) | - |
| **systemd groundwork**: tv/init.sh behind all service stops/starts/restarts; tv/systemd-units.tsv (all commented guesses); tools/list-services.sh; tools/test-init.sh; caps.sh and diagnose.sh report it; qspatch refuses on systemd | tv/init.sh, tv/common.sh, tv/debloat.sh, tv/qspatch.sh, tv/caps.sh, tools/*.sh | revert.sh as always |

Tested: poweron app destination (HDMI 1 -> Netflix), backlight 100 seeded on all 419 contexts, real Upstart path through the new wrappers (nudge undo/apply, unknown job skipped), tools/test-init.sh 18/18, Home and photo-less saver rendered. NOT verified: any real systemd TV, the saver backlight level and burn-in glow on the real panel (only rendered in the preview), the Settings sliders with the real remote.

## Fork tauqram/webos4-clean-home (2026-11-02 / 2026-11-03: Sam's LG OLED65C9, not yet installed on a real TV)

| What | Where | Undo |
|---|---|---|
| Five themes (Azion, Noir OLED, Aurore, Bleu nuit, Sable) with a SEASONS table, black OLED screensaver with canvas fireworks and a small moving clock | `tv/launcher/themes.js`, `index.html`, `app.js` | Settings -> Accueil et veille -> Thème; or revert the commit |
| Inter font (SIL OFL) bundled, copied to the RAM launcher copy | `tv/launcher/fonts/`, `tv/common.sh` (`ram_sync`) | revert the commit |
| Home, Settings and the Services catalog translated to French; 24 h clock and °C by default | `app.js`, `index.html`, `tv/services.tsv` | revert the commit (state/settings.json keeps the user's own choices) |
| Favorites picker: Settings -> Accueil et veille -> Favoris toggles apps in `dock` (max 6); Home rebuilds its rows when `dock`/`hide` change | `app.js` (`favPanel`, `favToggle`, `settingsChanged`, `applyRemoteSettings`) | revert the commit |
| Self-update source is this fork | `tv/selfupdate.sh` (`DEF_REPO`) | `selfupdate.sh conf repo TristanG115/webos4-clean-home` |
| French guided installer for Windows (double-click) | `Installer-TV.cmd`, `tools/installer-sam.sh` | PC side only |

Verified only in a desktop Chromium with mock data (screenshots); `tools/check.sh` has not run on the C9 yet.

## Release 2026.11.04.1 (2026-11-04, Sam's C9: deployed from branch `pending-tv-fixes` and used on the TV by the owner)

| What | Where | Undo |
|---|---|---|
| hosts apply counts names inside the begin/end block; `ram_sync` creates `launcher/photos` (fresh install fell back to flash) | `tv/debloat.sh`, `tv/common.sh` | revert the commit |
| Square favourites painted with LG's iconColor; icons fill the tile (inset only for `CFG.iconInset`, Alexa); own icon for YouTube AdFree (`CFG.iconByTitle`) | `tv/launcher/app.js`, `index.html` | revert the commit |
| Long press OK (0.7 s, action on key release) = edit mode: star (favourite), bin (uninstall if `removable`, or hide), ◀ ▶ move (`S.order`); Settings row "Apps masquées" | `app.js`; `tv/api.sh` `/api/uninstall` (loopback only, refuses system ids and non-removable apps, `appInstallService/remove`) | hidden apps: Settings -> Apps masquées; uninstalled apps: LG Content Store |
| Header: Thème (brush) and Éco (`picture.energySaving`) buttons, Entrées removed | `index.html`, `app.js` | revert the commit; Éco: set back to Désactivée |
| Back held in an app closes it and goes Home; Home ignores the rest of that key (`/tmp/back-held`, 4 s) | `tv/keywatch.py` (new HOLD event), `tv/backchain.sh`, `tv/api.sh` `/api/back`, `app.js` | Settings -> Télécommande -> Quitter une app avec Retour; or revert |
| Opaque Settings rail, OK on a choice row opens a list, smoother header focus, crisp SVG Aurore ribbons, Bleu nuit shooting star, flat Azion | `index.html`, `app.js` | revert the commit |

Verified by the owner on the TV (photos): favourites, icons, edit mode, Éco, themes, header. NOT verified: `/api/uninstall` on webOS 4.5,
whether energySaving set from Home applies to every input, the held-Back fix with the real remote, `tools/check.sh` on the C9.
`tools/test-init.sh` fails in the build container only because it has real `initctl`/`systemctl` on the PATH (init.sh and the test are unchanged).

## Release 2026.11.04.2 (2026-11-04, Sam's C9: deployed from branch `pending-tv-fixes`; night shutdown set to 22-7 on the TV)

| What | Where | Undo |
|---|---|---|
| Back on our Home does nothing (no relaunch of the last app / input) | `tv/launcher/app.js` (Home `onKey`, `goBack` removed) | revert the commit |
| Boot cover also hides an input or app at boot when the power-on destination is Home; boot forces `general.homeAutoLaunch=on` for that destination | `tv/cover.sh`, `tv/boot.sh` | revert the commit; `poweron.sh set last` |
| Full shutdown at night: between FROM and TO o'clock LG's Quick Start+ (`option.quickStartMode`, values on/off on the C9) is switched off, outside it on; checked once a minute by the home-on.sh watchdog (LG reads the switch when the TV is turned off). Settings -> Alimentation -> "Arrêt complet la nuit"; `/api/nightoff?v=off|FROM-TO`; off by default (no `state/nightoff.conf`) | `tv/nightoff.sh` (new), `tv/home-on.sh`, `tv/api.sh`, `tv/poweron.sh` (get adds `night`), `app.js` | `sh nightoff.sh set off` (leaves quickStartMode as it is; set it in Settings) |

Verified on the C9 at 21:35: deploy OK, Home cycle OK, getSystemTime gives the right local hour (21), quickStartMode switched to on outside the window.
Tested in the build container: nightoff.sh window parsing and the on/off decisions for 22-7 and 0-7 against a fake luna (hours 12, 21, 22, 23, 0, 6, 7, 8), the one-line-per-hour standby log; Settings page rendered with mock data.
NOT verified on the TV: the local hour from `com.palm.systemservice/time/getSystemTime` (falls back to `date`), that LG honours a quickStartMode change made a minute before power-off,
and whether our loops keep running in Quick Start+ standby (the log line "nightoff: still running at ..h while the TV is in ..." answers that; if they do, a TV left in standby at 22h could later be powered down for real: not built).

## Release 2026.11.06.3 (2026-11-06, Sam's C9: Christmas season theme "nuit de neige"; same branch, NOT on main)

| What | Where | Undo |
|---|---|---|
| Season theme Noël, active 1 Dec - 6 Jan when the theme is "auto" | `THEMES.noel` + `SEASONS` in `tv/launcher/themes.js`; CSS in `backgrounds.css` (`tools/make-backgrounds.py`) | empty `SEASONS`, or pick another theme |
| Pictures computed on the PC (blue night 1920x1080, far snow 1920x1080, soft mid/near snow 960x540 shown 2x; 4K `@2x` copies of the base and far snow picked through `-webkit-image-set` only if the page is drawn at devicePixelRatio 2) | `tv/launcher/bg/*.webp` (about 220 KB in all), made by `tools/make-season-backgrounds.py` (numpy + Pillow, fixed seeds) | delete the folder with the theme |
| RAM copy of the launcher gets `bg/*.webp` | `ram_sync` in `tv/common.sh` | revert the lines |
| Horizon rebuilt as a computed picture (sky haze, atmosphere falloff, 1.1 px rim line, limb glow; `horizon.webp` + 4K `@2x`) plus a separate sunrise bloom (`horizon-sun.webp`, breathes 9 s); stars kept as vectors but only above the rim; the CSS planet/sky/lit/grain layers are gone | `tools/render-backgrounds.py` (renamed from make-season-backgrounds.py), `tools/make-backgrounds.py`, `THEMES.horizon.layers` | revert the commit |
| Bleu nuit, Océan, Dunes, Dégradé, Lignes, Studio rebuilt the same way: computed pictures (`bg/<theme>.webp` + `@2x`; Milky Way with dust lanes and star dust, hill/dune rim light, moons with limb darkening and dimmed halos, contour lines lit by the warm spot); live vector layers kept only for twinkling stars (generated only above the hills/dunes and away from the moons), shooting stars and the sea shimmer. backgrounds.css 190 KB -> 92 KB; only the active theme's picture is decoded (about 8 MB at 1080p, 32 MB for a 4K copy on a 4K page) | `tools/render-backgrounds.py`, `tools/make-backgrounds.py` (unused SVG generators removed), `THEMES[id].layers` | revert the commit |

Made with the method of the design-resources doc (abstract only, rendered on the PC, grain baked in, every full-screen shot critiqued
before sending). The snow layers are two pictures tall and slide down one picture (70 s / 38 s / 21 s, transform only), paused with the
screensaver; decoded size about 8 MB for the base + 2 MB per snow layer. Verified in the headless preview (screenshot + 16 s video, no seam).
NOT verified on the TV (GPU cost of three full-screen moving layers on Chromium 53, memory).

## Release 2026.11.06.2 (2026-11-06, Sam's C9: smoother 6 and 9; same branch, NOT on main)

| What | Where | Undo |
|---|---|---|
| Clock font: the ink traps of 6 and 9 replaced by a plain crotch (Sam found the 9 odd at 19rem) | `tv/launcher/fonts/bricolage-grotesque-latin-800-normal.woff2`, made by `tools/fix-clock-digits.py` (OFL font, no Reserved Font Name, so a modified copy is allowed) | `git checkout` the previous woff2 |

A Christmas theme was built and shown to Sam, who rejected it (not professional enough): removed before release.

## Release 2026.11.06.1 (2026-11-06, Sam's C9: new backgrounds; same branch `claude/project-thread-kwaseh`, NOT on main)

| What | Where | Undo |
|---|---|---|
| Six new themes (Horizon, Océan, Dunes, Dégradé, Lignes, Studio) and a reworked Bleu nuit | `tv/launcher/themes.js` (`THEMES[id].layers`: the divs each theme puts into `#themebg`, inside `#nbg`), `tv/launcher/backgrounds.css` (generated by `tools/make-backgrounds.py`, fixed seeds, no binary assets) | pick another theme; or revert the commit |
| `backgrounds.css` copied to the RAM copy of the launcher | `ram_sync` in `tv/common.sh` (file list) | revert the line |
| Old Bleu nuit CSS (`.tb1-.tb3` stars, shooting star) removed; the hill in `index.html` now only on Aurore | `tv/launcher/index.html` | revert the commit |

Notes: every layer is a static gradient or SVG data URI; animations are opacity/transform only (twinkle 3-5 s, shooting stars
every 19 s / 31 s, Horizon sunrise glow breathing over 9 s, ocean reflection 2.6 s) and pause with the rest of `#themebg` while the
screensaver runs. A faint 160 px grain PNG on each background against gradient banding. Sam's review fixes: both moons dimmer (less
glare), the fixed straight light streak on Horizon's rim removed (it read as a straight line on a curved horizon).
Verified: rendered every theme in the headless preview (Chromium, mock data): layers built, no page errors, rows readable.
NOT verified: on the TV (Chromium 53 rendering of the large data URIs, GPU cost of the animations, memory). If a theme is slow,
switch back to Aurore or Noir.

## Release 2026.11.05.1 (2026-11-05, Sam's C9: new Home look; on branch `claude/project-thread-kwaseh`, NOT on main until Sam has deployed and checked it)

| What | Where | Undo |
|---|---|---|
| "Tout visible" Home: the big title line is gone (it comes back as a hint at the bottom while editing an app); the name shows under the focused app, bigger (1.9 rem); favourites 15 rem squares, apps 8.6 rem; row titles 1.6 rem | `tv/launcher/index.html` (last style block), `app.js` (`tedDraw` sets `body.editing`) | revert the commit |
| Large centred clock (19 rem) with the date and a short weather line centred above it (`#dline`, `#wmini`); `#weather` kept but hidden | `index.html` header markup + CSS, `app.js` `wxRender` | revert the commit |
| Clock font setting: Settings -> Accueil et veille -> Police de l'heure (`ui.clockFont` = outfit / verre / bricolage, body class `cf-*`); fonts Outfit 600, Inter 800, Bricolage Grotesque 800 (SIL OFL, licences in `launcher/fonts/`, about 60 KB together, copied to RAM by `ram_sync` like Inter) | `app.js` (`CLOCK_FONTS`, `applyUi`, DEFAULTS), `launcher/fonts/` | revert the commit |
| Header buttons are round, icon only; the focused one spells its name under itself (a pill growing sideways ran into the centred date line) | `index.html` | revert the commit |
| Dark hill with an aurora rim behind the clock on Aurore and Bleu nuit (`.hill` in `#themebg`, an SVG data URI; hidden with gallery photos like the rest of the theme) | `index.html` | revert the commit |
| Update pill moved to the bottom centre (it covered the hero title before) | `index.html` | revert the commit |

Tested in the build container only: preview of Home (Aurore, Bleu nuit, Azion; the three fonts), focus on a header button, focus in the grid, long-press edit mode, Settings row, screensaver unchanged; `node --check app.js`, `node tools/release-check.js`.
NOT verified on the TV: the look on the real panel with real LG icons, Chromium 53 rendering of `-webkit-background-clip:text` (glass digits), scroll position of the lower app rows, the edit hint over the last row. Mockups and CSS sketches: project files `webos4-clean-home-apercu/pistes-2026-11-05/`.

### 2026.11.06.4 - Icon focus without the ring, Apple TV style (Sam's option C)

| Change | Where | Undo |
|---|---|---|
| Focused tile: ring hidden (kept for `.tile.edit`), icon `scale(1.13)` over a deep soft shadow, light reflection layer `.ic:after` (radial highlight + inset light edge, opacity fade) | `index.html` (last style block) | revert the commit |
| Other icons at opacity .62 while a tile has the focus (`body.tilefoc`, set in `focusItem`; not while focus is on a header button, not in edit mode) | `index.html`, `app.js` | revert the commit |

Tested in the build container only (playwright preview, placeholder icons): focus on a favourite, on the app grid, on a header button (no dimming). Only transform/opacity animate; the shadow switches without animation.
NOT verified on the TV: smoothness of the opacity fade over 13+ tiles on Chromium 53, the look with real LG icons, edit mode. Mockups: project files `webos4-clean-home-apercu/selection/`.

### 2026.11.06.5 - Focus v2: spring tilt, gliding light, render probe

| Change | Where | Undo |
|---|---|---|
| Focused tile animates in with a spring (scale 1 -> 1.15 -> 1.125 -> 1.13) and a 6 deg tilt toward the move (`perspective rotateX/Y`, classes `gl/gr/gu/gd` set by `focusItem` from the previous row/column; not in edit mode) | `index.html`, `app.js` | revert the commit |
| A soft radial band of light (`.sheen i`, inside `.sheen` with `overflow:hidden` and the tile's radius) glides across the focused icon from the side the focus came from (translate3d only) | `index.html`, `app.js` (`mkTile`) | revert the commit |
| Render probe: on the first focus move logs `perf page WxH dpr= screen=`, then for 1 s after each of the first 12 moves `perf fps= worst=ms` (requestAnimationFrame) into `/tmp/launcher-page.log` | `app.js` (`perfProbe`) | revert the commit |

Tested in the build container only: frame-by-frame capture at 60 fps (4K video in project files `webos4-clean-home-apercu/selection/`). NOT verified on the TV: real fps, the page's devicePixelRatio, whether the rounded clip of `.sheen` lags a frame while the tile scales (seen before on the icon itself).

### 2026.11.06.6 - Focus v3: no sweeping band, slow sway and drifting light (Apple HIG)

| Change | Where | Undo |
|---|---|---|
| Removed the band of light that crossed the icon on arrival (Sam: looked cheap; Apple's HIG describes no such sweep). `.sheen i` is now a soft radial spot (160 % of the icon, clipped by `.sheen`) that drifts slowly (`tvglow`, 9 s loop) | `index.html` | revert the commit |
| After the arrival tilt, the focused icon sways gently (`tvsway`: rotateY +-2.2 deg, rotateX +-1.2 deg, 9 s loop, scale 1.13), as Apple's HIG says a focused tvOS icon "gently sways while the surface illuminates". The resting `.ic:after` now only draws the light edge | `index.html` | revert the commit |

The sway and the light run continuously on one tile while Home is shown (compositor-only transforms). Tested in the build container (60 fps frame-by-frame 4K video in project files `webos4-clean-home-apercu/selection/reflet-v3-*`). NOT verified on the TV: fps, and whether the endless animation costs anything noticeable.

### 2026.11.06.7 - Focus light a little stronger

`.sheen i` peak 0.17 -> 0.24 white, drift +-9 % -> +-14 % (`tvglow`) in `index.html`: Sam could not see the light in the 2026.11.06.6 video (that video was also spoiled by the preview's screensaver starting during the slow frame capture; the recorder now blocks long timers). Undo: revert the commit.

### 2026.11.06.8 - Focus light without rings

Sam saw the rings of the CSS radial-gradient (8-bit steps on the OLED, at 4K: devicePixelRatio 2 measured). `.sheen i` now uses `launcher/bg/focus-light.webp` (768 px lossless WebP, white with a Gaussian alpha falloff and triangular dither, drawn by `tools/make-focus-light.py`; `ram_sync` already copies `bg/*.webp`). Undo: revert the commit.

### 2026.11.06.9 - Sharper backgrounds, moving lines, fuller landscapes

Sam's TV review of the picture backgrounds (4K page, devicePixelRatio 2):
- Removed the Sable and Azion themes (`themes.js`, their `body.th-sable` / `body.th-azion` rules in `index.html`). A TV set to one of them falls back to the automatic theme.
- Thin bright lines (Horizon's planet rim, the Bleu nuit hill rims, the Dunes crests, the Lignes contours) showed steps on the TV. They are no longer baked into the WebP pictures (lossy WebP with half-resolution colour smears and steps a 1-2 px near-horizontal line); they are SVG strokes in `backgrounds.css` (`nb-rim`, `nb-lines` layers) that the TV draws at its own 4K resolution. Only the soft light around them stays in the pictures. Shapes shared by both generators moved to `tools/bggeom.py`.
- Lignes: the contour layer (110 % of the screen) sways slowly, 36 s each way (`nbsway`, transform only).
- Dunes: three more dune ridges down to the bottom of the screen, warm body colours instead of black. Bleu nuit: two lower ridges with mist in the valleys, deep blue instead of black at the bottom.
- Ocean: the reflection glints are wavy strokes on two layers that shimmer and sway out of step (`nbwave1/2`).
- Moons (Ocean, Dunes): maria from smooth noise, 40 craters with a shadowed and a lit wall, fine regolith grain.
- Shooting stars added to Ocean and Dunes.
Verified in the build container only (headless Chromium at devicePixelRatio 2). NOT verified on the TV: smoothness of the swaying Lignes layer (one 4K-sized composited layer, about 36 MB of GPU memory while Lignes is shown). Undo: revert the commit.

### 2026.11.06.10 - Screensaver looks Aurore, Eclipse, Soie

Without gallery photos the screensaver now shows one of three looks instead of only fireworks (Settings, "Animation de veille": Alternance = a different one each time (default; the old value `theme` means the same), Aurore boréale, Éclipse, Soie, Feux d'artifice, Aucune).
- Pictures `launcher/bg/sv-*.webp` (1x + @2x, 8.8 MB on flash and in the RAM copy) computed by `tools/render-saver.py`; light is computed, the TV only moves layers with transform / opacity. Aurora: 4K across and half resolution down (shown stretched x2 vertically; the rays are vertical so they stay sharp), filaments down to 3 px, a third fuchsia curtain that glows up about 20 s in every 71 s. Eclipse: a 2200 px rim picture rotating once in 3 min + a breathing bloom. Soie: each ribbon picture is one period wide and repeated (`repeat-x`, decoded once); the slide by one period loops without a seam.
- Horizontal slides use `steps()` so each step is half a CSS px = one 4K pixel: fine lines are never resampled.
- The elements exist only while the saver runs (`#svfx`, built by `themes.js`, removed 1.4 s after the saver stops), so their pictures (decoded at 4K: Aurore about 40 MB, Éclipse about 20 MB, Soie about 40 MB) are in memory only then. With LOWMEM (memguard) Aurore / Soie are replaced by Éclipse. The dim veil (`#sdim`) is off over these looks (it is meant for photos).
Verified in headless Chromium at 3840x2160 (dpr 2): rendering, steps, fuchsia, no page error. NOT verified on the TV: smoothness and memory (check with `grep perf /tmp/launcher-page.log`). Undo: revert the commit, or choose "Feux d'artifice" in Settings.

### 2026.11.06.11 - Screensaver smoothness probe

`app.js` `saverPerf()`: 8 s after the screensaver starts, counts frames for 3 s and logs `perf saver <look> dpr=.. fps=.. worst=..ms` to `/tmp/launcher-page.log` (at most 20 times per page life). `themes.js` exposes `Theme.saverName()`. Read with `./tv.sh 'grep perf /tmp/launcher-page.log | tail -15'`. Undo: revert the commit.

### 2026.11.06.12 - Power key instant again (LG's power service no longer stuck by our screensaver swap)
- Symptom (Sam, C9): Power took ~10 s and the TV then did a FULL shutdown even with Quick Start+ on, so the next start was slow and showed LG's old Home first.
- Cause (traces: `tools/poweroff-trace.sh`, `tools/saver-power-info.sh`, `tools/saver-unstick-test.sh`): tvpower launches `com.webos.app.screensaver` from
  `Active / processing: Screen Saver Ready` (about 2-3 min idle on Home, even with `screenSaverEnabled` off) and waits there until it has seen the saver
  start. `saver-take.sh` closed it 0.25 s after launch, so tvpower stayed in that state; `turnOnScreen` was refused ("power is busy").
- Fix: `saver-take.sh release [now]` launches LG's saver once more while the swap looks away for 20 s (`/tmp/saver-unstick`): tvpower returns to plain
  `Active` within a second and the saver leaves unseen; Home is brought back if it was in front. Run 2 s after every swap, and by the home-on.sh
  watchdog every 20 s (acts only on a second sighting 15 s apart). Proven by hand on the C9 (Power instant, wake in 2-3 s); the automatic path is
  tested only against a stubbed `lun` on Linux so far.
- Undo: previous `tv/saver-take.sh` / `tv/home-on.sh`; or `touch state/saver-lg` (LG's saver stays, no swap, no release needed).

### 2026.11.06.13 - Power fix without touching the screensaver (replaces the visible part of .12)
- Sam on .12: our screensaver stopped by itself, Home came back, our saver restarted with another look, then LG's saver showed for a moment.
  Cause: `saver-take.sh release now`, run 2 s after every swap (and by the watchdog while our saver ran), relaunches LG's saver to free tvpower.
- New `tv/saverdeny.sh` (started by home-on.sh and the 5-min sweep, stopped by home-off.sh / revert.sh): registers with tvpower
  (`registerScreenSaverRequest {"subscribe":true,"clientName":"tvdebloat"}`, accepted on the C9) and answers `responseScreenSaverRequest`
  with `ack:false` while Home / our overlays are in front (`/tmp/fgnow`), `ack:true` elsewhere. Every request and answer is logged
  (`saverdeny:` lines) because the request message has NOT been observed yet (tvpower's `requestScreenSaver` is not callable).
- `saver-take.sh`: no release right after a swap any more; `release` never runs while `/tmp/saver-on` exists. The watchdog fallback stays.
- To verify: leave the TV idle on Home for 4 min, then `grep -E 'saverdeny|stuck' state/tv-debloat.log` and `getPowerState` (no `processing`).
- Undo: `sh saverdeny.sh stop`; previous saver-take.sh / home-on.sh.

### 2026.11.06.14 - Screensaver clock: centred, fixed

Sam's choice A. Last block of `index.html` (`#saver.on #sinfo ...`, wins over the older #sinfo rules): the Home clock typeface (ClockBricolage 800, or the chosen clock font), 13rem, 86 % white, centred 3.4rem above the bottom, date + weather (no hi/lo/place) on one 2rem line, 58 % white. `app.js` `drift()` no longer jumps the block around every 30 s: it shifts it by 1 CSS px every 3 minutes along a 4 x 4 px square (pixel-shift against OLED marking), in photo mode too. Verified in headless Chromium at 4K with the three looks. Undo: revert the commit.

### 2026.11.06.15 - Power fix v3: unstick tvpower inside the swap, before our saver starts
- .13 result on the C9: tvpower asked our saverdeny client (`{"timestamp":"154631299","instantBoot":"on"}`), accepted `ack:false`
  (`returnValue:true`) and launched LG's saver 3 s later anyway; tvpower stuck again. saverdeny.sh is no longer started (kept as a record).
- `saver-take.sh`: after closing LG's saver it waits until SAM no longer lists it (<= 3 s), runs `release swap` (relaunch LG's saver, wait for plain
  `Active`, close it; no Home relaunch, ignores /tmp/saver-on), and only then writes /tmp/saver-now and launches Home. Our saver starts ~2-3 s later
  than before but is not interrupted. Watchdog fallback unchanged (never while our saver is on).
- Tested: sh -n, release-check, stubbed lun on Linux. To verify on the TV: idle 5 min on Home, log shows `released=yes ... (swap)`, getPowerState
  without `processing`, Power instant.

### 2026.11.06.16 - Swap waits for tvpower before closing LG's saver (one short flash instead of two)
- .15 verified on the C9: log `released=yes after 1s (swap)`, getPowerState plain `Active`. But Sam saw LG's saver, then ours.
- `saver-take.sh` now waits (0.2 s steps, at most 2 s) until tvpower leaves `Active / Screen Saver Ready` before closing LG's saver, logs
  `closed LG's saver after X s (tvpower free|still waiting)`, and only runs `release swap` if it is still stuck. Unverified on the TV.

### 2026.11.06.17 - LG's screensaver draws nothing (saverhide.sh)
- Sam: "je ne veux jamais voir la veille LG". It must still start (tvpower waits for it, else the Power key gets slow).
- New `tv/saverhide.sh apply|undo|status|build`: generates on the TV a copy of LG's `qml/Containers/MainView.qml` with three lines changed
  (`Mode_ScreenSaver`: window colour stays transparent, loader gets `undefined`; `Mode_PIG`: no black mask), checks that each edit matched exactly once,
  braces and line count are unchanged, then bind-mounts it over the original. Applied by home-on.sh (and the 5-min sweep), undone by home-off.sh and
  revert.sh; flag `state/saverhide-off` disables it. LG's file content is never committed.
- Tested: sh -n, the awk edit on the excerpt printed by tools/lg-saver-dump.sh (3 lines changed, a non-matching file refused). NOT yet on the TV.
- Undo: `sh saverhide.sh undo` (or touch state/saverhide-off).

### 2026.11.06.18 - Screensaver exit: clean fade

On exit the saver used to drop its classes at once (`className = ''`), so during the 1.2 s fade the clock fell back to the old #sinfo styles (it grew) and the animation/dim vanished (bare black). Now `saverStop()` swaps `on` for `leaving` (`#saver.leaving`: opacity 0 in 0.7 s, still visible), keeps every other class (the clock rules now key on the permanent class `sv`), and resets the classes, canvas, dim and photo stages 0.8 s later unless the saver restarted (`saverStop.t`). Verified in headless Chromium (frames of the fade). Undo: revert the commit.

### 2026.11.06.19 - No moving light, no ring in edit mode

Sam: the drifting light looked like a torch, and the ring while moving an icon is not pretty. Removed `.sheen` (element in `mkTile`, CSS, `bg/focus-light.webp`, `tools/make-focus-light.py`); `.tile .ring` is hidden everywhere. Edit mode: the moved icon keeps the lifted shadow and its jiggle (`tvwob`), the other icons go to opacity .4. Tested in the preview (long press, move). Undo: revert the commit.

### 2026.11.06.20 - Screensaver no longer restarts when LG's saver is swapped

Sam saw a flicker and "two savers" (back to Home, then another look). Cause: our saver starts after 2 min idle; tvpower launches LG's (invisible) saver about a minute later, saver-take.sh closes it and launches Home again, so the page got hidden and/or `webOSRelaunch`, `saverStop()` ran, then `/api/saver/take` said yes and `saverStart()` picked the NEXT look of the rotation. Now (app.js): a hide only stops the saver after 3 s if the page is still hidden (`onHide.t`), showing again while the saver is on just cancels that; `webOSRelaunch` while the saver is on first asks `saverTake()` (cached 5 s, so the two events can share one answer) and keeps the saver as it is when the relaunch was the swap. A real Home key still stops it (keys stop the saver before the relaunch; take is false otherwise). Tested in headless Chromium with the mock: swap relaunch -> same look stays on; relaunch with take=false -> saver off. Not yet seen on the TV. Undo: revert the commit.

### 2026.11.06.21 - Short app names that stay on screen

`app.js`: `shortName()` (tile label only): `CFG.nameByTitle` override (`M6 TV Replay Streaming` -> `M6+`), else the store title cut at ` - `, ` – `, ` : `, ` | ` or `(`; runs of 5+ capitals become normal case (`CANAL+` -> `Canal+`; `HDMI`, `TV`, `TF1` untouched). `fitName()` (called from `focusItem`) slides the focused label (`position:relative; left`) so it stays 4 rem inside the screen edges. `index.html`: label `max-width:40rem` with an ellipsis. Tested in the preview (first icon of a row, last icon, very long name). Undo: revert the commit.

### 2026.11.06.22 - Swap: no Home relaunch when our saver is already on
- Complements the page fix of .20 (Sam's "deux veilles"): tvpower's own idle timer launches LG's (invisible) saver while ours is running.
- `saver-take.sh`: notes whether ours was on (fresh `/tmp/saver-on`, or `/tmp/saver-off.at` stamped by `backlight.sh restore` in the last 6 s if the
  page already stopped it). Then, after closing LG's saver, it writes `/tmp/saver-now` but does not relaunch Home: it waits up to 3 s; taken = the
  page came back and kept / restarted ours; ours still on = nothing to do (`saver-now` removed); otherwise it relaunches Home as before. Logs say which.
- `backlight.sh restore` writes `/tmp/saver-off.at` (uptime, RAM only) when our saver was on.
- Tested: sh -n, release-check. NOT yet on the TV. Undo: revert the commit.

### 2026.11.06.23 - No light edge on the focused icon

Sam: the lit top edge serves no purpose; the shadow is enough. Removed `.tile .ic:after` (inset light edge) from `index.html`. Undo: revert the commit.
