// ═══════════════════════════════════════════
// VISUAL EFFECTS ENGINE
// ═══════════════════════════════════════════

// ── 1. SKILL LEVEL-UP TOAST ──
function showSkillLevelUp(skillName, level, skillKey) {
  const skillIcons = {
    strength: '💪', stealth: '🥷', scouting: '🔭', firstAid: '🩺',
    mechanics: '🔧', cooking: '🍳', lockpicking: '🔓', firearms: '🎯'
  };
  const icon = skillIcons[skillKey] || '⭐';
  const isEn = LANG?.current === 'en';

  const overlay = document.createElement('div');
  overlay.className = 'fx-skill-overlay';
  overlay.innerHTML = `
    <div class="fx-skill-particles" id="fx-particles"></div>
    <div class="fx-skill-toast">
      <div class="fx-skill-icon-ring">
        <div class="fx-skill-icon">${icon}</div>
        <svg class="fx-skill-ring" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,255,65,.15)" stroke-width="3"/>
          <circle class="fx-ring-progress" cx="50" cy="50" r="44" fill="none" stroke="var(--green)" stroke-width="3" stroke-dasharray="276.5" stroke-dashoffset="276.5" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="fx-skill-label">${isEn ? 'SKILL LEVEL UP' : 'НАВЫК ПОВЫШЕН'}</div>
      <div class="fx-skill-name">${skillName}</div>
      <div class="fx-skill-level">
        ${Array.from({length:5}, (_,i) => `<span class="fx-lvl-pip ${i < level ? 'active' : ''}">${i < level ? '◆' : '◇'}</span>`).join('')}
      </div>
      <div class="fx-skill-level-text">${isEn ? 'LEVEL' : 'УРОВЕНЬ'} ${level}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Spawn particles
  const particleBox = overlay.querySelector('#fx-particles');
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div');
    p.className = 'fx-particle';
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 120;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;
    p.style.cssText = `--dx:${dx}px;--dy:${dy}px;--delay:${Math.random()*0.4}s;--size:${2+Math.random()*4}px`;
    particleBox.appendChild(p);
  }

  // Animate ring
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    const ring = overlay.querySelector('.fx-ring-progress');
    if (ring) ring.style.strokeDashoffset = '0';
  });

  // Play enhanced level-up sound
  playSkillUpSound();

  // Remove after animation
  setTimeout(() => {
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 500);
  }, 2800);
}

function playSkillUpSound() {
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // Rising arpeggio
  [400, 500, 600, 800].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.12);
    gain.gain.setValueAtTime(0.12, now + i * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.25);
    osc.start(now + i * 0.12);
    osc.stop(now + i * 0.12 + 0.25);
  });

  // Shimmering high tone
  const osc2 = audioCtx.createOscillator();
  const g2 = audioCtx.createGain();
  osc2.connect(g2);
  g2.connect(audioCtx.destination);
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(1200, now + 0.5);
  osc2.frequency.exponentialRampToValueAtTime(1600, now + 1.0);
  g2.gain.setValueAtTime(0.06, now + 0.5);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc2.start(now + 0.5);
  osc2.stop(now + 1.2);
}

// ── 2. DAMAGE VIGNETTE ──
function showDamageVignette(intensity) {
  const el = document.getElementById('fx-damage-vignette') || createFxLayer('fx-damage-vignette');
  el.style.opacity = Math.min(1, (intensity || 1) * 0.6);
  el.classList.add('active');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.classList.remove('active');
  }, 400);
}

// ── 3. LOW HP HEARTBEAT OVERLAY ──
let _heartbeatActive = false;
function updateHeartbeatOverlay() {
  const el = document.getElementById('fx-heartbeat-vignette') || createFxLayer('fx-heartbeat-vignette');
  if (!G?.player?.alive) { el.classList.remove('active'); _heartbeatActive = false; return; }
  const avgHp = getTotalHp();
  if (avgHp < 30) {
    if (!_heartbeatActive) {
      el.classList.add('active');
      el.style.animationDuration = avgHp < 15 ? '0.6s' : '1.2s';
      _heartbeatActive = true;
    }
  } else if (_heartbeatActive) {
    el.classList.remove('active');
    _heartbeatActive = false;
  }
}

// ── 4. CRITICAL HIT FLASH ──
function showCriticalFlash() {
  const el = document.getElementById('fx-crit-flash') || createFxLayer('fx-crit-flash');
  el.classList.remove('active');
  void el.offsetWidth; // force reflow
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 300);
}

// ── 5. RARE LOOT NOTIFICATION ──
function showRareLootNotification(itemName, rarity) {
  const colors = {
    rare: { border: '#4488ff', glow: 'rgba(68,136,255,.3)', label: 'РЕДКИЙ ПРЕДМЕТ' },
    epic: { border: '#aa44ff', glow: 'rgba(170,68,255,.3)', label: 'ЭПИЧЕСКИЙ ПРЕДМЕТ' },
    legendary: { border: '#ffaa00', glow: 'rgba(255,170,0,.4)', label: 'ЛЕГЕНДАРНЫЙ ПРЕДМЕТ' },
  };
  const style = colors[rarity] || colors.rare;

  const el = document.createElement('div');
  el.className = 'fx-rare-loot' + (rarity === 'legendary' ? ' gradient-spin-border' : '');
  el.innerHTML = `
    <div class="fx-rare-shine"></div>
    <div class="fx-rare-label" style="color:${style.border}">${style.label}</div>
    <div class="fx-rare-name" style="color:${style.border};text-shadow:0 0 12px ${style.glow}">${itemName}</div>
  `;
  el.style.setProperty('--rare-color', style.border);
  el.style.setProperty('--rare-glow', style.glow);
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('active'));

  playRareLootSound(rarity);

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 600);
  }, 2500);
}

function playRareLootSound(rarity) {
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const baseFreqs = rarity === 'legendary' ? [600,800,1000,1200] : rarity === 'epic' ? [500,700,900] : [400,600,800];

  baseFreqs.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.1);
    gain.gain.setValueAtTime(0.1, now + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.4);
    osc.start(now + i * 0.1);
    osc.stop(now + i * 0.1 + 0.4);
  });
}

// ── 6. ZONE TRANSITION GLITCH ──
function showZoneTransition() {
  const el = document.createElement('div');
  el.className = 'fx-glitch-overlay';
  el.innerHTML = `<div class="fx-glitch-bars"></div>`;
  document.body.appendChild(el);

  // Generate random glitch bars
  const bars = el.querySelector('.fx-glitch-bars');
  for (let i = 0; i < 12; i++) {
    const bar = document.createElement('div');
    bar.className = 'fx-glitch-bar';
    bar.style.cssText = `
      top:${Math.random()*100}%;height:${1+Math.random()*4}px;
      animation-delay:${Math.random()*0.3}s;
      --shift:${(Math.random()-0.5)*20}px;
    `;
    bars.appendChild(bar);
  }

  requestAnimationFrame(() => el.classList.add('active'));

  playGlitchSound();

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 500);
}

function playGlitchSound() {
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  // Static burst
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.15;
  const src = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  src.buffer = buf;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  src.start(now);
}

// ── 7. KILL STREAK ──
let _killStreak = 0;
let _killStreakTimer = null;
function trackKillStreak() {
  _killStreak++;
  clearTimeout(_killStreakTimer);
  _killStreakTimer = setTimeout(() => { _killStreak = 0; }, 30000); // reset after 30s

  if (_killStreak >= 2) {
    showKillStreakPopup(_killStreak);
  }
}

function showKillStreakPopup(count) {
  const existing = document.querySelector('.fx-killstreak');
  if (existing) existing.remove();

  const labels = {
    2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'ULTRA KILL',
    5: 'RAMPAGE', 6: 'UNSTOPPABLE', 7: 'GODLIKE'
  };
  const label = count >= 7 ? labels[7] : (labels[count] || `${count}x KILL`);
  const isHigh = count >= 4;

  const el = document.createElement('div');
  el.className = 'fx-killstreak' + (isHigh ? ' high' : '');
  el.innerHTML = `<span class="fx-ks-count">${count}×</span> <span class="fx-ks-label">${label}</span>`;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('active'));

  playKillStreakSound(count);

  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  }, 2000);
}

function playKillStreakSound(count) {
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const freq = 300 + count * 80;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 2, now + 0.15);
  gain.gain.setValueAtTime(0.12, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.start(now);
  osc.stop(now + 0.3);
}

// ── 8. FROST OVERLAY ──
function updateFrostOverlay() {
  let el = document.getElementById('fx-frost-overlay');
  if (!G?.player?.alive) {
    if (el) el.style.opacity = '0';
    return;
  }
  const temp = G.player.moodles?.bodyTemp ?? 36.6;
  if (temp < 35) {
    if (!el) el = createFrostOverlay();
    const severity = Math.min(1, (35 - temp) / 5); // 0..1 from 35 to 30
    el.style.opacity = severity * 0.7;
    el.classList.add('active');
  } else {
    if (el) { el.style.opacity = '0'; el.classList.remove('active'); }
  }
}

function createFrostOverlay() {
  const el = document.createElement('div');
  el.id = 'fx-frost-overlay';
  el.className = 'fx-frost';
  el.innerHTML = `
    <svg width="100%" height="100%" style="position:absolute;inset:0">
      <defs>
        <radialGradient id="frostGrad" cx="50%" cy="50%" r="70%">
          <stop offset="50%" stop-color="transparent"/>
          <stop offset="100%" stop-color="rgba(150,200,255,.35)"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#frostGrad)"/>
    </svg>
  `;
  document.body.appendChild(el);
  return el;
}

// ── 9. RAIN DROPS ON SCREEN ──
let _rainDropsInterval = null;
function updateRainDrops() {
  const isOutdoor = !currentLocation()?.type || currentLocation()?.type === 'outdoor';
  const isRain = G?.world?.weather === 'rain' || G?.world?.weather === 'storm';

  if (isRain && isOutdoor && !_rainDropsInterval) {
    _rainDropsInterval = setInterval(spawnRainDrop, G.world.weather === 'storm' ? 200 : 400);
  } else if ((!isRain || !isOutdoor) && _rainDropsInterval) {
    clearInterval(_rainDropsInterval);
    _rainDropsInterval = null;
  }
}

function spawnRainDrop() {
  // Cap active drops to prevent DOM bloat
  if (document.querySelectorAll('.fx-raindrop').length > 15) return;
  const drop = document.createElement('div');
  drop.className = 'fx-raindrop';
  const x = Math.random() * 100;
  const y = Math.random() * 100;
  const size = 4 + Math.random() * 8;
  drop.style.cssText = `left:${x}%;top:${y}%;width:${size}px;height:${size}px`;
  document.body.appendChild(drop);
  setTimeout(() => drop.remove(), 1200);
}

// ── HELPER: create persistent FX layer ──
function createFxLayer(id) {
  const el = document.createElement('div');
  el.id = id;
  el.className = id;
  document.body.appendChild(el);
  return el;
}

// ── 10. XP FLOATING TEXT + PROGRESS BAR ──
const _skillIcons = {
  strength: '💪', stealth: '🥷', scouting: '🔭', firstAid: '🩺',
  mechanics: '🔧', cooking: '🍳', lockpicking: '🔓', firearms: '🎯'
};

function showXpGain(skill, amount, skillName) {
  const icon = _skillIcons[skill] || '⭐';

  // Floating text with bounce
  const el = document.createElement('div');
  el.className = 'fx-xp-float';
  el.innerHTML = `${icon} <span class="fx-xp-amount">+${amount} XP</span> <span class="fx-xp-skill">${skillName}</span>`;
  // Position: center-ish, slightly random
  el.style.left = (window.innerWidth / 2 + (Math.random() - 0.5) * 80) + 'px';
  el.style.top = (window.innerHeight / 2 - 20) + 'px';
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('active'));
  setTimeout(() => el.remove(), 1200);

  // Sound: quick ascending chime (distinct from loot)
  playXpSound();

  // Show XP bar near minimap
  showSkillXpBar(skill, skillName);
}

function playXpSound() {
  ensureAudio();
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.setValueAtTime(1000, now + 0.07);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.start(now);
  osc.stop(now + 0.2);
}

let _xpBarTimer = null;
function showSkillXpBar(skill, skillName) {
  const level = G.player.skills[skill] || 0;
  const xp = G.player.skillXp[skill] || 0;
  const threshold = typeof getSkillThreshold === 'function' ? getSkillThreshold(level) : (level + 1) * 30;
  const pct = Math.min(100, Math.round((xp / threshold) * 100));
  const icon = _skillIcons[skill] || '⭐';

  let bar = document.getElementById('fx-xp-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'fx-xp-bar';
    bar.className = 'fx-xp-bar';
    document.body.appendChild(bar);
  }

  bar.innerHTML = `
    <div class="fx-xpbar-header">
      <span class="fx-xpbar-icon">${icon}</span>
      <span class="fx-xpbar-name">${skillName}</span>
      <span class="fx-xpbar-level">Lv.${level}</span>
    </div>
    <div class="fx-xpbar-track">
      <div class="fx-xpbar-fill" style="width:0%"></div>
    </div>
    <div class="fx-xpbar-numbers">${xp}/${threshold} XP</div>
  `;

  // Show + animate fill
  bar.classList.remove('out');
  bar.classList.add('active');

  requestAnimationFrame(() => {
    const fill = bar.querySelector('.fx-xpbar-fill');
    if (fill) fill.style.width = pct + '%';
  });

  // Hide after 3 seconds
  clearTimeout(_xpBarTimer);
  _xpBarTimer = setTimeout(() => {
    bar.classList.add('out');
    bar.classList.remove('active');
  }, 3000);
}

// ── 11. CRAFT SUCCESS ANIMATION ──
function showCraftAnimation(itemName) {
  const el = document.createElement('div');
  el.className = 'fx-craft-success';
  el.innerHTML = `
    <div class="fx-craft-sparks" id="fx-craft-sp"></div>
    <div class="fx-craft-icon">⚒</div>
    ${itemName ? `<div style="color:var(--cyan);font-size:12px;margin-top:6px;text-shadow:0 0 6px rgba(0,229,255,.4);font-weight:bold">${itemName}</div>` : ''}
  `;
  document.body.appendChild(el);

  // Sparks
  const sp = el.querySelector('#fx-craft-sp');
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('div');
    s.className = 'fx-craft-spark';
    const angle = (i / 16) * Math.PI * 2;
    const dist = 30 + Math.random() * 40;
    s.style.cssText = `--sx:${Math.cos(angle)*dist}px;--sy:${Math.sin(angle)*dist}px;--delay:${Math.random()*0.15}s`;
    sp.appendChild(s);
  }

  requestAnimationFrame(() => el.classList.add('active'));
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 500);
  }, 1000);
}

// ── GENERAL PURPOSE FLOAT ──
function showGameFloat(text, opts = {}) {
  const { color = 'var(--green)', x, y, size = 12, duration = 1000, icon = '', direction = 'up' } = opts;
  const el = document.createElement('div');
  const px = x ?? (window.innerWidth / 2 + (Math.random() - 0.5) * 60);
  const py = y ?? (window.innerHeight * 0.45 + (Math.random() - 0.5) * 30);
  const dy = direction === 'down' ? 30 : -40;
  el.style.cssText = `position:fixed;z-index:9999;pointer-events:none;font-family:monospace;font-weight:bold;font-size:${size}px;color:${color};text-shadow:0 0 6px ${color};white-space:nowrap;left:${px}px;top:${py}px;opacity:1;transition:all ${duration * 0.8}ms ease-out;transform:translateX(-50%)`;
  el.textContent = (icon ? icon + ' ' : '') + text;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.transform = `translateX(-50%) translateY(${dy}px)`; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), duration);
}

// Healing float: green +HP
function showHealFloat(amount, partName) {
  showGameFloat(`+${amount} HP${partName ? ' ' + partName : ''}`, { color: '#44ff88', icon: '💚', size: 13 });
}

// Damage taken float: red -HP
function showDmgTakenFloat(amount) {
  showGameFloat(`−${amount}`, { color: '#ff4444', icon: '', size: 15, y: window.innerHeight * 0.55, direction: 'down' });
}

// Status float: yellow/orange alerts
function showStatusFloat(text, color = '#ffcc00') {
  showGameFloat(text, { color, icon: '', size: 11, duration: 1500 });
}

// Food/drink float
function showNutritionFloat(text, color = '#88ff88') {
  showGameFloat(text, { color, size: 11, duration: 1200, y: window.innerHeight * 0.6 });
}

// ── UPDATE TICK (call from advanceTime or updateUI) ──
function updateEffects() {
  updateHeartbeatOverlay();
  updateFrostOverlay();
  updateRainDrops();
}
