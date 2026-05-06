/* ═══════════════════════════════════════════════════════════
   lab-shell.js — injects the shared chrome into every lab page
   ═══════════════════════════════════════════════════════════
   Each lab page just provides:
     <body data-lab="drive">
       <div class="lab-content">…the lab UI…</div>
     </body>
   This script wraps that into the standard layout (header,
   right-rail message log, footer) and wires up all the shared
   widgets via UI.init() from ui.js.
   ═══════════════════════════════════════════════════════════ */

(function () {
  const body = document.body;
  const labKey = body.dataset.lab || '';
  const labTitle = body.dataset.labTitle || labKey;

  const headerHTML = `
    <header class="top">
      <h1 class="title">
        <a href="../index.html" class="back-link" data-i18n="back">← Home</a>
        <span style="margin-left:6px">${labTitle}</span>
      </h1>
      <div class="top-actions">
        <select class="picker" id="theme-pick" aria-label="theme">
          <option value="paper">📄 paper</option>
          <option value="steel">⚙️ steel</option>
          <option value="forest">🌿 forest</option>
          <option value="carbon">🖤 carbon</option>
        </select>
        <select class="picker" id="lang-pick" aria-label="language">
          <option value="en">EN</option>
          <option value="fr">FR</option>
          <option value="ar">AR</option>
        </select>
        <span class="status-pill" id="status-pill"><span class="dot"></span><span class="status-text" data-i18n="disconnected">Disconnected</span></span>
        <button id="connect-btn" class="primary" data-i18n="connect">Connect</button>
      </div>
    </header>`;

  const layoutOpenHTML = `<div class="lab-layout">
    <main class="lab-main">`;
  const layoutMidHTML = `</main>
    <aside class="log-panel">
      <header>
        <span class="lbl" data-i18n="log">Message log</span>
        <button id="log-clear" data-i18n="clear">Clear</button>
        <button id="log-copy"  data-i18n="copy">Copy</button>
      </header>
      <div id="log-body" class="log-body"></div>
    </aside>
  </div>`;

  const footerHTML = `
    <footer class="app-footer">
      <a href="../index.html">esp32c3-lab</a> · <a href="https://github.com/abourdim/esp32c3-lab" target="_blank" rel="noopener">github</a> · <a href="../plan.html">plan</a>
    </footer>`;

  // Wrap existing content
  const existing = document.querySelector('.lab-content');
  if (!existing) {
    console.warn('[lab-shell] no .lab-content found in body — nothing to wrap.');
    return;
  }

  // Build new structure: app > header + lab-layout(main + log) + footer
  const appWrap = document.createElement('div');
  appWrap.className = 'app';
  appWrap.innerHTML = headerHTML + layoutOpenHTML;

  // Move .lab-content into <main>
  const main = appWrap.querySelector('.lab-main');
  // We append the existing element ALSO move children — but the lab-content node has children we want
  // Move children of existing into <main>
  while (existing.firstChild) main.appendChild(existing.firstChild);
  existing.remove();

  // Add log + footer
  appWrap.insertAdjacentHTML('beforeend', layoutMidHTML);
  appWrap.insertAdjacentHTML('beforeend', footerHTML);

  body.innerHTML = '';
  body.appendChild(appWrap);

  // Wire shared UI
  if (window.UI && typeof UI.init === 'function') {
    UI.init();
  }

  // Helpful keyboard shortcut: ESC clears the log
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const cb = document.getElementById('log-clear');
      if (cb) cb.click();
    }
  });
})();
