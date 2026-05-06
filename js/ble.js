/* ═══════════════════════════════════════════════════════════
   ble.js — Web Bluetooth → Nordic UART Service
   ═══════════════════════════════════════════════════════════
   Adapted from maqueen-lab. Same UUIDs, same line-based ASCII
   protocol, same 20-byte chunking. Browser ↔ ESP32-C3 firmware.
   ═══════════════════════════════════════════════════════════ */

// Nordic UART Service UUIDs
const NUS_SERVICE  = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_CHAR  = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';   // browser → device
const NUS_RX_CHAR  = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';   // device → browser

const BLE_MTU = 20;   // safe default; ESP32 typically supports more after MTU exchange

// Internal state
let device      = null;
let server      = null;
let txChar      = null;   // we WRITE to this
let rxChar      = null;   // we get NOTIFY from this
let connected   = false;
let userDisconnect = false;

// Listeners
const listeners = {
  conn: new Set(),  // (state) => void   — state ∈ {'connecting','connected','disconnected','error'}
  line: new Set(),  // (line) => void    — one RX line at a time, no trailing \n
  log:  new Set(),  // (msg, type) => void  — for log-panel mirroring
};

const on = (type, fn) => { listeners[type].add(fn); return () => listeners[type].delete(fn); };
const fire = (type, ...args) => listeners[type].forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } });

const log = (msg, type='info') => fire('log', msg, type);

// ─── Connect / disconnect ────────────────────────────────────

async function connect() {
  if (!navigator.bluetooth) {
    log('Web Bluetooth not supported — use Chrome or Edge.', 'err');
    fire('conn', 'error');
    return false;
  }

  fire('conn', 'connecting');
  log('Requesting BLE device…', 'info');

  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [NUS_SERVICE] }],
      optionalServices: [NUS_SERVICE],
    });

    log(`Pairing with ${device.name || '(unnamed)'}…`, 'info');

    device.addEventListener('gattserverdisconnected', onDisconnected);

    server = await device.gatt.connect();
    const svc = await server.getPrimaryService(NUS_SERVICE);

    txChar = await svc.getCharacteristic(NUS_TX_CHAR);
    rxChar = await svc.getCharacteristic(NUS_RX_CHAR);

    await rxChar.startNotifications();
    rxChar.addEventListener('characteristicvaluechanged', onNotification);

    connected = true;
    userDisconnect = false;
    log(`Connected to ${device.name || '(esp32c3-lab)'}`, 'info');
    fire('conn', 'connected');
    return true;

  } catch (e) {
    log(`Connection failed: ${e.message || e}`, 'err');
    connected = false;
    fire('conn', 'error');
    return false;
  }
}

async function disconnect() {
  userDisconnect = true;
  if (device && device.gatt && device.gatt.connected) {
    try { device.gatt.disconnect(); } catch {}
  }
  // onDisconnected handler will finish cleanup
}

function onDisconnected() {
  connected = false;
  txChar = null;
  rxChar = null;
  server = null;
  log(userDisconnect ? 'Disconnected.' : 'Disconnected (unexpected).', userDisconnect ? 'info' : 'err');
  fire('conn', 'disconnected');
}

// ─── RX (notify from device) ────────────────────────────────

let rxBuffer = '';

function onNotification(ev) {
  const dv  = ev.target.value;
  const dec = new TextDecoder();
  rxBuffer += dec.decode(dv.buffer);

  // Split by newline; keep partial last fragment in buffer
  const lines = rxBuffer.split(/\r?\n/);
  rxBuffer = lines.pop();

  for (const line of lines) {
    if (line.trim()) {
      log(`< ${line}`, 'rx');
      fire('line', line);
    }
  }
}

// ─── TX (write to device) ───────────────────────────────────

let writeQueue = Promise.resolve();   // serializes writeValue() calls — Web BT requires it

function send(line) {
  if (!txChar || !connected) {
    log(`TX blocked (not connected): ${line}`, 'err');
    return Promise.reject(new Error('not connected'));
  }

  const enc  = new TextEncoder();
  const data = enc.encode(line + '\n');

  // Chunk if larger than MTU
  const chunks = [];
  for (let off = 0; off < data.byteLength; off += BLE_MTU) {
    chunks.push(data.slice(off, Math.min(off + BLE_MTU, data.byteLength)));
  }

  // Append chunks to the serial queue
  writeQueue = writeQueue.then(async () => {
    for (const chunk of chunks) {
      await txChar.writeValue(chunk);
    }
    log(`> ${line}`, 'tx');
  }).catch(err => {
    log(`TX error: ${err.message || err}`, 'err');
  });

  return writeQueue;
}

// ─── Public API ─────────────────────────────────────────────

window.BLE = {
  connect,
  disconnect,
  send,
  on,
  isConnected: () => connected,
  deviceName:  () => device ? (device.name || '(unnamed)') : null,
  UUID: { service: NUS_SERVICE, tx: NUS_TX_CHAR, rx: NUS_RX_CHAR },
};
