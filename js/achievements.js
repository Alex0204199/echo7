// ═══════════════════════════════════════════
// ACHIEVEMENT SYSTEM
// ═══════════════════════════════════════════

const ACHIEVEMENTS = [
  // ── Survival ──
  { id: 'survive_1',   name: 'Первый день',        nameEn: 'Day One',           desc: 'Прожить 1 день',          descEn: 'Survive 1 day',           icon: '🌅', check: () => G?.player?.daysSurvived >= 1 },
  { id: 'survive_3',   name: 'Три дня',             nameEn: 'Three Days',        desc: 'Прожить 3 дня',           descEn: 'Survive 3 days',          icon: '📅', check: () => G?.player?.daysSurvived >= 3 },
  { id: 'survive_7',   name: 'Неделя',              nameEn: 'One Week',          desc: 'Прожить 7 дней',          descEn: 'Survive 7 days',          icon: '🗓️', check: () => G?.player?.daysSurvived >= 7 },
  { id: 'survive_30',  name: 'Месяц',               nameEn: 'One Month',         desc: 'Прожить 30 дней',         descEn: 'Survive 30 days',         icon: '🏆', check: () => G?.player?.daysSurvived >= 30 },

  // ── Combat ──
  { id: 'kill_1',      name: 'Первая кровь',        nameEn: 'First Blood',       desc: 'Убить первого зомби',     descEn: 'Kill your first zombie',  icon: '🗡️', check: () => G?.stats?.zombiesKilled >= 1 },
  { id: 'kill_10',     name: 'Охотник',             nameEn: 'Hunter',            desc: 'Убить 10 зомби',          descEn: 'Kill 10 zombies',         icon: '⚔️', check: () => G?.stats?.zombiesKilled >= 10 },
  { id: 'kill_50',     name: 'Мясник',              nameEn: 'Butcher',           desc: 'Убить 50 зомби',          descEn: 'Kill 50 zombies',         icon: '💀', check: () => G?.stats?.zombiesKilled >= 50 },
  { id: 'kill_100',    name: 'Карнаж',              nameEn: 'Carnage',           desc: 'Убить 100 зомби',         descEn: 'Kill 100 zombies',        icon: '☠️', check: () => G?.stats?.zombiesKilled >= 100 },

  // ── Exploration ──
  { id: 'explore_10',  name: 'Исследователь',       nameEn: 'Explorer',          desc: 'Посетить 10 локаций',     descEn: 'Visit 10 locations',      icon: '🧭', check: () => G ? Object.values(G.world.nodes).filter(n=>n.visited).length >= 10 : false },
  { id: 'explore_50',  name: 'Картограф',           nameEn: 'Cartographer',      desc: 'Посетить 50 локаций',     descEn: 'Visit 50 locations',      icon: '🗺️', check: () => G ? Object.values(G.world.nodes).filter(n=>n.visited).length >= 50 : false },
  { id: 'all_regions', name: 'Вокруг света',        nameEn: 'Around the World',  desc: 'Посетить все 4 региона',  descEn: 'Visit all 4 regions',     icon: '🌍', check: () => {
    if (!G) return false;
    const visited = new Set(Object.values(G.world.nodes).filter(n=>n.visited).map(n=>n.regionId));
    return visited.size >= 4;
  }},

  // ── Base & Craft ──
  { id: 'set_base',    name: 'Дом милый дом',       nameEn: 'Home Sweet Home',   desc: 'Установить базу',         descEn: 'Set up a base',           icon: '🏠', check: () => !!G?.world?.homeBase },
  { id: 'craft_5',     name: 'Мастер на все руки',  nameEn: 'Jack of All Trades', desc: 'Скрафтить 5 предметов', descEn: 'Craft 5 items',           icon: '🔨', check: () => (G?.stats?.itemsCrafted || 0) >= 5 },
  { id: 'fortify',     name: 'Крепость',            nameEn: 'Fortress',          desc: 'Безопасность базы 10/10', descEn: 'Base security 10/10',     icon: '🛡️', check: () => G?.world?.homeBaseSecurity >= 10 },

  // ── Skills ──
  { id: 'skill_max',   name: 'Эксперт',             nameEn: 'Expert',            desc: 'Прокачать навык до 5',    descEn: 'Max out a skill to 5',    icon: '⭐', check: () => G ? Object.values(G.player.skills).some(v => v >= 5) : false },
  { id: 'skill_all3',  name: 'Универсал',           nameEn: 'Versatile',         desc: 'Все навыки на 3+',        descEn: 'All skills at 3+',        icon: '🎓', check: () => G ? Object.values(G.player.skills).every(v => v >= 3) : false },

  // ── Equipment ──
  { id: 'full_gear',   name: 'Полная экипировка',   nameEn: 'Full Gear',         desc: 'Заполнить все слоты',     descEn: 'Fill all equipment slots', icon: '🎽', check: () => {
    if (!G?.player?.equipment) return false;
    return Object.values(G.player.equipment).every(v => v !== null);
  }},
  { id: 'firearm',     name: 'Стрелок',             nameEn: 'Marksman',          desc: 'Экипировать огнестрел',    descEn: 'Equip a firearm',         icon: '🔫', check: () => {
    if (!G) return false;
    const wId = G.player.weaponSlot1 || G.player.weaponSlot2;
    return wId && ITEMS[wId]?.subtype === 'firearm';
  }},

  // ── Special ──
  { id: 'lockpick',    name: 'Взломщик',            nameEn: 'Lockpicker',        desc: 'Взломать 5 замков',       descEn: 'Pick 5 locks',            icon: '🔑', check: () => (G?.stats?.locksPicked || 0) >= 5 },
  { id: 'pacifist',    name: 'Пацифист',            nameEn: 'Pacifist',          desc: '3 дня без убийств',       descEn: '3 days without kills',    icon: '☮️', check: () => G?.player?.daysSurvived >= 3 && G?.stats?.zombiesKilled === 0 },
  { id: 'hoarder',     name: 'Хомяк',               nameEn: 'Hoarder',           desc: '30+ предметов в инвент.', descEn: '30+ items in inventory',  icon: '📦', check: () => G?.player?.inventory?.reduce((s,i) => s + (i.qty||1), 0) >= 30 },
  { id: 'night_owl',   name: 'Ночной зверь',        nameEn: 'Night Owl',         desc: '5 зомби убито ночью',     descEn: '5 zombies killed at night', icon: '🦉', check: () => (G?.stats?.nightKills || 0) >= 5 },
];

// Persistent storage for unlocked achievements (survives across games)
let _unlockedAchievements = new Set();

function loadAchievements() {
  try {
    const raw = localStorage.getItem('echo7_achievements');
    if (raw) _unlockedAchievements = new Set(JSON.parse(raw));
  } catch(e) {}
}

function saveAchievements() {
  localStorage.setItem('echo7_achievements', JSON.stringify([..._unlockedAchievements]));
}

// Check all achievements — called periodically
function checkAchievements() {
  if (!G) return;
  let newUnlock = false;
  for (const ach of ACHIEVEMENTS) {
    if (_unlockedAchievements.has(ach.id)) continue;
    try {
      if (ach.check()) {
        _unlockedAchievements.add(ach.id);
        newUnlock = true;
        showAchievementToast(ach);
      }
    } catch(e) {}
  }
  if (newUnlock) saveAchievements();
}

// Toast notification for new achievement — dramatic fullscreen effect
function showAchievementToast(ach) {
  const isEn = LANG?.current === 'en';
  const name = isEn ? ach.nameEn : ach.name;
  const desc = isEn ? ach.descEn : ach.desc;
  const label = isEn ? 'ACHIEVEMENT UNLOCKED' : 'ДОСТИЖЕНИЕ РАЗБЛОКИРОВАНО';
  const countText = `${_unlockedAchievements.size}/${ACHIEVEMENTS.length}`;

  const overlay = document.createElement('div');
  overlay.className = 'fx-ach-overlay';
  overlay.innerHTML = `
    <div class="fx-ach-flash"></div>
    <div class="fx-ach-particles" id="fx-ach-ptc"></div>
    <div class="fx-ach-content">
      <div class="fx-ach-line-top"></div>
      <div class="fx-ach-label">${label}</div>
      <div class="fx-ach-icon-wrap">
        <div class="fx-ach-icon-glow"></div>
        <div class="fx-ach-icon">${ach.icon}</div>
      </div>
      <div class="fx-ach-name">${name}</div>
      <div class="fx-ach-desc">${desc}</div>
      <div class="fx-ach-line-bot"></div>
      <div class="fx-ach-count">${countText}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Particles
  const ptcBox = overlay.querySelector('#fx-ach-ptc');
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'fx-ach-particle';
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 150;
    p.style.cssText = `--dx:${Math.cos(angle)*dist}px;--dy:${Math.sin(angle)*dist}px;--delay:${Math.random()*.5}s;--size:${2+Math.random()*3}px;background:${Math.random()>.5?'var(--green)':'var(--cyan)'}`;
    ptcBox.appendChild(p);
  }

  requestAnimationFrame(() => overlay.classList.add('active'));

  // Sound
  playAchievementSound();

  // Dismiss
  setTimeout(() => {
    overlay.classList.add('out');
    setTimeout(() => overlay.remove(), 800);
  }, 4000);

  if (typeof addLog === 'function') {
    addLog(`🏆 Достижение: ${name}`, 'success');
  }
}

function playAchievementSound() {
  if (typeof ensureAudio === 'function') ensureAudio();
  if (typeof audioCtx === 'undefined' || !audioCtx) return;
  const now = audioCtx.currentTime;
  // Fanfare: triumphant ascending chord
  [[400,.12],[500,.12],[600,.12],[800,.15]].forEach(([freq,vol], i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, now + i * 0.15);
    g.gain.setValueAtTime(vol, now + i * 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.5);
    o.start(now + i * 0.15); o.stop(now + i * 0.15 + 0.5);
  });
  // Shimmering finish
  const o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain();
  o2.connect(g2); g2.connect(audioCtx.destination);
  o2.type = 'triangle';
  o2.frequency.setValueAtTime(1200, now + 0.7);
  o2.frequency.exponentialRampToValueAtTime(1800, now + 1.3);
  g2.gain.setValueAtTime(0.06, now + 0.7);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
  o2.start(now + 0.7); o2.stop(now + 1.5);
}

// Show achievements gallery
function showAchievements() {
  const isEn = LANG?.current === 'en';
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:60vh;overflow-y:auto">';

  for (const ach of ACHIEVEMENTS) {
    const unlocked = _unlockedAchievements.has(ach.id);
    const name = isEn ? ach.nameEn : ach.name;
    const desc = isEn ? ach.descEn : ach.desc;
    html += `<div style="padding:8px;border:1px solid ${unlocked ? 'var(--green-dim)' : 'var(--border)'};border-radius:4px;background:${unlocked ? 'rgba(0,255,65,.04)' : 'rgba(0,0,0,.3)'}">
      <div style="font-size:16px;text-align:center;margin-bottom:3px;${unlocked ? '' : 'filter:grayscale(1);opacity:.4'}">${ach.icon}</div>
      <div style="color:${unlocked ? 'var(--green)' : 'var(--text-muted)'};font-size:10px;text-align:center;font-weight:bold">${name}</div>
      <div style="color:var(--text-dim);font-size:8px;text-align:center;margin-top:2px">${desc}</div>
    </div>`;
  }

  html += '</div>';
  html += `<div style="text-align:center;margin-top:8px;color:var(--text-dim);font-size:10px">${_unlockedAchievements.size}/${ACHIEVEMENTS.length} разблокировано</div>`;

  openModal('🏆 Достижения', html);
}
