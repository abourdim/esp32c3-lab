/* ═══════════════════════════════════════════════════════════
   i18n.js — minimal EN / FR / AR strings + RTL toggle
   ═══════════════════════════════════════════════════════════
   Apply via setLang(code).  Looks up data-i18n="key" attributes
   on the page and sets textContent.
   ═══════════════════════════════════════════════════════════ */

const STRINGS = {
  en: {
    title: 'ESP32-C3 Lab',
    subtitle: 'BLE-driven labs for Robot-01',
    connect: 'Connect',
    disconnect: 'Disconnect',
    connecting: 'Connecting…',
    connected: 'Connected',
    disconnected: 'Disconnected',
    log: 'Message log',
    clear: 'Clear',
    copy: 'Copy',
    back: '← Home',

    // landing
    intro: 'Six single-purpose labs that talk to your Robot-01 over Web Bluetooth (Nordic UART). Pick one below.',
    browser_warn: 'Heads-up: BLE works in Chrome / Edge only. Firefox + Safari can\'t do Web Bluetooth.',

    // labs
    lab_drive:     'Drive',     lab_drive_desc:    'Joystick → motors. Forward, back, turn, pivot.',
    lab_servo:     'Servo',     lab_servo_desc:    'Sliders + sweep. Plug servos into J4 / J5.',
    lab_leds:      'LEDs',      lab_leds_desc:     'Toggle the 4 status LEDs (D5–D8).',
    lab_neopixels: 'NeoPixels', lab_neopixels_desc:'Color the 4 onboard RGB pixels (D1–D4).',
    lab_distance:  'Distance',  lab_distance_desc: 'Live ultrasonic reading (HC-SR04 on J6).',
    lab_buzzer:    'Buzzer',    lab_buzzer_desc:   'Piano + freq slider for the on-board piezo.',

    not_connected: 'Connect first to use this lab.',
  },

  fr: {
    title: 'ESP32-C3 Lab',
    subtitle: 'Ateliers BLE pour Robot-01',
    connect: 'Connecter',
    disconnect: 'Déconnecter',
    connecting: 'Connexion…',
    connected: 'Connecté',
    disconnected: 'Déconnecté',
    log: 'Journal',
    clear: 'Effacer',
    copy: 'Copier',
    back: '← Accueil',

    intro: 'Six ateliers à but unique qui parlent à ton Robot-01 via Web Bluetooth (Nordic UART). Choisis-en un ci-dessous.',
    browser_warn: 'Attention : le BLE fonctionne sur Chrome / Edge seulement. Firefox + Safari ne supportent pas Web Bluetooth.',

    lab_drive:     'Pilotage',  lab_drive_desc:    'Joystick → moteurs. Avancer, reculer, tourner.',
    lab_servo:     'Servo',     lab_servo_desc:    'Curseurs + balayage. Branche les servos sur J4 / J5.',
    lab_leds:      'LEDs',      lab_leds_desc:     'Allume les 4 LEDs de statut (D5–D8).',
    lab_neopixels: 'NeoPixels', lab_neopixels_desc:'Colore les 4 pixels RGB embarqués (D1–D4).',
    lab_distance:  'Distance',  lab_distance_desc: 'Mesure ultrason en direct (HC-SR04 sur J6).',
    lab_buzzer:    'Buzzer',    lab_buzzer_desc:   'Piano + curseur de fréquence pour le buzzer.',

    not_connected: 'Connecte-toi d\'abord pour utiliser cet atelier.',
  },

  ar: {
    title: 'ESP32-C3 Lab',
    subtitle: 'ورش BLE لـ Robot-01',
    connect: 'الإتصال',
    disconnect: 'قطع الاتصال',
    connecting: 'جاري الاتصال…',
    connected: 'متصل',
    disconnected: 'غير متصل',
    log: 'سجل الرسائل',
    clear: 'مسح',
    copy: 'نسخ',
    back: '← الرئيسية',

    intro: 'ست ورش مختصة تتحدث مع روبوتك Robot-01 عبر Web Bluetooth. اختر واحدة بالأسفل.',
    browser_warn: 'انتباه: BLE يعمل فقط على Chrome / Edge. Firefox و Safari لا يدعمان Web Bluetooth.',

    lab_drive:     'القيادة',     lab_drive_desc:    'الجويستيك ← المحركات. تقدم، تراجع، استدر.',
    lab_servo:     'سيرفو',       lab_servo_desc:    'منزلقات وحركة. اربط السيرفو بـ J4 / J5.',
    lab_leds:      'مصابيح LED',  lab_leds_desc:     'تشغيل وإطفاء 4 مصابيح حالة (D5–D8).',
    lab_neopixels: 'NeoPixels',   lab_neopixels_desc:'لوّن 4 بكسلات RGB المدمجة (D1–D4).',
    lab_distance:  'المسافة',     lab_distance_desc: 'قراءة موجات فوق صوتية مباشرة (HC-SR04 على J6).',
    lab_buzzer:    'الجرس',       lab_buzzer_desc:   'بيانو + منزلق التردد للجرس.',

    not_connected: 'اتصل أولاً لاستخدام هذه الورشة.',
  },
};

const I18N_KEY = 'esp32c3-lab-lang';

function t(key) {
  const lang = currentLang();
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
}

function currentLang() {
  try { return localStorage.getItem(I18N_KEY) || 'en'; } catch { return 'en'; }
}

function setLang(code) {
  if (!STRINGS[code]) code = 'en';
  try { localStorage.setItem(I18N_KEY, code); } catch {}

  // RTL on AR
  document.documentElement.dir  = (code === 'ar') ? 'rtl' : 'ltr';
  document.documentElement.lang = code;

  // Apply to all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const v = t(key);
    if (v != null) el.textContent = v;
  });

  // Apply to placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  // Sync the lang picker if one is on the page
  const sel = document.getElementById('lang-pick');
  if (sel) sel.value = code;
}

window.t = t;
window.setLang = setLang;
window.currentLang = currentLang;
