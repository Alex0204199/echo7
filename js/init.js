// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
(function init() {
  loadSettings();
  applySettings();
  applyUiScale();
  applyTheme(settings.colorTheme || 'green');
  if (settings.language) LANG.current = settings.language;
  applyI18nHTML();
  loadAchievements();
  updateDevButton();

  // Adaptive viewport
  function fixViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  function applyDeviceLayout() {
    const w = window.innerWidth;
    const r = document.documentElement;
    if (w < 600) { r.style.setProperty('--btn-h','36px'); r.style.setProperty('--log-h','90px'); r.style.setProperty('--font-base','12px'); }
    else if (w < 1024) { r.style.setProperty('--btn-h','34px'); r.style.setProperty('--log-h','120px'); r.style.setProperty('--font-base','12px'); }
    else { r.style.setProperty('--btn-h','30px'); r.style.setProperty('--log-h','150px'); r.style.setProperty('--font-base','11px'); }
  }
  fixViewportHeight();
  applyDeviceLayout();
  window.addEventListener('resize', () => { fixViewportHeight(); applyDeviceLayout(); });

  // Mobile D-Pad for WASD movement
  if ('ontouchstart' in window) {
    const dpad = document.getElementById('dpad');
    if (dpad) {
      dpad.style.display = '';
      const dirKeys = { up:'w', down:'s', left:'a', right:'d' };
      dpad.querySelectorAll('.dpad-btn').forEach(btn => {
        const dir = btn.dataset.dir;
        const key = dirKeys[dir];
        btn.addEventListener('touchstart', e => {
          e.preventDefault();
          if (sceneData?._keysHeld) sceneData._keysHeld.add(key);
        }, {passive:false});
        btn.addEventListener('touchend', e => {
          e.preventDefault();
          if (sceneData?._keysHeld) sceneData._keysHeld.delete(key);
        }, {passive:false});
        btn.addEventListener('touchcancel', () => {
          if (sceneData?._keysHeld) sceneData._keysHeld.delete(key);
        });
      });
    }
  }

  // Landscape detection
  function checkLandscape() {
    const game = document.getElementById('game');
    if (!game) return;
    if (window.innerWidth > window.innerHeight && window.innerHeight < 500) {
      game.classList.add('landscape');
    } else {
      game.classList.remove('landscape');
    }
  }
  let landscapeTimer;
  function _onResize() { clearTimeout(landscapeTimer); landscapeTimer = setTimeout(() => { checkLandscape(); fixViewportHeight(); applyDeviceLayout(); if (typeof resizeCanvas === 'function') { resizeCanvas(); roomLayouts?.clear?.(); } }, 200); }
  window.addEventListener('resize', _onResize);
  window.addEventListener('orientationchange', () => setTimeout(_onResize, 300));
  checkLandscape();

  // Ripple effect on action buttons
  document.addEventListener('click', e => {
    const btn = e.target.closest('.act-btn');
    if (!btn) return;
    const r = document.createElement('span'); r.className='ripple';
    const rect = btn.getBoundingClientRect();
    const sz = Math.max(rect.width, rect.height);
    r.style.width=r.style.height=sz+'px';
    r.style.left=(e.clientX-rect.left-sz/2)+'px';
    r.style.top=(e.clientY-rect.top-sz/2)+'px';
    btn.appendChild(r);
    setTimeout(()=>r.remove(), 400);
  });

  // PWA: generate manifest as blob URL
  (function initPWA() {
    // Generate icons via canvas
    function makeIcon(sz) {
      const c = document.createElement('canvas'); c.width=c.height=sz;
      const x = c.getContext('2d');
      x.fillStyle='#000'; x.fillRect(0,0,sz,sz);
      x.fillStyle='#00ff41'; x.font=`bold ${sz*0.5}px monospace`; x.textAlign='center'; x.textBaseline='middle';
      x.fillText('E7',sz/2,sz/2);
      return c.toDataURL('image/png');
    }
    const manifest = {
      name:'ECHO-7',short_name:'ECHO-7',start_url:location.href,display:'standalone',
      background_color:'#000000',theme_color:'#000000',
      icons:[{src:makeIcon(192),sizes:'192x192',type:'image/png'},{src:makeIcon(512),sizes:'512x512',type:'image/png'}]
    };
    const blob = new Blob([JSON.stringify(manifest)],{type:'application/json'});
    const link = document.createElement('link'); link.rel='manifest'; link.href=URL.createObjectURL(blob);
    document.head.appendChild(link);

    // Note: SW requires a real file, not blob URL. PWA install works via manifest only.
    // Install prompt
    window._deferredInstall = null;
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window._deferredInstall = e; });
  })();

  // Generate favicon
  (function genFavicon() {
    const c = document.createElement('canvas'); c.width=c.height=32;
    const x = c.getContext('2d');
    x.fillStyle='#000'; x.fillRect(0,0,32,32);
    x.fillStyle='#00ff41'; x.font='bold 22px monospace'; x.textAlign='center'; x.textBaseline='middle';
    x.fillText('E',16,16);
    const link = document.querySelector('link[rel="icon"]') || document.createElement('link');
    link.rel='icon'; link.href=c.toDataURL(); document.head.appendChild(link);
  })();

  // Continue button
  checkContinueButton();

  // Menu background
  initMenuBackground();

  // Init character creation tabs
  ccShowTab(0);

  // Touch events for audio unlock
  document.addEventListener('touchstart', ensureAudio, { once: true });
  document.addEventListener('click', ensureAudio, { once: true });

  // Keyboard: ESC for pause
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close any context menu first
      document.querySelectorAll('.inv-ctx').forEach(el => el.remove());
      const overlay = document.getElementById('modal-overlay');
      if (overlay && overlay.classList.contains('active')) {
        closeModal();
        if (G) G.paused = false;
        return;
      }
      if (G && G.player && G.player.alive) {
        if (G.activeAction) { cancelTimedAction(); return; }
        G.paused = true;
        showPauseMenu();
      }
    }
  });

  // Pause/unpause on tab visibility change
  document.addEventListener('visibilitychange', () => {
    if (!G || !G.player?.alive) return;
    if (document.hidden) {
      G.paused = true;
    } else {
      // Auto-unpause when returning to tab (reset timing)
      G.paused = false;
      G.lastRealTime = Date.now();
      G.realTimeAccum = 0;
    }
  });
})();
