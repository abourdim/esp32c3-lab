# esp32c3-lab — v0.1 plan

A minimal clone of [maqueen-lab](https://github.com/abourdim/maqueen-lab) adapted
for the ESP32-C3 SuperMini (Robot-01 hardware, v3 schematic).

> Status: **PLANNING — no code yet pending approval.**
> One file already created during the earlier "go" exchange: `assets/styles.css`.
> If this plan is rejected, that file is the only cleanup needed.

---

## 1 · Goals

- **6 labs** — same set & names as maqueen-lab's primary capabilities:
  `drive · servo · leds · neopixels · distance · buzzer`
- **BLE** transport using **Nordic UART Service (NUS)** —
  same UUIDs, same chunking (20-byte MTU), same line-based ASCII protocol.
- **Same command vocabulary** as maqueen-lab (verb prefixes: `M:`, `SRV:`, `LED:`,
  `RGB:`, `BUZZ:`, `DIST:` etc.), so any maqueen lab page that doesn't depend
  on micro:bit-specific surfaces (matrix, A/B button) can be ported with
  near-zero JS changes.
- Fully **standalone repo** at `github.com/abourdim/esp32c3-lab`, public,
  GitHub Pages auto-deploy.

---

## 2 · BLE protocol — copied from maqueen-lab

### Service / characteristics

| | UUID |
|---|---|
| **Service** (Nordic UART) | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| **TX (write)** — browser → device | `6e400002-…` |
| **RX (notify)** — device → browser | `6e400003-…` |

ESP32-C3 firmware uses NimBLE-Arduino to advertise the service.
Browser uses Web Bluetooth (`navigator.bluetooth.requestDevice`).
Chrome / Edge only. (Firefox & Safari don't support Web Bluetooth.)

### Wire format

Plain ASCII, lines terminated by `\n`. Each line = one command (TX) or one
event (RX). Long lines chunked at 20-byte BLE MTU on the TX side.

**TX → device:**
```
M:80,80          ← drive motors (left%, right%)  [-100..100]
M:STOP           ← halt motors
SRV:1,90         ← servo (index 1..2, angle 0..180)
SWEEP:1,0,180,1500 ← sweep servo i from a to b over T ms
LED:1,1          ← simple LED (index 0..3, 0=off / 1=on)
RGB:0,255,0,0    ← NeoPixel set (idx, r, g, b)
RGB:ALL,0,128,0  ← all 4 NeoPixels green
RGB:CLEAR        ← all off
BUZZ:440,200     ← play freq Hz for duration ms
BUZZ:OFF         ← stop tone
DIST:?           ← request a single ultrasonic reading
STREAM:on        ← enable telemetry streaming (battery, button, etc.)
STREAM:off       ← disable
HELLO            ← (built-in) firmware replies HELLO:<version>
FW:?             ← (built-in) firmware replies FW:<version>,<caps>
```

**RX ← device:**
```
INFO:CONNECTED   ← greeting
HELLO:0.1.0      ← reply to HELLO
FW:0.1.0,M+S+L+R+B+D ← capabilities
DIST:37          ← distance in cm; "-" = no reading
DIST:-
ECHO:<seq> <verb> ← echo of the command (sequenced)
ERR:<seq> <reason>
BTN:1            ← SW1 (GPIO 0) pressed (only if STREAM:on)
BTN:0            ← released
BATT:3.86        ← battery voltage update (telemetry)
```

### Sequencing & echo (optional, maqueen pattern)

If a TX line begins with a sequence number followed by space —
`12 M:80,80` — firmware echoes `ECHO:12 M:80,80`. The browser uses this
to confirm delivery. The `js/ble-scheduler.js` from maqueen handles this;
we replicate.

For v0.1, sequence numbers are **optional** — labs can fire-and-forget.

---

## 3 · Firmware mapping (maqueen verb → Robot-01 hardware)

Per v3 schematic. Same maqueen command, different physical pins.

| Verb | Maqueen action (micro:bit) | Robot-01 action (ESP32-C3) |
|---|---|---|
| `M:left,right` | I²C 0x10 motor regs | TB6612FNG: `AIN1`/`AIN2`/`PWMA` (GPIO 1/2/3) for left, `BIN1`/`BIN2`/`PWMB` (GPIO 6/7/10) for right |
| `M:STOP` | both = 0 | brake both motors |
| `SRV:i,angle` | I²C 0x14 / 0x15 (S1/S2) | LEDC PWM 50 Hz on GPIO 6 (J4 = servo 1) or GPIO 10 (J5 = servo 2) ⚠ shares pins with motor B — see § 7 |
| `LED:i,on` | digital P8 / P12 | discrete LEDs D5–D8 (GPIO 1, 10) — note: shared with motor pins, brightness reflects motor PWM |
| `RGB:i,r,g,b` | I²C 0x32 register | FastLED on GPIO 5 → onboard NeoPixel chain D1→D2→D3→D4 |
| `RGB:ALL,r,g,b` | broadcast | `fill_solid()` |
| `BUZZ:f,ms` | `music.playTone()` on P0 | `ledcWriteTone()` on GPIO 4 (transistor stage) |
| `BUZZ:OFF` | `music.stopAllSounds()` | `ledcWrite(0)` |
| `DIST:?` | `sonarbit.getDistance()` P1/P2 | `pulseIn(ECHO)` after `digitalWrite(TRIG)` on J6 (GPIO 20/21) |
| `STREAM:on/off` | toggles periodic broadcast | toggles 100 ms loop posting BTN/BATT |
| `HELLO` / `FW:?` | reply with version | reply with `0.1.0` and caps string |

---

## 4 · File tree (~22 files)

```
esp32c3-lab/
├── README.md                     ← overview · live URL · quick start · BLE notes
├── PLAN.md                       ← this file (will become CHANGELOG eventually)
├── package.json                  ← minimal — npm run serve wraps tools/serve.py
├── manifest.json                 ← PWA manifest (icon, name, theme-color)
├── sw.js                         ← minimal offline-cache service worker
├── .gitignore                    ← .pio/, .vscode/, secrets, etc.
├── .nojekyll                     ← (empty) tells GitHub Pages not to Jekyll-process
├── index.html                    ← landing — 6 lab cards, connect button, theme/lang pickers
├── assets/
│   └── styles.css                ← ✅ ALREADY WRITTEN — 4 themes (paper / steel / forest / carbon) + UI components
├── js/
│   ├── ble.js                    ← Web Bluetooth NUS — connect, write, notify, reconnect, log mirror
│   ├── ble-scheduler.js          ← serializes writes (avoid GATT-busy errors); seq# / echo
│   ├── protocol.js               ← high-level senders: drive(l,r), servo(i,a), led(i,s), rgb(i,r,g,b), buzz(f,ms), distRequest()
│   ├── lab-shell.js              ← injects shared chrome (header, status pill, message log) into each lab page
│   ├── i18n.js                   ← EN / FR / AR strings; RTL toggle on AR
│   └── ui.js                     ← theme picker, lang picker, status pill, log scroll
├── labs/
│   ├── drive-lab.html            ← virtual joystick → M:left,right
│   ├── servo-lab.html            ← two sliders → SRV:1,a / SRV:2,a + sweep buttons
│   ├── leds-lab.html             ← four toggles for D5–D8 → LED:i,s
│   ├── neopixels-lab.html        ← four colour pickers + ALL/CLEAR → RGB:i,r,g,b
│   ├── distance-lab.html         ← live bar + numeric, polls DIST:? at 5 Hz
│   └── buzzer-lab.html           ← piano keys (8 notes) + freq/duration sliders → BUZZ:f,ms
├── firmware/
│   ├── esp32c3-lab.ino           ← Arduino sketch — NimBLE NUS server + parser + hardware drivers
│   ├── platformio.ini            ← pinned platform 6.7.0 + libs (NimBLE, FastLED, ESP32Servo)
│   └── README.md                 ← wiring notes · flashing instructions · troubleshooting
├── tools/
│   └── serve.py                  ← Python stdlib http.server → http://localhost:8000
├── serve.bat                     ← Windows launcher (calls tools/serve.py)
├── serve.sh                      ← *nix launcher
└── .github/
    └── workflows/
        └── pages.yml             ← deploy index.html + labs/ + js/ + assets/ to gh-pages
```

---

## 5 · Lab pages — one-line spec each

| Lab | UI | TX commands | RX consumed |
|---|---|---|---|
| **drive-lab** | round joystick (drag/tap) + STOP button | `M:l,r` continuously while dragging (throttled 50 ms); `M:STOP` on release | none |
| **servo-lab** | two sliders + preset buttons (0° / 90° / 180° / sweep) | `SRV:1,a`, `SRV:2,a`, `SWEEP:i,a,b,t` | `SWP:port,angle` echo |
| **leds-lab** | 4 toggle cards for D5–D8 + "all on" / "all off" | `LED:i,1` / `LED:i,0` | none |
| **neopixels-lab** | 4 colour pickers + ALL/CLEAR + 6 preset palettes | `RGB:i,r,g,b`, `RGB:ALL,r,g,b`, `RGB:CLEAR` | none |
| **distance-lab** | big numeric (cm) + horizontal bar + sparkline (last 60 readings) | `DIST:?` polled at 5 Hz | `DIST:<n>` / `DIST:-` |
| **buzzer-lab** | piano (C-D-E-F-G-A-B-C) + freq slider 50–2000 Hz + duration slider 50–2000 ms | `BUZZ:f,ms`, `BUZZ:OFF` | none |

Every lab inherits from `lab-shell.js`:
- top header (title, back link, theme picker, lang picker, status pill)
- right rail (or bottom on mobile) with TX/RX **Message Log**
- BLE connection state banner ("Connect" → "Connecting…" → "Connected to ESP32-C3 [xxxxxx]")

---

## 6 · UI conventions

- **4 themes**: `paper` (default, kid-friendly cream), `steel` (pro dark), `forest` (calm green), `carbon` (cyberpunk).
- **3 languages**: EN / FR / AR with **RTL** layout on AR.
- **Status pill**: red dot = disconnected, green pulsing = connected.
- **Message log**: timestamps + colour by type (TX = blue, RX = green, ERR = red, INFO = grey). Clear / Copy buttons.
- **PWA**: installable from desktop or mobile. SW caches the app shell + js + css for offline use (BLE itself doesn't need network).

---

## 7 · Hardware caveats (need to acknowledge in firmware + lab UI)

These come from the v3 schematic — robot_1's hardware audit page documents the same.

1. **Servo / motor pin sharing** — J4 (GPIO 6) and J5 (GPIO 10) host both
   TB6612FNG `BIN1` & `PWMB` AND the servo headers. Cannot drive motor B
   AND a servo at the same time. Firmware enters one of two modes at boot,
   selectable via a `MODE:motors` or `MODE:servos` command (default: motors).
2. **GPIO 3 = PWMA + J3** — same pin drives motor A speed AND any device
   plugged into J3. Don't plug servos into J3 if you also want motor A.
3. **GPIO 8/9 = I²C** — used by OLED in the v3 board, but the lab firmware
   doesn't drive the OLED (yet). Free for I²C peripherals if needed.
4. **GPIO 0 = SW1 push button** — read by firmware, broadcast as `BTN:1/0` events.
5. **Battery monitoring** — no ADC pin wired in v3; firmware reports `BATT:?` and
   v0.1 returns a stub value. Future v0.2 needs a battery divider on a free GPIO.

---

## 8 · Build / deploy

| Step | Command |
|---|---|
| Local serve | `./serve.sh` (or `serve.bat`) → http://localhost:8000 |
| Flash firmware | open `firmware/esp32c3-lab.ino` in Arduino IDE OR `pio run -t upload` |
| Push | `git push` → GitHub Action mirrors to `gh-pages` branch |
| Live | https://abourdim.github.io/esp32c3-lab/ |

---

## 9 · Out of v0.1 (deferred to v0.2+)

- Cockpit Lab (skeuomorphic dashboards)
- Living Twin (cartoon mirror page)
- Voice Tour, Mission Mode, confetti
- Workshops/ printable PDFs
- Playwright tests
- IR receiver, line sensors (no IR hardware on v3 schematic)
- A/B button matrix (micro:bit-specific, no equivalent on the C3 board)
- OLED status mirroring
- I2C addon discovery (`ADDON:LIST`)
- Battery level (needs a hardware revision with an ADC divider)
- 5×5 LED matrix (`CMD:` and `LM:` verbs from maqueen) — not on this hardware

---

## 10 · Open questions for you to confirm

1. **Default theme** — `paper` (light, classroom-ready) or `steel` (dark, workshop-ready)?
   *Default chosen: `paper`.*
2. **App title shown in the header** — `ESP32-C3 Lab` or `Robot-01 Lab` or something else?
   *Default chosen: `ESP32-C3 Lab`.*
3. **Sequence numbers** — every TX gets a `<seq> ` prefix and waits for `ECHO:<seq>` before sending the next, OR fire-and-forget for v0.1?
   *Default chosen: fire-and-forget. Sequencing infra in `ble-scheduler.js` is wired but disabled.*
4. **Servo / motor mode** — does the firmware ship in motor mode by default (servos won't respond on J4/J5 until `MODE:servos` is sent), or detect at runtime?
   *Default chosen: motor mode at boot. Servo lab issues `MODE:servos` on first SRV: command.*
5. **GitHub repo** — create `github.com/abourdim/esp32c3-lab` (public, gh-pages on master) on first push?
   *Default chosen: yes, public.*

---

## 11 · How to proceed

Reply with:
- **`go`** → I build files in this exact order and push:
  1. firmware sketch + platformio.ini
  2. js/ble.js + ble-scheduler.js + protocol.js
  3. js/lab-shell.js + i18n.js + ui.js
  4. index.html
  5. 6 labs in order: drive · neopixels · distance · buzzer · leds · servo
  6. PWA bits (manifest, sw, .nojekyll)
  7. tools/serve.py + launchers
  8. README + .gitignore + workflow
  9. git init · gh repo create · push · verify live URL
- **`go but X`** → tweak (e.g. `go but only 3 labs first`, `go but steel default`, `go but no PWA`)
- **`stop`** → discard the plan and `assets/styles.css`
- **questions** → I'll answer without writing code

