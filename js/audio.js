// ═══════════════════════════════════════════
// WEB AUDIO ENGINE
// ═══════════════════════════════════════════
function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch(e) {}
}

function ensureAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
  ensureAudio();
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    switch(type) {
      case 'step':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'scan':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.4);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
        // Echo
        setTimeout(() => {
          const o2 = audioCtx.createOscillator();
          const g2 = audioCtx.createGain();
          o2.connect(g2); g2.connect(audioCtx.destination);
          o2.type = 'sine';
          o2.frequency.setValueAtTime(800, audioCtx.currentTime);
          o2.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.3);
          g2.gain.setValueAtTime(0.04, audioCtx.currentTime);
          g2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
          o2.start(); o2.stop(audioCtx.currentTime + 0.4);
        }, 200);
        break;
      case 'alert':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        break;
      case 'hit':
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
        break;
      case 'damage':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.25);
        break;
      case 'kill':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
        break;
      case 'loot':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'levelup':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(600, now + 0.1);
        osc.frequency.setValueAtTime(800, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        break;
      case 'craft':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(500, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.25);
        break;
      case 'rest':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.5);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now); osc.stop(now + 0.6);
        break;
      case 'death':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 1.5);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2);
        osc.start(now); osc.stop(now + 2);
        break;
      case 'distract':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(500, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'door':
        // Creaky door opening
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
        break;
      case 'pickup':
        // Quick ascending chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.setValueAtTime(700, now + 0.06);
        osc.frequency.setValueAtTime(900, now + 0.12);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'drop':
        // Descending thud
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        break;
      case 'trade':
        // Cash register ding
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.04, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
        break;
      case 'rain':
        // White noise burst (rain ambience)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100 + Math.random()*50, now);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
        break;
      case 'cold':
        // Shivering teeth chatter
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        gain.gain.setValueAtTime(0.05, now);
        for (let i=0;i<4;i++) {
          gain.gain.setValueAtTime(0.05, now+i*0.08);
          gain.gain.setValueAtTime(0.01, now+i*0.08+0.04);
        }
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        break;
      case 'unlock':
        // Lock click + key turn
        osc.type = 'square';
        osc.frequency.setValueAtTime(2000, now);
        osc.frequency.setValueAtTime(1500, now + 0.05);
        osc.frequency.setValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
        break;
      case 'build':
        // Hammer hit
        osc.type = 'square';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now); osc.stop(now + 0.12);
        // Second hit
        setTimeout(() => {
          try {
            const o2=audioCtx.createOscillator(),g2=audioCtx.createGain();
            o2.connect(g2);g2.connect(audioCtx.destination);
            o2.type='square';o2.frequency.setValueAtTime(450,audioCtx.currentTime);
            o2.frequency.exponentialRampToValueAtTime(90,audioCtx.currentTime+0.08);
            g2.gain.setValueAtTime(0.12,audioCtx.currentTime);
            g2.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.1);
            o2.start();o2.stop(audioCtx.currentTime+0.1);
          } catch(e){}
        }, 150);
        break;
      default:
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    }
  } catch(e) {}
}

// Ambient rain sound loop
let _rainInterval = null;
function updateAmbientSounds() {
  if (!G?.world?.weather) return;
  const isRain = G.world.weather === 'rain' || G.world.weather === 'storm';
  if (isRain && !_rainInterval) {
    _rainInterval = setInterval(() => {
      if (!G?.world?.weather || (G.world.weather !== 'rain' && G.world.weather !== 'storm')) {
        clearInterval(_rainInterval); _rainInterval = null; return;
      }
      playSound('rain');
    }, 2000 + Math.random() * 3000);
  } else if (!isRain && _rainInterval) {
    clearInterval(_rainInterval); _rainInterval = null;
  }
}

// Loot pickup animation (floating text with rarity)
function showLootAnimation(itemName, x, y) {
  const el = document.createElement('div');
  // Determine rarity color from item definition
  const itemId = Object.keys(ITEMS || {}).find(k => ITEMS[k].name === itemName);
  const def = itemId ? ITEMS[itemId] : null;
  let color = '#00FF41'; // default green
  let glow = 'rgba(0,255,65,.5)';
  let prefix = '+';
  let fontSize = 11;
  if (def) {
    if (def.type === 'weapon' && (def.subtype === 'firearm' || def.dmg >= 20)) {
      color = '#aa44ff'; glow = 'rgba(170,68,255,.6)'; prefix = '★'; fontSize = 13;
    } else if (def.type === 'medicine') {
      color = '#44aaff'; glow = 'rgba(68,170,255,.5)'; prefix = '+';
    } else if (def.type === 'book') {
      color = '#00ccff'; glow = 'rgba(0,204,255,.5)'; prefix = '📚';
    } else if (def.type === 'ammo' || def.type === 'magazine') {
      color = '#ffaa00'; glow = 'rgba(255,170,0,.5)'; prefix = '+';
    }
  }
  el.style.cssText = `position:fixed;z-index:9999;color:${color};font-family:monospace;font-size:${fontSize}px;font-weight:bold;pointer-events:none;white-space:nowrap;text-shadow:0 0 6px ${glow};transition:all 0.8s ease-out;transform:translateX(-50%)`;
  el.textContent = prefix + ' ' + itemName;
  el.style.left = (x || window.innerWidth/2) + 'px';
  el.style.top = (y || window.innerHeight/2) + 'px';
  el.style.opacity = '1';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateX(-50%) translateY(-40px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 900);
}

// Heartbeat at low HP
function startHeartbeat() {
  if (!audioCtx || !G || !G.player.alive) return;
  const avgHp = getTotalHp();
  if (avgHp < 30) {
    const rate = avgHp < 15 ? 300 : 600;
    setTimeout(() => {
      if (!G || !G.player.alive) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(40, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
      startHeartbeat();
    }, rate);
  } else {
    setTimeout(startHeartbeat, 2000);
  }
}

