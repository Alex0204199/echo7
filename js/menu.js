// ═══════════════════════════════════════════
// MENU SYSTEM
// ═══════════════════════════════════════════
let menuBgCanvas, menuBgCtx, menuBgAnim;
let menuParticles = [];
let selectedDiff = 'normal';

function initMenuBackground() {
  menuBgCanvas = document.getElementById('menu-bg');
  if (!menuBgCanvas) return;
  menuBgCtx = menuBgCanvas.getContext('2d');
  resizeMenuBg();
  window.addEventListener('resize', resizeMenuBg);
  // Spawn initial particles
  for (let i = 0; i < 120; i++) {
    menuParticles.push(createMenuParticle(true));
  }
  // Rain streaks (CSS animated)
  const screen = document.getElementById('title-screen');
  for (let i = 0; i < 30; i++) {
    const streak = document.createElement('div');
    streak.className = 'rain-streak';
    streak.style.left = Math.random() * 100 + '%';
    streak.style.height = (40 + Math.random() * 80) + 'px';
    streak.style.animationDuration = (2 + Math.random() * 3) + 's';
    streak.style.animationDelay = Math.random() * 4 + 's';
    screen.insertBefore(streak, screen.firstChild);
  }
  menuBgLoop();
}

function resizeMenuBg() {
  if (!menuBgCanvas) return;
  menuBgCanvas.width = window.innerWidth * window.devicePixelRatio;
  menuBgCanvas.height = window.innerHeight * window.devicePixelRatio;
  menuBgCanvas.style.width = '100%';
  menuBgCanvas.style.height = '100%';
}

function createMenuParticle(scatter) {
  const w = window.innerWidth, h = window.innerHeight;
  return {
    x: scatter ? Math.random() * w : w/2 + (Math.random()-.5) * w * .3,
    y: scatter ? Math.random() * h : h/2 + (Math.random()-.5) * h * .3,
    vx: (Math.random() - .5) * .4,
    vy: (Math.random() - .5) * .4,
    size: .5 + Math.random() * 2,
    alpha: .05 + Math.random() * .2,
    color: Math.random() < .08 ? '#FF2244' : Math.random() < .2 ? '#00E5FF' : '#00FF41',
    life: 1,
    maxLife: 300 + Math.random() * 600,
    age: scatter ? Math.random() * 400 : 0,
  };
}

function menuBgLoop() {
  if (!menuBgCanvas || !menuBgCtx) return;
  const dpr = window.devicePixelRatio;
  const w = menuBgCanvas.width / dpr;
  const h = menuBgCanvas.height / dpr;

  menuBgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  menuBgCtx.fillStyle = 'rgba(0,0,0,.08)';
  menuBgCtx.fillRect(0, 0, w, h);

  // Subtle vignette
  const grad = menuBgCtx.createRadialGradient(w/2, h/2, w*.1, w/2, h/2, w*.7);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(1, 'rgba(0,0,0,.04)');
  menuBgCtx.fillStyle = grad;
  menuBgCtx.fillRect(0, 0, w, h);

  // Particles
  if (menuParticles.length < 120 && Math.random() < .3) {
    menuParticles.push(createMenuParticle(false));
  }

  for (let i = menuParticles.length - 1; i >= 0; i--) {
    const p = menuParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.age++;
    const lifeRatio = p.age / p.maxLife;
    const fade = lifeRatio < .1 ? lifeRatio * 10 : lifeRatio > .8 ? (1 - lifeRatio) * 5 : 1;

    if (p.age >= p.maxLife || p.x < -10 || p.x > w + 10 || p.y < -10 || p.y > h + 10) {
      menuParticles.splice(i, 1);
      continue;
    }

    menuBgCtx.globalAlpha = p.alpha * fade;
    menuBgCtx.fillStyle = p.color;

    // Slight flicker for red
    if (p.color === '#FF2244') {
      menuBgCtx.globalAlpha *= .5 + Math.sin(Date.now() * .008 + i) * .5;
    }

    menuBgCtx.fillRect(p.x, p.y, p.size, p.size);
  }

  // Horizontal scan line moving down
  menuBgCtx.globalAlpha = .03;
  menuBgCtx.fillStyle = '#00FF41';
  const scanY = (Date.now() * .03) % h;
  menuBgCtx.fillRect(0, scanY, w, 2);
  menuBgCtx.globalAlpha = 1;

  // Occasional glitch lines
  if (Math.random() < .005) {
    menuBgCtx.globalAlpha = .06 + Math.random() * .08;
    menuBgCtx.fillStyle = '#00FF41';
    const gy = Math.random() * h;
    menuBgCtx.fillRect(0, gy, w, 1 + Math.random() * 3);
    menuBgCtx.globalAlpha = 1;
  }

  menuBgAnim = requestAnimationFrame(menuBgLoop);
}

function stopMenuBg() {
  if (menuBgAnim) cancelAnimationFrame(menuBgAnim);
  menuBgAnim = null;
}

// ── Menu navigation ──
function menuShowPanel(id) {
  document.querySelectorAll('.menu-panel').forEach(p => p.classList.add('hidden'));
  const panel = document.getElementById(id);
  panel.classList.remove('hidden');

  // Re-trigger animations
  panel.querySelectorAll('.menu-btn, .scenario-btn, .menu-sep').forEach(el => {
    el.style.animation = 'none';
    el.offsetHeight; // force reflow
    el.style.animation = '';
  });

  // Panel-specific init
  if (id === 'panel-load') renderLoadSlots();
  if (id === 'panel-settings') renderSettings();
  if (id === 'panel-about') renderAbout();

  playSound('step');
}

function menuContinue() {
  if (loadGame()) {
    stopMenuBg();
  }
}

function menuHostGame() {
  console.log('[MP] 1. menuHostGame() → _pendingHost=true');
  window._pendingHost = true;
  window._pendingJoin = false;
  // Show mode selector for host
  const ms = document.getElementById('mode-select');
  if (ms) ms.style.display = '';
  menuShowPanel('panel-newgame');
}

function menuJoinGame() {
  window._pendingJoin = true;
  window._pendingHost = false;
  // Hide mode selector for client — host decides the mode
  const ms = document.getElementById('mode-select');
  if (ms) ms.style.display = 'none';
  menuShowPanel('panel-newgame');
}

function menuExit() {
  gameConfirm(t('menu.exit.confirm'), () => {
    try { window.close(); } catch(e) {}
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#00FF41;font-family:monospace;font-size:14px;letter-spacing:.2em;background:#000">SIGNAL LOST</div>';
  });
}

// ── Load slots ──
function renderLoadSlots() {
  const container = document.getElementById('load-slots');
  const saves = [];

  // Check all possible save slots
  for (let i = 0; i < 3; i++) {
    const key = i === 0 ? 'echo7_save' : `echo7_save_${i + 1}`;
    try {
      const data = JSON.parse(localStorage.getItem(key));
      saves.push({ slot: i, key, data });
    } catch(e) {
      saves.push({ slot: i, key, data: null });
    }
  }

  let html = '';
  saves.forEach((s, i) => {
    if (s.data) {
      const sc = SCENARIOS.find(x => x.id === s.data.scenario);
      const diff = s.data.difficulty;
      html += `<div class="save-slot" onclick="menuLoadSlot('${s.key}')">
        <div class="ss-title">СЛОТ ${i + 1} — ${sc ? sc.name : 'Выживший'}</div>
        <div class="ss-meta">
          День ${s.data.time?.day || '?'} · ${String(s.data.time?.hour || 0).padStart(2,'0')}:00<br>
          Сложность: ${diff?.name || '?'} · Убито: ${s.data.stats?.zombiesKilled || 0}
        </div>
        <div class="save-slot-actions">
          <button onclick="event.stopPropagation();menuLoadSlot('${s.key}')">Загрузить</button>
          <button class="del-btn" onclick="event.stopPropagation();menuDeleteSlot('${s.key}',${i})">Удалить</button>
        </div>
      </div>`;
    } else {
      html += `<div class="save-slot empty">
        <div class="ss-title">СЛОТ ${i + 1} — Пусто</div>
        <div class="ss-meta">Нет сохранения</div>
      </div>`;
    }
  });

  container.innerHTML = html;
}

function menuLoadSlot(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    if (!data || data.version !== 2) {
      openModal('', '<div style="text-align:center;color:var(--text)">Сохранение повреждено или несовместимо.</div>');
      return;
    }
    // Copy to main slot if needed
    if (key !== 'echo7_save') {
      localStorage.setItem('echo7_save', localStorage.getItem(key));
    }
    if (loadGame()) stopMenuBg();
  } catch(e) {
    openModal('', '<div style="text-align:center;color:var(--text)">Ошибка загрузки.</div>');
  }
}

function menuDeleteSlot(key, idx) {
  gameConfirm(`Удалить сохранение в слоте ${idx + 1}?`, () => {
    localStorage.removeItem(key);
    renderLoadSlots();
    checkContinueButton();
  });
}

// ── Color Themes ──
const COLOR_THEMES = {
  green:  { '--green':'#00ff41','--green-dim':'#00a82b','--green-faint':'#003d0f','--cyan':'#00e5ff','--text':'#b0ffb8','--text-dim':'#507850','--text-muted':'#2a4a2a' },
  amber:  { '--green':'#ffb000','--green-dim':'#cc8800','--green-faint':'#332200','--cyan':'#ffcc44','--text':'#ffe0a0','--text-dim':'#997744','--text-muted':'#4a3a1a' },
  blue:   { '--green':'#00b4ff','--green-dim':'#0088cc','--green-faint':'#001833','--cyan':'#44ddff','--text':'#a0d8ff','--text-dim':'#4477aa','--text-muted':'#1a3355' },
  red:    { '--green':'#ff2244','--green-dim':'#cc1133','--green-faint':'#330011','--cyan':'#ff6600','--text':'#ffb0b8','--text-dim':'#885050','--text-muted':'#4a1a1a' },
};
function applyTheme(name) {
  const theme = COLOR_THEMES[name] || COLOR_THEMES.green;
  const r = document.documentElement;
  Object.entries(theme).forEach(([k,v]) => r.style.setProperty(k, v));
  settings.colorTheme = name;
  saveSettings();
}

// ── Settings ──
function renderSettings() {
  const container = document.getElementById('settings-content');
  container.innerHTML = `
    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${t('set.audio')}</div>

    <div class="settings-row">
      <div class="s-label">${t('set.masterVol')}</div>
      <div class="s-value">
        <input type="range" class="s-range" min="0" max="100" value="${settings.masterVol}" oninput="settingChange('masterVol',this.value)">
        <span class="s-val" id="sv-masterVol">${settings.masterVol}%</span>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.sfxVol')}</div>
      <div class="s-value">
        <input type="range" class="s-range" min="0" max="100" value="${settings.sfxVol}" oninput="settingChange('sfxVol',this.value)">
        <span class="s-val" id="sv-sfxVol">${settings.sfxVol}%</span>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.musicVol')}</div>
      <div class="s-value">
        <input type="range" class="s-range" min="0" max="100" value="${settings.musicVol}" oninput="settingChange('musicVol',this.value)">
        <span class="s-val" id="sv-musicVol">${settings.musicVol}%</span>
      </div>
    </div>

    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${t('set.graphics')}</div>

    <div class="settings-row">
      <div class="s-label">${t('set.scanlines')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.scanlines ? 'on' : ''}" onclick="settingToggle('scanlines',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.particles')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.particles ? 'on' : ''}" onclick="settingToggle('particles',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.shake')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.screenShake ? 'on' : ''}" onclick="settingToggle('screenShake',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.fps')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.showFps ? 'on' : ''}" onclick="settingToggle('showFps',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.brightness')}</div>
      <div class="s-value">
        <input type="range" class="s-range" min="50" max="150" value="${settings.brightness}" oninput="settingChange('brightness',this.value)">
        <span class="s-val" id="sv-brightness">${settings.brightness}%</span>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.blood')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.bloodEffects ? 'on' : ''}" onclick="settingToggle('bloodEffects',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.nightFilter')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.nightFilter ? 'on' : ''}" onclick="settingToggle('nightFilter',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.uiScale')}</div>
      <div class="s-value">
        <input type="range" class="s-range" min="75" max="125" value="${settings.uiScale}" oninput="settingChange('uiScale',this.value)">
        <span class="s-val" id="sv-uiScale">${settings.uiScale}%</span>
      </div>
    </div>

    <div class="settings-row">
      <div class="s-label">${LANG.current==='en'?'Button size':'Размер кнопок'}</div>
      <div class="s-value">
        <input type="range" class="s-range" min="30" max="60" value="${settings.btnSize||44}" oninput="settingChange('btnSize',this.value);updateBtnPreview()">
        <span class="s-val" id="sv-btnSize">${settings.btnSize||44}px</span>
      </div>
    </div>
    <div id="btn-preview" style="display:flex;gap:3px;padding:6px;margin:4px 0 8px;border:1px dashed var(--border);border-radius:4px;justify-content:center;flex-wrap:wrap">
      <button class="act-btn" style="min-height:${settings.btnSize||44}px;font-size:${Math.max(8,Math.round((settings.btnSize||44)*0.2))}px;padding:3px 6px;flex:0 0 auto">ОБЫСК</button>
      <button class="act-btn" style="min-height:${settings.btnSize||44}px;font-size:${Math.max(8,Math.round((settings.btnSize||44)*0.2))}px;padding:3px 6px;flex:0 0 auto">КОМНАТЫ</button>
      <button class="act-btn" style="min-height:${settings.btnSize||44}px;font-size:${Math.max(8,Math.round((settings.btnSize||44)*0.2))}px;padding:3px 6px;flex:0 0 auto">ИДТИ</button>
    </div>

    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${t('set.theme')}</div>
    <div class="settings-row">
      <div class="s-label">Тема</div>
      <div class="s-value" style="display:flex;gap:6px">
        <div onclick="applyTheme('green');renderSettings()" style="width:24px;height:24px;background:#00ff41;border-radius:3px;cursor:pointer;border:2px solid ${settings.colorTheme==='green'?'#fff':'transparent'}"></div>
        <div onclick="applyTheme('amber');renderSettings()" style="width:24px;height:24px;background:#ffb000;border-radius:3px;cursor:pointer;border:2px solid ${settings.colorTheme==='amber'?'#fff':'transparent'}"></div>
        <div onclick="applyTheme('blue');renderSettings()" style="width:24px;height:24px;background:#00b4ff;border-radius:3px;cursor:pointer;border:2px solid ${settings.colorTheme==='blue'?'#fff':'transparent'}"></div>
        <div onclick="applyTheme('red');renderSettings()" style="width:24px;height:24px;background:#ff2244;border-radius:3px;cursor:pointer;border:2px solid ${settings.colorTheme==='red'?'#fff':'transparent'}"></div>
      </div>
    </div>

    <div class="settings-row">
      <div class="s-label">Язык / Language</div>
      <div class="s-value" style="display:flex;gap:6px">
        <button class="sub-back" style="font-size:10px;padding:3px 10px;${settings.language==='ru'?'border-color:var(--green);color:var(--green)':''}" onclick="setLanguage('ru');renderSettings()">🇷🇺 Русский</button>
        <button class="sub-back" style="font-size:10px;padding:3px 10px;${settings.language==='en'?'border-color:var(--green);color:var(--green)':''}" onclick="setLanguage('en');renderSettings()">🇬🇧 English</button>
      </div>
    </div>

    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${t('set.game')}</div>

    <div class="settings-row">
      <div class="s-label">${t('set.logOpacity')}</div>
      <div class="s-value">
        <input type="range" class="s-range" min="10" max="100" value="${settings.logOpacity}" oninput="settingChange('logOpacity',this.value)">
        <span class="s-val" id="sv-logOpacity">${settings.logOpacity}%</span>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.logMode')}</div>
      <div class="s-value" style="display:flex;gap:4px">
        <button class="sub-back" style="font-size:9px;padding:3px 8px;${settings.logMode==='normal'?'border-color:var(--green);color:var(--green)':''}" onclick="settingSet('logMode','normal')">Полный</button>
        <button class="sub-back" style="font-size:9px;padding:3px 8px;${settings.logMode==='compact'?'border-color:var(--green);color:var(--green)':''}" onclick="settingSet('logMode','compact')">Компакт</button>
        <button class="sub-back" style="font-size:9px;padding:3px 8px;${settings.logMode==='minimal'?'border-color:var(--green);color:var(--green)':''}" onclick="settingSet('logMode','minimal')">Минимум</button>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.soundVis')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.soundVis ? 'on' : ''}" onclick="settingToggle('soundVis',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.autosave')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.autoSave ? 'on' : ''}" onclick="settingToggle('autoSave',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.tooltips')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.tooltips ? 'on' : ''}" onclick="settingToggle('tooltips',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.confirmDrop')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.confirmDrop ? 'on' : ''}" onclick="settingToggle('confirmDrop',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.autoLoot')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.autoLoot ? 'on' : ''}" onclick="settingToggle('autoLoot',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${t('set.combatPause')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.combatPause ? 'on' : ''}" onclick="settingToggle('combatPause',this)"></div>
      </div>
    </div>

    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${t('set.controls')}</div>

    <div style="font-size:11px;color:var(--text-dim);line-height:1.9;padding:4px 0">
      <span style="color:var(--text)">WASD / стрелки</span> — навигация по карте<br>
      <span style="color:var(--text)">ПКМ</span> — контекстное меню инвентаря<br>
      <span style="color:var(--text)">Колесо мыши</span> — зум карты
    </div>

    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${LANG.current==='en'?'Multiplayer':'Мультиплеер'}</div>

    <div class="settings-row">
      <div class="s-label">${LANG.current==='en'?'Show player names':'Имена игроков'}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.showPlayerNames !== false ? 'on' : ''}" onclick="settingToggle('showPlayerNames',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${LANG.current==='en'?'Chat notifications':'Уведомления чата'}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.chatNotify !== false ? 'on' : ''}" onclick="settingToggle('chatNotify',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${LANG.current==='en'?'Auto-accept party':'Авто-принять группу'}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.autoAcceptParty ? 'on' : ''}" onclick="settingToggle('autoAcceptParty',this)"></div>
      </div>
    </div>

    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${LANG.current==='en'?'Notifications':'Уведомления'}</div>

    <div class="settings-row">
      <div class="s-label">${LANG.current==='en'?'Vibration':'Вибрация'}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.vibration !== false ? 'on' : ''}" onclick="settingToggle('vibration',this)"></div>
      </div>
    </div>
    <div class="settings-row">
      <div class="s-label">${LANG.current==='en'?'Combat alerts':'Уведомления о бое'}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.combatAlerts !== false ? 'on' : ''}" onclick="settingToggle('combatAlerts',this)"></div>
      </div>
    </div>

    <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${LANG.current==='en'?'Developer':'Разработчик'}</div>
    <div class="settings-row">
      <div class="s-label">${t('set.devMode')}</div>
      <div class="s-value">
        <div class="s-toggle ${settings.devMode ? 'on' : ''}" onclick="settingToggle('devMode',this);updateDevButton()"></div>
      </div>
    </div>

    ${settings.devMode ? '<div class="settings-row"><div class="s-label">Автотесты</div><div class="s-value"><button class="sub-back" onclick="showTestResults()" style="font-size:9px;padding:3px 10px;border-color:var(--cyan);color:var(--cyan)">🧪 Запустить</button></div></div>' : ''}

    <div style="margin-top:16px;text-align:center">
      <button class="sub-back" onclick="resetSettings()" style="color:var(--red);border-color:#661122">${t('set.reset')}</button>
    </div>
  `;
}

function applyUiScale() {
  const scale = settings.uiScale || 100;
  document.documentElement.style.fontSize = (scale * 0.135 + 0.5) + 'px';
  // Apply button size
  const btnSz = settings.btnSize || 44;
  document.documentElement.style.setProperty('--btn-size', btnSz + 'px');
  document.documentElement.style.setProperty('--btn-font', Math.max(8, Math.round(btnSz * 0.2)) + 'px');
}

function updateBtnPreview() {
  const sz = settings.btnSize || 44;
  const fsz = Math.max(8, Math.round(sz * 0.2));
  const preview = document.getElementById('btn-preview');
  if (preview) {
    preview.querySelectorAll('.act-btn').forEach(btn => {
      btn.style.minHeight = sz + 'px';
      btn.style.fontSize = fsz + 'px';
    });
  }
  // Live apply to game buttons
  applyUiScale();
}

function settingChange(key, val) {
  settings[key] = parseInt(val);
  const el = document.getElementById('sv-' + key);
  if (el) el.textContent = key === 'logSize' ? val : val + '%';
  saveSettings();
  if (key === 'uiScale') applyUiScale();
}

function settingToggle(key, el) {
  settings[key] = !settings[key];
  el.classList.toggle('on', settings[key]);
  saveSettings();
  if (key === 'devMode') updateDevButton();
}

function settingSet(key, val) {
  settings[key] = val;
  saveSettings();
  renderSettings();
}

function resetSettings() {
  gameConfirm(t('set.reset.confirm'), () => {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    applyTheme(settings.colorTheme || 'green');
    renderSettings();
  });
}

// ── About ──
function renderAbout() {
  document.getElementById('about-content').innerHTML = `
    <div style="text-align:center;padding:10px 0 16px">
      <div style="color:var(--green);font-size:24px;letter-spacing:.3em;text-shadow:0 0 15px rgba(0,255,65,.3);margin-bottom:4px">ECHO-7</div>
      <div style="color:var(--cyan);font-size:10px;letter-spacing:.25em">SURVIVAL HORROR SIMULATION v3.0</div>
      <div style="color:var(--text-dim);font-size:9px;letter-spacing:.15em;margin-top:6px">Build 3.0 &middot; 2026 &middot; Multiplayer</div>
    </div>

    <div style="border:1px solid var(--border);padding:12px;margin-bottom:10px">
      <div style="color:var(--green-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Описание</div>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.8">
        ECHO-7 — хардкорный survival horror симулятор в стилистике LIDAR-терминала.
        Вы — выживший в городе, захваченном зомби. Исследуйте здания,
        собирайте ресурсы, создавайте оружие и укрепления.
        Каждое решение может стать последним.
      </div>
    </div>

    <div style="border:1px solid var(--border);padding:12px;margin-bottom:10px">
      <div style="color:var(--green-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Возможности</div>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.8">
        ▸ Мультиплеер до 20 игроков (WebSocket)<br>
        ▸ Процедурная генерация мира с 4 регионами<br>
        ▸ Изометрическая карта с 3D зданиями<br>
        ▸ 145+ предметов: оружие, магазины, патроны, еда, медикаменты, одежда<br>
        ▸ 12 профессий, 22 черты, 8 навыков<br>
        ▸ Инвентарь в стиле Escape from Tarkov<br>
        ▸ Совместный бой с кулдаунами, блоком, комбо<br>
        ▸ Система лора: рация, записки, триггерные события<br>
        ▸ Торговля, группы, следование, эмоции<br>
        ▸ Крафт, базы, погода, времена года<br>
        ▸ Point Cloud / LIDAR рендер<br>
        ▸ Полностью оффлайн, без зависимостей
      </div>
    </div>

    <div style="border:1px solid var(--border);padding:12px;margin-bottom:10px">
      <div style="color:var(--green-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Управление</div>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.8">
        <b style="color:var(--text)">Обыск</b> — исследовать текущее помещение<br>
        <b style="color:var(--text)">Комнаты</b> — перейти в другое помещение<br>
        <b style="color:var(--text)">Идти</b> — переместиться в другую локацию<br>
        <b style="color:var(--text)">Разведка</b> — обнаружить новые локации<br>
        <b style="color:var(--text)">Скрытность</b> — режим тихого перемещения<br>
        <b style="color:var(--text)">Отдых</b> — восстановить силы (4 часа)<br>
        <b style="color:var(--text)">Крафт</b> — создание предметов<br>
        <b style="color:var(--text)">База</b> — установить убежище<br>
        <b style="color:var(--text)">Карта</b> — изометрическая карта мира с маршрутами<br>
        <b style="color:var(--text)">Инвентарь</b> — сетка предметов, drag &amp; drop экипировки<br>
        <b style="color:var(--text)">ПКМ</b> — контекстное меню предметов
      </div>
    </div>

    <div style="border:1px solid var(--border);padding:12px;margin-bottom:10px">
      <div style="color:var(--green-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Благодарности</div>
      <div style="font-size:11px;color:var(--text-dim);line-height:1.8">
        Вдохновлено: Project Zomboid (The Indie Stone)<br>
        Стек: HTML5 Canvas &middot; Web Audio API &middot; Vanilla JS<br>
        Однофайловое приложение, ~10000 строк кода
      </div>
    </div>

    <div style="border:1px solid var(--border);padding:12px;background:rgba(255,200,0,.03)">
      <div style="font-size:11px;color:var(--yellow);line-height:1.8;text-align:center">
        &#9888; ECHO-7 PROTOCOL &middot; CLASSIFIED<br>
        <span style="color:var(--text-dim);font-size:10px">Все права не защищены. Используйте на свой страх и риск.</span>
      </div>
    </div>
  `;
}

// ── In-game pause menu ──
function showPauseMenu() {
  let html = `
    <div style="text-align:center;margin-bottom:14px">
      <div style="color:var(--green);font-size:16px;letter-spacing:.2em;font-weight:bold">${LANG.current==='en'?'PAUSE':'ПАУЗА'}</div>
      <div style="color:var(--text-dim);font-size:10px;margin-top:4px">${getTimeString()} · День ${G.player.daysSurvived}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      <button class="act-btn" onclick="G.paused=false;closeModal()" style="width:100%">${uiIconHtml('pause_resume',18)} ${t('menu.continue')}</button>
      <button class="act-btn" onclick="closeModal();saveGame();addLog('${t('misc.saved')}','info')" style="width:100%">${uiIconHtml('pause_save',18)} ${t('act.save')}</button>
      <button class="act-btn" onclick="showInGameSettings()" style="width:100%">${uiIconHtml('pause_settings',18)} ${t('menu.settings')}</button>
      <button class="act-btn" onclick="closeModal();showDiary()" style="width:100%">📓 Дневник</button>
      <button class="act-btn" onclick="closeModal();showAchievements()" style="width:100%">🏆 ${LANG.current==='en'?'Achievements':'Достижения'}</button>
      <button class="act-btn danger" onclick="exitToMenu()" style="width:100%">${uiIconHtml('pause_quit',18)} В главное меню</button>
    </div>
  `;
  openModal('', html);
}

function showInGameSettings() {
  closeModal();
  setTimeout(() => {
    renderSettings();
    const settingsHtml = document.getElementById('settings-content').innerHTML;
    openModal(t('menu.settings'), settingsHtml + '<div style="margin-top:14px"><button class="act-btn" onclick="closeModal();showPauseMenu()" style="width:100%">' + t('misc.back') + '</button></div>');
  }, 50);
}

function exitToMenu() {
  gameConfirm('Вернуться в главное меню? Несохранённый прогресс будет потерян.', () => {
    closeModal();
    // Stop game canvas
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    clearScene();
    G = null;
    document.getElementById('game').style.display = 'none';
    document.getElementById('title-screen').style.display = '';
    document.getElementById('log').innerHTML = '';
    // Restart menu bg
    menuParticles = [];
    checkContinueButton();
    initMenuBackground();
  });
}

// Direct exit to menu without confirm dialog (for death screen)
function exitToMenuDirect() {
  closeModal();
  if (animId) cancelAnimationFrame(animId);
  animId = null;
  clearScene();
  G = null;
  document.getElementById('game').style.display = 'none';
  document.getElementById('title-screen').style.display = '';
  document.getElementById('log').innerHTML = '';
  menuParticles = [];
  checkContinueButton();
  initMenuBackground();
}

function checkContinueButton() {
  const hasSave = !!localStorage.getItem('echo7_save');
  document.getElementById('btn-continue').style.display = hasSave ? '' : 'none';
  document.getElementById('sep-continue').style.display = hasSave ? '' : 'none';
  if (hasSave) {
    try {
      const data = JSON.parse(localStorage.getItem('echo7_save'));
      const sc = SCENARIOS.find(x => x.id === data.scenario);
      document.getElementById('continue-hint').textContent =
        `${sc ? sc.name : '?'} · День ${data.time?.day || '?'} · ${data.difficulty?.name || '?'}`;
    } catch(e) {
      document.getElementById('continue-hint').textContent = 'Загрузить последнее сохранение';
    }
  }
}

