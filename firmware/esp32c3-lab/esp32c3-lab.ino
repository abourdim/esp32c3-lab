/* ═══════════════════════════════════════════════════════════
   esp32c3-lab firmware — v0.1.0
   ═══════════════════════════════════════════════════════════
   ESP32-C3 SuperMini · Robot-01 v3 schematic
   Exposes a Nordic UART Service (NUS) over BLE.
   Browser sends ASCII line commands; firmware parses + drives
   hardware; replies with ECHO/INFO/DIST/etc.

   Build: PlatformIO + platformio.ini in this folder, OR
   Arduino IDE (Board: "ESP32C3 Dev Module", USB CDC on Boot: Enabled).

   Libraries needed:
     - h2zero/NimBLE-Arduino    (BLE)
     - fastled/FastLED          (NeoPixels)
     - madhephaestus/ESP32Servo (servos)
   ═══════════════════════════════════════════════════════════ */

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <FastLED.h>
#include <ESP32Servo.h>

// ─── Pin map (v3 schematic) ─────────────────────────────────
#define PIN_BTN     0
#define PIN_AIN1    1
#define PIN_AIN2    2
#define PIN_PWMA    3
#define PIN_BUZZER  4
#define PIN_NEOPX   5
#define PIN_BIN1    6   // shared with J4 servo signal
#define PIN_BIN2    7
// 8, 9 = OLED I2C (unused here)
#define PIN_PWMB    10  // shared with J5 servo signal
#define PIN_TRIG    21  // J6 ultrasonic trig
#define PIN_ECHO    20  // J6 ultrasonic echo (via R4/R5 divider)

// ─── Capabilities / version ────────────────────────────────
#define FW_VERSION "0.1.0"
#define FW_CAPS    "M+S+L+R+B+D"  // Motor / Servo / Led / Rgb / Buzz / Distance

// ─── NUS UUIDs ─────────────────────────────────────────────
#define NUS_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define NUS_TX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // browser writes here
#define NUS_RX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // browser subscribes here

// ─── NeoPixel state ────────────────────────────────────────
#define NUM_PIXELS 4
CRGB pixels[NUM_PIXELS];

// ─── Servo objects (created on demand in servo mode) ───────
Servo servo1, servo2;
bool servoMode = false;   // false = motors live; true = servos live (motor B disabled)

// ─── PWM channels (LEDC) ───────────────────────────────────
#define LEDC_PWMA   0
#define LEDC_PWMB   1
#define LEDC_BUZZER 2
#define MOTOR_FREQ  20000
#define BUZZER_FREQ_DEFAULT 1000
#define MOTOR_RES   8        // 8-bit duty (0..255)

// ─── BLE state ─────────────────────────────────────────────
NimBLECharacteristic *txCharacteristic = nullptr;   // we NOTIFY out
NimBLECharacteristic *rxCharacteristic = nullptr;   // we receive on
bool bleConnected = false;
bool streamOn = false;
String rxBuffer = "";

// ─── Last broadcast cache (for telemetry) ──────────────────
int lastBtn = -1;
unsigned long lastTelemetry = 0;

// ═══════════════════════════════════════════════════════════
//  utility — send a line back to the browser
// ═══════════════════════════════════════════════════════════
void sendLine(const String &line) {
  if (!txCharacteristic || !bleConnected) return;
  String full = line + "\n";
  // Notify in 20-byte chunks to be safe
  size_t off = 0;
  while (off < full.length()) {
    size_t end = min<size_t>(off + 20, full.length());
    txCharacteristic->setValue((uint8_t*)full.c_str() + off, end - off);
    txCharacteristic->notify();
    off = end;
  }
}

// ═══════════════════════════════════════════════════════════
//  motors (TB6612FNG)
// ═══════════════════════════════════════════════════════════
void motorBrake() {
  digitalWrite(PIN_AIN1, LOW); digitalWrite(PIN_AIN2, LOW);
  ledcWrite(LEDC_PWMA, 0);
  if (!servoMode) {
    digitalWrite(PIN_BIN1, LOW); digitalWrite(PIN_BIN2, LOW);
    ledcWrite(LEDC_PWMB, 0);
  }
}

void setMotorA(int speedPct) {
  speedPct = constrain(speedPct, -100, 100);
  if (speedPct == 0) {
    digitalWrite(PIN_AIN1, LOW); digitalWrite(PIN_AIN2, LOW);
    ledcWrite(LEDC_PWMA, 0);
  } else if (speedPct > 0) {
    digitalWrite(PIN_AIN1, HIGH); digitalWrite(PIN_AIN2, LOW);
    ledcWrite(LEDC_PWMA, map(speedPct, 0, 100, 0, 255));
  } else {
    digitalWrite(PIN_AIN1, LOW); digitalWrite(PIN_AIN2, HIGH);
    ledcWrite(LEDC_PWMA, map(-speedPct, 0, 100, 0, 255));
  }
}

void setMotorB(int speedPct) {
  if (servoMode) return;   // can't drive motor B in servo mode
  speedPct = constrain(speedPct, -100, 100);
  if (speedPct == 0) {
    digitalWrite(PIN_BIN1, LOW); digitalWrite(PIN_BIN2, LOW);
    ledcWrite(LEDC_PWMB, 0);
  } else if (speedPct > 0) {
    digitalWrite(PIN_BIN1, HIGH); digitalWrite(PIN_BIN2, LOW);
    ledcWrite(LEDC_PWMB, map(speedPct, 0, 100, 0, 255));
  } else {
    digitalWrite(PIN_BIN1, LOW); digitalWrite(PIN_BIN2, HIGH);
    ledcWrite(LEDC_PWMB, map(-speedPct, 0, 100, 0, 255));
  }
}

// ═══════════════════════════════════════════════════════════
//  mode switching
// ═══════════════════════════════════════════════════════════
void enterServoMode() {
  if (servoMode) return;
  motorBrake();
  // detach motor B PWM, attach servo objects on the same pins
  ledcDetachPin(PIN_PWMB);
  pinMode(PIN_BIN1, INPUT);   // park
  pinMode(PIN_BIN2, INPUT);
  servo1.attach(PIN_BIN1);    // J4 = servo 1 = GPIO 6
  servo2.attach(PIN_PWMB);    // J5 = servo 2 = GPIO 10
  servoMode = true;
  sendLine("INFO:MODE=servos");
}

void enterMotorMode() {
  if (!servoMode) return;
  servo1.detach();
  servo2.detach();
  pinMode(PIN_BIN1, OUTPUT);
  pinMode(PIN_BIN2, OUTPUT);
  ledcAttachPin(PIN_PWMB, LEDC_PWMB);
  ledcSetup(LEDC_PWMB, MOTOR_FREQ, MOTOR_RES);
  servoMode = false;
  sendLine("INFO:MODE=motors");
}

// ═══════════════════════════════════════════════════════════
//  ultrasonic
// ═══════════════════════════════════════════════════════════
float readDistanceCm() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  unsigned long pulse = pulseIn(PIN_ECHO, HIGH, 30000UL);   // 30 ms timeout
  if (pulse == 0) return -1.0f;
  return pulse / 58.0f;   // microseconds → cm
}

// ═══════════════════════════════════════════════════════════
//  command parser
// ═══════════════════════════════════════════════════════════
void handleLine(const String &lineIn) {
  String line = lineIn;
  line.trim();
  if (line.length() == 0) return;

  // Optional sequence number prefix: "<seq> <verb...>"
  int seq = -1;
  int sp = line.indexOf(' ');
  if (sp > 0 && line.substring(0, sp).length() <= 5) {
    bool numeric = true;
    for (size_t i = 0; i < (size_t)sp; i++) if (!isDigit(line[i])) { numeric = false; break; }
    if (numeric) { seq = line.substring(0, sp).toInt(); line = line.substring(sp + 1); }
  }

  // ── HELLO / FW:? ──
  if (line == "HELLO") {
    sendLine(String("HELLO:") + FW_VERSION);
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " HELLO");
    return;
  }
  if (line == "FW:?") {
    sendLine(String("FW:") + FW_VERSION + "," + FW_CAPS);
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " FW:?");
    return;
  }

  // ── M:left,right or M:STOP ──
  if (line.startsWith("M:")) {
    String args = line.substring(2);
    if (args == "STOP") {
      motorBrake();
    } else {
      int comma = args.indexOf(',');
      if (comma > 0) {
        int l = args.substring(0, comma).toInt();
        int r = args.substring(comma + 1).toInt();
        setMotorA(l);
        setMotorB(r);
      }
    }
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " " + line);
    return;
  }

  // ── SRV:i,angle ──
  if (line.startsWith("SRV:")) {
    if (!servoMode) enterServoMode();
    String args = line.substring(4);
    int comma = args.indexOf(',');
    if (comma > 0) {
      int idx = args.substring(0, comma).toInt();
      int ang = args.substring(comma + 1).toInt();
      if (idx == 1) servo1.write(constrain(ang, 0, 180));
      else if (idx == 2) servo2.write(constrain(ang, 0, 180));
    }
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " " + line);
    return;
  }

  // ── SWEEP:i,from,to,ms ──
  if (line.startsWith("SWEEP:")) {
    if (!servoMode) enterServoMode();
    int p1 = line.indexOf(',', 6);
    int p2 = line.indexOf(',', p1 + 1);
    int p3 = line.indexOf(',', p2 + 1);
    if (p1 > 0 && p2 > 0 && p3 > 0) {
      int idx  = line.substring(6, p1).toInt();
      int from = line.substring(p1 + 1, p2).toInt();
      int to   = line.substring(p2 + 1, p3).toInt();
      int ms   = line.substring(p3 + 1).toInt();
      const int steps = 30;
      int stepMs = max(1, ms / (2 * steps));
      Servo *s = (idx == 1) ? &servo1 : &servo2;
      for (int i = 0; i <= steps; i++) {
        int ang = from + (to - from) * i / steps;
        s->write(constrain(ang, 0, 180));
        delay(stepMs);
      }
      for (int i = steps; i >= 0; i--) {
        int ang = from + (to - from) * i / steps;
        s->write(constrain(ang, 0, 180));
        delay(stepMs);
      }
      sendLine(String("SWP:") + idx + ",done");
    }
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " " + line);
    return;
  }

  // ── LED:i,on ── (note: hardware-shared with motor pins; on the v3 board these
  // toggles light up automatically when motors run. We expose the verb but
  // explicit ON only succeeds if motors are idle.)
  if (line.startsWith("LED:")) {
    String args = line.substring(4);
    int comma = args.indexOf(',');
    if (comma > 0) {
      int idx = args.substring(0, comma).toInt();
      int on  = args.substring(comma + 1).toInt();
      // best-effort: drive AIN1 / PWMB direction lines
      if (idx == 0 || idx == 1) {
        digitalWrite(PIN_AIN1, on ? HIGH : LOW);
      } else if (idx == 2 || idx == 3) {
        if (!servoMode) ledcWrite(LEDC_PWMB, on ? 80 : 0);
      }
    }
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " " + line);
    return;
  }

  // ── RGB:i,r,g,b  /  RGB:ALL,r,g,b  /  RGB:CLEAR ──
  if (line.startsWith("RGB:")) {
    String args = line.substring(4);
    if (args == "CLEAR") {
      FastLED.clear(); FastLED.show();
    } else if (args.startsWith("ALL,")) {
      String rgb = args.substring(4);
      int p1 = rgb.indexOf(','); int p2 = rgb.indexOf(',', p1 + 1);
      if (p1 > 0 && p2 > 0) {
        uint8_t r = rgb.substring(0, p1).toInt();
        uint8_t g = rgb.substring(p1+1, p2).toInt();
        uint8_t b = rgb.substring(p2+1).toInt();
        fill_solid(pixels, NUM_PIXELS, CRGB(r,g,b));
        FastLED.show();
      }
    } else {
      int p1 = args.indexOf(','); int p2 = args.indexOf(',', p1+1); int p3 = args.indexOf(',', p2+1);
      if (p1>0 && p2>0 && p3>0) {
        int idx = args.substring(0, p1).toInt();
        uint8_t r = args.substring(p1+1, p2).toInt();
        uint8_t g = args.substring(p2+1, p3).toInt();
        uint8_t b = args.substring(p3+1).toInt();
        if (idx >= 0 && idx < NUM_PIXELS) {
          pixels[idx] = CRGB(r, g, b);
          FastLED.show();
        }
      }
    }
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " " + line);
    return;
  }

  // ── BUZZ:f,ms  /  BUZZ:OFF ──
  if (line.startsWith("BUZZ:")) {
    String args = line.substring(5);
    if (args == "OFF") {
      ledcWrite(LEDC_BUZZER, 0);
    } else {
      int comma = args.indexOf(',');
      if (comma > 0) {
        int f  = args.substring(0, comma).toInt();
        int ms = args.substring(comma + 1).toInt();
        ledcWriteTone(LEDC_BUZZER, f);
        ledcWrite(LEDC_BUZZER, 128);   // 50 % duty
        delay(ms);
        ledcWrite(LEDC_BUZZER, 0);
      }
    }
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " " + line);
    return;
  }

  // ── DIST:? ──
  if (line == "DIST:?") {
    float cm = readDistanceCm();
    if (cm < 0) sendLine("DIST:-");
    else        sendLine("DIST:" + String(cm, 1));
    if (seq >= 0) sendLine("ECHO:" + String(seq) + " DIST:?");
    return;
  }

  // ── STREAM:on / off ──
  if (line == "STREAM:on")  { streamOn = true;  sendLine("STREAM:on");  if (seq>=0) sendLine("ECHO:"+String(seq)+" STREAM:on");  return; }
  if (line == "STREAM:off") { streamOn = false; sendLine("STREAM:off"); if (seq>=0) sendLine("ECHO:"+String(seq)+" STREAM:off"); return; }

  // ── MODE:motors / servos ──
  if (line == "MODE:motors") { enterMotorMode(); if (seq>=0) sendLine("ECHO:"+String(seq)+" "+line); return; }
  if (line == "MODE:servos") { enterServoMode(); if (seq>=0) sendLine("ECHO:"+String(seq)+" "+line); return; }

  // ── unknown ──
  sendLine("ERR:" + (seq >= 0 ? String(seq) : "?") + " unknown_verb " + line);
}

// ═══════════════════════════════════════════════════════════
//  BLE callbacks
// ═══════════════════════════════════════════════════════════
class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer)    override { bleConnected = true;  sendLine("INFO:CONNECTED"); }
  void onDisconnect(NimBLEServer* pServer) override {
    bleConnected = false; streamOn = false; motorBrake();
    NimBLEDevice::startAdvertising();   // re-advertise so a new client can connect
  }
};

class RxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pCharacteristic) override {
    std::string val = pCharacteristic->getValue();
    rxBuffer += String(val.c_str());
    int nl;
    while ((nl = rxBuffer.indexOf('\n')) >= 0) {
      String oneLine = rxBuffer.substring(0, nl);
      rxBuffer = rxBuffer.substring(nl + 1);
      handleLine(oneLine);
    }
    // safety: flush very long buffer (corrupted tx)
    if (rxBuffer.length() > 256) rxBuffer = "";
  }
};

// ═══════════════════════════════════════════════════════════
//  setup / loop
// ═══════════════════════════════════════════════════════════
void setup() {
  // Note: no Serial.begin() — Arduino-ESP32 2.0.16's symbol mapping for
  // the esp32-c3-devkitm-1 board variant doesn't expose `Serial` to user
  // code. Native USB CDC works without explicit init when
  // ARDUINO_USB_CDC_ON_BOOT=1 is set in build_flags. Firmware
  // communicates with the browser over BLE; no serial console needed.

  // Pin modes
  pinMode(PIN_BTN, INPUT_PULLUP);
  pinMode(PIN_AIN1, OUTPUT); pinMode(PIN_AIN2, OUTPUT);
  pinMode(PIN_BIN1, OUTPUT); pinMode(PIN_BIN2, OUTPUT);
  pinMode(PIN_TRIG, OUTPUT); pinMode(PIN_ECHO, INPUT);

  // PWM channels
  ledcSetup(LEDC_PWMA, MOTOR_FREQ, MOTOR_RES);
  ledcSetup(LEDC_PWMB, MOTOR_FREQ, MOTOR_RES);
  ledcSetup(LEDC_BUZZER, BUZZER_FREQ_DEFAULT, MOTOR_RES);
  ledcAttachPin(PIN_PWMA, LEDC_PWMA);
  ledcAttachPin(PIN_PWMB, LEDC_PWMB);
  ledcAttachPin(PIN_BUZZER, LEDC_BUZZER);

  motorBrake();

  // Servos — allow attaching any timer (ESP32Servo)
  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  ESP32PWM::allocateTimer(2);
  ESP32PWM::allocateTimer(3);

  // FastLED
  FastLED.addLeds<WS2812B, PIN_NEOPX, GRB>(pixels, NUM_PIXELS);
  FastLED.setBrightness(80);
  FastLED.clear(); FastLED.show();

  // BLE
  NimBLEDevice::init("esp32c3-lab");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  NimBLEServer *pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  NimBLEService *svc = pServer->createService(NUS_SERVICE_UUID);

  rxCharacteristic = svc->createCharacteristic(NUS_TX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rxCharacteristic->setCallbacks(new RxCallbacks());

  txCharacteristic = svc->createCharacteristic(NUS_RX_UUID, NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ);

  svc->start();

  // ── Advertisement packet engineering ──────────────────────────
  // BLE 4.x advertisement payload is 31 bytes max. The 128-bit NUS
  // service UUID alone is 16 + 2 = 18 bytes. The name 'esp32c3-lab'
  // is 11 + 2 = 13 bytes. Plus flags (3 bytes), the two together
  // exceed 31 bytes — NimBLE's default builder pushes the LATER-added
  // field (the name) into the scan-response packet. On Windows,
  // Chrome's Web Bluetooth filter doesn't reliably read scan-response
  // data, so a `namePrefix: 'esp32c3'` filter never matches.
  //
  // Fix: explicitly construct both packets.
  //   - Primary advertisement = flags + name only (compact, ~16 bytes)
  //   - Scan response          = the 128-bit service UUID
  // The browser sees 'esp32c3-lab' in the primary scan, the namePrefix
  // filter matches, and after pairing the NUS service is still
  // discoverable via getPrimaryService().

  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();

  NimBLEAdvertisementData advData;
  advData.setName("esp32c3-lab");
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  adv->setAdvertisementData(advData);

  NimBLEAdvertisementData scanData;
  scanData.setCompleteServices(NimBLEUUID(NUS_SERVICE_UUID));
  adv->setScanResponseData(scanData);

  // NB: don't set MinInterval/MaxInterval below 0x20 (20 ms). The BLE
  // spec rejects faster intervals for undirected advertising and NimBLE
  // silently refuses to start. NimBLE's defaults (~100 ms) are fine.

  adv->start();

  // (boot complete — firmware now advertising as 'esp32c3-lab' on NUS)

  // Boot: rainbow 1-frame swirl on the NeoPixels
  for (int i = 0; i < NUM_PIXELS; i++) pixels[i] = CHSV(i * 64, 255, 200);
  FastLED.show();
  delay(200);
  FastLED.clear(); FastLED.show();
}

void loop() {
  // Telemetry — at 10 Hz when streamOn
  unsigned long now = millis();
  if (streamOn && now - lastTelemetry > 100) {
    lastTelemetry = now;
    int b = (digitalRead(PIN_BTN) == LOW) ? 1 : 0;   // active-low (pull-up)
    if (b != lastBtn) {
      sendLine(String("BTN:") + b);
      lastBtn = b;
    }
    // Battery (stub — no ADC divider on v3)
    static int counter = 0;
    if (++counter % 30 == 0) sendLine("BATT:?");
  }
}
