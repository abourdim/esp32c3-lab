# 🤖 esp32c3-lab

Minimal **clone of [maqueen-lab](https://github.com/abourdim/maqueen-lab)** adapted for the **ESP32-C3 SuperMini** (Robot-01 v3 hardware).

Six single-purpose web labs that talk to your robot over Web Bluetooth (Nordic UART Service). Same protocol vocabulary as maqueen-lab — only the hardware behind it differs.

> **🌐 Live:** https://abourdim.github.io/esp32c3-lab/
> **📋 Plan / spec:** [`plan.html`](plan.html) · [`PLAN.md`](PLAN.md)

---

## What's in here

| | |
|---|---|
| 🕹️ [Drive](labs/drive-lab.html) | Joystick → motors |
| ⚙️ [Servo](labs/servo-lab.html) | Two sliders + sweep (J4 / J5) |
| 💡 [LEDs](labs/leds-lab.html) | 4 status LEDs (D5–D8) |
| 🌈 [NeoPixels](labs/neopixels-lab.html) | 4 RGB pixels (D1–D4) |
| 📡 [Distance](labs/distance-lab.html) | Live HC-SR04 reading |
| 🎹 [Buzzer](labs/buzzer-lab.html) | Piano + freq sweep |

Plus the firmware sketch in [`firmware/`](firmware/) and a Python static server in [`tools/`](tools/serve.py).

---

## Hardware

ESP32-C3 SuperMini · Robot-01 v3 PCB · uses the v3 schematic pin map (full pinout in [`firmware/README.md`](firmware/README.md) and [`plan.html` § 3](plan.html#mapping)).

Source schematic, PCB, BOM all live in [`abourdim/robot_1` → `02_hardware/v3/`](https://github.com/abourdim/robot_1/tree/master/02_hardware/v3) — this repo is **firmware + web app only**.

---

## Quick start

### 1 · Flash the firmware

```bash
cd firmware/
pio run -t upload --upload-port COM8     # Windows — find your port via `pio device list`
```

Or in Arduino IDE: open `firmware/esp32c3-lab.ino` (Board: *ESP32C3 Dev Module*, USB CDC on Boot: *Enabled*).

After boot the four NeoPixels do a rainbow swirl. The board now advertises as `esp32c3-lab` over BLE.

### 2 · Open the web app

Either:

- **Live:** https://abourdim.github.io/esp32c3-lab/ — Chrome / Edge only (Web Bluetooth)
- **Local:**
  ```bash
  ./serve.sh           # → http://localhost:8000
  ```
  (or `serve.bat` on Windows · `python tools/serve.py` cross-platform)

### 3 · Connect

Click **Connect** in the header → pick `esp32c3-lab` from the picker → start playing.

---

## Browser support

Web Bluetooth (used everywhere here for BLE) works in:

| Browser | Status |
|---|---|
| Chrome 89+ | ✅ |
| Edge 89+ | ✅ |
| Opera 76+ | ✅ |
| Brave | ✅ (need to enable in settings) |
| Firefox | ❌ — Mozilla considers Web Bluetooth too privacy-invasive |
| Safari | ❌ — not implemented |

---

## Protocol — same verbs as maqueen-lab

Line-based ASCII over Nordic UART Service `6e400001-b5a3-f393-e0a9-e50e24dcca9e`. 20-byte chunked. Full reference in [`plan.html` § 2](plan.html#protocol).

```
M:80,80          drive (left%, right%) -100..100
M:STOP           halt motors
SRV:1,90         servo i (1..2) → angle (0..180)
SWEEP:1,0,180,1500   sweep servo
LED:0,1          simple LED i (0..3) on/off
RGB:0,255,0,0    NeoPixel idx → r,g,b
RGB:ALL,0,128,0  paint all 4
RGB:CLEAR        all off
BUZZ:440,200     play freq Hz for ms
BUZZ:OFF         stop
DIST:?           one ultrasonic reading
STREAM:on/off    enable/disable telemetry
HELLO            replies HELLO:<version>
```

---

## File tree

```
esp32c3-lab/
├── README.md · PLAN.md · plan.html        ← docs
├── index.html · manifest.json · sw.js     ← landing + PWA
├── assets/styles.css                      ← 4 themes
├── js/   ble.js · protocol.js · i18n.js · ui.js · lab-shell.js
├── labs/ drive · servo · leds · neopixels · distance · buzzer (-lab.html)
├── firmware/  esp32c3-lab.ino · platformio.ini · README.md
├── tools/serve.py · serve.bat / serve.sh
└── .github/workflows/pages.yml            ← auto-deploy
```

---

## Themes & languages

- 4 themes via the picker: `paper` (default) · `steel` · `forest` · `carbon`
- 3 languages: EN / FR / AR (with RTL on Arabic)

Both stored in `localStorage` so the choice carries across pages.

---

## Roadmap (v0.2+)

Out of scope for v0.1 — see [`plan.html` § 9](plan.html#deferred):

- Cockpit Lab (skeuomorphic dashboards)
- Living Twin (cartoon mirror)
- Voice Tour, Mission Mode
- Workshops printables
- Playwright tests
- Battery monitoring (needs hardware ADC divider)

---

## License

MIT.

Adapted from [maqueen-lab](https://github.com/abourdim/maqueen-lab) by abourdim.
Robot-01 hardware: [abourdim/robot_1](https://github.com/abourdim/robot_1).
