# Firmware — esp32c3-lab v0.1.0

Exposes a Nordic UART Service over BLE on the ESP32-C3 SuperMini.
Browser sends ASCII line commands, firmware drives the v3 hardware,
and replies / streams telemetry.

## Build with PlatformIO

```
cd firmware/
pio run                      # compile
pio run -t upload --upload-port COM8   # flash (Windows)
pio device monitor -b 115200            # watch the boot log
```

`platformio.ini` already pins:

- `platform = espressif32 @ 6.7.0` (ESP-IDF 5.1 — fixes the RMT bug)
- `fastled/FastLED @ ^3.7.0`
- `madhephaestus/ESP32Servo`
- `h2zero/NimBLE-Arduino`

## Build with Arduino IDE

1. Install the **esp32 by Espressif Systems** boards package via Boards Manager.
2. Install libraries (Library Manager):
   - **NimBLE-Arduino** (h2zero)
   - **FastLED**
   - **ESP32Servo** (Kevin Harrington / madhephaestus)
3. Open `esp32c3-lab.ino`.
4. Tools menu:
   - **Board:** ESP32C3 Dev Module
   - **USB CDC On Boot:** Enabled
   - **Upload Speed:** 921600
   - **Partition Scheme:** Huge APP (3 MB) — optional
5. Pick your COM port → Upload.

If upload fails: hold **BOOT**, tap **RESET**, release **BOOT**, retry. (See `01_robot_1` audit BUG-005.)

## Verify

After boot, the four NeoPixels do a rainbow swirl for ~200 ms.
On a serial monitor (or via the web app's message log) you should see:

```
[esp32c3-lab] Advertising as 'esp32c3-lab' on NUS.
INFO:CONNECTED               (after the browser pairs)
HELLO:0.1.0                  (in response to HELLO)
FW:0.1.0,M+S+L+R+B+D         (in response to FW:?)
```

## Pin map (v3 schematic)

| Pin    | Role |
|--------|---|
| GPIO 0  | SW1 button (input pull-up) |
| GPIO 1  | TB6612FNG `AIN1` |
| GPIO 2  | TB6612FNG `AIN2` |
| GPIO 3  | TB6612FNG `PWMA` |
| GPIO 4  | Buzzer (transistor stage R7/R8/R9) |
| GPIO 5  | NeoPixel D1→D2→D3→D4 chain |
| GPIO 6  | TB6612FNG `BIN1` (or J4 servo signal in servo mode) |
| GPIO 7  | TB6612FNG `BIN2` |
| GPIO 10 | TB6612FNG `PWMB` (or J5 servo signal in servo mode) |
| GPIO 20 | HC-SR04 ECHO (via R4/R5 divider) |
| GPIO 21 | HC-SR04 TRIG |

GPIO 8/9 are I²C SDA/SCL (OLED) — not driven by this firmware.

## Servo / motor mode

J4 (GPIO 6) and J5 (GPIO 10) are dual-purpose: motor-driver pins **and** servo-header signal lines. The firmware boots in **motor mode**. The first `SRV:` command from the web app switches to **servo mode**, detaches the LEDC PWM, and attaches `Servo` objects to those pins.

Switch back: send `MODE:motors` or reset the board.

## Command vocabulary

See `../plan.html` § 2 for the full list. Quick reference:

```
M:l,r            drive motors (left%, right% in -100..100)
M:STOP           halt
SRV:i,a          servo i (1 or 2) to angle a (0..180)
SWEEP:i,a,b,ms   sweep servo i from a to b over ms
LED:i,on         simple LED i on/off
RGB:i,r,g,b      one NeoPixel
RGB:ALL,r,g,b    all four NeoPixels
RGB:CLEAR        all off
BUZZ:f,ms        play freq Hz for duration ms
BUZZ:OFF         stop
DIST:?           one-shot ultrasonic reading
STREAM:on/off    enable/disable telemetry (BTN, BATT)
MODE:motors      back to motor mode
MODE:servos      enter servo mode
HELLO            firmware replies HELLO:0.1.0
FW:?             firmware replies FW:0.1.0,M+S+L+R+B+D
```

Optional `<seq> ` prefix on any line; firmware echoes `ECHO:<seq> <verb>` if present.
