/* ═══════════════════════════════════════════════════════════
   protocol.js — high-level command builders
   ═══════════════════════════════════════════════════════════
   Each function builds a maqueen-style command string and sends
   it over BLE. Same verb prefixes as maqueen so any maqueen lab
   page that doesn't depend on micro:bit-specific surfaces
   (matrix, A/B button) is portable with near-zero JS changes.
   ═══════════════════════════════════════════════════════════ */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const intc  = (v, lo, hi) => clamp(Math.round(v), lo, hi);

const Protocol = {
  // ─── motors ────────────────────────────────────────────────
  drive(left, right) {
    return BLE.send(`M:${intc(left, -100, 100)},${intc(right, -100, 100)}`);
  },
  stop() {
    return BLE.send('M:STOP');
  },

  // ─── servos ────────────────────────────────────────────────
  servo(index, angle) {
    // index: 1 or 2 (J4 or J5).  angle: 0..180
    return BLE.send(`SRV:${intc(index, 1, 2)},${intc(angle, 0, 180)}`);
  },
  servoSweep(index, fromAngle, toAngle, durationMs) {
    return BLE.send(`SWEEP:${intc(index,1,2)},${intc(fromAngle,0,180)},${intc(toAngle,0,180)},${intc(durationMs,100,30000)}`);
  },

  // ─── simple LEDs (D5..D8) ─────────────────────────────────
  led(index, on) {
    // index: 0..3 (D5=0 D6=1 D7=2 D8=3).  on: 0 or 1
    return BLE.send(`LED:${intc(index, 0, 3)},${on ? 1 : 0}`);
  },

  // ─── NeoPixels (D1..D4 chain on GPIO 5) ───────────────────
  rgb(index, r, g, b) {
    return BLE.send(`RGB:${intc(index, 0, 3)},${intc(r, 0, 255)},${intc(g, 0, 255)},${intc(b, 0, 255)}`);
  },
  rgbAll(r, g, b) {
    return BLE.send(`RGB:ALL,${intc(r,0,255)},${intc(g,0,255)},${intc(b,0,255)}`);
  },
  rgbClear() {
    return BLE.send('RGB:CLEAR');
  },

  // ─── buzzer ────────────────────────────────────────────────
  buzz(freqHz, durationMs) {
    return BLE.send(`BUZZ:${intc(freqHz, 50, 5000)},${intc(durationMs, 10, 10000)}`);
  },
  buzzOff() {
    return BLE.send('BUZZ:OFF');
  },

  // ─── distance (HC-SR04 on J6) ─────────────────────────────
  distanceRequest() {
    return BLE.send('DIST:?');
  },

  // ─── telemetry stream ─────────────────────────────────────
  streamOn()  { return BLE.send('STREAM:on');  },
  streamOff() { return BLE.send('STREAM:off'); },

  // ─── meta ─────────────────────────────────────────────────
  hello()  { return BLE.send('HELLO'); },
  fwInfo() { return BLE.send('FW:?');  },
  mode(name) { return BLE.send(`MODE:${name}`); },   // 'motors' | 'servos'

  // ─── colour parsing helper ────────────────────────────────
  hexToRgb(hex) {
    const h = hex.replace('#','');
    if (h.length !== 6) return [0,0,0];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  },
};

window.Protocol = Protocol;

// ─── parse incoming RX lines into {verb, args} for labs that want it ─
function parseRxLine(line) {
  const m = /^([A-Z]+):(.*)$/.exec(line);
  if (!m) return { verb: '', args: line };
  return { verb: m[1], args: m[2] };
}
window.parseRxLine = parseRxLine;
