/* ═══════════════════════════════════════════════════════════
   ui.js — small shared widgets: theme picker, status pill, log
   ═══════════════════════════════════════════════════════════ */

const THEME_KEY = 'esp32c3-lab-theme';

function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'paper'; } catch { return 'paper'; }
}

function setTheme(name) {
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem(THEME_KEY, name); } catch {}
  const sel = document.getElementById('theme-pick');
  if (sel) sel.value = name;
}

function applySavedTheme() {
  setTheme(currentTheme());
}

// Wire a <select id="theme-pick">
function initThemePicker() {
  const sel = document.getElementById('theme-pick');
  if (!sel) return;
  sel.value = currentTheme();
  sel.addEventListener('change', () => setTheme(sel.value));
}

// Wire a <select id="lang-pick"> — depends on i18n.js
function initLangPicker() {
  const sel = document.getElementById('lang-pick');
  if (!sel) return;
  sel.value = (typeof currentLang === 'function') ? currentLang() : 'en';
  sel.addEventListener('change', () => {
    if (typeof setLang === 'function') setLang(sel.value);
  });
}

// Status pill (reads BLE state)
function initStatusPill() {
  const pill = document.getElementById('status-pill');
  if (!pill || !window.BLE) return;
  const text = pill.querySelector('.status-text') || pill;

  function render(state) {
    pill.classList.toggle('connected', state === 'connected');
    if (state === 'connected') {
      text.textContent = (typeof t === 'function') ? t('connected') : 'Connected';
    } else if (state === 'connecting') {
      text.textContent = (typeof t === 'function') ? t('connecting') : 'Connecting…';
    } else {
      text.textContent = (typeof t === 'function') ? t('disconnected') : 'Disconnected';
    }
  }
  render(BLE.isConnected() ? 'connected' : 'disconnected');
  BLE.on('conn', render);
}

// Connect / disconnect button
function initConnectButton() {
  const btn = document.getElementById('connect-btn');
  if (!btn || !window.BLE) return;

  function render() {
    if (BLE.isConnected()) {
      btn.textContent = (typeof t === 'function') ? t('disconnect') : 'Disconnect';
      btn.classList.add('danger');
      btn.classList.remove('primary');
    } else {
      btn.textContent = (typeof t === 'function') ? t('connect') : 'Connect';
      btn.classList.add('primary');
      btn.classList.remove('danger');
    }
  }
  btn.addEventListener('click', async () => {
    if (BLE.isConnected()) await BLE.disconnect();
    else                    await BLE.connect();
  });
  BLE.on('conn', render);
  render();
}

// Log panel — reads BLE log events
function initLogPanel() {
  const body = document.getElementById('log-body');
  if (!body || !window.BLE) return;

  const fmt = ts => {
    const d = new Date(ts);
    return d.toTimeString().slice(0,8);
  };

  function append(msg, type) {
    const line = document.createElement('div');
    line.className = `line ${type}`;
    line.innerHTML = `<span class="ts">${fmt(Date.now())}</span>${escapeHtml(msg)}`;
    body.appendChild(line);
    while (body.children.length > 200) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
  }
  BLE.on('log', append);

  const clearBtn = document.getElementById('log-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => { body.innerHTML = ''; });

  const copyBtn = document.getElementById('log-copy');
  if (copyBtn) copyBtn.addEventListener('click', () => {
    const text = Array.from(body.children).map(c => c.textContent).join('\n');
    navigator.clipboard.writeText(text);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// One-shot init
function initUI() {
  applySavedTheme();
  initThemePicker();
  initLangPicker();
  if (typeof setLang === 'function') setLang((typeof currentLang === 'function') ? currentLang() : 'en');
  initStatusPill();
  initConnectButton();
  initLogPanel();
}

window.UI = { init: initUI, setTheme, currentTheme, applySavedTheme };
