// GAME STATE
// ═══════════════════════════════════════════
let G = null; // global game state
let rng = null;
let audioCtx = null;

// Multiplayer accessor: returns current player's data
function localPlayer() { return G?.players?.[G.localPlayerId] || G?.player; }

function newGame(charData) {
  // charData: { name, occupation, traits:[], difficulty, sandbox:{} }
  const occ = OCCUPATIONS.find(o => o.id === charData.occupation);
  const diff = charData.sandbox || DIFFICULTIES.find(d => d.id === charData.difficulty);
  const selectedTraits = charData.traits.map(tid => TRAITS.find(t => t.id === tid)).filter(Boolean);
  const seed = window._forceSeed || Date.now() % 1000000;
  window._forceSeed = null;
  rng = new RNG(seed);

  // Merge skills from occupation + traits
  const skills = { strength:0, stealth:0, scouting:0, firstAid:0, mechanics:0, cooking:0, lockpicking:0, firearms:0 };
  if (occ.skills) Object.keys(occ.skills).forEach(k => { skills[k] = (skills[k] || 0) + occ.skills[k]; });
  selectedTraits.forEach(t => {
    if (t.effect.skills) Object.keys(t.effect.skills).forEach(k => { skills[k] = Math.max(0, (skills[k] || 0) + t.effect.skills[k]); });
  });

  // Merge trait effects into a modifiers object
  const mods = { xpMult:1, weightBonus:0, scanBonus:0, dmgReduction:0, infectionMult:1, panicMult:1,
    hungerMult:1, thirstMult:1, fatigueMult:1, noiseMult:1, combatFatigueMult:1, combatPanic:0,
    detectionMult:1, smoker:false, accuracyBonus:0, reloadMult:1, meleeDmgMult:1, luckBonus:0,
    movementNoiseMult:1, readMult:1, nightPenaltyMult:1, dayBonus:0, surpriseAttackMult:1,
    claustrophobia:false };
  selectedTraits.forEach(t => {
    const e = t.effect;
    if (e.xpMult !== undefined) mods.xpMult *= e.xpMult;
    if (e.weightBonus) mods.weightBonus += e.weightBonus;
    if (e.scanBonus) mods.scanBonus += e.scanBonus;
    if (e.dmgReduction) mods.dmgReduction += e.dmgReduction;
    if (e.infectionMult !== undefined) mods.infectionMult *= e.infectionMult;
    if (e.panicMult !== undefined) mods.panicMult *= e.panicMult;
    if (e.hungerMult !== undefined) mods.hungerMult *= e.hungerMult;
    if (e.thirstMult !== undefined) mods.thirstMult *= e.thirstMult;
    if (e.fatigueMult !== undefined) mods.fatigueMult *= e.fatigueMult;
    if (e.noiseMult !== undefined) mods.noiseMult *= e.noiseMult;
    if (e.combatFatigueMult !== undefined) mods.combatFatigueMult *= e.combatFatigueMult;
    if (e.combatPanic) mods.combatPanic += e.combatPanic;
    if (e.detectionMult !== undefined) mods.detectionMult *= e.detectionMult;
    if (e.smoker) mods.smoker = true;
    if (e.accuracyBonus) mods.accuracyBonus += e.accuracyBonus;
    if (e.reloadMult !== undefined) mods.reloadMult *= e.reloadMult;
    if (e.meleeDmgMult !== undefined) mods.meleeDmgMult *= e.meleeDmgMult;
    if (e.luckBonus) mods.luckBonus += e.luckBonus;
    if (e.movementNoiseMult !== undefined) mods.movementNoiseMult *= e.movementNoiseMult;
    if (e.readMult !== undefined) mods.readMult *= e.readMult;
    if (e.nightPenaltyMult !== undefined) mods.nightPenaltyMult *= e.nightPenaltyMult;
    if (e.dayBonus) mods.dayBonus += e.dayBonus;
    if (e.surpriseAttackMult !== undefined) mods.surpriseAttackMult *= e.surpriseAttackMult;
    if (e.claustrophobia) mods.claustrophobia = true;
  });

  const items = [...(occ.items || [])];

  G = {
    version: 3,
    seed,
    difficulty: diff,
    scenario: occ.id,
    characterName: charData.name || 'Выживший',
    occupation: occ.id,
    traitIds: charData.traits,
    modifiers: mods,
    time: { day: 1, hour: 8, minute: 0 },
    paused: false,
    lastRealTime: Date.now(),
    realTimeAccum: 0,
    activeAction: null, // {type, label, duration, elapsed, callback}
    localPlayerId: 'local',
    players: {},
    diary: [],
    loreNotes: [],
    radio: { charge:0, transmissions:[], nextTransmission:0, airdropNodeId:null, airdropDiscovered:false, npcCampDiscovered:false, lastAirdropDay:0 },
    triggers: {},
    _dayStats: { kills:0, itemsFound:0, nodesVisited:0, wasHurt:false, wasAtBase:false },
    world: {
      regions: [],
      currentRegion: 0,
      currentLocation: 0,
      currentRoom: -1,
      currentFloor: 0,
      exploredLocations: new Set(),
      homeBase: null,
      homeBaseSecurity: 0,
      homeBaseTraps: 0,
      // Node-graph world
      nodes: {},
      currentNodeId: null,
      currentRoute: null,
      lastHeading: { dx: 1, dy: 0 },
      weather: 'clear',
      season: charData.startSeason || charData.sandbox?.startSeason || 'summer',
      outsideTemp: 20,
      lastWeatherChange: 0,
    },
    combatState: null,
    stats: { zombiesKilled: 0, daysRecord: 0, locationsExplored: 0, itemsCrafted: 0 },
  };

  // Create local player data
  G.players['local'] = {
    hp: { head:100, torso:100, armL:100, armR:100, legL:100, legR:100 },
    moodles: { hunger:0, thirst:0, fatigue:0, noise:0, infection:0, bleeding:0, pain:0, panic:0, depression:0, bodyTemp:36.6, wetness:0, illness:0 },
    equipment: { head:null, face:null, torso:null, armor:null, rig:null, gloves:null, legs:null, feet:null, back:null },
    skills: { ...skills },
    skillXp: { strength:0, stealth:0, scouting:0, firstAid:0, mechanics:0, cooking:0, lockpicking:0, firearms:0 },
    inventory: items.map(id => ({ id, qty: 1, durability: ITEMS[id]?.dur || 0, freshDays: ITEMS[id]?.freshness || 999 })),
    equipped: items.find(i => ITEMS[i]?.type === 'weapon') || 'fist',
    weaponSlot1: items.find(i => ITEMS[i]?.type === 'weapon') || null,
    weaponSlot2: null,
    activeSlot: 1,
    stealthMode: false,
    weight: 0,
    alive: true,
    daysSurvived: 0,
    quickSlots: [null, null, null],
  };

  // Non-enumerable getter: G.player → G.players[G.localPlayerId] (backward compat, invisible to JSON)
  Object.defineProperty(G, 'player', { get() { return this.players[this.localPlayerId]; }, configurable: true, enumerable: false });

  // Show progress overlay with 3-second animated loading
  const progOverlay = document.createElement('div');
  progOverlay.id = 'gen-progress';
  progOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--green);font-family:monospace';
  progOverlay.innerHTML = '<div style="font-size:14px;letter-spacing:.2em;margin-bottom:12px">ГЕНЕРАЦИЯ МИРА...</div><div style="width:220px;height:4px;background:rgba(0,255,65,.1);border-radius:2px;overflow:hidden"><div id="gen-bar" style="width:0%;height:100%;background:var(--green);transition:width .15s"></div></div><div id="gen-pct" style="font-size:11px;margin-top:8px;color:var(--text-dim)">0%</div>';
  document.body.appendChild(progOverlay);

  generateWorld();

  // Animate progress bar over 3 seconds
  const _genStart = Date.now();
  const _genDuration = 3000;
  const _genSteps = ['Генерация регионов...','Размещение зданий...','Генерация комнат...','Расстановка лута...','Расстановка зомби...','Инициализация...'];
  function _genTick() {
    const elapsed = Date.now() - _genStart;
    const pct = Math.min(100, Math.round(elapsed / _genDuration * 100));
    const bar = document.getElementById('gen-bar');
    const pctEl = document.getElementById('gen-pct');
    if (bar) bar.style.width = pct + '%';
    if (pctEl) {
      const stepIdx = Math.min(_genSteps.length - 1, Math.floor(pct / 100 * _genSteps.length));
      pctEl.textContent = pct + '% · ' + _genSteps[stepIdx];
    }
    if (pct < 100) {
      requestAnimationFrame(_genTick);
    } else {
      // Show "Tap to start" blinking prompt
      progOverlay.innerHTML = '<div style="text-align:center"><div style="color:var(--green);font-size:14px;letter-spacing:.2em;margin-bottom:20px">МИР ГОТОВ</div><div id="tap-start" style="color:var(--green);font-size:12px;letter-spacing:.15em;animation:tapBlink 1.5s ease-in-out infinite">НАЖМИТЕ ЧТОБЫ НАЧАТЬ</div></div>';
      // Add blink animation
      if (!document.getElementById('tap-blink-style')) {
        const st = document.createElement('style');
        st.id = 'tap-blink-style';
        st.textContent = '@keyframes tapBlink{0%,100%{opacity:0.2}50%{opacity:1}}';
        document.head.appendChild(st);
      }
      // Wait for click/tap to dismiss
      const dismissOverlay = () => {
        progOverlay.style.transition = 'opacity 0.3s';
        progOverlay.style.opacity = '0';
        setTimeout(() => { const p = document.getElementById('gen-progress'); if (p) p.remove(); }, 350);
        progOverlay.removeEventListener('click', dismissOverlay);
        progOverlay.removeEventListener('touchstart', dismissOverlay);
      };
      progOverlay.addEventListener('click', dismissOverlay);
      progOverlay.addEventListener('touchstart', dismissOverlay);
      progOverlay.style.cursor = 'pointer';
    }
  }
  requestAnimationFrame(_genTick);

  if (charData.creative) {
    G.creative = true;
    // God mode - max HP
    Object.keys(G.player.hp).forEach(k => G.player.hp[k] = 100);
    // Disable moodles
    Object.keys(G.player.moodles).forEach(k => G.player.moodles[k] = k === 'bodyTemp' ? 36.6 : 0);
    // Max skills
    Object.keys(G.player.skills).forEach(k => G.player.skills[k] = 10);
    // Discover and visit entire map
    Object.values(G.world.nodes).forEach(n => { n.discovered = true; n.visited = true; });
    // Infinite weight
    G.modifiers = G.modifiers || {};
    G.modifiers.weightBonus = 9999;
  }

  calcWeight();

  // Place player at starting node (set by generateWorld)
  const startNode = G.world.nodes[G.world.currentNodeId];
  const startLocName = startNode && startNode.building ? startNode.building.name : 'неизвестной локации';

  document.getElementById('title-screen').style.display = 'none';
  document.getElementById('game').style.display = 'flex';

  initCanvas();
  initAudio();

  // Set initial player position at front door of starting building
  if (startNode && startNode.building) {
    const startLayout = getLocationLayout(startNode.building);
    if (startLayout) {
      sceneData.playerX = startLayout.frontDoorX;
      sceneData.playerY = startLayout.frontDoorY;
      sceneData.camX = startLayout.frontDoorX;
      sceneData.camY = startLayout.frontDoorY;
      sceneData.targetCamX = startLayout.frontDoorX;
      sceneData.targetCamY = startLayout.frontDoorY;
    }
  }

  setTimeout(startHeartbeat, 3000);
  addLog('═══ ECHO-7 АКТИВИРОВАН ═══', 'success');
  addLog(`${charData.name || 'Выживший'} · ${occ.name} · ${diff.name}`, 'info');
  addLog(`День 1. Ты приходишь в себя у входа в ${startLocName}. Вокруг тишина, нарушаемая лишь далёкими стонами.`, '');
  addLog('Кликни на помещение чтобы войти, или используй кнопки внизу.', 'info');

  updateUI();
  transitionScene();
  saveGame();

  // ── Multiplayer: after world gen, handle host or join ──
  if (window._pendingHost) {
    window._pendingHost = false;
    _showNetOverlay('📡 Подключение к серверу...');
    Bus.on('net:host_ready', () => { _removeNetOverlay(); showHostLobby(); });
    Bus.on('net:error', (e) => { _showNetOverlay('⚠ ' + e.error, true); });
    Net.hostGame(G.characterName || 'Host');
  } else if (window._pendingJoin) {
    window._pendingJoin = false;
    showJoinCodeInput();
  }
}

function _showNetOverlay(text, isError) {
  let el = document.getElementById('net-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'net-overlay';
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:5000;background:rgba(0,0,0,.9);border:1px solid var(--cyan);padding:20px 30px;text-align:center;font-family:monospace;border-radius:6px;max-width:300px';
    document.body.appendChild(el);
  }
  if (isError) {
    el.style.borderColor = 'var(--red)';
    el.innerHTML = `<div style="color:var(--red);font-size:11px">${text}</div><button onclick="document.getElementById('net-overlay')?.remove();Net.disconnect()" style="margin-top:8px;padding:6px 16px;border:1px solid var(--red);background:none;color:var(--red);font-family:monospace;cursor:pointer">Закрыть</button>`;
  } else {
    el.style.borderColor = 'var(--cyan)';
    el.innerHTML = `<div style="color:var(--cyan);font-size:12px">${text}</div>`;
  }
}

function _removeNetOverlay() {
  const el = document.getElementById('net-overlay');
  if (el) el.remove();
}

// Generate a building's internal structure (rooms, containers, loot, zombies)
function generateBuilding(locType, bldIdx) {
  const tmpl = LOCATION_TEMPLATES[locType];
  if (!tmpl) return null;
  const popMult = G.difficulty.population || 1;
  const infest = Math.max(0, Math.min(5, Math.round(rng.int(tmpl.baseInfest[0], tmpl.baseInfest[1]) * popMult)));
  const condition = rng.chance(80) ? 'intact' : (rng.chance(50) ? 'damaged' : 'collapsed');
  const hasFloor1 = tmpl.hasSecondFloor && condition !== 'collapsed' && rng.chance(65);
  const floorDefs = [];
  if (tmpl.floors[0]) floorDefs.push(...tmpl.floors[0].map(r => ({...r, floorNum:0})));
  if (hasFloor1 && tmpl.floors[1]) floorDefs.push(...tmpl.floors[1].map(r => ({...r, floorNum:1})));

  const rooms = floorDefs.filter(() => condition !== 'collapsed' || rng.chance(50)).map((roomDef) => {
    const furnDefs = ROOM_FURNITURE[roomDef.name] || [{name:'Ящик',icon:'□',shape:'box'}];
    const containers = furnDefs.map(fd => {
      const fl = FURNITURE_LOOT[fd.name];
      const loot = [];
      if (fl && fl.pool.length > 0) {
        const [minC, maxC] = fl.count;
        const cnt = Math.max(0, Math.floor(rng.int(minC, maxC + 1) * G.difficulty.lootMult));
        for (let i = 0; i < cnt; i++) {
          const itemId = rng.pick(fl.pool);
          if (ITEMS[itemId]) loot.push({ id:itemId, qty:1, durability:ITEMS[itemId].dur||0, freshDays:ITEMS[itemId].freshness||999 });
        }
      }
      // Lore notes are placed deterministically during world gen (see LORE NOTE PLACEMENT)
      // Some containers can be locked
      const lockableContainers = ['Сейф','Шкафчик','Тумбочка','Верстак','Ящик стола','Шкаф'];
      const isLockable = lockableContainers.includes(fd.name);
      const locked = isLockable && rng.chance(35) ? { difficulty: rng.int(1, Math.min(5, 1 + Math.floor(infest * 0.8))) } : null;
      return { name:fd.name, icon:fd.icon, loot, searched:false, locked };
    });
    const isSmall = roomDef.type === 'corridor' || roomDef.type === 'closet' || roomDef.type === 'stairs';
    // Some rooms can be locked (offices, storage, etc.)
    const lockFreq = G.difficulty.lockedFreq ?? 0.5;
    const lockableRooms = ['office','closet','storage','bedroom'];
    const roomLocked = lockableRooms.includes(roomDef.type) && rng.chance(25 * lockFreq * 2) ? { difficulty: rng.int(1, 3) } : null;

    // Valuable rooms are ALWAYS locked and require a key
    const valuableRooms = ['Оружейная','Арсенал','Аптечный склад','Серверная','Хранилище','Сейфовая'];
    const isValuable = valuableRooms.includes(roomDef.name);
    const valuableLocked = isValuable ? { difficulty: rng.int(3, 5), keyRequired: true, keyId: `key_${bldIdx}_${roomDef.name.replace(/\s/g,'_')}`, keyName: `Ключ от «${roomDef.name}»` } : null;

    return { name:roomDef.name, loot:[], containers, searched:false, floor:[], zombies:!isSmall && rng.chance(infest*15) ? spawnZombie(infest) : null, roomType:roomDef.type, floorNum:roomDef.floorNum, weight:roomDef.weight||1, locked: valuableLocked || roomLocked };
  });

  // Place keys for valuable locked rooms (40% chance) into random containers in OTHER rooms
  const valuableLockedRooms = rooms.filter(r => r.locked?.keyRequired);
  for (const vRoom of valuableLockedRooms) {
    if (!rng.chance(40)) continue; // 40% chance key spawns
    const otherRooms = rooms.filter(r => r !== vRoom && r.containers.length > 0);
    if (otherRooms.length > 0) {
      const targetRoom = rng.pick(otherRooms);
      const targetContainer = rng.pick(targetRoom.containers);
      targetContainer.loot.push({
        id: '_key', qty: 1, durability: 0, freshDays: 999,
        keyId: vRoom.locked.keyId, keyName: vRoom.locked.keyName
      });
    }
  }

  // Some building types have locked front doors
  const lockFreqB = G.difficulty.lockedFreq ?? 0.5;
  const lockableBuildings = ['police','military','bank','warehouse','pharmacy','office'];
  const buildingLocked = lockableBuildings.includes(locType) && rng.chance(50 * lockFreqB * 2) ? { difficulty: rng.int(2, 4) } : null;

  return {
    id: `bld-${bldIdx}`, type: locType,
    name: tmpl.name + (bldIdx > 0 ? ' #'+bldIdx : ''),
    infest, condition, looted:false, rooms,
    hasSecondFloor: hasFloor1, firstVisit:true, distance:1,
    locked: buildingLocked,
  };
}

// Generate loot containers for non-building nodes (car wrecks, parking, bus stops, gas stations)
function generateNodeContainers(nodeType) {
  const containers = [];
  if (nodeType === 'car_wreck') {
    containers.push({ name:'Бардачок', icon:'□', loot:generateLootFromTable('car_glove', rng.int(0,2)), searched:false });
    if (rng.chance(60)) containers.push({ name:'Багажник', icon:'▬', loot:generateLootFromTable('car_trunk', rng.int(0,3)), searched:false, locked: rng.chance(40) ? { difficulty: rng.int(1,2) } : null });
  } else if (nodeType === 'parking') {
    const cars = rng.int(1,3);
    for (let c = 0; c < cars; c++) {
      containers.push({ name:`Машина ${c+1}`, icon:'□', loot:generateLootFromTable('car_trunk', rng.int(0,2)), searched:false });
    }
  } else if (nodeType === 'bus_stop') {
    containers.push({ name:'Скамейка', icon:'▬', loot:generateLootFromTable('street', rng.int(0,2)), searched:false });
    containers.push({ name:'Мусорка', icon:'□', loot:generateLootFromTable('street', rng.int(0,1)), searched:false });
  } else if (nodeType === 'gas_station') {
    containers.push({ name:'Прилавок', icon:'□', loot:generateLootFromTable('gas_station', rng.int(1,3)), searched:false });
    containers.push({ name:'Стеллаж', icon:'▬', loot:generateLootFromTable('gas_station', rng.int(1,3)), searched:false });
    containers.push({ name:'Подсобка', icon:'□', loot:generateLootFromTable('warehouse', rng.int(0,2)), searched:false });
  }
  return containers;
}

function generateLootFromTable(tableId, count) {
  const table = LOOT_TABLES[tableId];
  if (!table) return [];
  const loot = [];
  for (let i = 0; i < count; i++) {
    const roll = rng.next();
    let pool;
    if (roll < 0.1 && table.rare) pool = table.rare;
    else if (roll < 0.35 && table.uncommon) pool = table.uncommon;
    else pool = table.common;
    const itemId = rng.pick(pool);
    if (ITEMS[itemId]) loot.push({ id:itemId, qty:1, durability:ITEMS[itemId].dur||0, freshDays:ITEMS[itemId].freshness||999 });
  }
  return loot;
}

function generateWorld() {
  const nodes = {};
  const nid = (x,y) => `n_${x}_${y}`;

  // Helper: add node
  function addNode(gx, gy, type, regionId, extra) {
    const id = nid(gx, gy);
    if (nodes[id]) return nodes[id]; // already exists
    const nt = NODE_TYPES[type];
    const node = {
      id, gx, gy, regionId, type,
      name: nt.name || type,
      building: null,
      connections: [],
      traverseTime: nt.time,
      dangerLevel: nt.danger || 0,
      lootContainers: [],
      searched: false,
      blocked: nt.blocked || false,
      blockType: nt.blocked ? (extra?.blockType || type) : null,
      blockToolReq: nt.toolReq || null,
      discovered: false,
      visited: false,
      ...extra,
    };
    nodes[id] = node;
    return node;
  }

  // Helper: connect two nodes bidirectionally
  function connect(id1, id2) {
    if (!nodes[id1] || !nodes[id2]) return;
    if (!nodes[id1].connections.includes(id2)) nodes[id1].connections.push(id2);
    if (!nodes[id2].connections.includes(id1)) nodes[id2].connections.push(id1);
  }

  // Helper: check if cell is free
  function isFree(x, y) { return !nodes[nid(x, y)]; }

  // For each region, generate road network + buildings
  const regionMeta = [];
  let globalBldIdx = 0;

  WORLD_CONFIG.regions.forEach((reg, ri) => {
    const ox = reg.gx, oy = reg.gy, rw = reg.w, rh = reg.h;

    // Phase 1: Road network
    // Generate 3 horizontal avenues (extend to edges for cross-region connections)
    const avenues = [];
    const avenueYs = [Math.floor(rh*0.25), Math.floor(rh*0.5), Math.floor(rh*0.75)];
    for (const ay of avenueYs) {
      const y = oy + ay;
      const startX = ox;
      const endX = ox + rw - 1;
      for (let x = startX; x <= endX; x++) {
        addNode(x, y, 'road', reg.id);
        if (x > startX) connect(nid(x-1,y), nid(x,y));
      }
      avenues.push(y);
    }

    // Generate 3 vertical streets (extend to edges)
    const streetXs = [Math.floor(rw*0.25), Math.floor(rw*0.5), Math.floor(rw*0.75)];
    for (const sx of streetXs) {
      const x = ox + sx;
      const startY = oy;
      const endY = oy + rh - 1;
      for (let y = startY; y <= endY; y++) {
        const existing = nodes[nid(x,y)];
        if (existing) {
          // Convert road to intersection where streets cross avenues
          existing.type = 'intersection';
          existing.name = NODE_TYPES.intersection.name;
          existing.dangerLevel = NODE_TYPES.intersection.danger;
          existing.traverseTime = NODE_TYPES.intersection.time;
        } else {
          addNode(x, y, 'road', reg.id);
        }
        if (y > startY) connect(nid(x,y-1), nid(x,y));
      }
    }

    // Add 2-4 side streets (short horizontal/vertical segments)
    const sideCount = rng.int(2, 4);
    for (let s = 0; s < sideCount; s++) {
      const isHoriz = rng.chance(50);
      if (isHoriz) {
        const y = oy + rng.int(3, rh-4);
        const sx = ox + rng.int(2, rw-8);
        const len = rng.int(3, 6);
        for (let x = sx; x < sx + len && x < ox + rw - 1; x++) {
          if (isFree(x, y)) addNode(x, y, 'road', reg.id);
          if (x > sx) connect(nid(x-1,y), nid(x,y));
          // Connect to perpendicular roads if adjacent
          if (nodes[nid(x,y-1)]) connect(nid(x,y), nid(x,y-1));
          if (nodes[nid(x,y+1)]) connect(nid(x,y), nid(x,y+1));
        }
      } else {
        const x = ox + rng.int(3, rw-4);
        const sy = oy + rng.int(2, rh-8);
        const len = rng.int(3, 6);
        for (let y = sy; y < sy + len && y < oy + rh - 1; y++) {
          if (isFree(x, y)) addNode(x, y, 'road', reg.id);
          if (y > sy) connect(nid(x,y-1), nid(x,y));
          if (nodes[nid(x-1,y)]) connect(nid(x,y), nid(x-1,y));
          if (nodes[nid(x+1,y)]) connect(nid(x,y), nid(x+1,y));
        }
      }
    }

    // Phase 2: Place buildings adjacent to roads
    // Find lots: empty cells adjacent to road/intersection nodes
    const roadNodes = Object.values(nodes).filter(n => n.regionId === reg.id && (n.type === 'road' || n.type === 'intersection'));
    const lots = [];
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const usedLots = new Set();
    roadNodes.forEach(rn => {
      dirs.forEach(([dx,dy]) => {
        const lx = rn.gx + dx, ly = rn.gy + dy;
        const lkey = `${lx}_${ly}`;
        if (lx >= ox && lx < ox+rw && ly >= oy && ly < oy+rh && isFree(lx, ly) && !usedLots.has(lkey)) {
          usedLots.add(lkey);
          lots.push({ gx:lx, gy:ly, roadId:rn.id });
        }
      });
    });
    // Shuffle lots
    for (let i = lots.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [lots[i], lots[j]] = [lots[j], lots[i]];
    }

    // Build weighted type pool from REGION_BUILDINGS distribution
    const buildingDist = REGION_BUILDINGS[reg.id] || {};
    const typePool = [];
    Object.entries(buildingDist).forEach(([type, weight]) => {
      for (let i = 0; i < weight; i++) typePool.push(type);
    });

    // Helper: check if multi-cell footprint is free
    function canPlaceFootprint(gx, gy, bw, bh) {
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const cx = gx + dx, cy = gy + dy;
          if (cx < ox || cx >= ox+rw || cy < oy || cy >= oy+rh) return false;
          if (!isFree(cx, cy)) return false;
        }
      }
      return true;
    }

    // Occupied cells tracker for multi-cell buildings
    const occupiedCells = new Set();

    // Fill ~75% of lots with buildings (realistic urban density)
    const fillRatio = reg.id === 'forest' ? 0.4 : reg.id === 'industrial' ? 0.65 : 0.78;
    const maxBuildings = Math.floor(lots.length * fillRatio);
    const regionLocations = [];
    let placed = 0;
    for (let li = 0; li < lots.length && placed < maxBuildings; li++) {
      const lot = lots[li];
      if (!isFree(lot.gx, lot.gy) || occupiedCells.has(`${lot.gx}_${lot.gy}`)) continue;
      const bType = typePool[rng.int(0, typePool.length - 1)];
      const meta = BUILDING_META[bType] || { w:1, h:1 };
      const bw = meta.w, bh = meta.h;

      // Try to place multi-cell building; try original orientation then rotated
      let placeX = lot.gx, placeY = lot.gy, finalW = bw, finalH = bh;
      let canPlace = false;
      if (bw === 1 && bh === 1) {
        canPlace = true;
      } else if (canPlaceFootprint(lot.gx, lot.gy, bw, bh)) {
        canPlace = true;
      } else if (bw !== bh && canPlaceFootprint(lot.gx, lot.gy, bh, bw)) {
        finalW = bh; finalH = bw; canPlace = true;
      } else {
        // Fall back to 1x1
        finalW = 1; finalH = 1; canPlace = true;
      }

      if (!canPlace) continue;

      globalBldIdx++;
      const bld = generateBuilding(bType, globalBldIdx);
      if (!bld) continue;

      const node = addNode(lot.gx, lot.gy, 'building', reg.id, {
        building: bld,
        name: bld.name,
        dangerLevel: bld.infest * 0.08,
        buildingW: finalW,
        buildingH: finalH,
      });
      connect(node.id, lot.roadId);

      // Mark all cells as occupied and connect to adjacent roads
      for (let dy = 0; dy < finalH; dy++) {
        for (let dx = 0; dx < finalW; dx++) {
          const cx = lot.gx + dx, cy = lot.gy + dy;
          occupiedCells.add(`${cx}_${cy}`);
          if (dx > 0 || dy > 0) {
            // Create a placeholder node that points to the main building
            const phId = nid(cx, cy);
            if (!nodes[phId]) {
              const ph = addNode(cx, cy, 'building', reg.id, {
                building: null, // placeholder — main building is at lot.gx, lot.gy
                parentBuildingId: node.id,
                name: bld.name,
                buildingW: 0, buildingH: 0, // marks as sub-cell
              });
              connect(ph.id, node.id);
            }
          }
          // Connect to adjacent road nodes
          dirs.forEach(([ddx, ddy]) => {
            const adj = nodes[nid(cx+ddx, cy+ddy)];
            if (adj && (adj.type === 'road' || adj.type === 'intersection')) {
              connect(node.id, adj.id);
            }
          });
        }
      }

      regionLocations.push(bld);
      placed++;
    }

    // Phase 3: Special nodes
    // Car wrecks on ~12% of road nodes
    const regionRoads = Object.values(nodes).filter(n => n.regionId === reg.id && n.type === 'road');
    regionRoads.forEach(rn => {
      if (rng.chance(12)) {
        rn.type = 'car_wreck';
        rn.name = NODE_TYPES.car_wreck.name;
        rn.dangerLevel = NODE_TYPES.car_wreck.danger;
        rn.traverseTime = NODE_TYPES.car_wreck.time;
        rn.lootContainers = generateNodeContainers('car_wreck');
      }
    });

    // Parking lots near large buildings
    const bigBuildings = Object.values(nodes).filter(n => n.regionId === reg.id && n.building && ['supermarket','office','warehouse','military','police','fire_station'].includes(n.building.type));
    bigBuildings.forEach(bn => {
      dirs.forEach(([dx,dy]) => {
        const px = bn.gx+dx, py = bn.gy+dy;
        if (isFree(px, py) && px >= ox && px < ox+rw && py >= oy && py < oy+rh && rng.chance(50)) {
          const pNode = addNode(px, py, 'parking', reg.id);
          pNode.lootContainers = generateNodeContainers('parking');
          connect(pNode.id, bn.id);
          // Connect to adjacent roads
          dirs.forEach(([dx2,dy2]) => {
            const adj = nodes[nid(px+dx2, py+dy2)];
            if (adj && adj.type !== 'building') connect(pNode.id, adj.id);
          });
        }
      });
    });

    // Bus stops (1-2 per region)
    const busCount = rng.int(1, 2);
    for (let b = 0; b < busCount; b++) {
      const roadPick = rng.pick(regionRoads);
      if (roadPick && roadPick.type === 'road') {
        roadPick.type = 'bus_stop';
        roadPick.name = NODE_TYPES.bus_stop.name;
        roadPick.traverseTime = NODE_TYPES.bus_stop.time;
        roadPick.dangerLevel = NODE_TYPES.bus_stop.danger;
        roadPick.lootContainers = generateNodeContainers('bus_stop');
      }
    }

    // Parks (1-2 per region, except forest)
    if (reg.id !== 'forest') {
      const parkCount = rng.int(1, 2);
      for (let p = 0; p < parkCount; p++) {
        const rx = ox + rng.int(3, rw-4), ry = oy + rng.int(3, rh-4);
        if (isFree(rx, ry)) {
          const parkNode = addNode(rx, ry, 'park', reg.id);
          // Connect to any adjacent nodes
          dirs.forEach(([dx,dy]) => {
            const adj = nodes[nid(rx+dx, ry+dy)];
            if (adj) connect(parkNode.id, adj.id);
          });
        }
      }
    }

    // Alleys (shortcuts, 1-2 per region in city areas)
    if (reg.id === 'city' || reg.id === 'industrial') {
      const alleyCount = rng.int(1, 2);
      for (let a = 0; a < alleyCount; a++) {
        // Find two building nodes close together and connect with alley
        const blds = Object.values(nodes).filter(n => n.regionId === reg.id && n.type === 'building');
        if (blds.length >= 2) {
          const b1 = rng.pick(blds);
          const nearby = blds.filter(b => b !== b1 && Math.abs(b.gx-b1.gx) + Math.abs(b.gy-b1.gy) <= 4);
          if (nearby.length > 0) {
            const b2 = rng.pick(nearby);
            const mx = Math.round((b1.gx+b2.gx)/2), my = Math.round((b1.gy+b2.gy)/2);
            if (isFree(mx, my)) {
              const alley = addNode(mx, my, 'alley', reg.id);
              connect(alley.id, b1.id);
              connect(alley.id, b2.id);
            }
          }
        }
      }
    }

    // Forest-specific: trails and clearings
    if (reg.id === 'forest') {
      // Add forest trails between roads
      for (let y = oy+1; y < oy+rh-1; y++) {
        for (let x = ox+1; x < ox+rw-1; x++) {
          if (isFree(x,y) && rng.chance(8)) {
            const adjRoad = dirs.some(([dx,dy]) => {
              const adj = nodes[nid(x+dx,y+dy)];
              return adj && (adj.type !== 'building');
            });
            if (adjRoad) {
              addNode(x, y, 'forest_trail', reg.id);
              dirs.forEach(([dx,dy]) => {
                const adj = nodes[nid(x+dx,y+dy)];
                if (adj && adj.type !== 'building') connect(nid(x,y), adj.id);
              });
            }
          }
        }
      }
      // Add 2 clearings
      for (let c = 0; c < 2; c++) {
        const cx = ox + rng.int(4, rw-5), cy = oy + rng.int(4, rh-5);
        if (isFree(cx, cy)) {
          const cl = addNode(cx, cy, 'forest_clearing', reg.id);
          dirs.forEach(([dx,dy]) => {
            const adj = nodes[nid(cx+dx,cy+dy)];
            if (adj) connect(cl.id, adj.id);
          });
        }
      }
    }

    // Barricade at region edges (1-2 per boundary)
    // (placed later after all regions are generated)

    regionMeta.push({
      id: reg.id, name: reg.name,
      scoutReq: reg.scoutReq, riskBase: reg.riskBase,
      locations: regionLocations, // for compatibility
      explored: ri === 0,
    });
  });

  // Phase 4: Connect regions at boundaries
  // Suburbs↔City (y boundary at 20), Suburbs↔Forest (x boundary at 20)
  // City↔Industrial (x boundary at 20), Forest↔Industrial (y boundary at 20)
  const boundaries = [
    { r1:'suburbs', r2:'city',       axis:'y', val:20, range:[0,20] },
    { r1:'suburbs', r2:'forest',     axis:'x', val:20, range:[0,20] },
    { r1:'city',    r2:'industrial', axis:'x', val:20, range:[20,40] },
    { r1:'forest',  r2:'industrial', axis:'y', val:20, range:[20,40] },
  ];
  boundaries.forEach(b => {
    // Find road nodes near boundary and connect them
    const crossings = [];
    if (b.axis === 'y') {
      for (let x = b.range[0]+1; x < b.range[1]-1; x++) {
        const above = nodes[nid(x, b.val-1)];
        const below = nodes[nid(x, b.val)];
        if (above && below) { connect(above.id, below.id); crossings.push([above,below]); }
        // Try to create bridge nodes if gap
        if (above && !below && isFree(x, b.val)) {
          addNode(x, b.val, 'road', b.r2);
          connect(above.id, nid(x, b.val));
          crossings.push([above, nodes[nid(x, b.val)]]);
        }
      }
    } else {
      for (let y = b.range[0]+1; y < b.range[1]-1; y++) {
        const left = nodes[nid(b.val-1, y)];
        const right = nodes[nid(b.val, y)];
        if (left && right) { connect(left.id, right.id); crossings.push([left,right]); }
        if (left && !right && isFree(b.val, y)) {
          addNode(b.val, y, 'road', b.r2);
          connect(left.id, nid(b.val, y));
          crossings.push([left, nodes[nid(b.val, y)]]);
        }
      }
    }
    // Add a barricade at one crossing point
    if (crossings.length > 0 && rng.chance(60)) {
      const [cn1, cn2] = rng.pick(crossings);
      // Place barricade between them
      const bx = Math.round((cn1.gx+cn2.gx)/2), by = Math.round((cn1.gy+cn2.gy)/2);
      if (nodes[nid(bx,by)]) {
        const existing = nodes[nid(bx,by)];
        existing.type = 'barricade';
        existing.name = NODE_TYPES.barricade.name;
        existing.blocked = true;
        existing.blockType = 'barricade';
        existing.blockToolReq = 'crowbar';
        existing.traverseTime = NODE_TYPES.barricade.time;
        existing.dangerLevel = NODE_TYPES.barricade.danger;
      }
    }
  });

  // ── Place NPC Base in city center ──
  const base = NPC_BASE;
  // Clear existing nodes in base area
  for (let bx = base.gx; bx < base.gx + base.w; bx++) {
    for (let by = base.gy; by < base.gy + base.h; by++) {
      const bid = nid(bx, by);
      if (nodes[bid]) {
        // Remove connections to this node
        nodes[bid].connections.forEach(adjId => {
          if (nodes[adjId]) nodes[adjId].connections = nodes[adjId].connections.filter(c => c !== bid);
        });
        delete nodes[bid];
      }
    }
  }

  // Place walls (perimeter)
  for (let bx = base.gx; bx < base.gx + base.w; bx++) {
    for (let by = base.gy; by < base.gy + base.h; by++) {
      const isEdge = bx === base.gx || bx === base.gx + base.w - 1 || by === base.gy || by === base.gy + base.h - 1;
      if (!isEdge) continue;
      // Gates at center of each wall
      const isMidX = bx === base.gx + Math.floor(base.w / 2);
      const isMidY = by === base.gy + Math.floor(base.h / 2);
      const isGate = (by === base.gy && isMidX) || (by === base.gy + base.h - 1 && isMidX) ||
                     (bx === base.gx && isMidY) || (bx === base.gx + base.w - 1 && isMidY);
      const gateNode = addNode(bx, by, isGate ? 'npc_gate' : 'npc_wall', 'city', {});
      // Connect gates to adjacent roads outside
      if (isGate) {
        [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy]) => {
          const adjId = nid(bx+dx, by+dy);
          if (nodes[adjId] && (nodes[adjId].type === 'road' || nodes[adjId].type === 'intersection')) {
            connect(gateNode.id, adjId);
          }
        });
      }
    }
  }

  // Place internal roads (cross pattern connecting gates)
  const midX = base.gx + Math.floor(base.w / 2);
  const midY = base.gy + Math.floor(base.h / 2);
  for (let bx = base.gx + 1; bx < base.gx + base.w - 1; bx++) {
    const bid = nid(bx, midY);
    if (!nodes[bid]) {
      const rn = addNode(bx, midY, 'road', 'city', {});
      // Connect to neighbors
      [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy]) => {
        const adjId = nid(bx+dx, midY+dy);
        if (nodes[adjId] && !nodes[adjId].blocked) connect(rn.id, adjId);
      });
    }
  }
  for (let by = base.gy + 1; by < base.gy + base.h - 1; by++) {
    const bid = nid(midX, by);
    if (!nodes[bid]) {
      const rn = addNode(midX, by, 'road', 'city', {});
      [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy]) => {
        const adjId = nid(midX+dx, by+dy);
        if (nodes[adjId] && !nodes[adjId].blocked) connect(rn.id, adjId);
      });
    }
  }
  // Center intersection
  const centerNode = nodes[nid(midX, midY)];
  if (centerNode) centerNode.type = 'intersection';

  // Place trader buildings inside the base
  const traderPositions = [
    { gx: base.gx + 1, gy: base.gy + 1 },
    { gx: base.gx + base.w - 2, gy: base.gy + 1 },
    { gx: base.gx + 1, gy: base.gy + base.h - 2 },
  ];
  NPC_TRADERS.forEach((trader, ti) => {
    const pos = traderPositions[ti];
    if (!pos) return;
    const bid = nid(pos.gx, pos.gy);
    // Remove if something already there
    if (nodes[bid]) {
      nodes[bid].connections.forEach(adjId => {
        if (nodes[adjId]) nodes[adjId].connections = nodes[adjId].connections.filter(c => c !== bid);
      });
      delete nodes[bid];
    }
    // Create trader building
    const bld = {
      id: `bld-trader-${ti}`, type: trader.buildingType,
      name: trader.buildingName, infest: 0, condition: 'intact',
      rooms: [
        { name: trader.buildingName, roomType: 'room', floorNum: 0, weight: 4,
          containers: [{ name: 'Прилавок', icon: '▬', loot: [], searched: true, locked: null }],
          searched: false, floor: [], zombies: null, locked: null, _inspected: false },
      ],
      hasSecondFloor: false, looted: false, firstVisit: true, distance: 1,
      isTraderShop: true,
      trader: { ...trader, stock: generateTraderStock(trader), lastRestock: 0 },
    };
    const traderNode = addNode(pos.gx, pos.gy, 'building', 'city', {
      building: bld, name: trader.buildingName, buildingW: 1, buildingH: 1,
    });
    // Connect to adjacent road
    [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy]) => {
      const adjId = nid(pos.gx+dx, pos.gy+dy);
      if (nodes[adjId] && !nodes[adjId].blocked) connect(traderNode.id, adjId);
    });
    traderNode.discovered = true;
  });

  // Place ruined buildings in base
  const ruinPositions = [
    { gx: base.gx + base.w - 2, gy: base.gy + base.h - 2 },
    { gx: base.gx + 2, gy: base.gy + 2 },
    { gx: base.gx + base.w - 2, gy: base.gy + 2 },
  ];
  RUIN_BUILDINGS.forEach((ruin, ri) => {
    const pos = ruinPositions[ri];
    if (!pos) return;
    const rid = nid(pos.gx, pos.gy);
    if (nodes[rid]) {
      nodes[rid].connections.forEach(adjId => {
        if (nodes[adjId]) nodes[adjId].connections = nodes[adjId].connections.filter(c => c !== rid);
      });
      delete nodes[rid];
    }
    // Generate rooms for ruined building (2 floors, 3 rooms each)
    const ruinRooms = [
      // Floor 0
      { name:'Прихожая', roomType:'corridor', floorNum:0, weight:2, containers:[], searched:false, floor:[], zombies:null, locked:null, _inspected:false, _ruinRestored:false },
      { name:'Гостиная', roomType:'room', floorNum:0, weight:4, containers:[], searched:false, floor:[], zombies:null, locked:null, _inspected:false, _ruinRestored:false },
      { name:'Кухня', roomType:'room', floorNum:0, weight:3, containers:[], searched:false, floor:[], zombies:null, locked:null, _inspected:false, _ruinRestored:false },
      // Floor 1
      { name:'Лестница (2й)', roomType:'stairs', floorNum:1, weight:1, containers:[], searched:false, floor:[], zombies:null, locked:null, _inspected:false, _ruinRestored:false },
      { name:'Спальня', roomType:'room', floorNum:1, weight:4, containers:[], searched:false, floor:[], zombies:null, locked:null, _inspected:false, _ruinRestored:false },
      { name:'Мастерская', roomType:'room', floorNum:1, weight:3, containers:[], searched:false, floor:[], zombies:null, locked:null, _inspected:false, _ruinRestored:false },
    ];
    // Also add stairs on floor 0
    ruinRooms.splice(1, 0, { name:'Лестница (1й)', roomType:'stairs', floorNum:0, weight:1, containers:[], searched:false, floor:[], zombies:null, locked:null, _inspected:false, _ruinRestored:false });

    const bld = {
      id: `bld-ruin-${ri}`, type: 'house',
      name: ruin.name, infest: 0, condition: 'intact',
      rooms: ruinRooms, hasSecondFloor: true, looted: false, firstVisit: true,
      isRuin: true,
      ruin: {
        id: ruin.id,
        upgrades: [],     // installed upgrade IDs
        storage: [],      // stored items
        gardenLastHarvest: 0,
        owned: false,
      },
    };
    const ruinNode = addNode(pos.gx, pos.gy, 'building', 'city', {
      building: bld, name: ruin.name, buildingW: 1, buildingH: 1,
    });
    [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy]) => {
      const adjId2 = nid(pos.gx+dx, pos.gy+dy);
      if (nodes[adjId2] && !nodes[adjId2].blocked) connect(ruinNode.id, adjId2);
    });
    ruinNode.discovered = true;
  });

  // Discover ALL nodes inside NPC base (walls, gates, roads, traders)
  for (let bx = base.gx; bx < base.gx + base.w; bx++) {
    for (let by = base.gy; by < base.gy + base.h; by++) {
      const bid = nid(bx, by);
      if (nodes[bid]) { nodes[bid].discovered = true; nodes[bid].visited = true; }
    }
  }

  // ── Fill empty cells with traversable ground nodes ──
  for (let gx = 0; gx < WORLD_CONFIG.gridW; gx++) {
    for (let gy = 0; gy < WORLD_CONFIG.gridH; gy++) {
      const id = nid(gx, gy);
      if (nodes[id]) continue;
      // Determine region
      let regId = 'suburbs';
      if (gx >= 20 && gy < 20) regId = 'forest';
      else if (gx >= 20) regId = 'industrial';
      else if (gy >= 20) regId = 'city';
      const groundNode = addNode(gx, gy, 'ground', regId, {
        name: regId === 'forest' ? 'Тропа' : 'Пустырь',
      });
      // Connect to adjacent existing nodes
      [[0,-1],[0,1],[-1,0],[1,0]].forEach(([dx,dy]) => {
        const adjId = nid(gx+dx, gy+dy);
        if (nodes[adjId] && !nodes[adjId].blocked) connect(groundNode.id, adjId);
      });
    }
  }

  // ── STREET NAMING ──
  WORLD_CONFIG.regions.forEach(reg => {
    const ox = reg.gx, oy = reg.gy, rw = reg.w, rh = reg.h;
    const pool = [...(STREET_NAMES[reg.id] || STREET_NAMES.suburbs)];
    // Shuffle pool
    for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    let nameIdx = 0;
    // Name horizontal avenues
    const aYs = [Math.floor(rh*0.25), Math.floor(rh*0.5), Math.floor(rh*0.75)];
    for (const ay of aYs) {
      const sName = 'ул. ' + (pool[nameIdx++] || 'Безымянная');
      for (let x = ox; x < ox + rw; x++) {
        const n = nodes[nid(x, oy + ay)];
        if (n && (n.type === 'road' || n.type === 'intersection')) { n.streetName = sName; n.streetDir = 'h'; }
      }
    }
    // Name vertical streets
    const sXs = [Math.floor(rw*0.25), Math.floor(rw*0.5), Math.floor(rw*0.75)];
    for (const sx of sXs) {
      const sName = (pool[nameIdx++] || 'Безымянный') + ' пр.';
      for (let y = oy; y < oy + rh; y++) {
        const n = nodes[nid(ox + sx, y)];
        if (n && (n.type === 'road' || n.type === 'intersection')) {
          if (!n.streetName) { n.streetName = sName; n.streetDir = 'v'; }
          else n.streetName2 = sName; // intersections get both
        }
      }
    }
  });

  // ── BUILDING ADDRESSES ──
  // For each building, inherit street name from adjacent road and assign number
  const streetCounters = {};
  Object.values(nodes).forEach(n => {
    if (n.type !== 'building' || !n.building) return;
    // Find adjacent road with a street name
    for (const adjId of n.connections) {
      const adj = nodes[adjId];
      if (adj && adj.streetName && (adj.type === 'road' || adj.type === 'intersection')) {
        const st = adj.streetName;
        if (!streetCounters[st]) streetCounters[st] = 1;
        n.building.address = st + ', ' + streetCounters[st];
        streetCounters[st] += 2; // odd numbers one side
        break;
      }
    }
  });

  // ── LORE NOTE PLACEMENT ──
  const usedNoteBuildings = new Set();
  LORE_NOTES.forEach(note => {
    // Find a building matching region + type
    const candidates = Object.values(nodes).filter(n =>
      n.type === 'building' && n.building && n.regionId === note.region &&
      n.building.type === note.buildingType && !usedNoteBuildings.has(n.id) &&
      n.building.rooms?.some(r => r.containers?.length > 0)
    );
    if (candidates.length === 0) return;
    const picked = candidates[rng.int(0, candidates.length - 1)];
    usedNoteBuildings.add(picked.id);
    // Find a container with space
    const rooms = picked.building.rooms.filter(r => r.containers?.length > 0);
    if (rooms.length === 0) return;
    const room = rooms[rng.int(0, rooms.length - 1)];
    const cont = room.containers[rng.int(0, room.containers.length - 1)];
    cont.loot.push({ id:'note', qty:1, durability:0, freshDays:999, loreId:note.id });
  });

  // ── TRIGGER EVENT PLACEMENT ──
  const usedTriggerBuildings = new Set();
  TRIGGER_EVENTS.forEach(evt => {
    const candidates = Object.values(nodes).filter(n =>
      n.type === 'building' && n.building && n.regionId === evt.region &&
      evt.buildingTypes.includes(n.building.type) && !usedTriggerBuildings.has(n.id) && !usedNoteBuildings.has(n.id)
    );
    if (candidates.length === 0) return;
    const picked = candidates[rng.int(0, candidates.length - 1)];
    usedTriggerBuildings.add(picked.id);
    picked.triggerEvent = evt.id;
    G.triggers[evt.id] = { seen: false, nodeId: picked.id };
  });

  // ── AIRDROP PLACEMENT ──
  const startGx = 5, startGy = 5; // approx suburbs start area
  const airdropCandidates = Object.values(nodes).filter(n =>
    (n.type === 'road' || n.type === 'intersection') && !isInNPCBase(n.gx, n.gy) &&
    (Math.abs(n.gx - startGx) + Math.abs(n.gy - startGy)) >= 12
  );
  if (airdropCandidates.length > 0) {
    const adNode = airdropCandidates[rng.int(0, airdropCandidates.length - 1)];
    adNode.isAirdrop = true;
    adNode.name = 'Точка сброса';
    adNode.lootContainers = [{
      name: 'Ящик сброса', icon: '📦', searched: false, locked: null,
      loot: [
        { id:'canned_food', qty:3, durability:0, freshDays:999 },
        { id:'water', qty:3, durability:0, freshDays:999 },
        { id:'antibiotics', qty:2, durability:0, freshDays:999 },
        { id:'bandage', qty:3, durability:0, freshDays:999 },
        { id:'ammo_9x19', qty:15, durability:0, freshDays:999 },
        { id:'battery', qty:3, durability:0, freshDays:999 },
      ]
    }];
    G.radio.airdropNodeId = adNode.id;
    G.radio.airdropStreet = adNode.streetName || 'неизвестная улица';
  }

  // Store in G.world
  G.world.nodes = nodes;
  G.world.regions = regionMeta;

  // Set starting position: find first building in suburbs
  const startNode = Object.values(nodes).find(n => n.regionId === 'suburbs' && n.type === 'building');
  G.world.currentNodeId = startNode ? startNode.id : Object.keys(nodes)[0];
  if (startNode) {
    startNode.discovered = true;
    startNode.visited = true;
    // Discover adjacent nodes
    startNode.connections.forEach(adjId => { if (nodes[adjId]) nodes[adjId].discovered = true; });
  }

  // Discover starting area (3-hop radius)
  discoverRadius(G.world.currentNodeId, 3);
}

// BFS discovery: mark all nodes within `radius` hops as discovered
function discoverRadius(startId, radius) {
  const nodes = G.world.nodes;
  if (!nodes[startId]) return;
  const queue = [[startId, 0]];
  const visited = new Set([startId]);
  while (queue.length) {
    const [nid, depth] = queue.shift();
    const node = nodes[nid];
    if (!node) continue;
    node.discovered = true;
    if (depth < radius) {
      for (const adjId of node.connections) {
        if (!visited.has(adjId)) {
          visited.add(adjId);
          queue.push([adjId, depth + 1]);
        }
      }
    }
  }
}

// ── A* PATHFINDING ──
function findPathAStar(fromId, toId) {
  const nodes = G.world.nodes;
  if (!nodes[fromId] || !nodes[toId]) return null;
  if (fromId === toId) return [fromId];

  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();
  const openSet = new Set([fromId]);
  const closedSet = new Set();

  const h = (a, b) => {
    const na = nodes[a], nb = nodes[b];
    return Math.abs(na.gx - nb.gx) + Math.abs(na.gy - nb.gy);
  };

  gScore.set(fromId, 0);
  fScore.set(fromId, h(fromId, toId));

  while (openSet.size > 0) {
    let current = null, bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) || Infinity;
      if (f < bestF) { bestF = f; current = id; }
    }

    if (current === toId) {
      const path = [current];
      while (cameFrom.has(current)) {
        current = cameFrom.get(current);
        path.unshift(current);
      }
      return path;
    }

    openSet.delete(current);
    closedSet.add(current);

    const node = nodes[current];
    for (const adjId of node.connections) {
      if (closedSet.has(adjId)) continue;
      const adj = nodes[adjId];
      if (!adj) continue;
      if (adj.blocked && adjId !== toId) continue;

      const nt = NODE_TYPES[adj.type] || {};
      const tentG = (gScore.get(current) || 0) + (nt.time || 5);

      if (tentG < (gScore.get(adjId) || Infinity)) {
        cameFrom.set(adjId, current);
        gScore.set(adjId, tentG);
        fScore.set(adjId, tentG + h(adjId, toId));
        openSet.add(adjId);
      }
    }
  }
  return null;
}

// ── ROUTE SYSTEM ──
function startRoute(targetId, stops) {
  const path = findPathAStar(G.world.currentNodeId, targetId);
  if (!path || path.length < 2) {
    addLog('Нет доступного маршрута.', 'warning');
    return false;
  }
  G.world.currentRoute = {
    path: path,
    currentStep: 0,
    paused: false,
    stops: stops ? new Set(stops) : new Set(),
    destinationId: targetId,
  };
  addLog(`Маршрут проложен: ${path.length - 1} переходов.`, 'info');
  executeRouteStep();
  return true;
}

function cancelRoute() {
  if (G.world.currentRoute) {
    if (G.world.currentRoute._moveTimer) clearTimeout(G.world.currentRoute._moveTimer);
    G.world.currentRoute = null;
    mapState.moveAnim = null;
    addLog('Маршрут отменён.', 'info');
    updateUI();
  }
}

function resumeRoute() {
  if (G.world.currentRoute && G.world.currentRoute.paused) {
    G.world.currentRoute.paused = false;
    mapState.moveAnim = null;
    executeRouteStep();
  }
}

function executeRouteStep() {
  const route = G.world.currentRoute;
  if (!route || route.paused) return;
  if (!G.player.alive) { cancelRoute(); return; }

  const nextIdx = route.currentStep + 1;
  if (nextIdx >= route.path.length) {
    G.world.currentRoute = null;
    mapState.moveAnim = null;
    addLog('Вы прибыли в пункт назначения.', 'success');
    playSound('step');
    updateUI();
    saveGame();
    return;
  }

  const fromNodeId = route.path[route.currentStep];
  const nextNodeId = route.path[nextIdx];
  const nextNode = G.world.nodes[nextNodeId];
  if (!nextNode) { cancelRoute(); return; }

  const nt = NODE_TYPES[nextNode.type] || {};
  const traverseMin = nt.time || 5;

  // Check barricade
  if (nextNode.blocked) {
    const hasReqTool = nt.toolReq && G.player.inventory.some(i => i.id === nt.toolReq);
    if (!hasReqTool) {
      addLog(`Путь заблокирован: ${nextNode.name || nt.name}. Нужен: ${nt.toolReq ? ITEMS[nt.toolReq]?.name || nt.toolReq : 'инструмент'}.`, 'warning');
      route.paused = true;
      mapState.moveAnim = null;
      updateUI();
      return;
    }
    addLog(`Разбираешь баррикаду...`, 'info');
    nextNode.blocked = false;
  }

  // Start movement animation (5 seconds real time per node)
  const stealthTimeMult = G.player.stealthMode ? 1.6 : 1.0;
  const moveDuration = Math.round(5000 * stealthTimeMult); // slower in stealth
  mapState.moveAnim = {
    fromId: fromNodeId,
    toId: nextNodeId,
    progress: 0,
    startTime: Date.now(),
    duration: moveDuration,
  };

  // Schedule arrival
  route._moveTimer = setTimeout(() => {
    mapState.moveAnim = null;

    // Advance game time
    advanceTime(traverseMin, true);
    const legPenalty = (G.player.hp.legL < 50 ? 1 : 0) + (G.player.hp.legR < 50 ? 1 : 0);
    if (legPenalty > 0) advanceTime(legPenalty, true);
    // Stealth slows travel but is quieter
    const stealthTimeAdd = G.player.stealthMode ? Math.ceil(traverseMin * 0.3) : 0;
    if (stealthTimeAdd > 0) advanceTime(stealthTimeAdd, true);

    // Noise
    const noiseMult = G.player.stealthMode ? 0.4 : 1.0;
    addNoise(Math.ceil(traverseMin * 0.5 * noiseMult * (G.modifiers.movementNoiseMult || 1)));

    // Encounter check
    const dangerBase = nt.danger || 0.08;
    const nightBonus = getNightMod() * 0.01;
    const noiseBonus = G.player.moodles.noise * 0.001;
    const encounterChance = (dangerBase + nightBonus + noiseBonus) * 100;

    if (rng.chance(encounterChance)) {
      moveToNode(nextNodeId);
      route.currentStep = nextIdx;
      const infest = nextNode.building ? nextNode.building.infest : 2;
      const zombie = spawnZombie(infest);
      addLog(`${nextNode.name || nt.name}: встречаешь ${zombie.name}!`, 'danger');
      route.paused = true;
      playSound('alert');
      startCombat(zombie, null);
      updateUI();
      return;
    }

    // Random loot
    if (nt.lootTable && rng.chance(12)) {
      const table = LOOT_TABLES[nt.lootTable];
      if (table) {
        const pool = table.common || Object.values(table).flat();
        const itemId = rng.pick(pool);
        if (itemId && ITEMS[itemId]) {
          addItem(itemId, 1);
          addLog(`Находишь на дороге: ${ITEMS[itemId].name}`, 'success');
        }
      }
    }

    // Arrive at node
    moveToNode(nextNodeId);
    route.currentStep = nextIdx;

    // Check stop
    if (route.stops.has(nextNodeId)) {
      route.paused = true;
      addLog(`Остановка: ${nextNode.name || nt.name}.`, 'info');
      playSound('step');
      updateUI();
      saveGame();
      return;
    }

    updateUI();
    // Continue to next step
    executeRouteStep();
  }, moveDuration);
}

// Update movement animation progress each frame (called from renderMapCanvas)
function updateMoveAnim() {
  if (!mapState.moveAnim) return;
  const ma = mapState.moveAnim;
  ma.progress = Math.min(1, (Date.now() - ma.startTime) / ma.duration);
}

// Move player to a specific node
function moveToNode(nodeId) {
  const node = G.world.nodes[nodeId];
  if (!node) return;
  Bus.emit('player:move', { nodeId });

  // Track heading direction from previous node
  const prevNode = G.world.currentNodeId ? G.world.nodes[G.world.currentNodeId] : null;
  if (prevNode && prevNode.id !== nodeId) {
    G.world.lastHeading = { dx: node.gx - prevNode.gx, dy: node.gy - prevNode.gy };
  }

  G.world.currentNodeId = nodeId;
  G.world.currentRoom = -1;
  G.world.currentFloor = 0;
  node.visited = true;
  node.discovered = true;
  if(G?._dayStats) G._dayStats.nodesVisited++;
  if (typeof Net !== 'undefined') Net.markDirty(nodeId);

  // Auto-discover 2x2 area around player (Manhattan distance 2)
  discoverArea(nodeId, 2);

  // Scouting XP
  addSkillXp('scouting', 5);

  // Position camera
  if (node.building) {
    const layout = getLocationLayout(node.building);
    if (layout) {
      sceneData.playerX = layout.frontDoorX;
      sceneData.playerY = layout.frontDoorY;
      sceneData.targetCamX = layout.frontDoorX;
      sceneData.targetCamY = layout.frontDoorY;
    }
  } else {
    // Non-building: center player on screen
    const w = canvas ? canvas.width / window.devicePixelRatio : 400;
    const h = canvas ? canvas.height / window.devicePixelRatio : 400;
    sceneData.playerX = w / 2;
    sceneData.playerY = h / 2;
    sceneData.camX = w / 2;
    sceneData.camY = h / 2;
    sceneData.targetCamX = w / 2;
    sceneData.targetCamY = h / 2;
  }

  transitionScene();
  if (typeof showZoneTransition === 'function') showZoneTransition();

  // Auto-show special building UIs after arriving
  if (node.building?.isRuin) {
    setTimeout(() => showRuinUI(node.building), 800);
  } else if (node.building?.isTraderShop && node.building?.trader) {
    setTimeout(() => showNPCDialog(node.building.trader), 800);
  }

  // Trigger events (lore)
  if (node.triggerEvent && G.triggers[node.triggerEvent] && !G.triggers[node.triggerEvent].seen) {
    G.triggers[node.triggerEvent].seen = true;
    const evt = TRIGGER_EVENTS.find(e => e.id === node.triggerEvent);
    if (evt) setTimeout(() => showTriggerEvent(evt), 1000);
    // Sync to other players
    if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE') {
      Net.broadcast({ t:'e', e:'trigger_seen', triggerId: node.triggerEvent });
    }
  }
}

// Discover all nodes within Manhattan distance `dist` on the grid
function discoverArea(startId, dist) {
  const nodes = G.world.nodes;
  const start = nodes[startId];
  if (!start) return;
  const gx = start.gx, gy = start.gy;
  for (const nid in nodes) {
    const n = nodes[nid];
    if (n.discovered) continue;
    if (Math.abs(n.gx - gx) <= dist && Math.abs(n.gy - gy) <= dist) {
      n.discovered = true;
    }
  }
}

// Interact with lootable non-building nodes (car_wreck, parking, bus_stop, gas_station)
function searchCurrentNode() {
  const node = currentNode();
  if (!node) return;
  if (node.type === 'building') return; // buildings use room system

  const nt = NODE_TYPES[node.type];
  if (!nt?.lootable && !node.isAirdrop) {
    addLog('Здесь нечего обыскивать.', 'info');
    return;
  }

  if (node.searched) {
    addLog('Уже обыскано.', 'info');
    return;
  }

  advanceTime(5, true); // 5 minutes to search
  addNoise(G.player.stealthMode ? 2 : 5);

  if (node.lootContainers && node.lootContainers.length > 0) {
    // Show loot picker with node containers
    let allLoot = [];
    node.lootContainers.forEach(c => {
      (c.items || c.loot || []).forEach(item => allLoot.push(item));
    });
    if (allLoot.length > 0) {
      node.searched = true;
      showNodeLootPicker(node, allLoot);
      return;
    }
  }

  node.searched = true;
  addLog('Ничего полезного не найдено.', 'info');
  updateUI();
}

function showNodeLootPicker(node, lootItems) {
  const isEn = LANG?.current === 'en';
  const nt = NODE_TYPES[node.type] || {};
  const nodeName = node.isAirdrop ? (isEn ? 'Supply Drop' : 'Точка сброса') : (node.name || nt.name);
  let html = `<div style="margin-bottom:8px;color:var(--text-dim);font-size:11px">${isEn ? 'Found at' : 'Найдено в'}: ${nodeName}</div>`;
  html += `<div style="color:var(--text-dim);font-size:10px;margin-bottom:6px">${isEn ? 'Weight' : 'Вес'}: ${G.player.weight}/${maxWeight()} ${isEn ? 'kg' : 'кг'}</div>`;
  html += '<div style="max-height:300px;overflow-y:auto">';

  lootItems.forEach((item, idx) => {
    const it = ITEMS[item.id];
    if (!it) return;
    const icon = typeof itemIconHtml === 'function' ? itemIconHtml(item.id, 20) : '';
    html += `<div class="inv-item" style="cursor:pointer;padding:6px">
      <div class="item-info">${icon}
        <div class="item-text">
          <div class="name">${it.name}${item.qty > 1 ? ' ×'+item.qty : ''}</div>
          <div class="meta">${(it.weight||0.1)} ${isEn ? 'kg' : 'кг'}</div>
        </div>
      </div>
      <button class="act-btn" style="flex:0;min-width:60px" onclick="takeNodeLoot('${node.id}',${idx})">${isEn ? 'Take' : 'Взять'}</button>
    </div>`;
  });

  html += '</div>';
  html += `<div style="margin-top:8px;display:flex;gap:6px">`;
  html += `<button class="act-btn" onclick="takeAllNodeLoot('${node.id}')" style="flex:1">${isEn ? 'Take All' : 'Взять всё'}</button>`;
  html += `<button class="act-btn" onclick="closeModal()" style="flex:1">${isEn ? 'Close' : 'Закрыть'}</button>`;
  html += `</div>`;
  openModal(nodeName, html);
}

function _getNodeAllLoot(node) {
  const all = [];
  if (!node?.lootContainers) return all;
  node.lootContainers.forEach(c => {
    const items = c.items || c.loot || [];
    items.forEach(item => all.push({ item, container: c, key: c.items ? 'items' : 'loot' }));
  });
  return all;
}

function takeNodeLoot(nodeId, itemIdx) {
  const node = G.world.nodes[nodeId];
  if (!node) return;
  const allItems = _getNodeAllLoot(node);
  if (itemIdx < 0 || itemIdx >= allItems.length) return;

  const { item, container, key } = allItems[itemIdx];
  addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays });
  const itemName = ITEMS[item.id]?.name || item.id;
  addLog(`Подобрано: ${itemName}`, 'success');
  playSound('pickup');
  if (typeof showLootAnimation === 'function') showLootAnimation(itemName);

  // Remove from container
  const arr = container[key] || [];
  const idx = arr.indexOf(item);
  if (idx >= 0) arr.splice(idx, 1);

  if (typeof Net !== 'undefined') Net.markDirty(nodeId);
  // Refresh
  const remaining = _getNodeAllLoot(node).map(e => e.item);
  if (remaining.length > 0) {
    showNodeLootPicker(node, remaining);
  } else {
    closeModal();
    addLog(LANG?.current === 'en' ? 'All taken.' : 'Всё забрано.', 'info');
  }
  calcWeight();
  updateUI();
  saveGame();
}

function takeAllNodeLoot(nodeId) {
  const node = G.world.nodes[nodeId];
  if (!node) return;
  const allItems = _getNodeAllLoot(node);

  allItems.forEach(({ item, container, key }, i) => {
    addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays });
    const itemName = ITEMS[item.id]?.name || item.id;
    setTimeout(() => {
      playSound('pickup');
      if (typeof showLootAnimation === 'function') showLootAnimation(itemName, window.innerWidth/2 + (Math.random()-0.5)*60, window.innerHeight/2 - i*20);
    }, i * 150);
  });

  // Clear all containers
  node.lootContainers.forEach(c => {
    if (c.items) c.items = [];
    if (c.loot) c.loot = [];
  });

  closeModal();
  addLog(`${LANG?.current === 'en' ? 'Taken' : 'Забрано'}: ${allItems.length} ${LANG?.current === 'en' ? 'items' : 'предм.'}`, 'success');
  calcWeight();
  updateUI();
  saveGame();
}

function spawnZombie(infest) {
  const roll = rng.next();
  let type;
  if (infest >= 4 && roll < 0.15) type = 'soldier';
  else if (infest >= 3 && roll < 0.25) type = 'fat';
  else if (roll < 0.3) type = 'runner';
  else type = 'shambler';

  if (G.difficulty.zombieSpeed === 'fast' && type === 'shambler' && rng.chance(40)) type = 'runner';
  if (G.difficulty.zombieSpeed === 'slow' && type === 'runner' && rng.chance(60)) type = 'shambler';

  const base = ZOMBIE_TYPES[type];
  const hpMult = G.difficulty.zombieHp || 1;
  const dmgMult = G.difficulty.zombieDmg || 1;
  const hp = Math.round(base.hp * hpMult);
  return { ...base, type, hp, currentHp: hp, dmg: Math.round(base.dmg * dmgMult) };
}

// ══ WEATHER & SEASONS ══
const SEASON_ORDER = ['spring','summer','autumn','winter'];
const SEASON_TEMP = { spring:[5,15], summer:[20,35], autumn:[0,12], winter:[-15,-5] };
const WEATHER_TEMP_MOD = { clear:0, cloudy:-2, rain:-5, storm:-8, snow:-10 };
const WEATHER_WIND = { clear:0, cloudy:2, rain:5, storm:10, snow:6 };
const WEATHER_PROB = {
  spring: {clear:35,cloudy:30,rain:25,storm:10,snow:0},
  summer: {clear:50,cloudy:25,rain:20,storm:5,snow:0},
  autumn: {clear:25,cloudy:30,rain:25,storm:10,snow:10},
  winter: {clear:20,cloudy:25,rain:5,storm:10,snow:40},
};

function getCurrentSeason() {
  if (!G) return 'summer';
  const startSeason = G.world.season || G.difficulty?.startSeason || 'summer';
  const startIdx = SEASON_ORDER.indexOf(startSeason);
  const SEASON_LENGTH = 30; // 30 days per season (realistic)
  const seasonsPassed = Math.floor((G.time.day - 1) / SEASON_LENGTH);
  return SEASON_ORDER[(startIdx + seasonsPassed) % 4];
}

function updateWeather() {
  if (!G) return;
  const hoursSinceChange = ((G.time.day - 1) * 24 + G.time.hour) - (G.world.lastWeatherChange || 0);
  const changeInterval = 4 + Math.floor(Math.random() * 8); // 4-12 hours
  if (hoursSinceChange < changeInterval) return;

  G.world.lastWeatherChange = (G.time.day - 1) * 24 + G.time.hour;
  const season = getCurrentSeason();
  const probs = WEATHER_PROB[season] || WEATHER_PROB.summer;

  // Weighted random pick
  const total = Object.values(probs).reduce((s,v) => s+v, 0);
  let roll = Math.random() * total;
  for (const [weather, prob] of Object.entries(probs)) {
    roll -= prob;
    if (roll <= 0) { G.world.weather = weather; break; }
  }

  // Calculate base outside temp
  const seasonRange = SEASON_TEMP[season] || [10,25];
  const baseTemp = seasonRange[0] + Math.random() * (seasonRange[1] - seasonRange[0]);
  const timeOfDay = getTimePeriod();
  const timeMod = timeOfDay === 'night' ? -8 : timeOfDay === 'dawn' ? -3 : timeOfDay === 'dusk' ? -2 : 0;
  const weatherMod = WEATHER_TEMP_MOD[G.world.weather] || 0;
  G.world.outsideTemp = Math.round(baseTemp + timeMod + weatherMod);
}

function getPlayerInsulation() {
  if (!G?.player?.equipment) return { insulation:0, windResist:0, waterResist:0 };
  let ins=0, wind=0, water=0, count=0;
  Object.values(G.player.equipment).forEach(id => {
    if (!id || !ITEMS[id]) return;
    const def = ITEMS[id];
    if (def.insulation !== undefined) { ins += def.insulation; count++; }
    if (def.windResist !== undefined) wind += def.windResist;
    if (def.waterResist !== undefined) water += def.waterResist;
  });
  // Average insulation across worn items (cap at 95)
  const slots = Math.max(count, 1);
  return {
    insulation: Math.min(95, ins / slots),
    windResist: Math.min(95, wind / Math.max(Object.values(G.player.equipment).filter(v=>v).length, 1)),
    waterResist: Math.min(95, water / Math.max(Object.values(G.player.equipment).filter(v=>v).length, 1)),
  };
}

function getWeatherIcon() {
  const w = G?.world?.weather || 'clear';
  const icons = { clear:'\u2600\uFE0F', cloudy:'\u26C5', rain:'\uD83C\uDF27\uFE0F', storm:'\u26C8\uFE0F', snow:'\u2744\uFE0F' };
  return icons[w] || '\u2600\uFE0F';
}

function getTemperatureStatus() {
  const bt = G?.player?.moodles?.bodyTemp || 36.6;
  if (bt < 30) return { key:'temp.hypothermia_severe', icon:'\uD83E\uDD76', color:'#2244ff' };
  if (bt < 33) return { key:'temp.hypothermia', icon:'\uD83E\uDD76', color:'#4466ff' };
  if (bt < 35) return { key:'temp.cold', icon:'\u2744\uFE0F', color:'#6699ff' };
  if (bt < 36) return { key:'temp.chilly', icon:'\uD83C\uDF21\uFE0F', color:'#88aacc' };
  if (bt <= 37.5) return { key:'temp.normal', icon:'\u2713', color:'var(--green)' };
  if (bt <= 38.5) return { key:'temp.warm', icon:'\uD83C\uDF24\uFE0F', color:'#ffcc00' };
  if (bt <= 40) return { key:'temp.fever', icon:'\uD83D\uDD25', color:'#ff8800' };
  if (bt <= 42) return { key:'temp.heatstroke', icon:'\u2620\uFE0F', color:'#ff4400' };
  return { key:'temp.heatstroke_severe', icon:'\u2620\uFE0F', color:'#ff0000' };
}

function getWetnessStatus() {
  const w = G?.player?.moodles?.wetness || 0;
  if (w < 20) return { key:'wet.dry', icon:'', color:'var(--text-dim)' };
  if (w < 50) return { key:'wet.damp', icon:'\uD83D\uDCA7', color:'#6699cc' };
  if (w < 80) return { key:'wet.wet', icon:'\uD83D\uDCA6', color:'#4488ff' };
  return { key:'wet.soaked', icon:'\uD83C\uDF0A', color:'#2266ff' };
}

// ── TIME SYSTEM ──
// Advance game time by minutes (or hours for legacy calls)
function advanceTime(hours = 1, isMinutes = false) {
  if (G.creative) {
    // In creative mode: no hunger, thirst, fatigue, always full HP
    Object.keys(G.player.moodles).forEach(k => G.player.moodles[k] = k === 'bodyTemp' ? 36.6 : 0);
    Object.keys(G.player.hp).forEach(k => G.player.hp[k] = 100);
    G.player.alive = true;
  }
  const totalMinutes = isMinutes ? hours : hours * 60;
  G.time.minute = (G.time.minute || 0) + totalMinutes;

  while (G.time.minute >= 60) {
    G.time.minute -= 60;
    G.time.hour++;
    advanceHourTick();
  }
  while (G.time.minute < 0) { G.time.minute += 60; G.time.hour--; }

  // Per-minute moodle micro-ticks
  const m = G.modifiers || {};
  const minFrac = totalMinutes / 60;
  G.player.moodles.hunger = Math.min(100, G.player.moodles.hunger + 1.5 * (m.hungerMult || 1) * minFrac);
  G.player.moodles.thirst = Math.min(100, G.player.moodles.thirst + 2.5 * (m.thirstMult || 1) * minFrac);
  G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + (G.player.moodles.thirst > 75 ? 2 : 1) * (m.fatigueMult || 1) * minFrac);

  // ── Weather & Temperature (per minute) ──
  if (!G.creative) {
    updateWeather();
    const isOutdoor = G.world.currentRoom < 0 || !currentLocation();
    const weather = G.world.weather || 'clear';
    const pIns = getPlayerInsulation();

    // Wetness
    if (isOutdoor && (weather === 'rain' || weather === 'storm')) {
      const rainRate = weather === 'storm' ? 0.5 : 0.3;
      const waterBlock = pIns.waterResist / 100;
      G.player.moodles.wetness = Math.min(100, G.player.moodles.wetness + rainRate * (1 - waterBlock));
    } else if (isOutdoor && weather === 'snow') {
      G.player.moodles.wetness = Math.min(100, G.player.moodles.wetness + 0.15 * (1 - pIns.waterResist / 100));
    } else {
      // Drying rate
      const hasGenerator = false; // TODO: check ruin upgrades
      const dryRate = isOutdoor ? 0.05 : (hasGenerator ? 0.4 : 0.15);
      G.player.moodles.wetness = Math.max(0, G.player.moodles.wetness - dryRate);
    }

    // Wetness reduces insulation effectiveness
    const wetPenalty = G.player.moodles.wetness > 90 ? 0.8 : G.player.moodles.wetness > 60 ? 0.5 : G.player.moodles.wetness > 30 ? 0.3 : 0;
    const effectiveInsulation = pIns.insulation * (1 - wetPenalty);

    // Environment temperature
    const airTemp = G.world.outsideTemp || 20;
    // Indoor temperature: sheltered, pulled toward ~20°C
    const envTemp = isOutdoor
      ? airTemp - (WEATHER_WIND[weather] || 0) * (1 - pIns.windResist / 100) * 0.3
      : airTemp + (20 - airTemp) * 0.6;

    // Body temperature physics
    const bodyTemp = G.player.moodles.bodyTemp || 36.6;

    // Comfortable air range: 16-26°C — no thermal stress
    const comfortLow = 16, comfortHigh = 26;
    let heatChange = 0;

    if (envTemp < comfortLow) {
      // COLD — body loses heat
      const severity = comfortLow - envTemp;
      const exposure = severity * (1 - effectiveInsulation / 100) * 0.004;
      const wetBonus = G.player.moodles.wetness * 0.001;
      heatChange = -(exposure + wetBonus);
    } else if (envTemp > comfortHigh) {
      // HOT — body gains heat
      const severity = envTemp - comfortHigh;
      const exposure = severity * 0.003;
      const insulationTrap = effectiveInsulation > 40 ? (effectiveInsulation - 40) * 0.001 : 0;
      heatChange = exposure + insulationTrap;
    }
    // 16-26°C: heatChange = 0, body returns to normal via homeostasis

    // Activity generates slight heat
    if (sceneData?.playerMoving || (sceneData?._keysHeld?.size > 0)) {
      heatChange += 0.003;
    }

    // Illness causes fever
    if (G.player.moodles.illness > 30) {
      heatChange += 0.003 * (G.player.moodles.illness / 100);
    }

    // Strong homeostasis — body regulates back to 36.6°
    const deviation = bodyTemp - 36.6;
    heatChange += -deviation * 0.01;

    G.player.moodles.bodyTemp = Math.max(28, Math.min(44, bodyTemp + heatChange));
  }

  // Noise attraction — loud sounds draw zombies (check before decay)
  if (G.player.moodles.noise > 50) {
    const attractChance = (G.player.moodles.noise - 50) * 0.4; // 0-20% at noise 50-100
    if (rng.chance(attractChance) && typeof triggerRandomEncounter === 'function') {
      addLog('⚠ Шум привлёк внимание!', 'danger');
      triggerRandomEncounter();
    }
  }

  // Noise decay — sound dissipates quickly (exponential decay)
  // Each game-minute noise drops by ~40% (stealth: ~55%)
  if (G.player.moodles.noise > 0) {
    const decayFactor = G.player.stealthMode ? 0.45 : 0.60; // retain this fraction per minute
    const decayPower = totalMinutes; // per actual minute elapsed
    G.player.moodles.noise *= Math.pow(decayFactor, decayPower);
    // Snap to zero below threshold to avoid lingering decimal dust
    if (G.player.moodles.noise < 0.5) G.player.moodles.noise = 0;
  }

  // Check death
  if (G.player.hp.head <= 0 || G.player.hp.torso <= 0) {
    playerDeath('Критические ранения');
  }
  updateUI();
}

// Full hour tick — called when hour boundary crossed
function advanceHourTick() {
  if (G.time.hour >= 24) {
    G.time.hour -= 24;
    generateDiaryEntry();
    G.time.day++;
    G.player.daysSurvived = G.time.day - 1;
    if (typeof checkNewAirdrop === 'function') checkNewAirdrop();
    G.player.inventory.forEach(it => {
      if (ITEMS[it.id]?.type === 'food' && it.freshDays < 999) it.freshDays--;
    });
  }

  const m = G.modifiers || {};

  // Depression
  let depGrow = 0.3;
  if (G.player.moodles.hunger > 60) depGrow += 0.5;
  if (G.player.moodles.pain > 40) depGrow += 0.4;
  if (G.player.moodles.infection > 30) depGrow += 0.6;
  const period = getTimePeriod();
  if (period === 'night') depGrow += 0.3;
  else if (period === 'dusk') depGrow += 0.15;
  if (G.player.daysSurvived > 7) depGrow += 0.2;
  if (m.smoker && !hasItem('cigarettes')) depGrow += 1.0;
  G.player.moodles.depression = Math.min(100, (G.player.moodles.depression || 0) + depGrow);
  if (G.player.moodles.depression > 80) {
    G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + 0.5);
  }

  // ── Temperature effects (per hour) ──
  const bt = G.player.moodles.bodyTemp || 36.6;

  if (bt < 30) {
    // Severe hypothermia
    Object.keys(G.player.hp).forEach(k => G.player.hp[k] = Math.max(0, G.player.hp[k] - 5));
    G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + 3);
    if(G?._dayStats) G._dayStats.wasHurt = true;
  } else if (bt < 33) {
    // Hypothermia
    G.player.hp.torso = Math.max(0, G.player.hp.torso - 2);
    G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + 2);
    if(G?._dayStats) G._dayStats.wasHurt = true;
  } else if (bt < 35) {
    // Mild hypothermia
    G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + 1);
  } else if (bt < 36) {
    // Chilly
    G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + 0.3);
  }

  if (bt > 42) {
    // Critical heatstroke
    Object.keys(G.player.hp).forEach(k => G.player.hp[k] = Math.max(0, G.player.hp[k] - 5));
    G.player.moodles.thirst = Math.min(100, G.player.moodles.thirst + 4);
    if(G?._dayStats) G._dayStats.wasHurt = true;
  } else if (bt > 40) {
    // Heatstroke
    G.player.hp.torso = Math.max(0, G.player.hp.torso - 2);
    G.player.moodles.thirst = Math.min(100, G.player.moodles.thirst + 3);
    if(G?._dayStats) G._dayStats.wasHurt = true;
  } else if (bt > 38.5) {
    // Fever/hot
    G.player.moodles.thirst = Math.min(100, G.player.moodles.thirst + 2);
    G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + 1);
  } else if (bt > 37.5) {
    // Warm
    G.player.moodles.thirst = Math.min(100, G.player.moodles.thirst + 0.5);
  }

  // Illness chance from cold/wet exposure
  if ((bt < 35 || G.player.moodles.wetness > 50) && G.player.moodles.illness === 0) {
    const illChance = (bt < 33 ? 8 : bt < 35 ? 4 : 0) + (G.player.moodles.wetness > 80 ? 5 : G.player.moodles.wetness > 50 ? 2 : 0);
    if (rng.chance(illChance)) {
      G.player.moodles.illness = 20 + Math.floor(rng.next() * 30); // 20-50 initial severity
      addLog('Вы заболели! Простуда.', 'danger');
    }
  }

  // Illness progression
  if (G.player.moodles.illness > 0) {
    G.player.moodles.fatigue = Math.min(100, G.player.moodles.fatigue + 1);
    G.player.moodles.noise = Math.min(100, G.player.moodles.noise + 3); // coughing
    // Natural recovery (slow)
    G.player.moodles.illness = Math.max(0, G.player.moodles.illness - 0.3);
    // Antibiotics cure faster (check if player used antibiotics recently is complex, just let it decay)
  }

  // Temperature death checks
  if (bt < 30 && G.player.hp.torso <= 0) { playerDeath('Гипотермия'); return; }
  if (bt > 42 && G.player.hp.torso <= 0) { playerDeath('Тепловой удар'); return; }

  // Bleeding & infection
  if (G.player.moodles.bleeding > 0) {
    const parts = Object.keys(G.player.hp);
    const part = parts[Math.floor(rng.next() * parts.length)];
    G.player.hp[part] = Math.max(0, G.player.hp[part] - 2);
    if(G?._dayStats) G._dayStats.wasHurt=true;
  }
  if (G.player.moodles.infection > 75) {
    G.player.hp.torso = Math.max(0, G.player.hp.torso - 3);
    if(G?._dayStats) G._dayStats.wasHurt=true;
  }

  // Starvation / dehydration damage
  if (G.player.moodles.hunger >= 95) {
    G.player.hp.torso = Math.max(0, G.player.hp.torso - 2);
    if (G.player.moodles.hunger >= 100) G.player.hp.torso = Math.max(0, G.player.hp.torso - 3);
  }
  if (G.player.moodles.thirst >= 95) {
    G.player.hp.torso = Math.max(0, G.player.hp.torso - 3);
    if (G.player.moodles.thirst >= 100) G.player.hp.torso = Math.max(0, G.player.hp.torso - 5);
  }

  // Death check after bleeding/infection/starvation (bug fix)
  if (G.player.hp.torso <= 0) {
    const cause = G.player.moodles.thirst >= 95 ? 'Обезвоживание' : G.player.moodles.hunger >= 95 ? 'Голод' : G.player.moodles.infection > 75 ? 'Заражение' : 'Кровотечение';
    playerDeath(cause);
    return;
  }
  if (G.player.hp.head <= 0) { playerDeath('Травма головы'); return; }

  // Noise attraction (moved main check to per-minute tick for faster decay system)
}

// Real-time clock update (called from animLoop)
function tickRealTime(now) {
  if (!G || !G.player.alive || G.paused) { G.lastRealTime = now; return; }
  // Modal open = paused (except during timed actions or multiplayer)
  const modalOpen = document.getElementById('modal-overlay')?.classList.contains('active');
  const isMultiplayer = typeof Net !== 'undefined' && Net.mode !== 'OFFLINE';
  if (modalOpen && !G.activeAction && !isMultiplayer) { G.lastRealTime = now; return; }

  const dt = (now - (G.lastRealTime || now)) / 1000; // seconds
  G.lastRealTime = now;
  if (dt > 2) {
    // Large gap (tab switch) — skip game time but still process timed actions
    if (G.activeAction) {
      G.activeAction.elapsed += Math.min(dt, G.activeAction.duration);
      updateActionProgress();
      if (G.activeAction && G.activeAction.elapsed >= G.activeAction.duration) {
        const cb = G.activeAction.callback;
        G.activeAction = null;
        closeModal();
        if (cb) cb();
      }
    }
    return;
  }

  // 1 real second = 1 game minute (only HOST or OFFLINE advances time)
  if (typeof Net === 'undefined' || Net.mode !== 'CLIENT') {
    G.realTimeAccum = (G.realTimeAccum || 0) + dt;
    while (G.realTimeAccum >= 1) {
      G.realTimeAccum -= 1;
      advanceTime(1, true); // 1 minute
    }
  }

  // Timed action progress
  if (G.activeAction) {
    G.activeAction.elapsed += dt;
    updateActionProgress();
    if (G.activeAction && G.activeAction.elapsed >= G.activeAction.duration) {
      const cb = G.activeAction.callback;
      G.activeAction = null;
      closeModal();
      if (cb) cb();
    }
  }
}

function getTimePeriod() {
  const h = G.time.hour;
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 18) return 'day';
  if (h >= 18 && h < 21) return 'dusk';
  return 'night';
}

function getTimeString() {
  return `DAY ${G.time.day} · ${String(G.time.hour).padStart(2,'0')}:${String(G.time.minute || 0).padStart(2,'0')}`;
}

function getNightMod() {
  const p = getTimePeriod();
  const hasTorch = G && G.player && hasItem('torch');
  if (p === 'night') return G.difficulty.nightPenalty * 100 * (hasTorch ? 0.5 : 1);
  if (p === 'dusk') return G.difficulty.nightPenalty * 50 * (hasTorch ? 0.7 : 1);
  return 0;
}

// ── PLAYER HELPERS ──
function calcWeight() {
  let w = 0;
  G.player.inventory.forEach(it => { w += (ITEMS[it.id]?.weight || 0) * it.qty; });
  G.player.weight = Math.round(w * 10) / 10;
}

function maxWeight() {
  let base = 10 + G.player.skills.strength * 2 + (G.modifiers?.weightBonus || 0);
  // Back slot (backpack) adds capacity
  const back = G.player.equipment?.back;
  if (back && ITEMS[back]) base += ITEMS[back].capacity || 0;
  // Rig adds capacity
  const rig = G.player.equipment?.rig;
  if (rig && ITEMS[rig]) base += ITEMS[rig].capacity || 0;
  return base;
}

function getArmor() {
  let armor = 0;
  if (!G.player.equipment) return 0;
  const eq = G.player.equipment;
  // Full armor from protective gear
  const fullArmorSlots = ['armor', 'head', 'face', 'gloves'];
  for (const slot of fullArmorSlots) {
    const id = eq[slot];
    if (id && ITEMS[id]) armor += ITEMS[id].armor || 0;
  }
  // Partial armor (25%) from regular clothing
  const partialSlots = ['torso', 'legs', 'feet', 'rig', 'back'];
  for (const slot of partialSlots) {
    const id = eq[slot];
    if (id && ITEMS[id]) armor += Math.floor((ITEMS[id].armor || 0) * 0.25);
  }
  return armor;
}

function isEncumbered() {
  return G.player.weight > maxWeight();
}

function getMoodleLevel(val) {
  if (val < 20) return 'ok';
  if (val < 45) return 'mild';
  if (val < 70) return 'severe';
  return 'critical';
}

function getMoodleModifier() {
  let mod = 0;
  const m = G.player.moodles;
  if (m.hunger >= 70) mod -= 30;
  else if (m.hunger >= 45) mod -= 15;
  else if (m.hunger >= 20) mod -= 5;

  if (m.fatigue >= 70) mod -= 25;
  else if (m.fatigue >= 45) mod -= 15;

  if (m.pain >= 70) mod -= 20;
  else if (m.pain >= 45) mod -= 10;

  if (m.panic >= 70) mod -= 25;
  else if (m.panic >= 45) mod -= 15;

  if (isEncumbered()) mod -= 30;
  return mod;
}

function addNoise(amount) { G.player.moodles.noise = Math.min(100, G.player.moodles.noise + amount); }

function getTotalHp() {
  const hp = G.player.hp;
  return Math.round((hp.head + hp.torso + hp.armL + hp.armR + hp.legL + hp.legR) / 6);
}

function addSkillXp(skill, amount) {
  const xpMult = G.modifiers?.xpMult || 1;
  const gained = Math.round(amount * xpMult);
  G.player.skillXp[skill] = (G.player.skillXp[skill] || 0) + gained;
  if (typeof showXpGain === 'function') showXpGain(skill, gained, getSkillName(skill));
  const threshold = (G.player.skills[skill] + 1) * 30;
  if (G.player.skillXp[skill] >= threshold && G.player.skills[skill] < 5) {
    G.player.skills[skill]++;
    G.player.skillXp[skill] = 0;
    addLog(`▲ Навык "${getSkillName(skill)}" повышен до ${G.player.skills[skill]}!`, 'success');
    if (typeof showSkillLevelUp === 'function') showSkillLevelUp(getSkillName(skill), G.player.skills[skill], skill);
  }
}

function getSkillName(s) {
  const isEn = LANG?.current === 'en';
  const names = isEn
    ? { strength:'Strength', stealth:'Stealth', scouting:'Scouting', firstAid:'First Aid', mechanics:'Mechanics', cooking:'Cooking', lockpicking:'Lockpicking', firearms:'Firearms' }
    : { strength:'Сила', stealth:'Скрытность', scouting:'Скаутинг', firstAid:'Медицина', mechanics:'Механика', cooking:'Готовка', lockpicking:'Взлом', firearms:'Огнестрел' };
  return names[s] || s;
}

function hasItem(id, qty = 1) {
  const items = G.player.inventory.filter(i => i.id === id);
  let total = 0;
  items.forEach(i => total += i.qty);
  return total >= qty;
}

function countItem(id) {
  let total = 0;
  G.player.inventory.filter(i => i.id === id).forEach(i => total += (i.qty || 1));
  return total;
}

function removeItem(id, qty = 1) {
  let remaining = qty;
  for (let i = G.player.inventory.length - 1; i >= 0 && remaining > 0; i--) {
    if (G.player.inventory[i].id === id) {
      if (G.player.inventory[i].qty <= remaining) {
        remaining -= G.player.inventory[i].qty;
        G.player.inventory.splice(i, 1);
      } else {
        G.player.inventory[i].qty -= remaining;
        remaining = 0;
      }
    }
  }
  calcWeight();
}

function addItem(id, qty = 1, extra = {}) {
  const def = ITEMS[id];
  if (!def) return;
  const canStack = (def.type === 'ammo' || def.type === 'material' || def.type === 'food' || def.type === 'medicine' || def.type === 'comfort' || def.type === 'throwable') && !extra.keyId;
  const existing = canStack ? G.player.inventory.find(i => i.id === id && !i.keyId) : null;
  if (existing) {
    existing.qty += qty;
  } else {
    G.player.inventory.push({ id, qty, durability: def.dur || 0, freshDays: def.freshness || 999, ...extra });
  }
  if(G?._dayStats) G._dayStats.itemsFound++;
  calcWeight();
}

function getEquippedWeapon() {
  const wId = getActiveWeaponId();
  if (wId === 'fist' || !ITEMS[wId]) return { ...ITEMS.fist, id: 'fist' };
  const inv = G.player.inventory.find(i => i.id === wId);
  if (!inv) {
    // Weapon not in inventory - clear slot
    const slot = G.player.activeSlot || 1;
    G.player[`weaponSlot${slot}`] = null;
    G.player.equipped = 'fist';
    return { ...ITEMS.fist, id: 'fist' };
  }
  G.player.equipped = wId;
  return { ...ITEMS[inv.id], id: inv.id, durability: inv.durability };
}

// ── LOCATION HELPERS ──
function currentNode() { return G.world.nodes ? G.world.nodes[G.world.currentNodeId] : null; }
function currentRegion() {
  const node = currentNode();
  if (node) {
    return WORLD_CONFIG.regions.find(r => r.id === node.regionId) || WORLD_CONFIG.regions[0];
  }
  return G.world.regions[G.world.currentRegion]; // legacy fallback
}
function currentLocation() {
  const node = currentNode();
  if (node && node.building) return node.building;
  // On non-building nodes (roads etc.), no location
  if (node) return null;
  // legacy fallback only if no node system
  const reg = G.world.regions[G.world.currentRegion];
  return reg ? reg.locations[G.world.currentLocation] : null;
}
function currentRoom() {
  const loc = currentLocation();
  return (loc && G.world.currentRoom >= 0) ? loc.rooms[G.world.currentRoom] : null;
}

// ── ACTIONS ──
function doAction(action) {
  if (!G.player.alive) return;

  // Fatigue random noise at critical
  if (G.player.moodles.fatigue >= 70 && rng.chance(20)) {
    addNoise(8);
    addLog('Ты спотыкаешься от усталости. Шум!', 'warning');
  }
  // Panic uncontrolled
  if (G.player.moodles.panic >= 70 && rng.chance(15)) {
    addLog('ПАНИКА! Ты теряешь контроль и бежишь!', 'danger');
    addNoise(20);
    G.player.moodles.panic = Math.max(0, G.player.moodles.panic - 20);
    advanceTime(1);
    updateUI();
    return;
  }

  switch (action) {
    case 'search':
      const cn = currentNode();
      if (cn && cn.type !== 'building' && (NODE_TYPES[cn.type]?.lootable || cn.isAirdrop)) {
        searchCurrentNode();
      } else {
        doSearch();
      }
      break;
    case 'move': showRoomSelect(); break;
    case 'goUp': changeFloor(1); break;
    case 'goDown': changeFloor(0); break;
    case 'travel': showMap(); break;
    case 'inventory': showInventory(); break;
    case 'health': showHealth(); break;
    case 'craft': showCrafting(); break;
    case 'stealth': toggleStealth(); break;
    case 'rest': doRest(); break;
    case 'map': showMap(); break;
    case 'radio': showRadioChat(); break;
    case 'base': doBase(); break;
    case 'scout': doScout(); break;
    case 'save': saveGame(); addLog('Игра сохранена.', 'info'); break;
  }
}

// ── LOCKPICKING ──
const LOCK_DIFFICULTY_NAMES = ['','Простой','Средний','Сложный','Очень сложный','Мастерский'];
const LOCK_DIFFICULTY_COLORS = ['','var(--green)','var(--yellow)','var(--orange,#cc8833)','var(--red)','#cc33ff'];

function getLockLabel(diff) { return LOCK_DIFFICULTY_NAMES[diff] || 'Замок'; }
function getLockColor(diff) { return LOCK_DIFFICULTY_COLORS[diff] || 'var(--text-dim)'; }

// Show lock interaction modal — choose crowbar, lockpick, or key
function showLockModal(locked, targetName, onUnlock) {
  const diff = locked.difficulty;
  const hasCrowbar = hasItem('crowbar');
  const hasLockpickItem = hasItem('lockpick');
  const lockpickSkill = G.player.skills.lockpicking || 0;
  const needsSkill = Math.max(0, diff - 1);

  // Check if player has the matching key
  const hasKey = locked.keyRequired && locked.keyId &&
    G.player.inventory.some(it => it.id === '_key' && it.keyId === locked.keyId);

  let html = `<div style="text-align:center;margin-bottom:12px">
    <div style="font-size:14px;color:${getLockColor(diff)}">🔒 ${getLockLabel(diff)} замок (${diff}/5)</div>
    <div style="color:var(--text-dim);font-size:11px;margin-top:4px">${targetName}</div>
    ${locked.keyRequired ? '<div style="color:var(--cyan);font-size:10px;margin-top:3px">Требуется ключ (или взлом)</div>' : ''}
  </div>`;

  // Key option (instant, silent, if player has the right key)
  if (locked.keyRequired) {
    html += `<div style="margin-bottom:8px">`;
    if (hasKey) {
      html += `<button class="act-btn" onclick="useKeyToUnlock('${locked.keyId}')" style="width:100%;padding:8px;margin-bottom:4px;border-color:var(--cyan);color:var(--cyan)">
        🗝 ${locked.keyName || 'Ключ'} <span style="color:var(--text-dim);font-size:10px">(мгновенно · тихо)</span>
      </button>`;
    } else {
      html += `<button class="act-btn" disabled style="width:100%;padding:8px;margin-bottom:4px;opacity:.4">
        🗝 ${locked.keyName || 'Ключ'} <span style="color:var(--red);font-size:10px">(ключ не найден — ищите в здании)</span>
      </button>`;
    }
    html += `</div>`;
  }

  // Crowbar option
  html += `<div style="margin-bottom:8px">`;
  if (hasCrowbar) {
    const time = 15 + diff * 3;
    html += `<button class="act-btn" onclick="startCrowbarMinigame(${diff}, '${targetName.replace(/'/g,"\\'")}', ${time})" style="width:100%;padding:8px;margin-bottom:4px">
      🔨 Монтировка <span style="color:var(--text-dim);font-size:10px">(${time}с · шум · не треб. навык)</span>
    </button>`;
  } else {
    html += `<button class="act-btn" disabled style="width:100%;padding:8px;margin-bottom:4px;opacity:.4">
      🔨 Монтировка <span style="color:var(--red);font-size:10px">(нет в инвентаре)</span>
    </button>`;
  }
  html += `</div>`;

  // Lockpick option
  html += `<div style="margin-bottom:8px">`;
  if (hasLockpickItem && lockpickSkill >= needsSkill) {
    html += `<button class="act-btn" onclick="startLockpickMinigame(${diff}, '${targetName.replace(/'/g,"\\'")}' )" style="width:100%;padding:8px;margin-bottom:4px">
      🔑 Отмычка <span style="color:var(--text-dim);font-size:10px">(тихо · навык ${needsSkill}+)</span>
    </button>`;
  } else {
    const reason = !hasLockpickItem ? 'нет отмычки' : `нужен навык Взлом ${needsSkill}`;
    html += `<button class="act-btn" disabled style="width:100%;padding:8px;margin-bottom:4px;opacity:.4">
      🔑 Отмычка <span style="color:var(--red);font-size:10px">(${reason})</span>
    </button>`;
  }
  html += `</div>`;

  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;border-color:#661122;color:var(--red);margin-top:4px">Отмена</button>`;

  // Store callback for after unlock
  G._lockUnlockCallback = onUnlock;
  openModal('Заперто', html);
}

function useKeyToUnlock(keyId) {
  closeModal();
  // Find and remove the key from inventory
  const keyIdx = G.player.inventory.findIndex(it => it.id === '_key' && it.keyId === keyId);
  if (keyIdx >= 0) {
    const keyItem = G.player.inventory[keyIdx];
    addLog(`Использован: ${keyItem.keyName || 'Ключ'}`, 'success');
    playSound('unlock');
    // Don't remove key — player keeps it (can reuse if locked again by save/load)
  }
  // Trigger unlock callback
  if (G._lockUnlockCallback) {
    const cb = G._lockUnlockCallback;
    G._lockUnlockCallback = null;
    cb();
  }
  updateUI();
}

// ── CROWBAR MINIGAME — timing bar ──
function startCrowbarMinigame(difficulty, targetName, duration) {
  closeModal();
  const greenWidth = Math.max(8, 30 - difficulty * 4); // % of bar that is green zone
  const speed = 1.5 + difficulty * 0.5; // line speed multiplier
  const greenStart = 30 + Math.random() * (70 - greenWidth - 30); // random position 30%-70%

  const html = `<div style="text-align:center">
    <div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">Нажми когда линия в зелёной зоне!</div>
    <canvas id="crowbar-canvas" width="300" height="60" style="width:300px;height:60px;border:1px solid var(--green-dim);background:#0a0a0a;cursor:pointer;display:block;margin:0 auto"></canvas>
    <div style="color:var(--text-dim);font-size:10px;margin-top:6px">
      <span id="crowbar-timer">${duration}с</span> · Шум: ■■■
    </div>
    <div style="margin-top:8px">
      <button class="act-btn" id="crowbar-hit-btn" onclick="crowbarHit()" style="width:100%;padding:10px;font-size:14px">⚡ УДАР</button>
    </div>
    <button class="act-btn" onclick="cancelCrowbar()" style="width:100%;margin-top:6px;border-color:#661122;color:var(--red)">Отмена</button>
  </div>`;
  openModal('Взлом монтировкой', html);
  document.getElementById('modal-close').style.display = 'none';

  const canvas = document.getElementById('crowbar-canvas');
  canvas.addEventListener('click', crowbarHit);
  const ctx = canvas.getContext('2d');

  G._crowbar = {
    difficulty, targetName, duration,
    greenStart, greenWidth, speed,
    linePos: 0, direction: 1, elapsed: 0,
    active: true, animFrame: null, lastTime: Date.now()
  };

  function animateCrowbar() {
    if (!G._crowbar || !G._crowbar.active) return;
    const now = Date.now();
    const dt = (now - G._crowbar.lastTime) / 1000;
    G._crowbar.lastTime = now;
    G._crowbar.elapsed += dt;

    // Update timer
    const timerEl = document.getElementById('crowbar-timer');
    const left = Math.max(0, G._crowbar.duration - G._crowbar.elapsed);
    if (timerEl) timerEl.textContent = `${Math.ceil(left)}с`;

    // Time ran out — auto fail
    if (G._crowbar.elapsed >= G._crowbar.duration) {
      crowbarFail('Время вышло!');
      return;
    }

    // Move line
    G._crowbar.linePos += G._crowbar.direction * dt * 100 * G._crowbar.speed;
    if (G._crowbar.linePos >= 100) { G._crowbar.linePos = 100; G._crowbar.direction = -1; }
    if (G._crowbar.linePos <= 0) { G._crowbar.linePos = 0; G._crowbar.direction = 1; }

    // Draw
    const w = 300, h = 60;
    ctx.clearRect(0, 0, w, h);

    // Green zone
    const gx = (G._crowbar.greenStart / 100) * w;
    const gw = (G._crowbar.greenWidth / 100) * w;
    ctx.fillStyle = 'rgba(0,180,0,0.3)';
    ctx.fillRect(gx, 0, gw, h);
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 1;
    ctx.strokeRect(gx, 0, gw, h);

    // Moving line
    const lx = (G._crowbar.linePos / 100) * w;
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, h);
    ctx.stroke();

    // Progress bar at bottom
    const pct = G._crowbar.elapsed / G._crowbar.duration;
    ctx.fillStyle = 'rgba(255,100,0,0.4)';
    ctx.fillRect(0, h - 4, w * pct, 4);

    G._crowbar.animFrame = requestAnimationFrame(animateCrowbar);
  }
  G._crowbar.animFrame = requestAnimationFrame(animateCrowbar);
}

function crowbarHit() {
  if (!G._crowbar || !G._crowbar.active) return;
  const cb = G._crowbar;
  const linePos = cb.linePos;

  // Check if line is in green zone
  if (linePos >= cb.greenStart && linePos <= cb.greenStart + cb.greenWidth) {
    crowbarSuccess();
  } else {
    crowbarFail('Промах! Не попал в зелёную зону.');
  }
}

function crowbarSuccess() {
  if (!G._crowbar) return;
  G._crowbar.active = false;
  if (G._crowbar.animFrame) cancelAnimationFrame(G._crowbar.animFrame);

  // Noise based on elapsed time
  const noiseAmount = 15 + Math.round(G._crowbar.elapsed * 2);
  addNoise(noiseAmount);

  // XP
  addSkillXp('lockpicking', 5 + G._crowbar.difficulty * 3);

  // Crowbar durability
  const inv = G.player.inventory;
  for (let i = 0; i < inv.length; i++) {
    if (inv[i].id === 'crowbar') {
      inv[i].dur = (inv[i].dur || 100) - (5 + G._crowbar.difficulty * 2);
      if (inv[i].dur <= 0) {
        inv.splice(i, 1);
        addLog('Монтировка сломалась!', 'danger');
        calcWeight();
      }
      break;
    }
  }

  addLog(`Замок взломан монтировкой! (шум: +${noiseAmount})`, 'success');
  playSound('craft');
  closeModal();

  if (G._lockUnlockCallback) {
    const cb = G._lockUnlockCallback;
    G._lockUnlockCallback = null;
    setTimeout(cb, 100);
  }
  G._crowbar = null;
  saveGame();
}

function crowbarFail(reason) {
  if (!G._crowbar) return;
  G._crowbar.active = false;
  if (G._crowbar.animFrame) cancelAnimationFrame(G._crowbar.animFrame);

  // Still makes noise even on failure
  const noiseAmount = 10 + Math.round(G._crowbar.elapsed);
  addNoise(noiseAmount);
  addSkillXp('lockpicking', 2);

  addLog(`Взлом провален: ${reason} (шум: +${noiseAmount})`, 'danger');
  playSound('alert');
  closeModal();
  G._crowbar = null;
}

function cancelCrowbar() {
  if (G._crowbar) {
    G._crowbar.active = false;
    if (G._crowbar.animFrame) cancelAnimationFrame(G._crowbar.animFrame);
    G._crowbar = null;
  }
  closeModal();
  addLog('Взлом отменён.', 'warning');
}

// ── LOCKPICK MINIGAME — Fallout-style tumbler ──
function startLockpickMinigame(difficulty, targetName) {
  closeModal();

  // Sweet spot: random angle, size decreases with difficulty
  const sweetSpotAngle = Math.random() * 360;
  const sweetSpotSize = Math.max(8, 40 - difficulty * 6); // degrees of tolerance

  const html = `<div style="text-align:center">
    <div style="color:var(--text-dim);font-size:11px;margin-bottom:6px">Поверни отмычку, найди правильное положение, затем поверни замок</div>
    <canvas id="lockpick-canvas" width="280" height="280" style="width:280px;height:280px;display:block;margin:0 auto;cursor:crosshair"></canvas>
    <div style="margin-top:8px;display:flex;gap:6px;justify-content:center">
      <button class="act-btn" id="lp-turn-btn" onmousedown="lockpickTurnStart()" onmouseup="lockpickTurnEnd()" ontouchstart="lockpickTurnStart()" ontouchend="lockpickTurnEnd()" style="flex:1;padding:10px">🔄 Повернуть замок</button>
    </div>
    <div style="color:var(--text-dim);font-size:10px;margin-top:4px">Отмычек: ${countItem('lockpick')} · Прочность: <span id="lp-hp">100%</span></div>
    <button class="act-btn" onclick="cancelLockpick()" style="width:100%;margin-top:6px;border-color:#661122;color:var(--red)">Отмена</button>
  </div>`;
  openModal('Взлом отмычкой', html);
  document.getElementById('modal-close').style.display = 'none';

  const canvas = document.getElementById('lockpick-canvas');
  const ctx = canvas.getContext('2d');

  G._lockpick = {
    difficulty, targetName,
    sweetSpotAngle, sweetSpotSize,
    pickAngle: 0,       // current pick angle (player controls via mouse/touch)
    turnAngle: 0,       // how far the lock cylinder has turned
    turning: false,      // is player holding turn button
    pickHp: 100,         // pick durability
    active: true,
    animFrame: null,
    canvas, ctx,
    shakeOffset: 0,
    lastTime: Date.now()
  };

  // Mouse/touch to rotate the pick
  canvas.addEventListener('mousemove', lockpickMouseMove);
  canvas.addEventListener('touchmove', lockpickTouchMove, { passive: false });

  function animateLockpick() {
    if (!G._lockpick || !G._lockpick.active) return;
    const lp = G._lockpick;
    const now = Date.now();
    const dt = (now - lp.lastTime) / 1000;
    lp.lastTime = now;

    if (lp.turning) {
      // Calculate how close pick is to sweet spot
      const angleDiff = angleDiffDeg(lp.pickAngle, lp.sweetSpotAngle);
      const tolerance = lp.sweetSpotSize / 2;

      if (angleDiff <= tolerance) {
        // In sweet spot — turn freely
        lp.turnAngle += dt * 120;
        lp.shakeOffset = 0;
        if (lp.turnAngle >= 90) {
          lockpickSuccess();
          return;
        }
      } else {
        // Not in sweet spot — limited turn, damages pick
        const maxTurn = Math.max(5, 30 - (angleDiff - tolerance) * 0.5);
        if (lp.turnAngle < maxTurn) {
          lp.turnAngle += dt * 60;
        }
        // Damage pick
        const dmgRate = 15 + difficulty * 8 + angleDiff * 0.3;
        lp.pickHp -= dt * dmgRate;
        lp.shakeOffset = (Math.random() - 0.5) * 3;

        if (lp.pickHp <= 0) {
          lockpickBreak();
          return;
        }

        const hpEl = document.getElementById('lp-hp');
        if (hpEl) hpEl.textContent = `${Math.round(lp.pickHp)}%`;
      }
    } else {
      // Spring back when not turning
      if (lp.turnAngle > 0) {
        lp.turnAngle = Math.max(0, lp.turnAngle - dt * 180);
      }
      lp.shakeOffset = 0;
    }

    drawLockpick(lp);
    lp.animFrame = requestAnimationFrame(animateLockpick);
  }
  G._lockpick.animFrame = requestAnimationFrame(animateLockpick);
}

function angleDiffDeg(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function lockpickMouseMove(e) {
  if (!G._lockpick || !G._lockpick.active) return;
  const canvas = G._lockpick.canvas;
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const mx = e.clientX - rect.left - cx;
  const my = e.clientY - rect.top - cy;
  G._lockpick.pickAngle = ((Math.atan2(my, mx) * 180 / Math.PI) + 360) % 360;
}

function lockpickTouchMove(e) {
  e.preventDefault();
  if (!G._lockpick || !G._lockpick.active || !e.touches[0]) return;
  const canvas = G._lockpick.canvas;
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const mx = e.touches[0].clientX - rect.left - cx;
  const my = e.touches[0].clientY - rect.top - cy;
  G._lockpick.pickAngle = ((Math.atan2(my, mx) * 180 / Math.PI) + 360) % 360;
}

function lockpickTurnStart() {
  if (G._lockpick) G._lockpick.turning = true;
}
function lockpickTurnEnd() {
  if (G._lockpick) G._lockpick.turning = false;
}

function drawLockpick(lp) {
  const ctx = lp.ctx;
  const w = 280, h = 280;
  const cx = w / 2 + lp.shakeOffset, cy = h / 2;
  const r = 100;

  ctx.clearRect(0, 0, w, h);

  // Lock body (outer circle)
  ctx.save();
  ctx.translate(cx, cy);

  // Lock cylinder — rotates with turnAngle
  ctx.save();
  ctx.rotate(lp.turnAngle * Math.PI / 180);

  // Keyhole background
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Inner circle
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Screwdriver / tension wrench (bottom)
  ctx.fillStyle = '#888';
  ctx.fillRect(-3, 0, 6, r + 30);

  ctx.restore(); // un-rotate

  // Pick (rotates with pickAngle, does NOT rotate with cylinder)
  const pickRad = lp.pickAngle * Math.PI / 180;
  ctx.save();
  ctx.rotate(pickRad);
  ctx.strokeStyle = '#ccccaa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r + 25, 0);
  ctx.stroke();
  // Pick tip
  ctx.fillStyle = '#ccccaa';
  ctx.beginPath();
  ctx.moveTo(r + 25, -3);
  ctx.lineTo(r + 32, 0);
  ctx.lineTo(r + 25, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // HP bar
  const hpColor = lp.pickHp > 50 ? '#00cc44' : lp.pickHp > 25 ? '#ccaa00' : '#cc3300';
  ctx.fillStyle = '#222';
  ctx.fillRect(-r, r + 15, r * 2, 6);
  ctx.fillStyle = hpColor;
  ctx.fillRect(-r, r + 15, r * 2 * (lp.pickHp / 100), 6);

  ctx.restore(); // un-translate
}

function lockpickSuccess() {
  if (!G._lockpick) return;
  G._lockpick.active = false;
  if (G._lockpick.animFrame) cancelAnimationFrame(G._lockpick.animFrame);

  // Clean up event listeners
  G._lockpick.canvas.removeEventListener('mousemove', lockpickMouseMove);
  G._lockpick.canvas.removeEventListener('touchmove', lockpickTouchMove);

  // XP reward
  addSkillXp('lockpicking', 8 + G._lockpick.difficulty * 5);
  // No noise from lockpick!

  addLog(`Замок вскрыт отмычкой! (тихо)`, 'success');
  playSound('craft');
  closeModal();

  if (G._lockUnlockCallback) {
    const cb = G._lockUnlockCallback;
    G._lockUnlockCallback = null;
    setTimeout(cb, 100);
  }
  G._lockpick = null;
  saveGame();
}

function lockpickBreak() {
  if (!G._lockpick) return;
  G._lockpick.active = false;
  if (G._lockpick.animFrame) cancelAnimationFrame(G._lockpick.animFrame);

  G._lockpick.canvas.removeEventListener('mousemove', lockpickMouseMove);
  G._lockpick.canvas.removeEventListener('touchmove', lockpickTouchMove);

  // Remove one lockpick
  removeItem('lockpick', 1);
  addSkillXp('lockpicking', 3);

  addLog(`Отмычка сломалась! (осталось: ${countItem('lockpick')})`, 'danger');
  playSound('alert');
  closeModal();
  G._lockpick = null;
}

function cancelLockpick() {
  if (G._lockpick) {
    G._lockpick.active = false;
    if (G._lockpick.animFrame) cancelAnimationFrame(G._lockpick.animFrame);
    G._lockpick.canvas.removeEventListener('mousemove', lockpickMouseMove);
    G._lockpick.canvas.removeEventListener('touchmove', lockpickTouchMove);
    G._lockpick = null;
  }
  closeModal();
  addLog('Взлом отменён.', 'warning');
}

// ── SEARCH ──
// Show timed action progress bar in modal
function startTimedAction(label, durationSec, callback) {
  G.activeAction = { type:'action', label, duration:durationSec, elapsed:0, callback };
  G.lastRealTime = Date.now();
  const html = `<div style="text-align:center">
    <div style="color:var(--text-dim);font-size:12px;margin-bottom:10px" id="action-label">${label}</div>
    <div style="width:100%;height:18px;border:1px solid var(--green-dim);background:rgba(0,10,0,.6);position:relative;overflow:hidden">
      <div id="action-bar" style="height:100%;background:var(--green);width:0%;transition:width 0.1s linear"></div>
    </div>
    <div id="action-time" style="color:var(--text-dim);font-size:10px;margin-top:4px">0%</div>
    <button class="act-btn" onclick="cancelTimedAction()" style="margin-top:10px;width:100%;border-color:#661122;color:var(--red)">Отмена</button>
  </div>`;
  openModal('', html);
  document.getElementById('modal-close').style.display = 'none';
}

function updateActionProgress() {
  if (!G.activeAction) return;
  const pct = Math.min(100, (G.activeAction.elapsed / G.activeAction.duration) * 100);
  const bar = document.getElementById('action-bar');
  const timeEl = document.getElementById('action-time');
  if (bar) bar.style.width = pct + '%';
  if (timeEl) {
    const left = Math.max(0, G.activeAction.duration - G.activeAction.elapsed);
    timeEl.textContent = `${Math.round(pct)}% · ${left.toFixed(1)}с`;
  }
}

function cancelTimedAction() {
  G.activeAction = null;
  closeModal();
  addLog('Действие отменено.', 'warning');
}

function doSearch() {
  if (G.activeAction) return;

  // Special buildings work without entering a room
  const loc = currentLocation();
  if (loc?.isTraderShop && loc?.trader) {
    showNPCDialog(loc.trader);
    return;
  }
  if (loc?.isRuin && loc?.ruin) {
    showRuinUI(loc);
    return;
  }

  if (G.world.currentRoom < 0) {
    addLog('Сначала войди в помещение (Комнаты).', 'warning');
    return;
  }

  const room = currentRoom();
  if (!room) { addLog('Нет помещения для обыска.', 'warning'); return; }

  // Check for zombies in room
  if (room.zombies && room.zombies.currentHp > 0) {
    addLog(`В ${room.name} тебя встречает ${room.zombies.name}!`, 'danger');
    playSound('alert');
    renderPointCloud('scan');
    startCombat(room.zombies, room);
    return;
  }

  const noiseAdd = G.player.stealthMode ? 2 : 5;
  addNoise(noiseAdd);

  // If room already inspected, show container list immediately
  if (room._inspected) {
    showContainerList(room);
    renderPointCloud('scan');
    updateUI();
    return;
  }

  // Start 3-second inspection
  addLog(`Осматриваю ${room.name}...`, 'info');
  playSound('loot');
  startTimedAction(`Осмотр: ${room.name}`, 3, () => {
    room._inspected = true;
    addLog(`${room.name} осмотрена. Найдено ${room.containers.length} объектов.`, 'success');
    showContainerList(room);
    renderPointCloud('scan');
    updateUI();
  });
}

function showContainerList(room) {
  const containers = room.containers || [];
  const hasFloorItems = room.floor && room.floor.length > 0;

  if (containers.length === 0 && !hasFloorItems) {
    addLog('Здесь нечего обыскивать.', 'warning');
    return;
  }

  let html = `<div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">Вес: ${G.player.weight}/${maxWeight()} кг · Выбери что обыскать</div>`;
  html += '<div style="max-height:350px;overflow-y:auto">';

  containers.forEach((cont, ci) => {
    const isLocked = cont.locked && !cont.locked.unlocked;
    const lootCount = cont.loot ? cont.loot.filter(l => l.id !== 'note').length : 0;
    const statusColor = isLocked ? getLockColor(cont.locked.difficulty) : cont.searched ? (lootCount > 0 ? 'var(--yellow)' : 'var(--text-dim)') : 'var(--green)';
    const statusText = isLocked ? `🔒 ${getLockLabel(cont.locked.difficulty)}` : cont.searched ? (lootCount > 0 ? `${lootCount} предм.` : 'Пусто') : '?';
    const btnText = isLocked ? 'Взлом' : 'Обыскать';
    html += `<div class="inv-item" style="cursor:pointer;border-left:2px solid ${statusColor};padding-left:6px" onclick="searchContainer(${ci})">
      <div>
        <div class="name">${cont.icon || '□'} ${cont.name}</div>
        <div class="meta" style="color:${statusColor}">${statusText}</div>
      </div>
      <button class="act-btn" style="flex:0;min-width:60px" onclick="event.stopPropagation();searchContainer(${ci})">${btnText}</button>
    </div>`;
  });

  // Floor items
  if (hasFloorItems) {
    html += `<div class="inv-item" style="cursor:pointer;border-left:2px solid var(--cyan);padding-left:6px" onclick="showFloorItems()">
      <div>
        <div class="name">На полу</div>
        <div class="meta" style="color:var(--cyan)">${room.floor.length} предм.</div>
      </div>
      <button class="act-btn" style="flex:0;min-width:60px" onclick="event.stopPropagation();showFloorItems()">Подобрать</button>
    </div>`;
  }

  html += '</div>';
  html += `<div style="margin-top:10px"><button class="act-btn" onclick="closeModal()" style="width:100%;border-color:#661122;color:var(--red)">Закрыть</button></div>`;
  openModal(`Обыск: ${room.name}`, html);
}

function searchContainer(ci) {
  const room = currentRoom();
  if (!room || !room.containers || !room.containers[ci]) return;
  Bus.emit('loot:claim', { nodeId: G.world.currentNodeId, roomIdx: G.world.currentRoom, ci });
  if (G.activeAction) return;
  const cont = room.containers[ci];

  // Check if container is locked
  if (cont.locked && !cont.locked.unlocked) {
    showLockModal(cont.locked, cont.name, () => {
      cont.locked.unlocked = true;
      addLog(`${cont.name} открыт!`, 'success');
      showContainerList(room);
    });
    return;
  }

  // Highlight furniture on canvas
  sceneData.selectedFurnIdx = ci;
  renderPointCloud('scan');

  if (!cont.searched) {
    // 3-second search animation
    addLog(`Обыскиваю: ${cont.name}...`, 'info');
    startTimedAction(`Обыск: ${cont.name}`, 3, () => {
      cont.searched = true;
      room.searched = true;
      addSkillXp('scouting', 3);
      addNoise(G.player.stealthMode ? 1 : 3);
      playSound('loot');
      if (typeof Net !== 'undefined') Net.markDirty(G.world.currentNodeId);

      // Show lore notes
      cont.loot.forEach(item => {
        if (item.id === 'note' && item.loreId) {
          const note = LORE_NOTES.find(n => n.id === item.loreId);
          if (note) {
            addLog(`📜 Найдена записка: "${note.title}"`, 'lore');
            // Save to diary if not already there
            if (!G.loreNotes.find(ln => ln.id === note.id)) {
              G.loreNotes.push({ id: note.id, title: note.title, text: note.text, day: G.player.daysSurvived });
            }
            // Auto-show note content
            setTimeout(() => showLoreNote(note), 500);
          }
        } else if (item.id === 'note' && item.loreText) {
          addLog(`📜 Записка: "${item.loreText}"`, 'lore');
        }
      });

      const lootCount = cont.loot.filter(l => l.id !== 'note').length;
      addLog(`${cont.name}: найдено ${lootCount} предм.`, lootCount > 0 ? 'success' : 'warning');
      showLootPicker(room, ci, true);
      saveGame();
    });
  } else {
    showLootPicker(room, ci);
  }
}

function showFloorItems() {
  const room = currentRoom();
  if (!room) return;
  showLootPicker(room, -1); // -1 = floor items
}

function showLootPicker(room, containerIdx, staggered) {
  const availableLoot = [];

  if (containerIdx === -1) {
    // Floor items
    if (room.floor && room.floor.length > 0) {
      room.floor.forEach((item, i) => {
        availableLoot.push({ source: 'floor', idx: i, item });
      });
    }
  } else if (containerIdx !== undefined && room.containers && room.containers[containerIdx]) {
    const cont = room.containers[containerIdx];
    if (cont.loot && cont.loot.length > 0) {
      cont.loot.forEach((item, i) => {
        if (item.id === 'note') return;
        availableLoot.push({ source: 'container', containerIdx, idx: i, item });
      });
    }
  } else {
    // Legacy: flat room.loot
    if (room.loot && room.loot.length > 0) {
      room.loot.forEach((item, i) => {
        if (item.id === 'note') return;
        availableLoot.push({ source: 'loot', idx: i, item });
      });
    }
  }

  if (availableLoot.length === 0) {
    addLog('Пусто.', 'warning');
    showContainerList(room);
    return;
  }

  const contName = containerIdx >= 0 && room.containers[containerIdx] ? room.containers[containerIdx].name : 'На полу';
  let html = `<div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">Вес: ${G.player.weight}/${maxWeight()} кг</div>`;
  html += '<div style="max-height:300px;overflow-y:auto">';

  availableLoot.forEach((entry, li) => {
    const def = ITEMS[entry.item.id];
    if (!def) return;
    let meta = `${def.weight}кг`;
    if (entry.item.qty > 1) meta += ` x${entry.item.qty}`;
    if (def.type === 'food' && entry.item.freshDays < 999) {
      const freshLabel = entry.item.freshDays > 2 ? 'Свежее' : entry.item.freshDays > 0 ? 'Чёрствое' : 'Гнилое';
      const freshColor = entry.item.freshDays > 2 ? 'var(--green)' : entry.item.freshDays > 0 ? 'var(--yellow)' : 'var(--red)';
      meta += ` · <span style="color:${freshColor}">${freshLabel}</span>`;
    }
    const srcStr = entry.source === 'container' ? `'container',${entry.containerIdx},${entry.idx}` : `'${entry.source}',0,${entry.idx}`;
    const displayName = entry.item.keyName || def.name;
    const staggerStyle = staggered ? `opacity:0;transform:translateX(-10px);transition:opacity .3s ease,transform .3s ease` : '';
    html += `<div class="inv-item loot-reveal-item" style="${staggerStyle}">
      <div class="item-info">${itemIconHtml(entry.item.id)}
        <div class="item-text">
          <div class="name">${displayName}</div>
          <div class="meta">${meta}</div>
        </div>
      </div>
      <button class="act-btn" style="flex:0;min-width:60px" onclick="takeLootItem(${srcStr})">Взять</button>
    </div>`;
  });

  html += '</div>';
  const btnStaggerStyle = staggered ? 'opacity:0;transition:opacity .3s ease' : '';
  html += `<div id="loot-actions" style="margin-top:10px;display:flex;gap:8px;${btnStaggerStyle}">
    <button class="act-btn" onclick="takeAllFromContainer(${containerIdx})" style="flex:1">Взять всё</button>
    <button class="act-btn" onclick="showContainerList(currentRoom())" style="flex:1">Назад</button>
  </div>`;
  openModal(contName, html);

  // Staggered reveal: items appear one by one with sound
  if (staggered) {
    const items = document.querySelectorAll('.loot-reveal-item');
    const total = items.length;
    items.forEach((el, i) => {
      setTimeout(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(0)';
        playSound('loot');
        // Show action buttons after last item
        if (i === total - 1) {
          const btns = document.getElementById('loot-actions');
          if (btns) btns.style.opacity = '1';
        }
      }, i * 250);
    });
    // Fallback: if no items, show buttons immediately
    if (total === 0) {
      const btns = document.getElementById('loot-actions');
      if (btns) btns.style.opacity = '1';
    }
  }
}

function takeLootItem(source, containerIdx, idx) {
  if (G.activeAction) return;
  const _loc = currentLocation();
  const room = currentRoom() || (_loc && _loc.rooms ? _loc.rooms[0] : null);
  if (!room) return;

  // Validate item exists before starting timer
  let targetItem;
  if (source === 'container') {
    const cont = room.containers && room.containers[containerIdx];
    if (!cont || !cont.loot || idx >= cont.loot.length) return;
    targetItem = cont.loot[idx];
  } else if (source === 'loot') {
    if (!room.loot || idx >= room.loot.length) return;
    targetItem = room.loot[idx];
  } else {
    if (!room.floor || idx >= room.floor.length) return;
    targetItem = room.floor[idx];
  }
  if (!targetItem) return;

  const itemName = ITEMS[targetItem.id]?.name || targetItem.id;
  startTimedAction(`Подбираю: ${itemName}`, 1, () => {
    // Re-validate after timer (item may have been taken)
    let item;
    if (source === 'container') {
      const cont = room.containers && room.containers[containerIdx];
      if (!cont || !cont.loot || idx >= cont.loot.length) { addLog('Предмет уже забран.', 'warning'); return; }
      item = cont.loot.splice(idx, 1)[0];
    } else if (source === 'loot') {
      if (!room.loot || idx >= room.loot.length) return;
      item = room.loot.splice(idx, 1)[0];
    } else {
      if (!room.floor || idx >= room.floor.length) return;
      item = room.floor.splice(idx, 1)[0];
    }
    if (!item) return;
    addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays, loadedAmmo: item.loadedAmmo, insertedMag: item.insertedMag, keyId: item.keyId, keyName: item.keyName });
    const itemName = item.keyName || ITEMS[item.id]?.name || item.id;
    addLog(`Подобрано: ${itemName}`, 'success');
    playSound('pickup');
    if (typeof showLootAnimation === 'function') showLootAnimation(itemName);
    calcWeight();
    if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE') {
      Net.markDirty(G.world.currentNodeId);
      // Immediate broadcast: item taken from container
      Net.broadcast({ t:'e', e:'loot_taken', nodeId:G.world.currentNodeId, roomIdx:G.world.currentRoom, ci:containerIdx, itemId:item.id, source });
    }
    if (source === 'container') showLootPicker(room, containerIdx);
    else if (source === 'floor') showLootPicker(room, -1);
    else showLootPicker(room);
    updateUI();
    saveGame();
  });
}

function takeAllFromContainer(containerIdx) {
  if (G.activeAction) return;
  const _taLoc = currentLocation();
  const room = currentRoom() || (_taLoc && _taLoc.rooms ? _taLoc.rooms[0] : null);
  if (!room) return;

  let itemCount = 0;
  if (containerIdx >= 0 && room.containers && room.containers[containerIdx]) {
    itemCount = room.containers[containerIdx].loot.filter(it => it.id !== 'note').length;
  } else if (containerIdx === -1 && room.floor) {
    itemCount = room.floor.length;
  }
  if (itemCount === 0) { showContainerList(room); return; }

  startTimedAction(`Забираю всё (${itemCount} предм.)`, Math.min(itemCount, 5), () => {
    let allItems = [];
    if (containerIdx >= 0 && room.containers && room.containers[containerIdx]) {
      const cont = room.containers[containerIdx];
      allItems = cont.loot.filter(it => it.id !== 'note');
      allItems.forEach(item => {
        addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays, loadedAmmo: item.loadedAmmo, insertedMag: item.insertedMag });
      });
      cont.loot = cont.loot.filter(it => it.id === 'note');
    } else if (containerIdx === -1 && room.floor) {
      allItems = [...room.floor];
      allItems.forEach(item => {
        addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays, loadedAmmo: item.loadedAmmo, insertedMag: item.insertedMag });
      });
      room.floor = [];
    }
    // Staggered loot animation + sound
    allItems.forEach((item, i) => {
      const name = item.keyName || ITEMS[item.id]?.name || item.id;
      setTimeout(() => {
        addLog(`Подобрано: ${name}`, 'success');
        playSound('pickup');
        if (typeof showLootAnimation === 'function') {
          showLootAnimation(name, window.innerWidth/2 + (Math.random()-0.5)*60, window.innerHeight/2 - i*20);
        }
      }, i * 200); // 200ms between each item
    });
    calcWeight();
    showContainerList(room);
    updateUI();
    saveGame();
  });
}

function takeAllLoot(room) {
  const _talLoc = currentLocation();
  const r = room || currentRoom() || (_talLoc && _talLoc.rooms ? _talLoc.rooms[0] : null);
  if (!r) return;
  if (r.containers) {
    r.containers.forEach(cont => {
      if (cont.loot) {
        cont.loot.filter(it => it.id !== 'note').forEach(item => {
          addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays, loadedAmmo: item.loadedAmmo, insertedMag: item.insertedMag });
        });
        cont.loot = cont.loot.filter(it => it.id === 'note');
        cont.searched = true;
      }
    });
  }
  if (r.loot) {
    r.loot.filter(it => it.id !== 'note').forEach(item => {
      addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays });
    });
    r.loot = r.loot.filter(it => it.id === 'note');
  }
  if (r.floor && r.floor.length > 0) {
    r.floor.forEach(item => {
      addItem(item.id, item.qty || 1, { durability: item.durability, freshDays: item.freshDays });
    });
    r.floor = [];
  }
  r.searched = true;
  calcWeight();
  closeModal();
  updateUI();
  saveGame();
}

// ── ROOM NAVIGATION ──
function changeFloor(targetFloor) {
  const loc = currentLocation();
  if (!loc) return;
  G.world.currentFloor = targetFloor;
  // Clear scene data WITHOUT calling transitionScene (which resets player to front door)
  sceneData.persistentPoints = [];
  sceneData.zombieEntities = [];
  sceneData.scanWaves = [];
  sceneData.scannedRooms.clear();
  sceneData.ambientParticles = [];
  sceneData.playerTrail = [];
  roomLayouts.clear();
  // Find stairs room on target floor and position player there
  const layout = getLocationLayout(loc);
  if (layout) {
    const stairsRoom = layout.rooms.find(r => r.floorNum === targetFloor && r.roomType === 'stairs');
    const destRoom = stairsRoom || layout.rooms.find(r => r.floorNum === targetFloor);
    if (destRoom) {
      G.world.currentRoom = destRoom.idx;
      sceneData.playerX = destRoom.cx;
      sceneData.playerY = destRoom.cy;
      sceneData.camX = destRoom.cx;
      sceneData.camY = destRoom.cy;
      sceneData.targetCamX = destRoom.cx;
      sceneData.targetCamY = destRoom.cy;
    }
    layout.rooms.forEach((r,i) => sceneData.scannedRooms.add(loc.id + '-' + i));
  }
  renderPointCloud('scan');
  addLog(targetFloor === 1 ? 'Вы поднялись на 2-й этаж' : 'Вы спустились на 1-й этаж', 'info');
  playSound('step');
  advanceTime(1, true);
  updateUI();
}

function showRoomSelect() {
  const loc = currentLocation();
  if (!loc) { addLog('Ты не в здании.', 'warning'); return; }

  // Check building lock
  if (loc.locked && !loc.locked.unlocked) {
    showLockModal(loc.locked, loc.name, () => {
      loc.locked.unlocked = true;
      addLog(`${loc.name} — входная дверь взломана!`, 'success');
      showRoomSelect();
    });
    return;
  }

  const currentFloor = G.world.currentFloor || 0;
  let html = `<div style="margin-bottom:8px;color:var(--text-dim);font-size:11px">${loc.name} · ${loc.condition === 'intact' ? 'Целое' : loc.condition === 'damaged' ? 'Повреждено' : 'Разрушено'} · Заражение: ${'⬤'.repeat(loc.infest)}${'○'.repeat(5 - loc.infest)}</div>`;

  if (loc.hasSecondFloor) {
    html += `<div style="margin-bottom:8px;text-align:center">Этаж: <b style="color:var(--green)">${currentFloor === 0 ? '1-й' : '2-й'}</b></div>`;
  }

  html += `<div style="color:var(--text-dim);font-size:9px;margin-bottom:6px;opacity:.6">Можно также кликнуть на комнату на карте</div>`;

  loc.rooms.forEach((room, i) => {
    if ((room.floorNum || 0) !== currentFloor) return;
    const isRoomLocked = room.locked && !room.locked.unlocked;
    const status = isRoomLocked ? '🔒' : room.searched ? '✓' : (room.zombies && room.zombies.currentHp > 0 ? '⚠' : '?');
    const statusColor = isRoomLocked ? getLockColor(room.locked.difficulty) : room.searched ? 'var(--green-dim)' : (room.zombies && room.zombies.currentHp > 0 ? 'var(--red)' : 'var(--text-dim)');
    const isCurrent = G.world.currentRoom === i;
    const typeIcon = room.roomType === 'stairs' ? ' ⬆' : room.roomType === 'corridor' ? ' ▬' : room.roomType === 'closet' ? ' ▪' : '';
    const statusLabel = isRoomLocked ? `🔒 ${getLockLabel(room.locked.difficulty)}` : status === '✓' ? 'Обыскано' : status === '⚠' ? 'Угроза!' : 'Не исследовано';
    const btnLabel = isRoomLocked ? 'Взлом' : isCurrent ? 'Здесь' : 'Войти';
    html += `<div class="travel-dest" style="${isCurrent ? 'border-left:2px solid var(--green);padding-left:6px' : ''}">
      <div class="td-info">
        <div class="td-name">${room.name}${typeIcon}</div>
        <div class="td-meta" style="color:${statusColor}">${statusLabel}</div>
      </div>
      <button class="act-btn" style="flex:0;min-width:60px" onclick="enterRoom(${i})">${btnLabel}</button>
    </div>`;
  });
  openModal('Помещения', html);
}

function enterRoom(idx) {
  const loc = currentLocation();
  if (!loc || !loc.rooms || !loc.rooms[idx]) return;
  const room = loc.rooms[idx];

  // Check if room is locked
  if (room.locked && !room.locked.unlocked) {
    showLockModal(room.locked, room.name, () => {
      room.locked.unlocked = true;
      addLog(`${room.name} — замок вскрыт!`, 'success');
      enterRoom(idx); // retry entry after unlock
    });
    return;
  }

  const prevRoom = G.world.currentRoom;
  G.world.currentRoom = idx;
  if (!room) { G.world.currentRoom = prevRoom; return; }
  closeModal();
  const noiseAdd = G.player.stealthMode ? 1 : 3;
  addNoise(noiseAdd);
  addLog(`Входишь в: ${room.name}`, 'info');
  playSound('door');

  // Set player/camera to room position
  const layout = getLocationLayout(loc);
  if (layout && layout.rooms[idx]) {
    const lr = layout.rooms[idx];
    sceneData.playerX = lr.cx;
    sceneData.playerY = lr.cy;
    sceneData.targetCamX = lr.cx;
    sceneData.targetCamY = lr.cy;
    if (prevRoom === -1) {
      sceneData.camX = lr.cx;
      sceneData.camY = lr.cy;
    }
  }

  // Refresh previous room's colors
  if (prevRoom >= 0 && layout) {
    refreshRoomPoints(layout, prevRoom, loc);
  }

  // LIDAR scan of the room
  renderPointCloud('pulse');

  if (room.zombies && room.zombies.currentHp > 0 && rng.chance(60)) {
    setTimeout(() => {
      addLog(`${room.zombies.name} заметил тебя!`, 'danger');
      playSound('alert');
      startCombat(room.zombies, room);
    }, 400);
  }

  // Auto-show NPC trader dialog when entering trader building
  if (loc.isTraderShop && loc.trader) {
    setTimeout(() => {
      showNPCDialog(loc.trader);
    }, 500);
  }

  // Auto-show ruin UI when entering ruined building
  if (loc.isRuin && loc.ruin) {
    setTimeout(() => {
      showRuinUI(loc);
    }, 500);
  }

  updateUI();
}

// ── TRAVEL ──
function showTravelMenu() {
  const region = currentRegion();
  let html = `<div style="margin-bottom:10px;color:var(--cyan);font-size:12px">Регион: ${region.name}</div>`;

  // Locations in current region
  html += '<div style="color:var(--text-dim);font-size:10px;margin-bottom:4px;letter-spacing:.1em">ЛОКАЦИИ В РЕГИОНЕ</div>';
  region.locations.forEach((loc, i) => {
    if (i === G.world.currentLocation) {
      html += `<div class="travel-dest" style="border-left:2px solid var(--green);padding-left:6px">
        <div class="td-info"><div class="td-name">${loc.name}</div><div class="td-meta">Вы здесь</div></div>
      </div>`;
    } else {
      const dist = loc.distance;
      const explored = G.world.exploredLocations.has(loc.id);
      html += `<div class="travel-dest">
        <div class="td-info">
          <div class="td-name">${explored ? loc.name : '???'}</div>
          <div class="td-meta">Расстояние: ${dist} ч · Заражение: ${explored ? loc.infest + '/5' : '?'}</div>
        </div>
        <button class="act-btn${loc.infest >= 4 ? ' danger' : ''}" style="flex:0;min-width:70px" onclick="travelTo(${i})">Идти</button>
      </div>`;
    }
  });

  // Other regions
  html += '<div style="color:var(--text-dim);font-size:10px;margin:12px 0 4px;letter-spacing:.1em">ДРУГИЕ РЕГИОНЫ</div>';
  G.world.regions.forEach((r, ri) => {
    if (ri === G.world.currentRegion) return;
    const canGo = G.player.skills.scouting >= r.scoutReq;
    html += `<div class="travel-dest">
      <div class="td-info">
        <div class="td-name">${r.explored ? r.name : '???'}</div>
        <div class="td-meta">${canGo ? 'Доступен' : `Скаутинг ≥${r.scoutReq}`} · Риск: ${r.riskBase}%</div>
      </div>
      <button class="act-btn" style="flex:0;min-width:70px" ${canGo ? `onclick="travelRegion(${ri})"` : 'disabled'}>Перейти</button>
    </div>`;
  });

  openModal('Путешествие', html);
}

function travelTo(locIdx) {
  closeModal();
  const loc = currentRegion().locations[locIdx];
  const dist = loc.distance;
  const legPenalty = (G.player.hp.legL < 50 ? 1 : 0) + (G.player.hp.legR < 50 ? 1 : 0);
  const totalTime = dist + legPenalty;

  addLog(`Отправляешься в ${loc.name}... (${totalTime} ч)`, 'info');

  // Random encounters during travel
  for (let h = 0; h < totalTime; h++) {
    const encounterChance = currentRegion().riskBase + G.player.moodles.noise * 0.1 + getNightMod();
    if (rng.chance(encounterChance)) {
      const zombie = spawnZombie(loc.infest);
      addLog(`По пути встречаешь ${zombie.name}!`, 'danger');
      advanceTime(1);
      playSound('alert');
      startCombat(zombie, null);
      updateUI();
      return;
    }
    // Random find on road
    if (rng.chance(8)) {
      const streetLoot = LOOT_TABLES.street;
      const itemId = rng.pick(streetLoot.common);
      addItem(itemId, 1);
      addLog(`Находишь на дороге: ${ITEMS[itemId].name}`, 'success');
    }
  }

  advanceTime(totalTime);
  G.world.currentLocation = locIdx;
  G.world.currentRoom = -1;
  G.world.currentFloor = 0;
  G.world.exploredLocations.add(loc.id);
  addNoise(G.player.stealthMode ? totalTime * 2 : totalTime * 5);

  addLog(`Прибыл в ${loc.name}. Заражение: ${loc.infest}/5.`, 'info');
  if (loc.firstVisit) {
    addLog(`Вы стоите у входа. Кликните на помещение, чтобы войти.`, 'info');
    loc.firstVisit = false;
  }
  addSkillXp('scouting', 10);
  playSound('step');

  // Set player at front door
  const layout = getLocationLayout(loc);
  if (layout) {
    sceneData.playerX = layout.frontDoorX;
    sceneData.playerY = layout.frontDoorY;
    sceneData.camX = layout.frontDoorX;
    sceneData.camY = layout.frontDoorY;
    sceneData.targetCamX = layout.frontDoorX;
    sceneData.targetCamY = layout.frontDoorY;
  }

  transitionScene();
  updateUI();
  saveGame();
}

function travelRegion(ri) {
  closeModal();
  const reg = G.world.regions[ri];
  const travelTime = 3;
  addLog(`Переход в регион: ${reg.name}... (${travelTime} ч)`, 'info');

  for (let h = 0; h < travelTime; h++) {
    if (rng.chance(reg.riskBase + G.player.moodles.noise * 0.1 + getNightMod())) {
      const zombie = spawnZombie(3);
      addLog(`Встреча на переходе: ${zombie.name}!`, 'danger');
      advanceTime(1);
      startCombat(zombie, null);
      return;
    }
  }

  advanceTime(travelTime);
  G.world.currentRegion = ri;
  G.world.currentLocation = 0;
  G.world.currentRoom = -1;
  G.world.currentFloor = 0;
  reg.explored = true;
  G.world.exploredLocations.add(reg.locations[0].id);
  addNoise(travelTime * 5);

  addLog(`Прибыл в регион: ${reg.name}.`, 'success');
  addSkillXp('scouting', 20);

  const newLoc = reg.locations[0];
  const newLayout = getLocationLayout(newLoc);
  if (newLayout) {
    sceneData.playerX = newLayout.frontDoorX;
    sceneData.playerY = newLayout.frontDoorY;
    sceneData.camX = newLayout.frontDoorX;
    sceneData.camY = newLayout.frontDoorY;
    sceneData.targetCamX = newLayout.frontDoorX;
    sceneData.targetCamY = newLayout.frontDoorY;
  }

  transitionScene();
  updateUI();
  saveGame();
}

// ── COMBAT ──
function startCombat(zombie, room) {
  Bus.emit('combat:start', { nodeId: G.world.currentNodeId, roomIdx: G.world.currentRoom });
  if (G.creative) {
    addLog('Креатив: бой пропущен, зомби уничтожены.', 'success');
    // Award kills without combat
    const killed = 1;
    G.stats.zombiesKilled = (G.stats.zombiesKilled || 0) + killed;
    if (room) room.zombies = null;
    return;
  }
  G.combatState = { zombie, room, turn: 0 };
  // Trigger LIDAR zombie attack animation
  if (room && G.world.currentRoom >= 0) {
    triggerZombieAttackAnimation(G.world.currentRoom);
  } else {
    // Outdoor encounter — spawn temporary zombie entity rushing player
    const w2 = canvas.width / window.devicePixelRatio;
    const h2 = canvas.height / window.devicePixelRatio;
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = Math.min(w2, h2) * 0.4;
    sceneData.zombieEntities.push({
      roomIdx: -1, x: w2/2 + Math.cos(angle) * spawnDist, y: h2/2 + Math.sin(angle) * spawnDist,
      targetX: w2/2, targetY: h2/2, homeX: w2/2 + Math.cos(angle) * spawnDist * 0.6,
      homeY: h2/2 + Math.sin(angle) * spawnDist * 0.6, roomW: 40, roomH: 40,
      moveTimer: 0, moveInterval: 100, type: zombie.type, attacking: true, attackPhase: 0,
      pulsePhase: 0, pointCount: zombie.type === 'fat' ? 18 : 10, bodyPoints: [],
    });
    if (settings.screenShake) sceneData.shakeAmount = 8;
  }
  showCombatUI();
}

// ── Ammo helpers for new magazine system ──
function getAmmoIdForCaliber(caliber) {
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.type === 'ammo' && it.caliber === caliber && !it._alias) return id;
  }
  return null;
}

function getWeaponAmmoInfo(invItem) {
  const def = ITEMS[invItem.id];
  if (!def || def.subtype !== 'firearm') return { loaded:0, max:0, caliber:'' };
  const loaded = invItem.loadedAmmo || 0;
  const max = def.magSize || 0;
  // If weapon uses magazines, check inserted magazine
  if (def.magType && !def.noMag) {
    const mag = invItem.insertedMag; // {id, loadedAmmo}
    if (mag) {
      const magDef = ITEMS[mag.id];
      return { loaded: mag.loadedAmmo || 0, max: magDef?.capacity || max, caliber: def.caliber, hasMag: true, mag };
    }
    return { loaded: 0, max: 0, caliber: def.caliber, hasMag: false, needsMag: def.magType };
  }
  // No-mag weapons (revolvers, shotguns, bolt-action)
  return { loaded, max, caliber: def.caliber, hasMag: false, noMag: true };
}

function fireWeapon(invItem) {
  const def = ITEMS[invItem.id];
  if (def.magType && !def.noMag) {
    if (invItem.insertedMag && invItem.insertedMag.loadedAmmo > 0) {
      invItem.insertedMag.loadedAmmo--;
      return true;
    }
    return false;
  }
  if ((invItem.loadedAmmo || 0) > 0) { invItem.loadedAmmo--; return true; }
  return false;
}

// Load magazine UI (from inventory)
function showLoadMagUI(invIdx) {
  const invItem = G.player.inventory[invIdx];
  if (!invItem) return;
  const def = ITEMS[invItem.id];
  if (!def) return;

  if (def.type === 'magazine') {
    // Loading rounds into a magazine
    const loaded = invItem.loadedAmmo || 0;
    const max = def.capacity || 0;
    const ammoId = getAmmoIdForCaliber(def.caliber);
    const ammoCount = ammoId ? countItem(ammoId) : 0;
    const canLoad = Math.min(max - loaded, ammoCount);

    let html = `<div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">${def.name} · ${def.caliber}</div>`;
    html += `<div style="margin-bottom:8px">Заряжено: <span style="color:var(--green)">${loaded}/${max}</span></div>`;
    html += `<div style="margin-bottom:8px">Патронов в инвентаре: ${ammoCount}</div>`;
    if (canLoad > 0) {
      html += `<button class="act-btn" onclick="startLoadMag(${invIdx},${canLoad})" style="width:100%;margin-bottom:6px">Зарядить ${canLoad} патр. (~${canLoad}с)</button>`;
    } else if (loaded >= max) {
      html += `<div style="color:var(--yellow)">Магазин полон</div>`;
    } else {
      html += `<div style="color:var(--red)">Нет подходящих патронов (${def.caliber})</div>`;
    }
    html += `<button class="act-btn" onclick="closeModal()" style="width:100%;border-color:#661122;color:var(--red);margin-top:6px">Закрыть</button>`;
    openModal('Снаряжение', html);
  } else if (def.subtype === 'firearm') {
    // Firearm: insert/eject magazine or load directly
    const info = getWeaponAmmoInfo(invItem);
    let html = `<div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">${def.name} · ${def.caliber}</div>`;

    if (def.noMag) {
      // Direct loading (revolvers, shotguns)
      const ammoId = getAmmoIdForCaliber(def.caliber);
      const ammoCount = ammoId ? countItem(ammoId) : 0;
      const loaded = invItem.loadedAmmo || 0;
      const max = def.magSize || 0;
      const canLoad = Math.min(max - loaded, ammoCount);
      html += `<div style="margin-bottom:8px">Заряжено: <span style="color:var(--green)">${loaded}/${max}</span></div>`;
      html += `<div style="margin-bottom:8px">Патронов: ${ammoCount}</div>`;
      if (canLoad > 0) {
        html += `<button class="act-btn" onclick="startLoadDirect(${invIdx},${canLoad})" style="width:100%;margin-bottom:6px">Зарядить ${canLoad} патр. (~${canLoad}с)</button>`;
      } else if (loaded >= max) {
        html += `<div style="color:var(--yellow)">Полностью заряжено</div>`;
      } else {
        html += `<div style="color:var(--red)">Нет патронов (${def.caliber})</div>`;
      }
    } else {
      // Magazine weapon
      if (invItem.insertedMag) {
        const magDef = ITEMS[invItem.insertedMag.id];
        html += `<div style="margin-bottom:8px">Магазин: ${magDef?.name || '?'} · ${invItem.insertedMag.loadedAmmo || 0}/${magDef?.capacity || '?'} патр.</div>`;
        html += `<button class="act-btn" onclick="ejectMag(${invIdx})" style="width:100%;margin-bottom:6px">Извлечь магазин</button>`;
      } else {
        html += `<div style="margin-bottom:8px;color:var(--red)">Магазин не вставлен</div>`;
        // Find compatible mags in inventory
        const compatMags = G.player.inventory.map((it,i) => ({it,i})).filter(({it}) => it.id === def.magType);
        if (compatMags.length > 0) {
          compatMags.forEach(({it, i}) => {
            const mDef = ITEMS[it.id];
            html += `<button class="act-btn" onclick="insertMag(${invIdx},${i})" style="width:100%;margin-bottom:4px">Вставить ${mDef?.name} (${it.loadedAmmo||0}/${mDef?.capacity||0})</button>`;
          });
        } else {
          html += `<div style="color:var(--red)">Нет магазинов (${ITEMS[def.magType]?.name || def.magType})</div>`;
        }
      }
    }
    html += `<button class="act-btn" onclick="closeModal()" style="width:100%;border-color:#661122;color:var(--red);margin-top:6px">Закрыть</button>`;
    openModal('Оружие', html);
  }
}

function startLoadMag(invIdx, count) {
  if (G.activeAction) return;
  const invItem = G.player.inventory[invIdx];
  if (!invItem) return;
  const def = ITEMS[invItem.id];
  const reloadTime = count * (G.modifiers?.reloadMult || 1);
  startTimedAction(`Снаряжение: ${def.name}`, reloadTime, () => {
    const ammoId = getAmmoIdForCaliber(def.caliber);
    const available = ammoId ? countItem(ammoId) : 0;
    const max = def.capacity || 0;
    const loaded = invItem.loadedAmmo || 0;
    const toLoad = Math.min(count, available, max - loaded);
    for (let i = 0; i < toLoad; i++) removeItem(ammoId, 1);
    invItem.loadedAmmo = loaded + toLoad;
    addLog(`${def.name} снаряжён: ${invItem.loadedAmmo}/${max}`, 'success');
    calcWeight();
    updateUI();
  });
}

function startLoadDirect(invIdx, count) {
  if (G.activeAction) return;
  const invItem = G.player.inventory[invIdx];
  if (!invItem) return;
  const def = ITEMS[invItem.id];
  const reloadTime = count * (G.modifiers?.reloadMult || 1);
  startTimedAction(`Заряжаю: ${def.name}`, reloadTime, () => {
    const ammoId = getAmmoIdForCaliber(def.caliber);
    const available = ammoId ? countItem(ammoId) : 0;
    const max = def.magSize || 0;
    const loaded = invItem.loadedAmmo || 0;
    const toLoad = Math.min(count, available, max - loaded);
    for (let i = 0; i < toLoad; i++) removeItem(ammoId, 1);
    invItem.loadedAmmo = loaded + toLoad;
    addLog(`${def.name} заряжён: ${invItem.loadedAmmo}/${max}`, 'success');
    calcWeight();
    updateUI();
  });
}

function insertMag(weaponIdx, magIdx) {
  const weapon = G.player.inventory[weaponIdx];
  const mag = G.player.inventory[magIdx];
  if (!weapon || !mag) return;
  weapon.insertedMag = { id: mag.id, loadedAmmo: mag.loadedAmmo || 0 };
  G.player.inventory.splice(magIdx, 1);
  addLog(`Магазин вставлен в ${ITEMS[weapon.id]?.name}.`, 'success');
  calcWeight();
  closeModal();
  updateUI();
}

function ejectMag(weaponIdx) {
  const weapon = G.player.inventory[weaponIdx];
  if (!weapon || !weapon.insertedMag) return;
  const mag = weapon.insertedMag;
  addItem(mag.id, 1, { loadedAmmo: mag.loadedAmmo });
  // Set loadedAmmo on the last added item
  const addedMag = G.player.inventory.filter(it => it.id === mag.id).pop();
  if (addedMag) addedMag.loadedAmmo = mag.loadedAmmo;
  weapon.insertedMag = null;
  addLog(`Магазин извлечён.`, 'info');
  calcWeight();
  closeModal();
  updateUI();
}

function showCombatUI() {
  const z = G.combatState.zombie;
  const w = getEquippedWeapon();
  const invItem = G.player.inventory.find(i => i.id === G.player.equipped);
  const hpPct = Math.round(z.currentHp / z.hp * 100);
  const hpColor = hpPct > 50 ? 'var(--green)' : hpPct > 25 ? 'var(--yellow)' : 'var(--red)';

  let weaponInfo = `${w.name} (урон: ${w.dmg}`;
  if (w.subtype === 'firearm' && invItem) {
    const ammoInfo = getWeaponAmmoInfo(invItem);
    weaponInfo += ` · ${ammoInfo.loaded}/${ammoInfo.max} патр.`;
  }
  if (w.durability > 0) weaponInfo += ` · прочн: ${Math.round(w.durability)}`;
  weaponInfo += ')';

  // Secondary weapon info
  const otherSlot = G.player.activeSlot === 1 ? 2 : 1;
  const otherWId = G.player[`weaponSlot${otherSlot}`];
  const otherW = otherWId && ITEMS[otherWId] ? ITEMS[otherWId].name : 'Кулаки';

  let html = `
    <div class="encounter-title">⚠ ${z.name}</div>
    <div class="encounter-info">
      <div>HP: <span style="color:${hpColor}">${z.currentHp}/${z.hp}</span> · Урон: ${z.dmg} · Скорость: ${z.speed}</div>
      <div style="margin-top:4px;display:flex;align-items:center;gap:4px">${itemIconHtml(G.player.equipped,24)} Оружие [${G.player.activeSlot}]: ${weaponInfo}</div>
      <div style="color:var(--text-dim);font-size:10px;display:flex;align-items:center;gap:4px">${otherWId ? itemIconHtml(otherWId,16) : ''}Слот ${otherSlot}: ${otherW}</div>
    </div>
    <div class="encounter-actions">
      <button class="act-btn danger" id="combat-atk-btn" onclick="combatAttack()">${uiIconHtml('combat_attack',18)} Атаковать</button>
      <button class="act-btn" onclick="switchWeaponSlot()">${uiIconHtml('combat_switch',18)} Сменить (${otherW})</button>
      <button class="act-btn" onclick="combatFlee()">${uiIconHtml('combat_flee',18)} Бежать</button>
      ${G.player.skills.stealth >= 5 && G.player.moodles.fatigue < 70 ? `<button class="act-btn stealth-on" onclick="combatStealth()">${uiIconHtml('combat_stealth',18)} Бесшумное устранение</button>` : ''}
      ${hasItem('rock') || hasItem('can_empty') ? `<button class="act-btn" onclick="combatDistract()">${uiIconHtml('combat_distract',18)} Отвлечь</button>` : ''}
    </div>
    <div id="combat-cooldown" style="height:3px;background:rgba(255,34,68,.15);margin-top:4px;border-radius:2px;overflow:hidden"><div id="combat-cd-fill" style="height:100%;width:0%;background:var(--red);transition:width 0.1s"></div></div>`;
  openModal('БОЙ', html);
  document.getElementById('modal-close').style.display = 'none';
}

function combatAttack() {
  // Cooldown check (1.5s between attacks)
  const now = Date.now();
  if (G.combatState._lastAttack && now - G.combatState._lastAttack < 1500) return;
  G.combatState._lastAttack = now;
  // Disable button + show cooldown bar
  const atkBtn = document.getElementById('combat-atk-btn');
  const cdFill = document.getElementById('combat-cd-fill');
  if (atkBtn) { atkBtn.disabled = true; setTimeout(() => { if (atkBtn) atkBtn.disabled = false; }, 1500); }
  if (cdFill) { cdFill.style.width = '100%'; setTimeout(() => { if (cdFill) cdFill.style.transition = 'width 1.4s linear'; cdFill.style.width = '0%'; setTimeout(() => { if (cdFill) cdFill.style.transition = 'width 0.1s'; }, 1500); }, 50); }

  Bus.emit('combat:action', { action: 'attack' });
  const z = G.combatState.zombie;
  const w = getEquippedWeapon();
  const p = G.player;
  const invItem = p.inventory.find(i => i.id === p.equipped);

  // Firearm ammo check (new magazine system)
  const isFirearm = w.subtype === 'firearm';
  if (isFirearm) {
    if (!invItem || !fireWeapon(invItem)) {
      const ammoName = w.caliber || 'патроны';
      addLog(`Нет патронов (${ammoName})! Оружие не заряжено.`, 'danger');
      // Try to auto-switch to other weapon slot
      const otherSlot = p.activeSlot === 1 ? 2 : 1;
      const otherId = p[`weaponSlot${otherSlot}`];
      if (otherId && otherId !== 'fist') {
        p.activeSlot = otherSlot;
        p.equipped = otherId;
        addLog(`Переключаюсь на слот ${otherSlot}: ${ITEMS[otherId]?.name || 'оружие'}`, 'warning');
      } else {
        p.equipped = 'fist';
        addLog('Переключаюсь на кулаки.', 'warning');
      }
      showCombatUI();
      return;
    }
  }

  // Player attack
  const m = G.modifiers || {};
  const bodyPenalty = (p.hp.armR < 50 ? 15 : 0) + (p.hp.armR < 15 ? 30 : 0);
  const firearmSkillBonus = isFirearm ? (p.skills.firearms || 0) * 8 : 0;
  const traitAccuracy = m.accuracyBonus || 0;
  const hitChance = (isFirearm ? firearmSkillBonus : p.skills.strength * 10) + (w.accuracy || 0) + traitAccuracy + (p.stealthMode ? 10 : 0) - (getMoodleLevel(p.moodles.fatigue) === 'critical' ? 20 : getMoodleLevel(p.moodles.fatigue) === 'severe' ? 10 : 0) - bodyPenalty + getMoodleModifier() / 2;
  const panicMiss = p.moodles.panic >= 45 ? 20 : 0;
  // Temperature debuffs to accuracy
  const bt2 = p.moodles.bodyTemp || 36.6;
  const tempAccPenalty = bt2 < 33 ? 15 : bt2 < 35 ? 8 : bt2 > 40 ? 10 : 0;
  const finalHit = Math.min(95, Math.max(15, 60 + hitChance - panicMiss - tempAccPenalty));

  if (rng.chance(finalHit)) {
    const skillMult = isFirearm ? (1 + (p.skills.firearms || 0) * 0.08) : (1 + p.skills.strength * 0.05);
    const meleeMult = !isFirearm ? (m.meleeDmgMult || 1) : 1;
    let dmg = w.dmg * skillMult * meleeMult * (0.85 + rng.next() * 0.3);
    if (z.armor) dmg *= (1 - z.armor);
    // Critical hit (15% base + stealth bonus)
    const critChance = 15 + (p.stealthMode ? 15 : 0);
    const isCrit = rng.chance(critChance);
    if (isCrit) dmg *= 1.8;
    dmg = Math.round(dmg);
    z.currentHp -= dmg;
    const noiseAdd = w.noise || 15;
    addNoise(noiseAdd);
    const verb = isFirearm ? 'Выстрел!' : 'Удар!';
    if (isCrit) {
      addLog(`💥 КРИТ! ${w.name} наносит ${dmg} урона ${z.name}! [HP: ${Math.max(0, z.currentHp)}/${z.hp}]`, 'success');
      playSound('hit');
      if (typeof showCriticalFlash === 'function') showCriticalFlash();
    } else {
      addLog(`${verb} ${w.name} наносит ${dmg} урона ${z.name}. [HP: ${Math.max(0, z.currentHp)}/${z.hp}]`, 'success');
      playSound('hit');
    }

    // Weapon durability
    if (w.id !== 'fist' && invItem && invItem.durability > 0) {
      invItem.durability -= isFirearm ? rng.int(1, 3) : rng.int(3, 8);
      if (invItem.durability <= 0) {
        addLog(`⚠ ${w.name} сломалось! Оружие уничтожено.`, 'danger');
        p[`weaponSlot${p.activeSlot}`] = null;
        removeItem(w.id, 1);
        // Auto-switch
        const otherSlot = p.activeSlot === 1 ? 2 : 1;
        const otherId = p[`weaponSlot${otherSlot}`];
        if (otherId && otherId !== 'fist') {
          p.activeSlot = otherSlot;
          p.equipped = otherId;
          addLog(`Переключаюсь на ${ITEMS[otherId]?.name || 'оружие'} (слот ${otherSlot}).`, 'warning');
        } else {
          p.equipped = 'fist';
          addLog('Берусь за кулаки.', 'warning');
        }
      }
    }
    addSkillXp(isFirearm ? 'firearms' : 'strength', 8);
  } else {
    addLog(`Промах! ${z.name} уклоняется.`, 'warning');
    addNoise(isFirearm ? (w.noise || 15) : 5);
  }

  // Check zombie death
  if (z.currentHp <= 0) {
    combatVictory();
    return;
  }

  // Zombie attacks back
  zombieAttack();
}

function zombieAttack() {
  const z = G.combatState.zombie;
  const p = G.player;
  const zHitChance = 50 - (p.skills.stealth * 5) + z.bonus + (getNightMod() / 2);
  const finalZHit = Math.min(85, Math.max(10, zHitChance));

  if (rng.chance(finalZHit)) {
    const parts = ['head','torso','torso','armL','armR','legL','legR'];
    const hitPart = rng.pick(parts);
    const m = G.modifiers || {};
    let dmg = z.dmg + rng.int(-2, 3);
    const armorReduction = Math.min(0.8, getArmor() / 100); // Armor reduces up to 80%
    dmg = Math.max(1, Math.round(dmg * (G.difficulty.zombieDmg || 1) * (1 - (m.dmgReduction || 0)) * (1 - armorReduction)));
    p.hp[hitPart] = Math.max(0, p.hp[hitPart] - dmg);
    if(G?._dayStats) G._dayStats.wasHurt=true;
    if (navigator.vibrate) navigator.vibrate(50);
    p.moodles.pain = Math.min(100, p.moodles.pain + dmg);
    const panicAdd = Math.round(10 * (m.panicMult || 1) + (m.combatPanic || 0));
    p.moodles.panic = Math.min(100, p.moodles.panic + panicAdd);
    p.moodles.fatigue = Math.min(100, p.moodles.fatigue + 2 * (m.combatFatigueMult || 1));

    const partNames = { head:'Голова', torso:'Торс', armL:'Л.рука', armR:'П.рука', legL:'Л.нога', legR:'П.нога' };
    addLog(`${z.name} наносит ${dmg} урона [${partNames[hitPart]}: ${p.hp[hitPart]}%]`, 'danger');
    playSound('damage');
    if (typeof showDamageVignette === 'function') showDamageVignette(dmg / 20);

    // Bite check (with infection chance from difficulty)
    const infChance = (15 + z.bonus) * (G.difficulty.infectionChance !== undefined ? G.difficulty.infectionChance / 0.5 : 1);
    if (rng.chance(infChance)) {
      const infAmount = Math.round(15 * (m.infectionMult || 1));
      p.moodles.infection = Math.min(100, p.moodles.infection + infAmount);
      addLog('УКУС! Риск заражения!', 'danger');
    }
    // Bleeding check
    if (rng.chance(20) && p.moodles.bleeding === 0) {
      p.moodles.bleeding = 1;
      addLog('Кровотечение! Нужен бинт.', 'danger');
    }

    // Death check
    if (p.hp.head <= 0 || p.hp.torso <= 0) {
      closeModal();
      playerDeath(`Убит ${z.name}`);
      return;
    }
  } else {
    addLog(`${z.name} промахивается.`, '');
  }

  G.combatState.turn++;
  advanceTime(0); // No time for combat turns, just update
  showCombatUI();
  updateUI();
}

function combatVictory() {
  const z = G.combatState.zombie;
  closeModal();
  addLog(`${z.name} уничтожен!`, 'success');
  addNoise(z.deathNoise);
  if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE') {
    Net.markDirty(G.world.currentNodeId);
    Net.broadcast({ t:'e', e:'zombie_killed', nodeId:G.world.currentNodeId, roomIdx:G.world.currentRoom });
  }
  Bus.emit('combat:victory', { nodeId: G.world.currentNodeId });
  G.stats.zombiesKilled++;
  if(G?._dayStats) G._dayStats.kills++;
  // Award XP based on weapon type used
  const killWeapon = ITEMS[getActiveWeaponId()];
  const killSkill = (killWeapon?.subtype === 'firearm') ? 'firearms' : 'strength';
  addSkillXp(killSkill, z.xp);

  if (G.combatState.room) {
    G.combatState.room.zombies = null;
  }
  // Remove zombie entity from LIDAR scene
  sceneData.zombieEntities = sceneData.zombieEntities.filter(ze => {
    if (G.combatState && G.combatState.room && ze.roomIdx === G.world.currentRoom) return false;
    if (ze.roomIdx === -1 && ze.attacking) return false; // outdoor encounter
    return true;
  });

  // Generate zombie loot
  const lootDef = z.loot;
  const droppedItems = [];
  if (lootDef && rng.chance(lootDef.chance)) {
    const count = rng.int(lootDef.count[0], lootDef.count[1]);
    for (let i = 0; i < count; i++) {
      const itemId = rng.pick(lootDef.pool);
      if (ITEMS[itemId]) {
        droppedItems.push(itemId);
      }
    }
  }

  G.combatState = null;
  advanceTime(1);
  playSound('kill');
  renderPointCloud('pulse');
  if (typeof trackKillStreak === 'function') trackKillStreak();
  updateUI();

  // Show loot if any
  if (droppedItems.length > 0) {
    let html = `<div style="color:var(--text-dim);font-size:11px;margin-bottom:8px">С тела ${z.name} можно забрать:</div>`;
    droppedItems.forEach((itemId, i) => {
      const def = ITEMS[itemId];
      html += `<div class="inv-item" style="cursor:pointer;border-left:2px solid var(--green);padding-left:6px">
        <div><div class="name">${itemIconHtml(itemId,20)} ${def.name}</div>
        <div class="meta" style="color:var(--text-dim)">${def.weight} кг</div></div>
        <button class="act-btn" style="flex:0;min-width:60px" onclick="pickZombieLoot('${itemId}',${i},this)">Забрать</button>
      </div>`;
    });
    html += `<button class="act-btn" onclick="closeModal()" style="width:100%;margin-top:8px;border-color:#661122;color:var(--red)">Закрыть</button>`;
    // Store loot for pickup
    G._zombieLoot = droppedItems;
    openModal(`Добыча: ${z.name}`, html);
  }
  saveGame();
}

function pickZombieLoot(itemId, idx, btn) {
  if (!G._zombieLoot || G._zombieLoot[idx] === null) return;
  addItem(itemId, 1);
  G._zombieLoot[idx] = null;
  addLog(`Подобрал: ${ITEMS[itemId].name}`, 'success');
  btn.textContent = '✓';
  btn.disabled = true;
  btn.style.color = 'var(--text-dim)';
}

function combatFlee() {
  Bus.emit('combat:action', { action: 'flee' });
  const z = G.combatState.zombie;
  const p = G.player;
  // Base flee: 70% for shamblers, modified by zombie speed & player state
  const baseChance = 70;
  const speedPenalty = z.speed * 10;  // runners: -30, fat: 0, shambler: -10
  const stealthBonus = p.skills.stealth * 5;
  const encPenalty = isEncumbered() ? 25 : 0;
  const fatiguePenalty = p.moodles.fatigue > 70 ? 15 : p.moodles.fatigue > 40 ? 5 : 0;
  const legPenalty = (p.hp.legL < 30 || p.hp.legR < 30) ? 20 : 0;
  const legCrit = (p.hp.legL < 10 || p.hp.legR < 10);

  if (legCrit) {
    addLog('Ноги критически повреждены! Бегство невозможно!', 'danger');
    showCombatUI();
    return;
  }

  const fleeChance = baseChance - speedPenalty + stealthBonus - encPenalty - fatiguePenalty - legPenalty + (z.fleeChance || 0);

  closeModal();
  if (rng.chance(Math.max(5, Math.min(95, fleeChance)))) {
    addLog('Удалось сбежать!', 'warning');
    addNoise(20);
    p.moodles.fatigue = Math.min(100, p.moodles.fatigue + 5);
    advanceTime(2);
    // Remove zombie entity from LIDAR
    sceneData.zombieEntities = sceneData.zombieEntities.filter(ze => {
      if (G.combatState && G.combatState.room && ze.roomIdx === G.world.currentRoom) return false;
      if (ze.roomIdx === -1 && ze.attacking) return false;
      return true;
    });
    G.combatState = null;
  } else {
    addLog('Не удалось сбежать!', 'danger');
    addNoise(15);
    zombieAttack();
    if (G.combatState) showCombatUI();
  }
  updateUI();
}

function combatStealth() {
  closeModal();
  const p = G.player;
  const z = G.combatState.zombie;
  // Success chance: 50% base + stealth×8 - zombie speed×5 - fatigue×0.3
  const chance = Math.min(90, 50 + p.skills.stealth * 8 - z.speed * 5 - p.moodles.fatigue * 0.3);
  if (rng.chance(chance)) {
    addLog('Бесшумное устранение! Цель нейтрализована без шума.', 'success');
    z.currentHp = 0;
    addNoise(2); // minimal noise
    addSkillXp('stealth', 25);
    combatVictory();
  } else {
    addLog('Попытка бесшумного устранения провалилась! Зомби атакует!', 'danger');
    addNoise(15);
    p.moodles.panic = Math.min(100, p.moodles.panic + 20);
    zombieAttack();
    if (G.combatState) showCombatUI();
    updateUI();
  }
}

function combatDistract() {
  closeModal();
  const distractItem = hasItem('can_empty') ? 'can_empty' : 'rock';
  removeItem(distractItem, 1);
  addNoise(ITEMS[distractItem].noise || 10);
  addLog(`Бросаешь ${ITEMS[distractItem].name}. ${G.combatState.zombie.name} отвлечён!`, 'info');
  G.combatState = null;
  advanceTime(1);
  playSound('distract');
  updateUI();
}

function triggerRandomEncounter() {
  // Safe zone — no encounters inside NPC base
  if (typeof isInSafeZone === 'function' && isInSafeZone()) return;
  const loc = currentLocation();
  const infest = loc ? loc.infest : 2;
  const zombie = spawnZombie(infest);
  addLog(`${zombie.name} появляется!`, 'danger');
  playSound('alert');
  startCombat(zombie, null);
}

// ── STEALTH ──
function toggleStealth() {
  G.player.stealthMode = !G.player.stealthMode;
  if (G.player.stealthMode) {
    addLog('Режим скрытности ВКЛЮЧЁН. Шум −50%.', 'info');
  } else {
    addLog('Режим скрытности выключен.', '');
  }
  updateUI();
}

// ── REST ──
function doRest() {
  if (G.world.currentRoom < 0) {
    addLog('Найди помещение для отдыха.', 'warning');
    return;
  }

  const loc = currentLocation();
  const isBase = loc && G.world.homeBase === loc.id;
  const security = isBase ? G.world.homeBaseSecurity : 0;

  // Raid check during rest — traps reduce chance further
  const traps = isBase ? (G.world.homeBaseTraps || 0) : 0;
  const raidChance = Math.max(0, 30 - security * 3 - traps * 4);
  if (!isBase || security < 5) {
    if (rng.chance(raidChance)) {
      if (traps > 0 && rng.chance(traps * 15)) {
        addLog('Ловушка сработала! Зомби снаружи нейтрализован.', 'success');
        G.world.homeBaseTraps = Math.max(0, traps - 1);
        G.stats.zombiesKilled = (G.stats.zombiesKilled || 0) + 1;
      } else {
        addLog('Шум снаружи! Отдых прерван — зомби!', 'danger');
        const zombie = spawnZombie(loc ? loc.infest : 2);
        startCombat(zombie, null);
        return;
      }
    }
  }

  // Room type affects rest quality
  const roomName = (loc && loc.rooms && loc.rooms[G.world.currentRoom]) ? loc.rooms[G.world.currentRoom].name : '';
  const isBedroom = roomName === 'Спальня' || roomName === 'Детская' || roomName === 'Казарма';
  const hours = 4;
  const fatigueRecovery = isBedroom ? hours * 10 : hours * 8;
  const painRecovery = isBedroom ? 15 : 10;

  G.player.moodles.fatigue = Math.max(0, G.player.moodles.fatigue - fatigueRecovery);
  G.player.moodles.pain = Math.max(0, G.player.moodles.pain - painRecovery);
  G.player.moodles.panic = Math.max(0, G.player.moodles.panic - 20);
  if (isBedroom) G.player.moodles.depression = Math.max(0, G.player.moodles.depression - 5);

  // HP recovery if fed
  const hpRecovery = isBedroom ? 8 : 5;
  if (G.player.moodles.hunger < 50) {
    Object.keys(G.player.hp).forEach(part => {
      if (G.player.hp[part] > 0 && G.player.hp[part] < 100) {
        G.player.hp[part] = Math.min(100, G.player.hp[part] + hpRecovery);
      }
    });
  }

  advanceTime(hours);
  const bedBonus = isBedroom ? ' Кровать: улучшенное восстановление!' : '';
  addLog(`Отдых ${hours} ч. Усталость снижена.${G.player.moodles.hunger < 50 ? ' HP восстановлено.' : ''}${bedBonus}`, 'success');
  playSound('rest');
  renderPointCloud('pulse');
  updateUI();
  saveGame();
}

// ── SCOUT ──
function doScout() {
  if (!G.world.nodes || !G.world.currentNodeId) return;

  // Timed scouting: 6 seconds base, traits modify
  let scoutTime = 6000;
  if (G.player.traits) {
    if (G.player.traits.includes('eagle_eye')) scoutTime = 4000;
    if (G.player.traits.includes('short_sighted')) scoutTime = 8000;
  }
  // Skill reduces time slightly
  scoutTime = Math.max(2000, scoutTime - G.player.skills.scouting * 400);

  // Disable scout button during scouting
  const scoutBtn = document.getElementById('map-scout-btn');
  if (scoutBtn) {
    scoutBtn.disabled = true;
    scoutBtn.textContent = 'СКАНИРОВАНИЕ...';
  }

  // Start progress bar
  const progBar = document.getElementById('map-scout-progress');
  if (progBar) {
    progBar.style.display = 'block';
    progBar.querySelector('.bp-fill').style.transition = `width ${scoutTime}ms linear`;
    setTimeout(() => { progBar.querySelector('.bp-fill').style.width = '100%'; }, 30);
  }

  setTimeout(() => {
    // Reveal 3x3 grid area (Manhattan dist 3, traits modify)
    let revealDist = 3;
    if (G.player.traits) {
      if (G.player.traits.includes('eagle_eye')) revealDist = 4;
      if (G.player.traits.includes('short_sighted')) revealDist = 2;
    }
    revealDist += Math.floor(G.player.skills.scouting / 3);

    const nodesBefore = Object.values(G.world.nodes).filter(n => n.discovered).length;
    discoverArea(G.world.currentNodeId, revealDist);
    const nodesAfter = Object.values(G.world.nodes).filter(n => n.discovered).length;
    const newFound = nodesAfter - nodesBefore;

    advanceTime(1);
    addNoise(G.player.stealthMode ? 2 : 5);
    addSkillXp('scouting', 12);

    if (newFound > 0) {
      addLog(`Разведка: обнаружено ${newFound} новых точек на карте.`, 'success');
    } else {
      addLog('Окрестности полностью разведаны.', 'info');
    }

    G.stats.locationsExplored = G.world.exploredLocations ? G.world.exploredLocations.size : 0;
    playSound('scan');

    // Reset scout button
    if (scoutBtn) {
      scoutBtn.disabled = false;
      scoutBtn.textContent = 'РАЗВЕДКА';
    }
    if (progBar) {
      progBar.style.display = 'none';
      progBar.querySelector('.bp-fill').style.transition = 'none';
      progBar.querySelector('.bp-fill').style.width = '0%';
    }

    renderMapCanvas();
    updateUI();
    saveGame();
  }, scoutTime);
}

// ── BASE ──
function doBase() {
  const loc = currentLocation();
  if (!loc) { addLog('Здесь нельзя устроить убежище.', 'warning'); return; }
  if (G.world.homeBase === loc.id) {
    addLog(`Убежище: ${loc.name}. Безопасность: ${G.world.homeBaseSecurity}/10.`, 'info');
  } else if (G.world.homeBase) {
    addLog('Переносишь убежище сюда.', 'info');
    G.world.homeBase = loc.id;
    G.world.homeBaseSecurity = 1;
  } else {
    G.world.homeBase = loc.id;
    G.world.homeBaseSecurity = 1;
    addLog(`${loc.name} установлен как убежище! Безопасность: 1/10.`, 'success');
  }
  // Sync base to all players
  if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE') {
    Net.broadcast({ t:'e', e:'base_set', nodeId:G.world.currentNodeId, homeBase:G.world.homeBase, security:G.world.homeBaseSecurity });
  }
  updateUI();
  saveGame();
}

// ── GRID INVENTORY SYSTEM ──
const GRID_COLS = 7;
const CELL_PX = 40;
let _invGrid = null; // 2D array [row][col] = invIdx or -1
let _invDrag = null;  // {invIdx, fromSlot, offsetX, offsetY}

function gridSize(id) {
  return GRID_SIZES[id] || [1,1];
}

function gridRows() {
  let rows = 4;
  const back = G.player.equipment?.back;
  if (back && ITEMS[back]) rows += Math.ceil((ITEMS[back].capacity||0) / 2);
  const rig = G.player.equipment?.rig;
  if (rig && ITEMS[rig]) rows += Math.ceil((ITEMS[rig].capacity||0) / 2);
  const legs = G.player.equipment?.legs;
  if (legs && ITEMS[legs]?.pockets) rows += 1;
  return rows;
}

function initInvGrid() {
  const rows = gridRows();
  _invGrid = Array.from({length:rows}, () => Array(GRID_COLS).fill(-1));
  // Place items that already have grid positions
  const placed = new Set();
  G.player.inventory.forEach((it, idx) => {
    if (it.gridX != null && it.gridY != null) {
      const [gw,gh] = gridSize(it.id);
      if (canPlaceGrid(it.gridX, it.gridY, gw, gh, idx)) {
        placeOnGrid(idx, it.gridX, it.gridY);
        placed.add(idx);
      }
    }
  });
  // Auto-place items without positions
  G.player.inventory.forEach((it, idx) => {
    if (placed.has(idx)) return;
    const [gw,gh] = gridSize(it.id);
    let spot = findFreeSpot(gw, gh);
    // If grid is full, expand by 1 row and retry
    if (!spot) {
      _invGrid.push(Array(GRID_COLS).fill(-1));
      spot = findFreeSpot(gw, gh);
    }
    if (spot) {
      it.gridX = spot[0]; it.gridY = spot[1];
      placeOnGrid(idx, spot[0], spot[1]);
    }
  });
}

function canPlaceGrid(gx, gy, gw, gh, skipIdx) {
  const rows = _invGrid.length;
  if (gx < 0 || gy < 0 || gx+gw > GRID_COLS || gy+gh > rows) return false;
  for (let dy=0;dy<gh;dy++) for (let dx=0;dx<gw;dx++) {
    const v = _invGrid[gy+dy][gx+dx];
    if (v !== -1 && v !== skipIdx) return false;
  }
  return true;
}

function placeOnGrid(idx, gx, gy) {
  const it = G.player.inventory[idx];
  const [gw,gh] = gridSize(it.id);
  for (let dy=0;dy<gh;dy++) for (let dx=0;dx<gw;dx++) {
    _invGrid[gy+dy][gx+dx] = idx;
  }
}

function clearFromGrid(idx) {
  if (!_invGrid) return;
  for (let r=0;r<_invGrid.length;r++) for (let c=0;c<GRID_COLS;c++) {
    if (_invGrid[r][c] === idx) _invGrid[r][c] = -1;
  }
}

function findFreeSpot(gw, gh) {
  const rows = _invGrid.length;
  for (let y=0;y<=rows-gh;y++) for (let x=0;x<=GRID_COLS-gw;x++) {
    if (canPlaceGrid(x,y,gw,gh,-1)) return [x,y];
  }
  return null;
}

// ── INVENTORY ──
function showInventory() {
  if (!G || !G.player) return;
  initInvGrid();
  const p = G.player;
  const mw = maxWeight();
  const enc = isEncumbered();
  const rows = gridRows();

  // Helper to render an equipment slot
  function slotHtml(key, label, itemId, x, y, w, h) {
    const hasIt = !!itemId;
    const title = hasIt ? (ITEMS[itemId]?.name || itemId) : label;
    const iconSz = Math.min(w, h) - 6;
    let s = `<div class="inv-eslot${hasIt?' has-item':''}" title="${title}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px" data-slot="${key}" ondragover="invDragOver(event)" ondrop="invSlotDrop(event,'${key}')" onclick="invSlotClick('${key}')">`;
    if (hasIt) s += `<div style="pointer-events:none">${itemIconHtml(itemId, iconSz)}</div>`;
    s += `<span class="slot-label">${label}</span></div>`;
    return s;
  }

  let html = '';
  // Weight bar
  const wPct = Math.min(100, (p.weight/mw)*100);
  html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">`;
  html += `<div style="flex:1;height:5px;background:rgba(0,255,65,.1);border-radius:3px;overflow:hidden"><div style="width:${wPct}%;height:100%;background:${enc?'#ff4444':'#00FF41'};border-radius:3px"></div></div>`;
  html += `<span style="font-size:10px;color:${enc?'#ff4444':'var(--green)'}">${p.weight}/${mw} кг</span>`;
  html += `</div>`;

  // Sorting buttons
  const sortMode = settings.invSort || 'none';
  html += '<div style="display:flex;gap:3px;margin-bottom:4px">';
  const sortBtns = [['type','Тип'],['weight','Вес'],['alpha','А-Я'],['newest','Новые']];
  for (const [mode,label] of sortBtns) {
    const active = sortMode === mode;
    html += `<button class="act-btn" onclick="invSort('${mode}')" style="flex:1;font-size:9px;padding:2px 4px;${active?'border-color:var(--green);color:var(--green)':''}">${label}</button>`;
  }
  html += '</div>';

  // ── Character silhouette with equipment slots overlaid ──
  const silW = 220, silH = 280;
  const slotSz = 42, slotSzW = 42; // weapon slots slightly taller
  html += `<div style="position:relative;width:100%;height:${silH}px;margin:0 auto 4px;flex-shrink:0">`;
  // Silhouette image centered (use screen blend to remove black bg)
  html += `<div style="position:absolute;left:50%;top:0;width:${silW}px;height:${silH}px;transform:translateX(-50%);background:url('inv.png') center/contain no-repeat;mix-blend-mode:screen;opacity:0.35;pointer-events:none"></div>`;

  // Slot positions relative to silhouette center (centered at 50%)
  // Using CSS calc for horizontal centering
  const cx = `calc(50%)`;
  const ofsL = (x) => `calc(50% - ${silW/2 - x}px)`;
  const ofsR = (x) => `calc(50% + ${x - silW/2}px)`;

  // Head — top center
  html += slotHtml('head','Голова', p.equipment?.head, 0,0, slotSz,slotSz);
  // Face — next to head
  html += slotHtml('face','Лицо', p.equipment?.face, 0,0, slotSz,slotSz);

  // Weapon 1 — far left
  html += slotHtml('weapon1','Оружие 1', p.weaponSlot1, 0,0, slotSz,64);
  // Weapon 2 — far right
  html += slotHtml('weapon2','Оружие 2', p.weaponSlot2, 0,0, slotSz,64);

  // Torso — center chest
  html += slotHtml('torso','Торс', p.equipment?.torso, 0,0, slotSz,slotSz);
  // Armor — left of torso
  html += slotHtml('armor','Броня', p.equipment?.armor, 0,0, slotSz,slotSz);
  // Rig — right of torso
  html += slotHtml('rig','Разгрузка', p.equipment?.rig, 0,0, slotSz,slotSz);

  // Gloves — at hands level
  html += slotHtml('gloves','Перчатки', p.equipment?.gloves, 0,0, slotSz,slotSz);

  // Legs — lower
  html += slotHtml('legs','Ноги', p.equipment?.legs, 0,0, slotSz,slotSz);

  // Feet — bottom
  html += slotHtml('feet','Обувь', p.equipment?.feet, 0,0, slotSz,slotSz);

  // Back — far right side
  html += slotHtml('back','Рюкзак', p.equipment?.back, 0,0, slotSz,slotSz);

  html += '</div>';

  // We'll position slots via JS after DOM creation (see setTimeout below)

  // ── Grid Inventory below ──
  html += `<div class="inv-grid-panel" style="flex:1;overflow-y:auto;overflow-x:hidden;min-height:0">`;
  html += `<div class="inv-grid" style="width:${GRID_COLS*CELL_PX}px;height:${rows*CELL_PX}px;margin:0 auto">`;
  for (let r=0;r<rows;r++) for (let c=0;c<GRID_COLS;c++) {
    html += `<div class="inv-cell" style="left:${c*CELL_PX}px;top:${r*CELL_PX}px" data-gx="${c}" data-gy="${r}" ondragover="invDragOver(event)" ondrop="invGridDrop(event,${c},${r})"></div>`;
  }
  const rendered = new Set();
  for (let r=0;r<rows;r++) for (let c=0;c<GRID_COLS;c++) {
    const idx = _invGrid[r][c];
    if (idx < 0 || rendered.has(idx)) continue;
    rendered.add(idx);
    const it = p.inventory[idx];
    const [gw,gh] = gridSize(it.id);
    const def = ITEMS[it.id];
    const pw = gw*CELL_PX, ph = gh*CELL_PX;
    const itemName = it.keyName || def?.name || it.id;
    html += `<div class="inv-gitem" title="${itemName}" style="left:${c*CELL_PX}px;top:${r*CELL_PX}px;width:${pw}px;height:${ph}px" draggable="true" data-idx="${idx}" ondragstart="invDragStart(event,${idx})" oncontextmenu="invCtxMenu(event,${idx})" onclick="invShowInfo(${idx})" ontouchstart="invTouchStart(event,${idx})" ontouchmove="invTouchMove(event)" ontouchend="invTouchEnd()">`;
    html += `<div style="pointer-events:none">${itemIconHtml(it.id, Math.min(pw,ph)-4)}</div>`;
    if (it.qty > 1) html += `<span class="qty-badge">${it.qty}</span>`;
    if (def?.dur && it.durability != null && it.durability < 100) {
      const dp = it.durability;
      html += `<div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:rgba(0,0,0,.4)"><div style="width:${dp}%;height:100%;background:${dp>50?'#00FF41':dp>25?'#ffaa00':'#ff4444'}"></div></div>`;
    }
    html += '</div>';
  }
  html += '</div></div>';

  // Info panel
  const isTouch = 'ontouchstart' in window;
  const invHint = isTouch
    ? '📱 Удерживай предмет — меню действий · Перетащи на слот — экипировать'
    : '🖱 ПКМ — меню действий · Перетащите предмет в слот';
  html += `<div class="inv-info" id="inv-info-panel">${invHint}</div>`;

  openModal('Инвентарь', html, 'inventory');

  // Position equipment slots on the silhouette after DOM render
  setTimeout(() => {
    const mb = document.getElementById('modal-body');
    if (mb) { mb.style.overflow = 'hidden'; mb.style.display = 'flex'; mb.style.flexDirection = 'column'; }

    // Get the silhouette container
    const silContainer = mb?.querySelector('[style*="position:relative"]');
    if (!silContainer) return;
    const slotsEls = silContainer.querySelectorAll('.inv-eslot');
    const cw = silContainer.clientWidth;
    const midX = cw / 2;
    const ss = 42; // slot size

    // Position each slot relative to the body silhouette
    const positions = {
      'head':    { x: midX - ss/2,          y: 2 },
      'face':    { x: midX - ss/2 + ss + 4, y: 2 },
      'weapon1': { x: midX - silW/2 - ss - 8, y: 50 },
      'weapon2': { x: midX + silW/2 + 8,      y: 50 },
      'torso':   { x: midX - ss/2,          y: ss + 8 },
      'armor':   { x: midX - ss - ss/2 - 4, y: ss + 8 },
      'rig':     { x: midX + ss/2 + 4,      y: ss + 8 },
      'gloves':  { x: midX - silW/2 - ss - 8, y: 140 },
      'legs':    { x: midX - ss/2,          y: ss*2 + 16 },
      'feet':    { x: midX - ss/2,          y: silH - ss - 14 },
      'back':    { x: midX + silW/2 + 8,    y: 140 },
    };

    slotsEls.forEach(el => {
      const key = el.dataset.slot;
      const pos = positions[key];
      if (pos) {
        el.style.left = pos.x + 'px';
        el.style.top = pos.y + 'px';
        if (key === 'weapon1' || key === 'weapon2') {
          el.style.width = ss + 'px';
          el.style.height = '64px';
        } else {
          el.style.width = ss + 'px';
          el.style.height = ss + 'px';
        }
      }
    });
  }, 30);
}

// ── CREATIVE PANEL ──
function showCreativePanel() {
  if (!G?.creative) return;
  let html = '';

  // Quick actions
  html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">';
  html += '<button class="act-btn" onclick="creativeHeal()" style="flex:1;min-width:80px;font-size:10px">❤ Полное HP</button>';
  html += '<button class="act-btn" onclick="creativeResetMoodles()" style="flex:1;min-width:80px;font-size:10px">✦ Сброс статусов</button>';
  html += '<button class="act-btn" onclick="creativeTimeDay()" style="flex:1;min-width:80px;font-size:10px">☀ День</button>';
  html += '<button class="act-btn" onclick="creativeTimeNight()" style="flex:1;min-width:80px;font-size:10px">☾ Ночь</button>';
  html += '<button class="act-btn" onclick="creativeClearInv()" style="flex:1;min-width:80px;font-size:10px">✕ Очистить инв.</button>';
  html += '<button class="act-btn" onclick="creativeDiscoverAll()" style="flex:1;min-width:80px;font-size:10px">◎ Открыть карту</button>';
  html += '</div>';

  // Item spawn - categories
  const categories = [
    {name:'Оружие ближнего боя', filter: it => it.type==='weapon' && it.subtype==='melee' && !it._alias},
    {name:'Пистолеты', filter: it => it.type==='weapon' && it.subtype==='firearm' && it.caliber && ['9x18','9x19','7.62x25','7.62x38R','.357'].includes(it.caliber) && !it._alias},
    {name:'Длинноствольное', filter: it => it.type==='weapon' && it.subtype==='firearm' && !['9x18','9x19','7.62x25','7.62x38R','.357'].includes(it.caliber) && !it._alias},
    {name:'Магазины', filter: it => it.type==='magazine'},
    {name:'Патроны', filter: it => it.type==='ammo' && !it._alias},
    {name:'Медицина', filter: it => it.type==='medicine'},
    {name:'Еда', filter: it => it.type==='food'},
    {name:'Одежда — голова', filter: it => it.type==='clothing' && it.slot==='head'},
    {name:'Одежда — лицо', filter: it => it.type==='clothing' && it.slot==='face'},
    {name:'Одежда — торс', filter: it => it.type==='clothing' && it.slot==='torso'},
    {name:'Броня', filter: it => it.type==='clothing' && it.slot==='armor'},
    {name:'Разгрузки', filter: it => it.type==='clothing' && it.slot==='rig'},
    {name:'Перчатки', filter: it => it.type==='clothing' && it.slot==='gloves'},
    {name:'Одежда — ноги', filter: it => it.type==='clothing' && it.slot==='legs'},
    {name:'Одежда — обувь', filter: it => it.type==='clothing' && it.slot==='feet'},
    {name:'Рюкзаки', filter: it => it.type==='clothing' && it.slot==='back'},
    {name:'Материалы', filter: it => it.type==='material'},
    {name:'Комфорт', filter: it => it.type==='comfort'},
    {name:'Книги', filter: it => it.type==='book'},
    {name:'Электроника', filter: it => it.type==='radio'},
    {name:'Лор', filter: it => it.type==='lore'},
  ];

  html += '<div style="max-height:50vh;overflow-y:auto">';
  for (const cat of categories) {
    const items = Object.entries(ITEMS).filter(([id,it]) => cat.filter(it));
    if (items.length === 0) continue;
    html += `<div style="color:var(--cyan);font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin:8px 0 4px;padding-bottom:2px;border-bottom:1px solid rgba(0,229,255,.15)">${cat.name}</div>`;
    html += '<div style="display:flex;flex-wrap:wrap;gap:3px">';
    for (const [id, def] of items) {
      html += `<button class="act-btn" onclick="creativeSpawn('${id}')" style="font-size:9px;padding:3px 6px" title="${def.name}">${itemIconHtml(id,16)} ${def.name}</button>`;
    }
    html += '</div>';
  }
  html += '</div>';

  openModal('☆ Креатив-панель', html);
}

// Creative helper functions
function creativeHeal() {
  if (!G?.creative) return;
  Object.keys(G.player.hp).forEach(k => G.player.hp[k] = 100);
  G.player.moodles.bleeding = 0;
  G.player.moodles.pain = 0;
  G.player.moodles.infection = 0;
  addLog('Здоровье полностью восстановлено.', 'success');
  updateUI();
}

function creativeResetMoodles() {
  if (!G?.creative) return;
  Object.keys(G.player.moodles).forEach(k => G.player.moodles[k] = 0);
  addLog('Все статусы сброшены.', 'success');
  updateUI();
}

function creativeTimeDay() {
  if (!G?.creative) return;
  G.time.hour = 12; G.time.minute = 0;
  addLog('Время установлено: полдень.', 'info');
  updateUI();
}

function creativeTimeNight() {
  if (!G?.creative) return;
  G.time.hour = 0; G.time.minute = 0;
  addLog('Время установлено: полночь.', 'info');
  updateUI();
}

function creativeClearInv() {
  if (!G?.creative) return;
  G.player.inventory = [];
  calcWeight();
  addLog('Инвентарь очищен.', 'info');
  updateUI();
}

function creativeDiscoverAll() {
  if (!G?.creative) return;
  Object.values(G.world.nodes).forEach(n => { n.discovered = true; n.visited = true; });
  addLog('Вся карта открыта.', 'success');
  updateUI();
}

function creativeSpawn(id) {
  if (!G?.creative) return;
  const def = ITEMS[id];
  if (!def) return;
  const qty = def.stackable ? 30 : 1;
  addItem(id, qty);
  calcWeight();
  addLog(`Получено: ${def.name}${qty > 1 ? ' x'+qty : ''}`, 'success');
}

// ── Drag & Drop ──
function invDragStart(e, idx) {
  _invDrag = {invIdx: idx, fromSlot: null};
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', idx);
  e.target.classList.add('dragging');
}

function invDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function invGridDrop(e, gx, gy) {
  e.preventDefault();
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  if (!_invDrag) return;
  const idx = _invDrag.invIdx;
  const it = G.player.inventory[idx];
  if (!it) return;
  const [gw,gh] = gridSize(it.id);

  // If dragged from a slot, unequip first
  if (_invDrag.fromSlot) {
    const slot = _invDrag.fromSlot;
    if (slot === 'weapon1') { G.player.weaponSlot1 = null; if (G.player.activeSlot===1) G.player.equipped='fist'; }
    else if (slot === 'weapon2') { G.player.weaponSlot2 = null; if (G.player.activeSlot===2) G.player.equipped='fist'; }
    else if (G.player.equipment[slot]) { G.player.equipment[slot] = null; }
    // Add to inventory if not already there
    if (!G.player.inventory.includes(it)) {
      G.player.inventory.push(it);
      initInvGrid();
      const newIdx = G.player.inventory.length - 1;
      const spot = findFreeSpot(gw,gh);
      if (spot) { G.player.inventory[newIdx].gridX = spot[0]; G.player.inventory[newIdx].gridY = spot[1]; }
      showInventory();
      return;
    }
  }

  // Clear old position
  clearFromGrid(idx);
  // Try to place at new position
  if (canPlaceGrid(gx, gy, gw, gh, idx)) {
    it.gridX = gx; it.gridY = gy;
    placeOnGrid(idx, gx, gy);
  } else {
    // Revert
    if (it.gridX != null) placeOnGrid(idx, it.gridX, it.gridY);
  }
  showInventory();
}

function invSlotDrop(e, slotKey) {
  e.preventDefault();
  document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  if (!_invDrag) return;
  const idx = _invDrag.invIdx;
  const it = G.player.inventory[idx];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def) return;

  // Check compatibility
  if (slotKey === 'weapon1' || slotKey === 'weapon2') {
    if (def.type !== 'weapon') return;
    const slotNum = slotKey === 'weapon1' ? 1 : 2;
    // Swap if slot occupied
    const oldId = slotNum===1 ? G.player.weaponSlot1 : G.player.weaponSlot2;
    if (slotNum===1) G.player.weaponSlot1 = it.id;
    else G.player.weaponSlot2 = it.id;
    if (G.player.activeSlot === slotNum) G.player.equipped = it.id;
    // Remove from inventory
    clearFromGrid(idx);
    G.player.inventory.splice(idx, 1);
  } else {
    if (def.type !== 'clothing' || def.slot !== slotKey) return;
    // Unequip current if any
    const oldId = G.player.equipment[slotKey];
    G.player.equipment[slotKey] = it.id;
    clearFromGrid(idx);
    G.player.inventory.splice(idx, 1);
    // Put old item back to inventory
    if (oldId) {
      addItem(oldId, 1);
    }
  }
  calcWeight();
  showInventory();
}

function invSlotClick(slotKey) {
  let itemId = null;
  if (slotKey === 'weapon1') { itemId = G.player.weaponSlot1; if (itemId) { G.player.weaponSlot1=null; if (G.player.activeSlot===1) G.player.equipped='fist'; } }
  else if (slotKey === 'weapon2') { itemId = G.player.weaponSlot2; if (itemId) { G.player.weaponSlot2=null; if (G.player.activeSlot===2) G.player.equipped='fist'; } }
  else { itemId = G.player.equipment?.[slotKey]; if (itemId) G.player.equipment[slotKey]=null; }
  if (itemId) {
    addItem(itemId, 1);
    calcWeight();
    showInventory();
  }
}

// ── Context Menu ──
function invCtxMenu(e, idx) {
  e.preventDefault();
  e.stopPropagation();
  document.querySelectorAll('.inv-ctx').forEach(el => el.remove());
  const it = G.player.inventory[idx];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def) return;

  let menuHtml = '';
  if (def.type === 'weapon') {
    menuHtml += `<div onclick="invEquipWeapon(${idx})">Экипировать</div>`;
    if (def.subtype === 'firearm') {
      // Magazine-fed weapons
      if (def.magType && !def.noMag) {
        if (it.insertedMag) {
          menuHtml += `<div onclick="invEjectMag(${idx})">Извлечь магазин</div>`;
        } else {
          // Find compatible magazine in inventory
          const magIdx = G.player.inventory.findIndex(m => m.id === def.magType);
          if (magIdx >= 0) menuHtml += `<div onclick="invInsertMag(${idx},${magIdx})">Вставить магазин</div>`;
        }
      }
      // Direct-load weapons (revolvers, shotguns)
      if (def.noMag) {
        const ammoId = typeof getAmmoIdForCaliber==='function' ? getAmmoIdForCaliber(def.caliber) : null;
        const loaded = it.loadedAmmo || 0;
        if (ammoId && hasItem(ammoId) && loaded < def.magSize) menuHtml += `<div onclick="invLoadDirect(${idx})">Зарядить</div>`;
        if (loaded > 0) menuHtml += `<div onclick="invUnloadDirect(${idx})">Разрядить</div>`;
      }
    }
  }
  if (def.type === 'magazine') {
    const ammoId = typeof getAmmoIdForCaliber==='function' ? getAmmoIdForCaliber(def.caliber) : null;
    const loaded = it.loadedAmmo || 0;
    if (ammoId && hasItem(ammoId) && loaded < def.capacity) menuHtml += `<div onclick="invLoadMag(${idx})">Зарядить магазин</div>`;
    if (loaded > 0) menuHtml += `<div onclick="invUnloadMag(${idx})">Разрядить магазин</div>`;
  }
  if (def.type === 'clothing') menuHtml += `<div onclick="invEquipClothing(${idx})">Надеть</div>`;
  if (def.type === 'food') menuHtml += `<div onclick="invUseFood(${idx})">Съесть</div>`;
  if (def.type === 'medicine') menuHtml += `<div onclick="invUseMedicine(${idx})">Применить</div>`;
  if (def.type === 'book') menuHtml += `<div onclick="invUseBook(${idx})">Читать</div>`;
  if (def.type === 'comfort') menuHtml += `<div onclick="invUseComfort(${idx})">Использовать</div>`;
  menuHtml += `<div onclick="assignQuickSlot(${idx},0);closeCtxMenu()">В слот 1</div>`;
  menuHtml += `<div onclick="assignQuickSlot(${idx},1);closeCtxMenu()">В слот 2</div>`;
  menuHtml += `<div onclick="assignQuickSlot(${idx},2);closeCtxMenu()">В слот 3</div>`;
  menuHtml += `<div onclick="closeCtxMenu();showItemInfo('${it.id}',G.player.inventory[${idx}])">ℹ Информация</div>`;
  menuHtml += `<div onclick="invDropItem(${idx})">Бросить</div>`;
  menuHtml += `<div onclick="closeCtxMenu()">Отмена</div>`;

  const menu = document.createElement('div');
  menu.className = 'inv-ctx';
  menu.innerHTML = menuHtml;
  const mx = Math.min(e.clientX, window.innerWidth - 160);
  const my = Math.min(e.clientY, window.innerHeight - 200);
  menu.style.left = mx + 'px';
  menu.style.top = my + 'px';
  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', closeCtxMenu, {once:true}), 10);
}

function closeCtxMenu() {
  document.querySelectorAll('.inv-ctx').forEach(el => el.remove());
}

function assignQuickSlot(invIdx, slotIdx) {
  if (!G?.player) return;
  if (!G.player.quickSlots) G.player.quickSlots = [null,null,null];
  const it = G.player.inventory[invIdx];
  if (!it) return;
  G.player.quickSlots[slotIdx] = { id: it.id };
  addLog(`${ITEMS[it.id]?.name || it.id} → быстрый слот ${slotIdx+1}`, 'info');
  updateQuickSlots();
}

const Device = { isTouch: 'ontouchstart' in window };
let _longPressTimer = null, _longPressTarget = null, _longPressStartX = 0, _longPressStartY = 0;

function invTouchStart(e, idx) {
  if (!Device.isTouch) return;
  const touch = e.touches[0];
  _longPressStartX = touch.clientX; _longPressStartY = touch.clientY;
  _longPressTarget = e.currentTarget;
  _longPressTarget.style.background = 'rgba(0,255,65,0.15)';
  _longPressTimer = setTimeout(() => {
    _longPressTarget.style.background = '';
    showBottomSheet(idx);
  }, 500);
}

function invTouchMove(e) {
  if (!_longPressTimer) return;
  const touch = e.touches[0];
  const dx = touch.clientX - _longPressStartX, dy = touch.clientY - _longPressStartY;
  if (Math.sqrt(dx*dx+dy*dy) > 10) {
    clearTimeout(_longPressTimer); _longPressTimer = null;
    if (_longPressTarget) _longPressTarget.style.background = '';
  }
}

function invTouchEnd() {
  if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
  if (_longPressTarget) { _longPressTarget.style.background = ''; _longPressTarget = null; }
}

function showBottomSheet(idx) {
  document.querySelectorAll('.inv-ctx,.inv-bottom-sheet').forEach(el => el.remove());
  const it = G.player.inventory[idx];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def) return;
  const displayName = it.keyName || def.name;

  let menuHtml = `<div style="text-align:center;padding:8px 0;font-size:12px;color:var(--green);border-bottom:1px solid var(--border);margin-bottom:6px">${displayName}</div>`;
  if (def.type === 'weapon') menuHtml += `<div class="bs-item" onclick="invEquipWeapon(${idx});closeBottomSheet()">Экипировать</div>`;
  if (def.type === 'clothing') menuHtml += `<div class="bs-item" onclick="invEquipClothing(${idx});closeBottomSheet()">Надеть</div>`;
  if (def.type === 'food') menuHtml += `<div class="bs-item" onclick="invUseFood(${idx});closeBottomSheet()">Съесть</div>`;
  if (def.type === 'medicine') menuHtml += `<div class="bs-item" onclick="invUseMedicine(${idx});closeBottomSheet()">Применить</div>`;
  if (def.type === 'book') menuHtml += `<div class="bs-item" onclick="invUseBook(${idx});closeBottomSheet()">Читать</div>`;
  if (def.type === 'comfort') menuHtml += `<div class="bs-item" onclick="invUseComfort(${idx});closeBottomSheet()">Использовать</div>`;
  menuHtml += `<div class="bs-item" onclick="assignQuickSlot(${idx},0);closeBottomSheet()">В быстрый слот 1</div>`;
  menuHtml += `<div class="bs-item" onclick="assignQuickSlot(${idx},1);closeBottomSheet()">В быстрый слот 2</div>`;
  menuHtml += `<div class="bs-item" onclick="assignQuickSlot(${idx},2);closeBottomSheet()">В быстрый слот 3</div>`;
  menuHtml += `<div class="bs-item" onclick="closeBottomSheet();showItemInfo('${it.id}',G.player.inventory[${idx}])">ℹ Информация</div>`;
  menuHtml += `<div class="bs-item" onclick="invDropItem(${idx});closeBottomSheet()">Бросить</div>`;
  menuHtml += `<div class="bs-item" onclick="closeBottomSheet()" style="color:var(--text-dim)">Отмена</div>`;

  const sheet = document.createElement('div');
  sheet.className = 'inv-bottom-sheet';
  sheet.innerHTML = menuHtml;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeBottomSheet() {
  const sheet = document.querySelector('.inv-bottom-sheet');
  if (sheet) { sheet.classList.remove('open'); setTimeout(() => sheet.remove(), 200); }
}

function invShowInfo(idx) {
  const it = G.player.inventory[idx];
  if (!it) return;
  showItemInfo(it.id, it);
}

function showItemInfo(itemId, invItem) {
  const def = ITEMS[itemId];
  if (!def) return;
  const isEn = LANG?.current === 'en';
  const name = (invItem?.keyName) || def.name;
  const desc = isEn ? (def.descEn || def.desc || '') : (def.desc || '');

  let html = '';

  // Header: icon + name + type
  html += `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">`;
  html += `<div style="flex-shrink:0">${itemIconHtml(itemId, 40)}</div>`;
  html += `<div>`;
  html += `<div style="color:var(--green);font-size:14px;font-weight:bold">${name}</div>`;
  const typeNames = {weapon:isEn?'Weapon':'Оружие',clothing:isEn?'Clothing':'Одежда',food:isEn?'Food':'Еда',medicine:isEn?'Medicine':'Медицина',ammo:isEn?'Ammo':'Патроны',magazine:isEn?'Magazine':'Магазин',material:isEn?'Material':'Материал',book:isEn?'Book':'Книга',comfort:isEn?'Comfort':'Комфорт',throwable:isEn?'Throwable':'Метательное'};
  html += `<div style="color:var(--text-dim);font-size:10px">${typeNames[def.type]||def.type} · ${def.weight||0}${isEn?'kg':'кг'}${invItem?.qty>1?' · ×'+invItem.qty:''}</div>`;
  html += `</div></div>`;

  // Description
  if (desc) {
    html += `<div style="color:var(--text);font-size:10px;font-style:italic;padding:6px 8px;background:rgba(0,255,65,.03);border-left:2px solid var(--green-dim);margin-bottom:8px;line-height:1.5">${desc}</div>`;
  }

  // Durability bar
  if (invItem?.durability != null && def.dur) {
    const dp = invItem.durability;
    const col = dp > 50 ? 'var(--green)' : dp > 25 ? '#ffaa00' : 'var(--red)';
    html += `<div style="margin-bottom:6px"><div style="font-size:9px;color:var(--text-dim);margin-bottom:2px">${isEn?'Durability':'Прочность'}: ${dp}%</div>`;
    html += `<div style="height:4px;background:rgba(0,0,0,.3);border-radius:2px"><div style="width:${dp}%;height:100%;background:${col};border-radius:2px"></div></div></div>`;
  }

  // ── Clothing properties ──
  if (def.type === 'clothing') {
    // Protection
    const hasProt = def.biteDefense || def.scratchDefense || def.bulletDefense;
    if (hasProt) {
      html += `<div style="color:var(--cyan);font-size:9px;letter-spacing:.08em;margin-bottom:3px">${isEn?'PROTECTION':'ЗАЩИТА'}</div>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:6px">`;
      html += _statBar(isEn?'Bites':'Укусы', def.biteDefense||0, 100, '#ff4444');
      html += _statBar(isEn?'Scratches':'Царапины', def.scratchDefense||0, 100, '#ffaa00');
      html += _statBar(isEn?'Bullets':'Пули', def.bulletDefense||0, 100, '#00aaff');
      html += `</div>`;
    }

    // Environment
    html += `<div style="color:var(--cyan);font-size:9px;letter-spacing:.08em;margin-bottom:3px">${isEn?'ENVIRONMENT':'ОКРУЖЕНИЕ'}</div>`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:6px">`;
    html += _statBar(isEn?'Insulation':'Теплоизол.', def.insulation||0, 100, '#ff8800');
    html += _statBar(isEn?'Wind':'Ветрозащ.', def.windResist||0, 100, '#8888ff');
    html += _statBar(isEn?'Water':'Водозащ.', def.waterResist||0, 100, '#4488ff');
    html += `</div>`;

    // Movement
    const hasMove = (def.runSpeed && def.runSpeed !== 1.0) || (def.meleeSpeed && def.meleeSpeed !== 1.0);
    if (hasMove) {
      html += `<div style="color:var(--cyan);font-size:9px;letter-spacing:.08em;margin-bottom:3px">${isEn?'MODIFIERS':'МОДИФИКАТОРЫ'}</div>`;
      html += `<div style="display:flex;gap:8px;margin-bottom:6px;font-size:10px">`;
      if (def.runSpeed && def.runSpeed !== 1.0) {
        const pct = Math.round((def.runSpeed - 1) * 100);
        html += `<span style="color:${pct>=0?'var(--green)':'var(--red)'}">🏃 ${isEn?'Run':'Бег'}: ${pct>=0?'+':''}${pct}%</span>`;
      }
      if (def.meleeSpeed && def.meleeSpeed !== 1.0) {
        const pct = Math.round((def.meleeSpeed - 1) * 100);
        html += `<span style="color:${pct>=0?'var(--green)':'var(--red)'}">⚔ ${isEn?'Melee':'Ближний бой'}: ${pct>=0?'+':''}${pct}%</span>`;
      }
      html += `</div>`;
    }

    // Extra info
    html += `<div style="font-size:9px;color:var(--text-dim)">`;
    if (def.capacity) html += `📦 ${isEn?'Capacity':'Вместимость'}: +${def.capacity}${isEn?'kg':'кг'} · `;
    if (def.pockets) html += `🗂 ${isEn?'Pockets':'Карманы'}: +${def.pockets} · `;
    html += `${def.repairable ? (isEn?'🔧 Repairable':'🔧 Чинится') : (isEn?'✗ Not repairable':'✗ Не чинится')}`;
    html += `</div>`;
  }

  // ── Weapon properties ──
  if (def.type === 'weapon') {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:6px;font-size:10px">`;
    if (def.dmg) html += `<div>⚔ ${isEn?'Damage':'Урон'}: <b style="color:var(--red)">${def.dmg}</b></div>`;
    if (def.accuracy) html += `<div>🎯 ${isEn?'Accuracy':'Точность'}: <span style="color:${def.accuracy>=0?'var(--green)':'var(--red)'}"> ${def.accuracy>=0?'+':''}${def.accuracy}</span></div>`;
    if (def.noise) html += `<div>🔊 ${isEn?'Noise':'Шум'}: ${def.noise}</div>`;
    if (def.dur) html += `<div>🔧 ${isEn?'Durability':'Прочность'}: ${invItem?.durability||def.dur}/${def.dur}</div>`;
    if (def.caliber) html += `<div>💥 ${isEn?'Caliber':'Калибр'}: ${def.caliber}</div>`;
    if (def.magSize) html += `<div>📦 ${isEn?'Capacity':'Ёмкость'}: ${def.magSize}</div>`;
    html += `</div>`;
  }

  // ── Food properties ──
  if (def.type === 'food') {
    html += `<div style="font-size:10px;margin-bottom:4px">`;
    if (def.hunger) html += `<span style="color:${def.hunger<0?'var(--green)':'var(--red)'}">${isEn?'Hunger':'Голод'}: ${def.hunger}</span> · `;
    if (def.thirst) html += `<span style="color:${def.thirst<0?'var(--green)':'var(--red)'}">${isEn?'Thirst':'Жажда'}: ${def.thirst}</span> · `;
    if (invItem?.freshDays < 999) {
      const fd = invItem.freshDays;
      const lbl = fd > 2 ? (isEn?'Fresh':'Свежее') : fd > 0 ? (isEn?'Stale':'Чёрствое') : (isEn?'Spoiled':'Гнилое');
      const col = fd > 2 ? 'var(--green)' : fd > 0 ? '#ffaa00' : 'var(--red)';
      html += `<span style="color:${col}">${lbl} (${fd}${isEn?'d':'дн'})</span>`;
    }
    html += `</div>`;
  }

  // ── Medicine/book/comfort ──
  if (def.type === 'medicine' && def.subtype) html += `<div style="font-size:10px;color:var(--text-dim)">${isEn?'Type':'Тип'}: ${def.subtype}</div>`;
  if (def.type === 'book' && def.skill) html += `<div style="font-size:10px;color:var(--text-dim)">📚 ${isEn?'Skill':'Навык'}: ${SKILL_NAMES[def.skill]||def.skill} +${def.xpBoost}xp</div>`;
  if (def.depression) html += `<div style="font-size:10px;color:var(--cyan)">${isEn?'Depression':'Депрессия'}: ${def.depression}</div>`;

  openModal(`ℹ ${name}`, html);
}

function _statBar(label, value, max, color) {
  const pct = Math.min(100, Math.round(value / max * 100));
  return `<div style="text-align:center"><div style="font-size:8px;color:var(--text-dim);margin-bottom:1px">${label}</div><div style="height:4px;background:rgba(255,255,255,.06);border-radius:2px"><div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div></div><div style="font-size:9px;color:${value>0?color:'var(--text-muted)'};margin-top:1px">${value}%</div></div>`;
}

// ── Context menu actions (wrappers) ──
function invEquipWeapon(idx) {
  closeCtxMenu();
  const it = G.player.inventory[idx];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def || def.type !== 'weapon') return;
  const slot = G.player.activeSlot || 1;
  // Swap: put old weapon back to inventory
  const oldId = slot===1 ? G.player.weaponSlot1 : G.player.weaponSlot2;
  // Set new weapon
  if (slot===1) G.player.weaponSlot1 = it.id;
  else G.player.weaponSlot2 = it.id;
  G.player.equipped = it.id;
  // Remove from inventory
  clearFromGrid(idx);
  G.player.inventory.splice(idx, 1);
  // Put old weapon back
  if (oldId && oldId !== 'fist') addItem(oldId, 1);
  calcWeight();
  addLog(`Экипировано в слот ${slot}: ${def.name}`, 'info');
  showInventory();
  updateUI();
}
function invEquipClothing(idx) {
  closeCtxMenu();
  const it = G.player.inventory[idx];
  if (!it) return;
  const def = ITEMS[it.id];
  if (!def || def.type !== 'clothing') return;
  const slot = def.slot;
  // Swap: put old clothing back to inventory
  const oldId = G.player.equipment[slot];
  // Set new
  G.player.equipment[slot] = it.id;
  // Remove from inventory
  clearFromGrid(idx);
  G.player.inventory.splice(idx, 1);
  // Put old back
  if (oldId) addItem(oldId, 1);
  calcWeight();
  addLog(`Надето: ${def.name}`, 'success');
  showInventory();
  updateUI();
}
function invUseFood(idx) { closeCtxMenu(); useFood(idx); showInventory(); }
function invUseMedicine(idx) { closeCtxMenu(); useMedicine(idx); showInventory(); }
function invUseBook(idx) { closeCtxMenu(); useBook(idx); showInventory(); }
function invUseComfort(idx) { closeCtxMenu(); useComfort(idx); showInventory(); }
function invDropItem(idx) { closeCtxMenu(); dropItem(idx); showInventory(); }

// ── Weapon ammo actions from inventory ──
function invEjectMag(idx) {
  closeCtxMenu();
  const it = G.player.inventory[idx];
  if (!it?.insertedMag) return;
  addItem(it.insertedMag.id, 1, {loadedAmmo: it.insertedMag.loadedAmmo});
  it.insertedMag = null;
  showInventory();
}
function invInsertMag(weaponIdx, magIdx) {
  closeCtxMenu();
  if (typeof insertMag === 'function') { insertMag(weaponIdx, magIdx); }
  showInventory();
}
function invLoadDirect(idx) {
  closeCtxMenu();
  const it = G.player.inventory[idx];
  const def = ITEMS[it?.id];
  if (!def?.noMag) return;
  const ammoId = getAmmoIdForCaliber(def.caliber);
  if (!ammoId) return;
  const space = def.magSize - (it.loadedAmmo||0);
  const avail = countItem(ammoId);
  const count = Math.min(space, avail);
  if (count > 0) {
    it.loadedAmmo = (it.loadedAmmo||0) + count;
    removeItem(ammoId, count);
  }
  showInventory();
}
function invUnloadDirect(idx) {
  closeCtxMenu();
  const it = G.player.inventory[idx];
  if (!it?.loadedAmmo) return;
  const def = ITEMS[it.id];
  const ammoId = getAmmoIdForCaliber(def.caliber);
  if (ammoId) addItem(ammoId, it.loadedAmmo);
  it.loadedAmmo = 0;
  showInventory();
}
function invLoadMag(idx) {
  closeCtxMenu();
  const it = G.player.inventory[idx];
  const def = ITEMS[it?.id];
  if (!def?.capacity) return;
  const ammoId = getAmmoIdForCaliber(def.caliber);
  if (!ammoId) return;
  const space = def.capacity - (it.loadedAmmo||0);
  const avail = countItem(ammoId);
  const count = Math.min(space, avail);
  if (count > 0) {
    it.loadedAmmo = (it.loadedAmmo||0) + count;
    removeItem(ammoId, count);
  }
  showInventory();
}
function invUnloadMag(idx) {
  closeCtxMenu();
  const it = G.player.inventory[idx];
  if (!it?.loadedAmmo) return;
  const def = ITEMS[it.id];
  const ammoId = getAmmoIdForCaliber(def.caliber);
  if (ammoId) addItem(ammoId, it.loadedAmmo);
  it.loadedAmmo = 0;
  showInventory();
}

function unequipWeapon() {
  const slot = G.player.activeSlot || 1;
  G.player[`weaponSlot${slot}`] = null;
  G.player.equipped = getActiveWeaponId();
  addLog('Оружие убрано.', 'info');
  showInventory();
  updateUI();
}

function unequipWeaponSlot(slot) {
  G.player[`weaponSlot${slot}`] = null;
  G.player.equipped = getActiveWeaponId();
  addLog(`Слот ${slot} очищен.`, 'info');
  showInventory();
  updateUI();
}

function switchWeaponSlot() {
  G.player.activeSlot = G.player.activeSlot === 1 ? 2 : 1;
  G.player.equipped = getActiveWeaponId();
  const wId = G.player[`weaponSlot${G.player.activeSlot}`];
  const wName = wId && ITEMS[wId] ? ITEMS[wId].name : 'Кулаки';
  addLog(`Активный слот: ${G.player.activeSlot} (${wName})`, 'info');
  if (G.combatState) showCombatUI();
  else showInventory();
  updateUI();
}

function getActiveWeaponId() {
  const slot = G.player.activeSlot || 1;
  return G.player[`weaponSlot${slot}`] || 'fist';
}

function equipItem(idx) {
  const item = G.player.inventory[idx];
  const def = ITEMS[item.id];
  if (def.type === 'weapon') {
    const slot = G.player.activeSlot || 1;
    G.player[`weaponSlot${slot}`] = item.id;
    G.player.equipped = item.id;
    addLog(`Экипировано в слот ${slot}: ${def.name}`, 'info');
  } else {
    G.player.equipped = item.id;
    addLog(`Экипировано: ${def.name}`, 'info');
  }
  showInventory();
  updateUI();
}

function useFood(idx) {
  const item = G.player.inventory[idx];
  const def = ITEMS[item.id];
  if (item.freshDays <= 0 && rng.chance(60)) {
    addLog('Гнилая еда! Пищевое отравление!', 'danger');
    G.player.moodles.hunger = Math.min(100, G.player.moodles.hunger + 15);
    G.player.hp.torso = Math.max(0, G.player.hp.torso - 10);
    G.player.moodles.pain += 15;
  } else {
    if (def.hunger) G.player.moodles.hunger = Math.max(0, G.player.moodles.hunger + def.hunger);
    if (def.thirst) G.player.moodles.thirst = Math.max(0, G.player.moodles.thirst + def.thirst);
    if (def.painRelief) G.player.moodles.pain = Math.max(0, G.player.moodles.pain - def.painRelief);
    if (def.fatigue) G.player.moodles.fatigue = Math.max(0, G.player.moodles.fatigue + def.fatigue);
    if (def.depression) G.player.moodles.depression = Math.max(0, (G.player.moodles.depression || 0) + def.depression);
    if (def.pain) G.player.moodles.pain = Math.max(0, G.player.moodles.pain + def.pain);
    if (def.accuracy) G.modifiers = { ...(G.modifiers || {}), tempAccuracy: (G.modifiers?.tempAccuracy || 0) + def.accuracy };
    addLog(`Употреблено: ${def.name}`, 'success');
    addSkillXp('cooking', 3);
  }
  addNoise(def.noise || 0);
  removeItem(item.id, 1);
  showInventory();
  updateUI();
  saveGame();
}

function useMedicine(idx) {
  const item = G.player.inventory[idx];
  const def = ITEMS[item.id];
  switch (def.subtype) {
    case 'bandage':
      G.player.moodles.bleeding = 0;
      addLog('Кровотечение остановлено.', 'success');
      break;
    case 'antibiotics':
      if (!G.difficulty.infectionCure && G.player.moodles.infection >= 70) {
        addLog('Заражение слишком сильное. Антибиотики бессильны.', 'danger');
        return;
      }
      G.player.moodles.infection = Math.max(0, G.player.moodles.infection - 30);
      addLog('Антибиотики приняты. Заражение снижено.', 'success');
      break;
    case 'painkillers':
      G.player.moodles.pain = Math.max(0, G.player.moodles.pain - 40);
      addLog('Обезболивающее принято.', 'success');
      break;
    case 'splint':
      // Find most damaged limb
      const limbs = ['armL','armR','legL','legR'];
      const worst = limbs.reduce((a, b) => G.player.hp[a] < G.player.hp[b] ? a : b);
      G.player.hp[worst] = Math.min(100, G.player.hp[worst] + 30);
      const partNames = { armL:'Л.рука', armR:'П.рука', legL:'Л.нога', legR:'П.нога' };
      addLog(`Шина наложена на ${partNames[worst]}. +30 HP.`, 'success');
      break;
    case 'disinfectant':
      G.player.moodles.infection = Math.max(0, G.player.moodles.infection - 15);
      addLog('Раны продезинфицированы.', 'success');
      break;
    case 'vitamins':
      G.player.moodles.depression = Math.max(0, (G.player.moodles.depression || 0) - 10);
      G.player.moodles.fatigue = Math.max(0, G.player.moodles.fatigue - 10);
      addLog('Витамины приняты. Бодрость и настроение улучшены.', 'success');
      break;
    case 'antidepressants':
      G.player.moodles.depression = Math.max(0, (G.player.moodles.depression || 0) - 35);
      addLog('Антидепрессанты приняты. Депрессия значительно снижена.', 'success');
      break;
  }
  addSkillXp('firstAid', 10);
  removeItem(item.id, 1);
  showInventory();
  updateUI();
  saveGame();
}

function useBook(idx) {
  const item = G.player.inventory[idx];
  const def = ITEMS[item.id];
  if (!def || def.type !== 'book') return;
  const skill = def.skill;
  const xp = def.xpBoost || 50;
  addSkillXp(skill, xp);
  advanceTime(2); // Reading takes time
  addLog(`Прочитано: ${def.name}. +${xp} XP к навыку "${skill}".`, 'success');
  // Depression reduction from reading
  G.player.moodles.depression = Math.max(0, (G.player.moodles.depression || 0) - 5);
  removeItem(item.id, 1);
  showInventory();
  updateUI();
  saveGame();
}

function useComfort(idx) {
  const item = G.player.inventory[idx];
  const def = ITEMS[item.id];
  if (!def || def.type !== 'comfort') return;
  const depressionReduce = Math.abs(def.depression || 0);
  G.player.moodles.depression = Math.max(0, (G.player.moodles.depression || 0) - depressionReduce);
  advanceTime(1);
  const actionNames = { smoke:'Покурил', read:'Почитал', play:'Поиграл', look:'Посмотрел', listen:'Послушал' };
  const action = actionNames[def.comfortType] || 'Использовал';
  addLog(`${action}: ${def.name}. Депрессия -${depressionReduce}.`, 'success');

  if (def.reusable) {
    // Reusable items stay in inventory
  } else if (def.uses && def.uses > 1) {
    // Multi-use items (cigarettes)
    if (!item.usesLeft) item.usesLeft = def.uses;
    item.usesLeft--;
    if (item.usesLeft <= 0) {
      removeItem(item.id, 1);
      addLog(`${def.name} закончились.`, 'warning');
    }
  } else {
    removeItem(item.id, 1);
  }
  showInventory();
  updateUI();
  saveGame();
}

function equipClothing(idx) {
  const item = G.player.inventory[idx];
  const def = ITEMS[item.id];
  if (!def || def.type !== 'clothing') return;
  if (!G.player.equipment) G.player.equipment = { head:null, torso:null, legs:null, feet:null, back:null };
  const slot = def.slot;
  // Unequip current item in slot
  if (G.player.equipment[slot]) {
    addLog(`Снято: ${ITEMS[G.player.equipment[slot]]?.name || 'предмет'}`, 'info');
  }
  G.player.equipment[slot] = item.id;
  addLog(`Надето: ${def.name} (${slot})`, 'success');
  calcWeight();
  showInventory();
  updateUI();
  saveGame();
}

function unequipClothing(slot) {
  if (!G.player.equipment || !G.player.equipment[slot]) return;
  const id = G.player.equipment[slot];
  addLog(`Снято: ${ITEMS[id]?.name || 'предмет'}`, 'info');
  G.player.equipment[slot] = null;
  calcWeight();
  showInventory();
  updateUI();
  saveGame();
}

function dropItem(idx) {
  const item = G.player.inventory[idx];
  const def = ITEMS[item.id];
  if (G.player.equipped === item.id) G.player.equipped = 'fist';
  // Clear weapon slots if dropping a weapon in a slot
  if (def && def.type === 'weapon') {
    if (G.player.weaponSlot1 === item.id) { G.player.weaponSlot1 = null; }
    if (G.player.weaponSlot2 === item.id) { G.player.weaponSlot2 = null; }
    G.player.equipped = getActiveWeaponId();
  }
  // Unequip clothing if dropping equipped clothing
  if (G.player.equipment) {
    Object.entries(G.player.equipment).forEach(([slot, id]) => {
      if (id === item.id) G.player.equipment[slot] = null;
    });
  }
  // Add to current room floor if in a room
  const room = currentRoom();
  if (room) {
    if (!room.floor) room.floor = [];
    room.floor.push({ id: item.id, qty: item.qty || 1, durability: item.durability, freshDays: item.freshDays, loadedAmmo: item.loadedAmmo, insertedMag: item.insertedMag });
  }
  addLog(`Выброшено: ${def?.name || item.id}${room ? ' (на пол)' : ''}`, '');
  // Clear quick slot if this item was assigned
  if (G.player.quickSlots) {
    G.player.quickSlots.forEach((qs, i) => { if (qs && qs.id === item.id) G.player.quickSlots[i] = null; });
  }
  G.player.inventory.splice(idx, 1);
  calcWeight();
  if (typeof updateQuickSlots === 'function') updateQuickSlots();
  showInventory();
  updateUI();
  saveGame();
}

// ── HEALTH ──
function showHealth() {
  const p = G.player;
  const partNames = { head:'Голова', torso:'Торс', armL:'Лев. рука', armR:'Прав. рука', legL:'Лев. нога', legR:'Прав. нога' };
  let html = '<div style="margin-bottom:10px;color:var(--text-dim);font-size:10px;letter-spacing:.1em">СОСТОЯНИЕ ТЕЛА</div>';

  Object.entries(p.hp).forEach(([part, val]) => {
    const color = val > 50 ? 'var(--green)' : val > 15 ? 'var(--yellow)' : 'var(--red)';
    html += `<div class="body-part">
      <span>${partNames[part]}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:${color};font-size:10px">${val}%</span>
        <div class="bp-bar"><div class="bp-fill" style="width:${val}%;background:${color}"></div></div>
      </div>
    </div>`;
  });

  // Temperature & Wetness section
  html += '<div style="margin:14px 0 8px;color:var(--text-dim);font-size:10px;letter-spacing:.1em">ТЕМПЕРАТУРА ТЕЛА</div>';
  if (typeof getTemperatureStatus === 'function') {
    const ts = getTemperatureStatus();
    const bodyTemp = p.moodles.bodyTemp || 36.6;
    html += `<div class="body-part"><span>🌡️ Температура тела</span><span style="color:${ts.color};font-size:10px">${bodyTemp.toFixed(1)}°C — ${t(ts.key)}</span></div>`;
  }
  if (p.moodles.illness > 0) {
    html += `<div class="body-part"><span>🤒 Простуда</span><div style="display:flex;align-items:center;gap:6px"><span style="color:var(--red);font-size:10px">${Math.round(p.moodles.illness)}%</span><div class="bp-bar"><div class="bp-fill" style="width:${p.moodles.illness}%;background:var(--red)"></div></div></div></div>`;
  }
  if (typeof getWetnessStatus === 'function') {
    const ws = getWetnessStatus();
    const wet = Math.round(p.moodles.wetness || 0);
    html += `<div class="body-part"><span>💦 Влажность</span><div style="display:flex;align-items:center;gap:6px"><span style="color:${ws.color};font-size:10px">${wet}% — ${t(ws.key)}</span><div class="bp-bar"><div class="bp-fill" style="width:${wet}%;background:${ws.color}"></div></div></div></div>`;
  }
  if (typeof getCurrentSeason === 'function') {
    const season = getCurrentSeason();
    const weather = G.world.weather || 'clear';
    html += `<div class="body-part"><span>🌤️ Погода</span><span style="font-size:10px;color:var(--text-dim)">${getWeatherIcon()} ${t('weather.'+weather)} · ${t('season.'+season)} · ${G.world.outsideTemp||0}°C</span></div>`;
  }

  html += '<div style="margin:14px 0 8px;color:var(--text-dim);font-size:10px;letter-spacing:.1em">СТАТУСЫ</div>';
  const moodleNames = { hunger:'🍖 Голод', thirst:'💧 Жажда', fatigue:'😴 Усталость', depression:'😞 Депрессия', noise:'🔊 Шум', infection:'🦠 Заражение', bleeding:'🩸 Кровотечение', pain:'🤕 Боль', panic:'😨 Паника' };
  Object.entries(p.moodles).forEach(([key, val]) => {
    if (!moodleNames[key]) return; // Skip temperature/wetness (shown above)
    if (key === 'bleeding') {
      const active = val > 0;
      html += `<div class="body-part"><span>${moodleNames[key]}</span><span style="color:${active ? 'var(--red)' : 'var(--green)'};font-size:10px">${active ? 'АКТИВНО' : 'Нет'}</span></div>`;
    } else {
      const level = getMoodleLevel(val);
      const color = level === 'ok' ? 'var(--green)' : level === 'mild' ? 'var(--yellow)' : level === 'severe' ? '#ff8800' : 'var(--red)';
      const levelName = level === 'ok' ? 'Норма' : level === 'mild' ? 'Легкий' : level === 'severe' ? 'Тяжёлый' : 'Критический';
      html += `<div class="body-part">
        <span>${moodleNames[key]}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="color:${color};font-size:10px">${Math.round(val)} — ${levelName}</span>
          <div class="bp-bar"><div class="bp-fill" style="width:${val}%;background:${color}"></div></div>
        </div>
      </div>`;
    }
  });

  html += '<div style="margin:14px 0 8px;color:var(--text-dim);font-size:10px;letter-spacing:.1em">НАВЫКИ</div>';
  Object.entries(p.skills).forEach(([skill, level]) => {
    const xp = p.skillXp[skill] || 0;
    const nextThreshold = (level + 1) * 30;
    const pct = level >= 5 ? 100 : Math.round(xp / nextThreshold * 100);
    html += `<div class="body-part">
      <span>${getSkillName(skill)}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:var(--cyan);font-size:10px">Ур.${level}${level < 5 ? ` (${pct}%)` : ' MAX'}</span>
        <div class="bp-bar"><div class="bp-fill" style="width:${level >= 5 ? 100 : pct}%;background:var(--cyan)"></div></div>
      </div>
    </div>`;
  });

  html += `<div style="margin-top:14px;color:var(--text-dim);font-size:10px;text-align:center">Дней прожито: ${G.player.daysSurvived} · Зомби убито: ${G.stats.zombiesKilled}</div>`;

  openModal('Здоровье и навыки', html, 'health');
}

// ── CRAFTING ──
function showCrafting() {
  const _craftLoc = currentLocation();
  const isAtBase = _craftLoc && G.world.homeBase === _craftLoc.id;

  // Categorize recipes
  const categories = {
    'Оружие': [], 'Медицина': [], 'Еда': [], 'Инструменты': [], 'База': [],
  };
  RECIPES.forEach((recipe, i) => {
    const r = recipe.result;
    if (r === '_barricade' || r === '_trap' || r === '_alarm') categories['База'].push({recipe, i});
    else if (r === 'spear' || r === 'molotov' || r === '_repair_melee' || r === '_repair_firearm') categories['Оружие'].push({recipe, i});
    else if (r === 'bandage' || r === 'splint') categories['Медицина'].push({recipe, i});
    else if (r === 'soup' || r === '_stew' || r === '_smoked_meat') categories['Еда'].push({recipe, i});
    else categories['Инструменты'].push({recipe, i});
  });

  let html = '';
  for (const [catName, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    html += `<div style="color:var(--cyan);font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin:10px 0 6px;padding-bottom:3px;border-bottom:1px solid rgba(0,229,255,.15)">${catName}</div>`;
    for (const {recipe, i} of items) {
      const hasSkill = !recipe.skill || G.player.skills[recipe.skill] >= recipe.skillReq;
      const hasComps = Object.entries(recipe.components).every(([id, qty]) => hasItem(id, qty));
      const needsBaseCheck = recipe.needsBase ? isAtBase : true;
      const canCraft = hasSkill && hasComps && needsBaseCheck;

      const compPills = Object.entries(recipe.components).map(([id, qty]) => {
        const has = hasItem(id, qty);
        return `<span style="display:inline-block;padding:1px 5px;margin:1px;border-radius:2px;font-size:9px;border:1px solid ${has ? 'var(--green-dim)' : 'rgba(255,34,68,.3)'};color:${has ? 'var(--green)' : 'var(--red)'};background:${has ? 'rgba(0,255,65,.05)' : 'rgba(255,34,68,.05)'}">${ITEMS[id]?.name || id}${qty > 1 ? ' ×'+qty : ''}</span>`;
      }).join('');

      const skillBadge = recipe.skill
        ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;border:1px solid ${hasSkill ? 'var(--green-dim)' : 'rgba(255,34,68,.3)'};color:${hasSkill ? 'var(--text-dim)' : 'var(--red)'}">${getSkillName(recipe.skill)} ${recipe.skillReq}+${hasSkill ? ' ✓' : ''}</span>`
        : '';

      const baseBadge = recipe.needsBase
        ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;border:1px solid ${isAtBase ? 'var(--green-dim)' : 'rgba(255,34,68,.3)'};color:${isAtBase ? 'var(--text-dim)' : 'var(--red)'}">🏠 База${isAtBase ? ' ✓' : ''}</span>`
        : '';

      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:3px;border:1px solid ${canCraft ? 'var(--green-dim)' : 'var(--border)'};border-radius:4px;background:${canCraft ? 'rgba(0,255,65,.03)' : 'rgba(0,0,0,.2)'}">
        <div style="flex:1;min-width:0">
          <div style="color:${canCraft ? 'var(--green)' : 'var(--text-dim)'};font-size:11px;font-weight:bold;margin-bottom:2px">${recipe.name}</div>
          ${recipe.desc ? `<div style="color:var(--text-muted);font-size:9px;margin-bottom:3px;font-style:italic">${recipe.desc}</div>` : ''}
          <div style="margin-bottom:2px">${compPills}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">${skillBadge}${baseBadge}</div>
        </div>
        <button class="act-btn" style="flex-shrink:0;padding:6px 12px;font-size:10px;${canCraft ? 'border-color:var(--green);color:var(--green)' : 'opacity:.4'}" ${canCraft ? `onclick="doCraft(${i});showCrafting()"` : 'disabled'}>${canCraft ? '⚒ Создать' : '✗'}</button>
      </div>`;
    }
  }

  openModal('⚒ Крафт', html, 'craft');
}

function doCraft(idx) {
  const recipe = RECIPES[idx];

  Object.entries(recipe.components).forEach(([id, qty]) => {
    if (recipe.returnKnife && id === 'knife') return;
    if (recipe.keepHammer && id === 'hammer') return;
    if (recipe.keepAll) return;
    removeItem(id, qty);
  });

  if (recipe.result === '_barricade') {
    G.world.homeBaseSecurity = Math.min(10, G.world.homeBaseSecurity + 2);
    addLog(`Баррикада установлена! Безопасность: ${G.world.homeBaseSecurity}/10`, 'success');
  } else if (recipe.result === '_trap') {
    G.world.homeBaseTraps = (G.world.homeBaseTraps || 0) + 1;
    addLog(`Растяжка-ловушка установлена! (×${G.world.homeBaseTraps})`, 'success');
  } else if (recipe.result === '_alarm') {
    G.world.homeBaseSecurity = Math.min(10, G.world.homeBaseSecurity + 2);
    addLog(`Сигнализация установлена! Безопасность: ${G.world.homeBaseSecurity}/10`, 'success');
  } else if (recipe.result === '_repair_melee') {
    const wpn = G.player.inventory.find(it => ITEMS[it.id] && ITEMS[it.id].type === 'weapon' && ITEMS[it.id].subtype === 'melee' && it.id !== 'fist' && it.durability < (ITEMS[it.id].dur || 100));
    if (wpn) {
      const maxDur = ITEMS[wpn.id].dur || 100;
      const repairAmt = 30 + G.player.skills.mechanics * 10;
      wpn.durability = Math.min(maxDur, wpn.durability + repairAmt);
      removeItem('scrap_metal', 1); removeItem('tape', 1);
      addLog(`${ITEMS[wpn.id].name} починено! Прочность: ${Math.round(wpn.durability)}`, 'success');
    } else {
      addLog('Нет оружия ближнего боя для починки.', 'warning');
      return;
    }
  } else if (recipe.result === '_repair_firearm') {
    const wpn = G.player.inventory.find(it => ITEMS[it.id] && ITEMS[it.id].type === 'weapon' && ITEMS[it.id].subtype === 'firearm' && it.durability < (ITEMS[it.id].dur || 100));
    if (wpn) {
      const maxDur = ITEMS[wpn.id].dur || 100;
      const repairAmt = 40 + G.player.skills.mechanics * 10;
      wpn.durability = Math.min(maxDur, wpn.durability + repairAmt);
      removeItem('scrap_metal', 1); removeItem('duct_tape', 1);
      addLog(`${ITEMS[wpn.id].name} починено! Прочность: ${Math.round(wpn.durability)}`, 'success');
    } else {
      addLog('Нет огнестрельного оружия для починки.', 'warning');
      return;
    }
  } else if (recipe.result === '_stew') {
    addItem('stew', 1);
    addLog('Создано: Рагу', 'success');
  } else if (recipe.result === '_smoked_meat') {
    addItem('smoked_meat', 2);
    addLog('Создано: Вяленое мясо ×2', 'success');
  } else if (recipe.result === '_lockpick') {
    addItem('lockpick', 1);
    addLog('Создано: Отмычка', 'success');
  } else if (recipe.result === '_torch') {
    addItem('torch', 1);
    addLog('Создано: Факел', 'success');
  } else {
    addItem(recipe.result, 1);
    addLog(`Создано: ${ITEMS[recipe.result].name}`, 'success');
  }

  if (recipe.skill) addSkillXp(recipe.skill, 15);
  G.stats.itemsCrafted = (G.stats.itemsCrafted || 0) + 1;
  advanceTime(1);
  addNoise(10);
  playSound('craft');
  if (typeof showCraftAnimation === 'function') {
    const resultName = recipe.result.startsWith('_') ? '' : (ITEMS[recipe.result]?.name || '');
    showCraftAnimation(resultName);
  }
  showCrafting();
  updateUI();
  saveGame();
}

// ── MAP ──
// ── MAP STATE ──
let mapState = {
  panX: 0, panY: 0, zoom: 2.2,
  dragging: false, wasDragging: false, dragStartX: 0, dragStartY: 0,
  selectedNode: null, previewPath: null, xray: false,
  animFrame: null,
  moveAnim: null, // { fromId, toId, progress, startTime, duration }
};

// ═══════════════════════════════════════════
// RADIO SYSTEM
// ═══════════════════════════════════════════
function showRadioChat() {
  if (!G.radio) G.radio = { charge:0, transmissions:[], nextTransmission:0, airdropNodeId:null, airdropDiscovered:false, npcCampDiscovered:false };
  const isEn = LANG?.current === 'en';
  const r = G.radio;
  const hasBattery = hasItem('battery');
  const canScan = r.charge >= 10 && r.nextTransmission < RADIO_TRANSMISSIONS.length;

  let html = '';

  // Header: frequency + charge
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">`;
  html += `<div style="color:var(--cyan);font-size:11px;letter-spacing:.1em">📡 ${isEn ? 'FREQUENCY' : 'ЧАСТОТА'}: 148.200 MHz</div>`;
  html += `<div style="font-size:10px;color:${r.charge > 0 ? 'var(--green)' : 'var(--red)'}">${isEn ? 'CHARGE' : 'ЗАРЯД'}: ${r.charge} ${isEn ? 'min' : 'мин'}</div>`;
  html += `</div>`;

  // Charge bar
  const chargePct = Math.min(100, Math.round(r.charge / 180 * 100));
  html += `<div style="height:4px;background:rgba(0,255,65,.1);border-radius:2px;margin-bottom:12px">`;
  html += `<div style="height:100%;width:${chargePct}%;background:${r.charge > 30 ? 'var(--green)' : 'var(--red)'};border-radius:2px;transition:width .3s"></div></div>`;

  // Transmissions (newest first)
  if (r.transmissions.length > 0) {
    html += `<div style="max-height:40vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px">`;
    [...r.transmissions].reverse().forEach(tx => {
      html += `<div style="padding:8px;border:1px solid rgba(0,229,255,.15);border-radius:4px;background:rgba(0,229,255,.03)">`;
      html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px">`;
      html += `<span style="color:var(--cyan);font-size:10px;font-weight:bold">${isEn ? tx.speakerEn : tx.speaker}</span>`;
      html += `<span style="color:var(--text-muted);font-size:9px">${tx.freq} MHz</span>`;
      html += `</div>`;
      let text = isEn ? tx.textEn : tx.text;
      // Replace airdrop placeholder with actual street
      if (tx.special === 'airdrop' && G.radio.airdropStreet) {
        text = text.replace('координаты сброса', G.radio.airdropStreet);
        text = text.replace('supply drop coordinates', G.radio.airdropStreet);
      }
      html += `<div style="color:var(--text);font-size:10px;line-height:1.5;font-style:italic">"${text}"</div>`;
      html += `</div>`;
    });
    html += `</div>`;
  } else {
    html += `<div style="text-align:center;color:var(--text-dim);padding:20px;font-size:11px">${isEn ? 'No transmissions received yet' : 'Передач пока нет'}</div>`;
  }

  // Action buttons
  html += `<div style="display:flex;flex-direction:column;gap:6px">`;
  if (canScan) {
    html += `<button class="act-btn" onclick="scanRadio()" style="width:100%;padding:10px;border-color:var(--cyan);color:var(--cyan)">📻 ${isEn ? 'SCAN AIRWAVES' : 'СКАНИРОВАТЬ ЭФИР'} <span style="font-size:9px;opacity:.6">(-10 ${isEn ? 'min' : 'мин'})</span></button>`;
  } else if (r.nextTransmission >= RADIO_TRANSMISSIONS.length) {
    html += `<div style="text-align:center;color:var(--text-dim);font-size:10px;padding:6px">${isEn ? 'All frequencies scanned' : 'Все частоты просканированы'}</div>`;
  } else if (r.charge < 10) {
    html += `<div style="text-align:center;color:var(--red);font-size:10px;padding:6px">${isEn ? 'Not enough charge to scan' : 'Недостаточно заряда для сканирования'}</div>`;
  }

  if (hasBattery) {
    html += `<button class="act-btn" onclick="useRadioBattery()" style="width:100%;padding:8px">🔋 ${isEn ? 'INSERT BATTERIES' : 'ВСТАВИТЬ БАТАРЕЙКИ'} <span style="font-size:9px;opacity:.6">(+180 ${isEn ? 'min' : 'мин'})</span></button>`;
  }
  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:8px">👋 ${isEn ? 'Close' : 'Закрыть'}</button>`;
  html += `</div>`;

  openModal('📻 ' + (isEn ? 'Radio' : 'Рация'), html);
  playSound('scan');
}

function scanRadio() {
  if (!G.radio || G.radio.charge < 10) return;
  if (G.radio.nextTransmission >= RADIO_TRANSMISSIONS.length) return;

  G.radio.charge -= 10;
  const tx = RADIO_TRANSMISSIONS[G.radio.nextTransmission];
  G.radio.transmissions.push(tx);
  G.radio.nextTransmission++;

  const isEn = LANG?.current === 'en';

  if (tx.special === 'airdrop') {
    G.radio.airdropDiscovered = true;
    addLog(isEn ? '📡 Supply drop coordinates received! Check the map.' : '📡 Координаты сброса получены! Проверьте карту.', 'success');
  }
  if (tx.special === 'npc_camp') {
    G.radio.npcCampDiscovered = true;
    addLog(isEn ? '📡 Survivor settlement located! Check the map.' : '📡 Поселение выживших обнаружено! Проверьте карту.', 'success');
  }

  playSound('scan');
  addNoise(5);
  showRadioChat(); // refresh
  saveGame();
}

function showTriggerEvent(evt) {
  const isEn = LANG?.current === 'en';
  const title = isEn ? (evt.titleEn || evt.title) : evt.title;
  const text = isEn ? (evt.textEn || evt.text) : evt.text;
  const typeColors = { graffiti:'var(--yellow)', blood:'var(--red)', corpse:'#aa6644', barricade:'#887744', warning:'var(--cyan)' };
  const typeIcons = { graffiti:'🖊️', blood:'🩸', corpse:'💀', barricade:'🚧', warning:'⚠️' };
  const color = typeColors[evt.type] || 'var(--text)';
  const icon = typeIcons[evt.type] || '❓';

  let html = '';
  html += `<div style="background:rgba(0,0,0,.4);border:1px solid ${color};border-radius:6px;padding:14px;margin-bottom:10px">`;
  html += `<div style="text-align:center;font-size:28px;margin-bottom:8px">${icon}</div>`;
  html += `<div style="color:var(--text);font-size:11px;line-height:1.7;white-space:pre-wrap">${text}</div>`;
  html += `</div>`;

  // Loot from trigger
  if (evt.loot && evt.loot.length > 0) {
    html += `<div style="color:var(--green);font-size:10px;margin-bottom:6px">${isEn ? 'Found:' : 'Найдено:'}</div>`;
    evt.loot.forEach(l => {
      addItem(l.id, l.qty);
      const def = ITEMS[l.id];
      html += `<div style="color:var(--text-dim);font-size:10px">+ ${def?.name || l.id}${l.qty > 1 ? ' ×' + l.qty : ''}</div>`;
    });
  }

  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:8px;margin-top:10px">${isEn ? 'Continue' : 'Продолжить'}</button>`;

  openModal(icon + ' ' + title, html);
  playSound('alert');

  // Depression effect
  if (evt.depressionAdd) {
    G.player.moodles.depression = Math.min(100, (G.player.moodles.depression || 0) + evt.depressionAdd);
  }

  addLog(`${icon} ${title}`, 'lore');
  saveGame();
}

function showLoreNote(note) {
  const isEn = LANG?.current === 'en';
  let html = '';
  html += `<div style="background:rgba(0,229,255,.03);border:1px solid rgba(0,229,255,.15);border-radius:6px;padding:14px;margin-bottom:10px">`;
  html += `<div style="color:var(--text);font-size:11px;line-height:1.7;white-space:pre-wrap">${note.text}</div>`;
  html += `</div>`;
  html += `<div style="text-align:center;color:var(--text-muted);font-size:9px;margin-bottom:8px">${isEn ? 'Saved to diary → Notes tab' : 'Сохранено в дневник → вкладка Записки'}</div>`;
  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:8px">${isEn ? 'Close' : 'Закрыть'}</button>`;
  openModal('📜 ' + note.title, html);
}

function checkNewAirdrop() {
  if (!G.radio || !hasItem('radio')) return;
  const daysSince = G.player.daysSurvived - (G.radio.lastAirdropDay || 0);
  if (daysSince < 30) return;

  // Clear old airdrop if it was searched
  if (G.radio.airdropNodeId) {
    const oldNode = G.world.nodes[G.radio.airdropNodeId];
    if (oldNode && oldNode.searched) {
      oldNode.isAirdrop = false;
      G.radio.airdropNodeId = null;
    } else {
      return; // old airdrop still active, don't generate new one
    }
  }

  generateAirdrop();
  G.radio.lastAirdropDay = G.player.daysSurvived;
  const isEn = LANG?.current === 'en';
  addLog(isEn ? '📡 Radio: New supply drop detected! Check the map.' : '📡 Рация: Обнаружен новый сброс припасов! Проверьте карту.', 'success');
  playSound('scan');
}

function generateAirdrop() {
  const curNode = G.world.nodes[G.world.currentNodeId];
  const pGx = curNode?.gx || 20, pGy = curNode?.gy || 20;

  const candidates = Object.values(G.world.nodes).filter(n =>
    (n.type === 'road' || n.type === 'intersection') && !n.isAirdrop && !n.searched &&
    !isInNPCBase(n.gx, n.gy) && (Math.abs(n.gx - pGx) + Math.abs(n.gy - pGy)) >= 10
  );
  if (candidates.length === 0) return;

  const adNode = candidates[rng.int(0, candidates.length - 1)];
  adNode.isAirdrop = true;
  adNode.searched = false;
  adNode.name = 'Точка сброса';
  adNode.lootContainers = [{
    name: 'Ящик сброса', icon: '📦', searched: false, locked: null,
    loot: [
      { id:'canned_food', qty:3, durability:0, freshDays:999 },
      { id:'water', qty:3, durability:0, freshDays:999 },
      { id:'antibiotics', qty:1, durability:0, freshDays:999 },
      { id:'bandage', qty:3, durability:0, freshDays:999 },
      { id:'ammo_9x19', qty:10, durability:0, freshDays:999 },
      { id:'battery', qty:2, durability:0, freshDays:999 },
    ]
  }];
  G.radio.airdropNodeId = adNode.id;
  G.radio.airdropDiscovered = true;
  G.radio.airdropStreet = adNode.streetName || 'неизвестная улица';
}

function useRadioBattery() {
  if (!hasItem('battery')) return;
  removeItem('battery', 1);
  G.radio.charge += 180;
  addLog(LANG?.current === 'en' ? 'Batteries inserted. +180 min charge.' : 'Батарейки вставлены. +180 мин заряда.', 'success');
  playSound('pickup');
  showRadioChat(); // refresh
}

function showMap() {
  const nodes = G.world.nodes;
  if (!nodes || !G.world.currentNodeId) {
    openModal('Карта', '<div style="color:var(--text-dim)">Карта недоступна.</div>', 'map');
    return;
  }

  const cur = nodes[G.world.currentNodeId];
  const cellPx = WORLD_CONFIG.cellPx;
  if (!mapState._userZoom) { mapState.zoom = 2.2; mapState._userZoom = true; }
  // (zoom kept at 2.2 for dimetric — good default)
  mapState.selectedNode = null;
  mapState.previewPath = null;

  // Flex layout: canvas stretches, controls pinned at bottom
  let html = '<div id="map-wrapper" style="display:flex;flex-direction:column;height:calc(85vh - 60px);min-height:250px">';

  // Canvas — fills available space
  html += '<canvas id="map-canvas" width="500" height="400" style="flex:1;width:100%;min-height:0;border:1px solid rgba(0,255,65,0.15);border-radius:4px;touch-action:none;cursor:grab;background:#030803"></canvas>';

  // Fixed bottom panel
  html += '<div id="map-controls" style="flex-shrink:0;padding-top:5px">';

  // Info panel
  html += '<div id="map-info" style="padding:3px 6px;font-size:9px;color:var(--text-dim);min-height:22px;border:1px solid var(--border);border-radius:3px;background:rgba(0,10,0,.6);overflow:hidden;text-overflow:ellipsis"></div>';

  // Controls row — compact for mobile
  html += '<div style="display:flex;gap:2px;margin-top:3px;flex-wrap:wrap">';
  const icsz = 18;
  html += `<button class="act-btn" onclick="mapZoom(1)" style="min-height:28px;flex:1;min-width:36px;padding:1px">${mapIconHtml('zoom_in',icsz)}</button>`;
  html += `<button class="act-btn" onclick="mapZoom(-1)" style="min-height:28px;flex:1;min-width:36px;padding:1px">${mapIconHtml('zoom_out',icsz)}</button>`;
  html += `<button class="act-btn" onclick="mapCenter()" style="min-height:28px;flex:1;min-width:36px;padding:1px">${mapIconHtml('center',icsz)}</button>`;
  html += `<button class="act-btn" id="map-xray-btn" onclick="toggleMapXray()" style="min-height:28px;flex:1;min-width:36px;padding:1px${mapState.xray?';border-color:var(--cyan);background:rgba(0,229,255,.12)':''}">${mapIconHtml('xray',icsz)}</button>`;
  html += `<button class="act-btn" id="map-scout-btn" onclick="doScout()" style="min-height:28px;flex:1;min-width:36px;padding:1px;border-color:var(--cyan)">${mapIconHtml('scout',icsz)}</button>`;
  html += `<button class="act-btn" id="map-go-btn" onclick="mapGo()" style="min-height:28px;flex:2;min-width:70px;display:none;padding:1px;border-color:var(--green);background:rgba(0,255,65,.15);font-size:10px">${mapIconHtml('go',icsz)} ИДТИ</button>`;
  html += '</div>';

  // Scout progress bar
  html += '<div id="map-scout-progress" style="display:none;margin-top:2px"><div class="bp-bar" style="height:3px"><div class="bp-fill" style="width:0%;background:var(--cyan)"></div></div></div>';

  // Route controls
  if (G.world.currentRoute && !G.world.currentRoute.paused) {
    const rt = G.world.currentRoute;
    html += `<div style="margin-top:4px;display:flex;gap:3px;align-items:center">`;
    html += `<div style="flex:1;padding:3px 6px;border:1px solid var(--cyan);border-radius:3px;color:var(--cyan);font-size:10px;background:rgba(0,229,255,.05)">В пути: ${rt.currentStep}/${rt.path.length-1}</div>`;
    html += '<button class="act-btn danger" onclick="cancelRoute();showMap()" style="min-height:30px;flex:0 0 auto;padding:0 12px">СТОП</button>';
    html += '</div>';
  } else if (G.world.currentRoute && G.world.currentRoute.paused) {
    html += '<div style="margin-top:4px;display:flex;gap:3px">';
    html += '<button class="act-btn" onclick="resumeRoute();showMap()" style="min-height:30px;flex:1;border-color:var(--green);color:var(--green)">ПРОДОЛЖИТЬ</button>';
    html += '<button class="act-btn danger" onclick="cancelRoute();showMap()" style="min-height:30px;flex:1">ОТМЕНИТЬ</button>';
    html += '</div>';
  }

  html += '</div>'; // end map-controls
  html += '</div>'; // end map-wrapper
  openModal('Карта', html, 'map');

  // Override modal styles for map: no scroll, fill height
  setTimeout(() => {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modal-body');
    if (modal) { modal.style.maxHeight = '90vh'; modal.style.overflow = 'hidden'; modal.style.display = 'flex'; modal.style.flexDirection = 'column'; }
    if (modalBody) { modalBody.style.flex = '1'; modalBody.style.overflow = 'hidden'; modalBody.style.padding = '8px'; }

    // Resize canvas to actual pixel size
    const mapCanvas = document.getElementById('map-canvas');
    if (mapCanvas) {
      const rect = mapCanvas.getBoundingClientRect();
      mapCanvas.width = Math.round(rect.width * (window.devicePixelRatio || 1));
      mapCanvas.height = Math.round(rect.height * (window.devicePixelRatio || 1));
      mapCanvas.getContext('2d').scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
    }

    if (cur && mapCanvas) {
      const cw = mapCanvas.width / (window.devicePixelRatio || 1);
      const ch = mapCanvas.height / (window.devicePixelRatio || 1);
      const halfTW = WORLD_CONFIG.cellPx * mapState.zoom;
      const halfTH = halfTW / 2;
      mapState.panX = -((cur.gx + 0.5) - (cur.gy + 0.5)) * halfTW;
      mapState.panY = ch * 0.42 - ((cur.gx + 0.5) + (cur.gy + 0.5)) * halfTH;
    }
    initMapCanvas();
  }, 50);
}

function initMapCanvas() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;

  // Mouse/touch events for pan
  canvas.addEventListener('mousedown', mapPointerDown);
  canvas.addEventListener('mousemove', mapPointerMove);
  canvas.addEventListener('mouseup', mapPointerUp);
  canvas.addEventListener('mouseleave', mapPointerUp);
  canvas.addEventListener('touchstart', e => { e.preventDefault(); mapPointerDown(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchmove', e => { e.preventDefault(); mapPointerMove(e.touches[0]); }, { passive: false });
  canvas.addEventListener('touchend', e => { mapPointerUp(); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); mapZoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  canvas.addEventListener('click', mapClick);

  renderMapCanvas();
}

function mapPointerDown(e) {
  mapState.dragging = true;
  mapState.wasDragging = false;
  mapState.dragStartX = e.clientX - mapState.panX;
  mapState.dragStartY = e.clientY - mapState.panY;
}
function mapPointerMove(e) {
  if (!mapState.dragging) return;
  const newPX = e.clientX - mapState.dragStartX;
  const newPY = e.clientY - mapState.dragStartY;
  if (Math.abs(newPX - mapState.panX) > 3 || Math.abs(newPY - mapState.panY) > 3) mapState.wasDragging = true;
  mapState.panX = newPX;
  mapState.panY = newPY;
  renderMapCanvas();
}
function mapPointerUp() {
  mapState.dragging = false;
  setTimeout(() => { mapState.wasDragging = false; }, 50);
}

function mapZoom(dir) {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const cx = canvas.width / dpr / 2, cy = canvas.height / dpr / 2;
  const oldZ = mapState.zoom;
  mapState.zoom = Math.max(0.5, Math.min(4, mapState.zoom + dir * 0.3));
  const ratio = mapState.zoom / oldZ;
  mapState.panX = cx - (cx - mapState.panX) * ratio;
  mapState.panY = cy - (cy - mapState.panY) * ratio;
  renderMapCanvas();
}

function mapCenter() {
  const canvas = document.getElementById('map-canvas');
  const cur = G.world.nodes[G.world.currentNodeId];
  if (!canvas || !cur) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.width / dpr, ch = canvas.height / dpr;
  const halfTW = WORLD_CONFIG.cellPx * mapState.zoom;
  const halfTH = halfTW / 2;
  mapState.panX = -((cur.gx + 0.5) - (cur.gy + 0.5)) * halfTW;
  mapState.panY = ch * 0.42 - ((cur.gx + 0.5) + (cur.gy + 0.5)) * halfTH;
  renderMapCanvas();
}

function mapClick(e) {
  if (mapState.wasDragging) return;
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / (window.devicePixelRatio || 1)) / rect.width;
  const my = (e.clientY - rect.top) * (canvas.height / (window.devicePixelRatio || 1)) / rect.height;

  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.width / dpr;
  const halfTW = WORLD_CONFIG.cellPx * mapState.zoom;
  const halfTH = halfTW / 2;
  const nodes = G.world.nodes;

  // Inverse dimetric transform: screen → grid
  const relX = mx - mapState.panX - cw / 2;
  const relY = my - mapState.panY;
  const gxf = (relX / halfTW + relY / halfTH) / 2;
  const gyf = (relY / halfTH - relX / halfTW) / 2;

  // Find nearest discovered node in grid space
  let bestNode = null, bestDist = 3.5;
  for (const nid in nodes) {
    const n = nodes[nid];
    if (!n.discovered) continue;
    const ncx = n.gx + (n.buildingW || 1) * 0.5;
    const ncy = n.gy + (n.buildingH || 1) * 0.5;
    const dist = Math.hypot(gxf - ncx, gyf - ncy);
    if (dist < bestDist) { bestDist = dist; bestNode = n; }
  }

  if (bestNode?.parentBuildingId && nodes[bestNode.parentBuildingId]) {
    bestNode = nodes[bestNode.parentBuildingId];
  }

  if (bestNode && bestNode.id !== G.world.currentNodeId) {
    mapState.selectedNode = bestNode.id;
    mapState.previewPath = findPathAStar(G.world.currentNodeId, bestNode.id);
    updateMapInfo(bestNode);
    renderMapCanvas();
  } else {
    mapState.selectedNode = null;
    mapState.previewPath = null;
    updateMapInfo(null);
    renderMapCanvas();
  }
}

function updateMapInfo(node) {
  const infoDiv = document.getElementById('map-info');
  const goBtn = document.getElementById('map-go-btn');
  if (!infoDiv) return;

  if (!node) {
    infoDiv.innerHTML = '<span style="color:var(--text-dim)">Нажми на точку для выбора цели</span>';
    if (goBtn) goBtn.style.display = 'none';
    return;
  }

  const nt = NODE_TYPES[node.type] || {};
  const name = node.name || nt.name || '???';
  const reg = WORLD_CONFIG.regions.find(r => r.id === node.regionId);
  const regName = reg ? reg.name : '';
  const meta = node.building ? (BUILDING_META[node.building.type] || {}) : {};
  const nameColor = meta.color || 'var(--green)';

  let info = `<span style="color:${nameColor};font-weight:bold">${name}</span> <span style="color:var(--text-dim)">[${regName}]</span><br>`;

  if (node.type === 'building' && node.building) {
    const catNames = { residential:'Жилое', commercial:'Коммерция', industrial:'Промышленность', government:'Гос.учреждение', civic:'Общественное' };
    const catName = catNames[meta.category] || '';
    info += `<span style="color:var(--text-dim)">${catName}</span> · Заражение: ${node.building.infest}/5 · `;
    if (node.buildingW > 1 || node.buildingH > 1) {
      info += `${node.buildingW}x${node.buildingH} · `;
    }
  }
  if (nt.danger) {
    info += `Опасность: ${Math.round(nt.danger * 100)}% · `;
  }

  if (mapState.previewPath) {
    // Calculate total travel time
    let totalMin = 0;
    for (let i = 1; i < mapState.previewPath.length; i++) {
      const stepNode = G.world.nodes[mapState.previewPath[i]];
      const stepNt = NODE_TYPES[stepNode?.type] || {};
      totalMin += stepNt.time || 5;
    }
    const steps = mapState.previewPath.length - 1;
    info += `<br>Маршрут: ${steps} переходов · ~${totalMin} мин`;
    if (goBtn) goBtn.style.display = '';
  } else {
    info += '<br><span style="color:var(--red)">Нет доступного маршрута</span>';
    if (goBtn) goBtn.style.display = 'none';
  }

  infoDiv.innerHTML = info;
}

function mapGo() {
  if (!mapState.selectedNode) return;
  if (G.creative) {
    // Instant teleport in creative
    moveToNode(mapState.selectedNode);
    closeModal();
    addLog('Телепортация!', 'info');
    updateUI();
    return;
  }
  startRoute(mapState.selectedNode);
  // Re-render map with route controls (keep map open)
  showMap();
}

function toggleMapXray() {
  // 3 states: 0=off, 1=transparent, 2=hidden (roads + street names only)
  if (!mapState.xrayLevel) mapState.xrayLevel = 0;
  mapState.xrayLevel = (mapState.xrayLevel + 1) % 3;
  mapState.xray = mapState.xrayLevel > 0;
  const btn = document.getElementById('map-xray-btn');
  if (btn) {
    const active = mapState.xrayLevel > 0;
    btn.style.borderColor = active ? 'var(--cyan)' : '';
    btn.style.color = mapState.xrayLevel === 2 ? 'var(--yellow)' : active ? 'var(--cyan)' : '';
    btn.style.background = mapState.xrayLevel === 2 ? 'rgba(255,224,0,.08)' : active ? 'rgba(0,229,255,.12)' : '';
  }
  renderMapCanvas();
}

function renderMapCanvas() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr, h = canvas.height / dpr;
  const nodes = G.world.nodes;
  const z = mapState.zoom;

  // ── Dimetric (2:1) tile dimensions ──
  const halfTW = WORLD_CONFIG.cellPx * z; // half tile width
  const halfTH = halfTW / 2;              // half tile height

  // Grid → screen transforms
  function isoX(gx, gy) { return (gx - gy) * halfTW + mapState.panX + w / 2; }
  function isoY(gx, gy) { return (gx + gy) * halfTH + mapState.panY; }

  // scaleColor and BLD_H are now global (defined near BUILDING_META)

  // ── Background ──
  ctx.fillStyle = '#020602';
  ctx.fillRect(0, 0, w, h);

  // ── Faint isometric grid lines at high zoom ──
  if (z >= 2.5) {
    ctx.strokeStyle = 'rgba(0,255,65,0.018)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 42; i++) {
      ctx.beginPath();
      ctx.moveTo(isoX(i, 0), isoY(i, 0)); ctx.lineTo(isoX(i, 42), isoY(i, 42)); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(isoX(0, i), isoY(0, i)); ctx.lineTo(isoX(42, i), isoY(42, i)); ctx.stroke();
    }
  }

  // ── Ground fill for ALL cells (terrain under everything) ──
  if (z >= 0.5) {
    for (let gx = 0; gx < WORLD_CONFIG.gridW; gx++) {
      for (let gy = 0; gy < WORLD_CONFIG.gridH; gy++) {
        const N2={x:isoX(gx,gy),y:isoY(gx,gy)};
        const S2={x:isoX(gx+1,gy+1),y:isoY(gx+1,gy+1)};
        // Cull offscreen
        if (S2.x < -halfTW*2 || N2.x > w+halfTW*2 || N2.y > h+halfTH*2 || S2.y < -halfTH*2) continue;
        const E2={x:isoX(gx+1,gy),y:isoY(gx+1,gy)};
        const W2={x:isoX(gx,gy+1),y:isoY(gx,gy+1)};
        // Region-based ground color (visible terrain)
        let groundCol;
        if (gx >= 20 && gy < 20) groundCol = '#0e2a0e'; // forest — green grass
        else if (gx >= 20) groundCol = '#1a1508'; // industrial — brown dirt
        else if (gy >= 20) groundCol = '#0e100e'; // city — dark pavement
        else groundCol = '#0e1e0a'; // suburbs — light green
        ctx.beginPath();
        ctx.moveTo(N2.x,N2.y); ctx.lineTo(E2.x,E2.y); ctx.lineTo(S2.x,S2.y); ctx.lineTo(W2.x,W2.y);
        ctx.closePath();
        ctx.fillStyle = groundCol; ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,65,0.03)'; ctx.lineWidth = 0.3; ctx.stroke();
      }
    }
  }

  // ── Region name labels (background) ──
  ctx.textAlign = 'center';
  WORLD_CONFIG.regions.forEach(r => {
    const cx = r.gx + r.w * 0.5, cy = r.gy + r.h * 0.5;
    const sx = isoX(cx, cy), sy = isoY(cx, cy);
    if (sx < -60 || sx > w + 60 || sy < -30 || sy > h + 30) return;
    ctx.fillStyle = 'rgba(0,255,65,0.06)';
    ctx.font = `bold ${Math.max(11, 14 * z)}px monospace`;
    ctx.fillText(r.name.toUpperCase(), sx, sy);
  });

  // ── NPC Base label (conditional on discovery) ──
  if (typeof NPC_BASE !== 'undefined') {
    const bcx = NPC_BASE.gx + NPC_BASE.w/2, bcy = NPC_BASE.gy + NPC_BASE.h/2;
    const bsx = isoX(bcx, bcy), bsy = isoY(bcx, bcy);
    // Check if any NPC gate is discovered
    const npcGateDiscovered = Object.values(nodes).some(n => n.type === 'npc_gate' && n.discovered);
    const radioHint = G?.radio?.npcCampDiscovered;
    if (npcGateDiscovered) {
      ctx.fillStyle = 'rgba(170,170,68,0.12)';
      ctx.font = `bold ${Math.max(9, 11 * z)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(LANG?.current === 'en' ? 'SETTLEMENT' : 'ПОСЕЛЕНИЕ', bsx, bsy - halfTH * 2);
    } else if (radioHint) {
      // Yellow "?" marker from radio hint
      ctx.fillStyle = 'rgba(255,224,0,0.25)';
      ctx.font = `bold ${Math.max(10, 13 * z)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('?', bsx, bsy - halfTH);
      ctx.fillStyle = 'rgba(255,224,0,0.12)';
      ctx.font = `${Math.max(7, 9 * z)}px monospace`;
      ctx.fillText(LANG?.current === 'en' ? 'SETTLEMENT?' : 'ПОСЕЛЕНИЕ?', bsx, bsy - halfTH * 2.5);
    }
  }

  // ── Airdrop marker ──
  if (G?.radio?.airdropDiscovered && G.radio.airdropNodeId) {
    const adNode = nodes[G.radio.airdropNodeId];
    if (adNode) {
      const ax = isoX(adNode.gx, adNode.gy), ay = isoY(adNode.gx, adNode.gy);
      // Pulsing orange marker
      const pulse = 0.6 + Math.sin(Date.now() / 400) * 0.3;
      ctx.fillStyle = `rgba(255,140,0,${pulse * 0.4})`;
      ctx.beginPath();
      ctx.arc(ax, ay - halfTH, Math.max(4, 6 * z), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,140,0,${pulse})`;
      ctx.font = `bold ${Math.max(8, 10 * z)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('📦', ax, ay - halfTH * 2);
      ctx.fillStyle = `rgba(255,140,0,0.3)`;
      ctx.font = `${Math.max(7, 8 * z)}px monospace`;
      ctx.fillText(LANG?.current === 'en' ? 'SUPPLY DROP' : 'СБРОС', ax, ay - halfTH * 3);
    }
  }

  // ── Trigger event markers (colored dots on triggered buildings) ──
  if (G?.triggers) {
    Object.entries(G.triggers).forEach(([evtId, tData]) => {
      if (!tData.seen) return;
      const tn = nodes[tData.nodeId];
      if (!tn || !tn.discovered) return;
      const tx = isoX(tn.gx, tn.gy), ty = isoY(tn.gx, tn.gy);
      const evt = TRIGGER_EVENTS.find(e => e.id === evtId);
      const dotColor = evt?.type === 'blood' ? 'rgba(255,34,68,.4)' : evt?.type === 'graffiti' ? 'rgba(255,224,0,.4)' : evt?.type === 'corpse' ? 'rgba(170,100,68,.4)' : 'rgba(0,229,255,.3)';
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(tx, ty - halfTH * 2, Math.max(2, 3 * z), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── Collect visible nodes ──
  const visNodes = Object.values(nodes).filter(n => n.discovered && !n.parentBuildingId);

  // ── Separate: ground nodes vs buildings ──
  const groundNodes = visNodes.filter(n => n.type !== 'building');
  const buildingNodes = visNodes.filter(n => n.type === 'building');

  // Sort ground by gx+gy, buildings by FAR corner (gx+bw + gy+bh) for correct painter's order
  groundNodes.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));
  buildingNodes.sort((a, b) => {
    const da = (a.gx + (a.buildingW||1)) + (a.gy + (a.buildingH||1));
    const db = (b.gx + (b.buildingW||1)) + (b.gy + (b.buildingH||1));
    return da - db;
  });

  // ── Pass 1: Draw ground tiles (road flat diamonds) ──
  const roadSet = new Set(['road','intersection','car_wreck','bus_stop','alley','parking']);
  for (const n of groundNodes) {
    if (!roadSet.has(n.type)) continue;
    const bw = 1, bh = 1;
    const N = { x: isoX(n.gx,    n.gy),    y: isoY(n.gx,    n.gy) };
    const E = { x: isoX(n.gx+bw, n.gy),    y: isoY(n.gx+bw, n.gy) };
    const S = { x: isoX(n.gx+bw, n.gy+bh), y: isoY(n.gx+bw, n.gy+bh) };
    const W = { x: isoX(n.gx,    n.gy+bh), y: isoY(n.gx,    n.gy+bh) };
    const isAlley = n.type === 'alley';
    ctx.fillStyle = n.visited
      ? (isAlley ? '#0e1a0e' : '#14201a')
      : '#0a0f0a';
    ctx.beginPath();
    ctx.moveTo(N.x,N.y); ctx.lineTo(E.x,E.y); ctx.lineTo(S.x,S.y); ctx.lineTo(W.x,W.y);
    ctx.closePath(); ctx.fill();
    // Subtle edge
    if (n.visited) {
      ctx.strokeStyle = isAlley ? 'rgba(0,255,65,0.06)' : 'rgba(0,255,65,0.09)';
      ctx.lineWidth = 0.4; ctx.stroke();
    }
    // Road marking (center dashes) at high zoom
    if (z >= 3 && n.visited && n.type === 'road') {
      ctx.strokeStyle = 'rgba(80,80,0,0.18)';
      ctx.lineWidth = 0.6;
      const cx = (N.x+S.x)/2, cy = (N.y+S.y)/2;
      const cx2 = (E.x+W.x)/2, cy2 = (E.y+W.y)/2;
      ctx.beginPath(); ctx.moveTo(cx-3,cy); ctx.lineTo(cx+3,cy); ctx.stroke();
    }
  }

  // ── Pass 2: Draw road connections (lines on top of flat tiles, before buildings) ──
  const drawnEdges = new Set();
  for (const n of groundNodes) {
    if (!roadSet.has(n.type)) continue;
    for (const adjId of n.connections) {
      const adj = nodes[adjId];
      if (!adj || !adj.discovered || !roadSet.has(adj.type)) continue;
      const key = n.id < adjId ? n.id+'|'+adjId : adjId+'|'+n.id;
      if (drawnEdges.has(key)) continue;
      drawnEdges.add(key);
      const nx = isoX(n.gx+0.5, n.gy+0.5), ny = isoY(n.gx+0.5, n.gy+0.5);
      const ax = isoX(adj.gx+0.5, adj.gy+0.5), ay = isoY(adj.gx+0.5, adj.gy+0.5);
      const isAlley = n.type==='alley' || adj.type==='alley';
      const visited = n.visited || adj.visited;
      ctx.strokeStyle = visited ? (isAlley ? '#182818' : '#1e301e') : '#101510';
      ctx.lineWidth = isAlley ? Math.max(2, halfTW*0.22) : Math.max(3, halfTW*0.48);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(nx,ny); ctx.lineTo(ax,ay); ctx.stroke();
    }
  }

  // ── Pass 2.5: Street name labels (rotated parallel to roads) ──
  {
    const showStreets = z >= 2.2 || mapState.xrayLevel === 2;
    if (showStreets) {
      const drawnStreets = new Set();
      const fontSize = mapState.xrayLevel === 2 ? Math.max(9, 10 * z) : Math.max(7, 8 * z);
      const alpha = mapState.xrayLevel === 2 ? 0.5 : 0.18;
      ctx.font = `bold ${fontSize}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const isoAngleH = Math.atan2(halfTH, halfTW);    // ~26.57° — goes ↗
      const isoAngleV = -Math.atan2(halfTH, halfTW);  // ~-26.57° — goes ↘ (readable, not flipped)

      // Collect street segments: group by streetName, find midpoints per region-segment
      const streetSegments = {};
      for (const n of groundNodes) {
        if (!n.streetName || !n.visited) continue;
        const key = n.streetName + '|' + n.regionId;
        if (!streetSegments[key]) streetSegments[key] = { name: n.streetName, dir: n.streetDir || 'h', nodes: [] };
        streetSegments[key].nodes.push(n);
      }

      for (const seg of Object.values(streetSegments)) {
        if (seg.nodes.length < 3) continue;
        if (drawnStreets.has(seg.name + seg.dir)) continue;
        drawnStreets.add(seg.name + seg.dir);

        // Sort nodes along the road direction
        seg.nodes.sort((a, b) => seg.dir === 'h' ? a.gx - b.gx : a.gy - b.gy);
        const mid = seg.nodes[Math.floor(seg.nodes.length / 2)];
        const mx = isoX(mid.gx + 0.5, mid.gy + 0.5);
        const my = isoY(mid.gx + 0.5, mid.gy + 0.5);

        // Skip if off-screen
        if (mx < -100 || mx > w + 100 || my < -100 || my > h + 100) continue;

        const angle = seg.dir === 'h' ? isoAngleH : isoAngleV;

        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        // Dark background stroke for readability
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeText(seg.name, 0, 0);
        ctx.fillStyle = `rgba(0,255,65,${alpha})`;
        ctx.fillText(seg.name, 0, 0);
        ctx.restore();
      }
      ctx.textBaseline = 'alphabetic';
    }
  }

  // ── Pass 3: Draw non-road ground elements (POIs) ──
  const labelsToDraw = [];
  const _poiIcons = []; // deferred to draw after buildings
  for (const n of groundNodes) {
    if (roadSet.has(n.type)) continue; // already drawn above
    const csx = isoX(n.gx+0.5, n.gy+0.5), csy = isoY(n.gx+0.5, n.gy+0.5);
    if (csx < -halfTW*12 || csx > w+halfTW*12 || csy < -halfTH*24 || csy > h+halfTH*24) continue;
    const isHere = n.id === G.world.currentNodeId;

    // NPC base walls and gates
    if (n.type === 'npc_wall') {
      // Thin rectangular wall — detect orientation from position on perimeter
      const base = typeof NPC_BASE !== 'undefined' ? NPC_BASE : {gx:7,gy:27,w:6,h:6};
      const isTopEdge = n.gy === base.gy;
      const isBottomEdge = n.gy === base.gy + base.h - 1;
      const isLeftEdge = n.gx === base.gx;
      const isRightEdge = n.gx === base.gx + base.w - 1;
      const isHorizontal = isTopEdge || isBottomEdge;
      const isCorner = (isTopEdge || isBottomEdge) && (isLeftEdge || isRightEdge);

      // Thin wall: 0.25 thickness across, full length along the edge
      const thick = 0.25; // wall thickness in grid units
      const wallH = halfTH * 0.8;
      let x0, y0, x1, y1; // grid coords of the thin wall rectangle

      if (isCorner) {
        // Corner post — small square
        x0 = n.gx + 0.3; y0 = n.gy + 0.3; x1 = n.gx + 0.7; y1 = n.gy + 0.7;
      } else if (isTopEdge || isBottomEdge) {
        // Horizontal wall — full width, thin depth
        const cy = isTopEdge ? n.gy + 0.5 - thick/2 : n.gy + 0.5 - thick/2;
        x0 = n.gx; y0 = cy; x1 = n.gx + 1; y1 = cy + thick;
      } else {
        // Vertical wall — thin width, full depth
        const cx = isLeftEdge ? n.gx + 0.5 - thick/2 : n.gx + 0.5 - thick/2;
        x0 = cx; y0 = n.gy; x1 = cx + thick; y1 = n.gy + 1;
      }

      const wN={x:isoX(x0,y0),y:isoY(x0,y0)};
      const wE={x:isoX(x1,y0),y:isoY(x1,y0)};
      const wS={x:isoX(x1,y1),y:isoY(x1,y1)};
      const wW={x:isoX(x0,y1),y:isoY(x0,y1)};

      // SE face
      ctx.beginPath(); ctx.moveTo(wE.x,wE.y); ctx.lineTo(wS.x,wS.y);
      ctx.lineTo(wS.x,wS.y-wallH); ctx.lineTo(wE.x,wE.y-wallH); ctx.closePath();
      ctx.fillStyle = '#6b5a3a'; ctx.fill();
      // SW face
      ctx.beginPath(); ctx.moveTo(wS.x,wS.y); ctx.lineTo(wW.x,wW.y);
      ctx.lineTo(wW.x,wW.y-wallH); ctx.lineTo(wS.x,wS.y-wallH); ctx.closePath();
      ctx.fillStyle = '#4a3d25'; ctx.fill();
      // Top
      ctx.beginPath(); ctx.moveTo(wN.x,wN.y-wallH); ctx.lineTo(wE.x,wE.y-wallH);
      ctx.lineTo(wS.x,wS.y-wallH); ctx.lineTo(wW.x,wW.y-wallH); ctx.closePath();
      ctx.fillStyle = '#8a7a55'; ctx.fill();
      ctx.strokeStyle = 'rgba(200,180,120,0.2)'; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.globalAlpha = 1; continue;
    }
    if (n.type === 'npc_gate') {
      const gN={x:isoX(n.gx,n.gy),y:isoY(n.gx,n.gy)};
      const gE={x:isoX(n.gx+1,n.gy),y:isoY(n.gx+1,n.gy)};
      const gS={x:isoX(n.gx+1,n.gy+1),y:isoY(n.gx+1,n.gy+1)};
      const gW={x:isoX(n.gx,n.gy+1),y:isoY(n.gx,n.gy+1)};
      // Ground tile
      ctx.beginPath(); ctx.moveTo(gN.x,gN.y); ctx.lineTo(gE.x,gE.y);
      ctx.lineTo(gS.x,gS.y); ctx.lineTo(gW.x,gW.y); ctx.closePath();
      ctx.fillStyle = '#2a2a1a'; ctx.fill();
      // Gate markers
      ctx.strokeStyle = '#aaaa44'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(gN.x,gN.y); ctx.lineTo(gE.x,gE.y);
      ctx.lineTo(gS.x,gS.y); ctx.lineTo(gW.x,gW.y); ctx.closePath(); ctx.stroke();
      if (z >= 1.5) labelsToDraw.push({ x:csx, y:csy+8, label:'Ворота', isHere, color:'#aaaa44' });
      ctx.globalAlpha = 1; continue;
    }

    const poiSz = Math.max(8, halfTW * 0.7);
    const poiAlpha = n.visited ? 0.8 : 0.3;
    ctx.globalAlpha = poiAlpha;
    // POI icons deferred to draw AFTER buildings (so they're not hidden)
    if (n.type === 'car_wreck') {
      _poiIcons.push({ icon:'car_wreck', x:csx, y:csy, sz:poiSz*1.3, searched:n.searched, isHere });
      if (z >= 1.5) labelsToDraw.push({ x:csx, y:csy+poiSz*0.6+7, label: n.searched ? 'Авария ✓' : 'Авария', isHere, color: n.searched ? '#553333' : '#cc3344' });
    } else if (n.type === 'park') {
      _poiIcons.push({ icon:'park', x:csx, y:csy, sz:poiSz });
    } else if (n.type === 'forest_clearing') {
      _poiIcons.push({ icon:'forest_clearing', x:csx, y:csy, sz:poiSz });
    } else if (n.type === 'barricade') {
      _poiIcons.push({ icon:'barricade', x:csx, y:csy, sz:poiSz });
      if (n.blocked && z >= 1.8) labelsToDraw.push({ x:csx, y:csy+poiSz*0.6+7, label:'Заблокировано', isHere, color:'#aa8800' });
    } else if (n.type === 'forest_trail') {
      _poiIcons.push({ icon:'forest_trail', x:csx, y:csy, sz:poiSz*0.7 });
    } else if (n.type === 'bus_stop') {
      _poiIcons.push({ icon:'bus_stop', x:csx, y:csy, sz:poiSz });
    } else if (n.type === 'parking') {
      _poiIcons.push({ icon:'parking', x:csx, y:csy, sz:poiSz });
    }
    // Airdrop marker deferred
    if (n.isAirdrop && !n.searched && G?.radio?.airdropDiscovered) {
      _poiIcons.push({ icon:'_airdrop', x:csx, y:csy, sz:poiSz });
      if (z >= 1.2) labelsToDraw.push({ x:csx, y:csy+poiSz*0.6+7, label:'📦 СБРОС', isHere, color:'#ff8c00' });
    }
    ctx.globalAlpha = 1.0;
  }

  // ── Pass 4: Draw 3D buildings (sorted back-to-front by far corner) ──
  const hasActiveRoute = G.world.currentRoute && !G.world.currentRoute.paused && G.world.currentRoute.currentStep < G.world.currentRoute.path?.length - 1;
  const hasPreview = mapState.previewPath && mapState.previewPath.length > 1;
  const bldOpacity = mapState.xrayLevel === 2 ? 0 : mapState.xray ? 0.12 : ((hasPreview || hasActiveRoute) ? 0.35 : 1.0);

  // Wall-coordinate helpers: u=0..1 along wall edge, v=0..1 ground→roof
  function rwPt(E,S,bH,u,v){return{x:E.x+(S.x-E.x)*u,y:E.y+(S.y-E.y)*u-bH*v};}
  function lwPt(S,W,bH,u,v){return{x:S.x+(W.x-S.x)*u,y:S.y+(W.y-S.y)*u-bH*v};}
  // Draw parallelogram on wall face
  // Draw a map sprite icon on canvas at (cx,cy) with given size
  function drawMapIcon(iconName, cx, cy, sz) {
    const pos = MAP_ICONS[iconName];
    if (!pos || !mapIconImg.complete) return;
    const [col,row] = pos;
    const sx = col * MAP_ICON_SIZE, sy = row * MAP_ICON_SIZE;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = Math.max(prevAlpha, 0.6); // ensure icons are visible
    const prevComp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(mapIconImg, sx, sy, MAP_ICON_SIZE, MAP_ICON_SIZE, cx-sz/2, cy-sz/2, sz, sz);
    ctx.globalCompositeOperation = prevComp;
    ctx.globalAlpha = prevAlpha;
  }

  function wallRect(ptFn,A,B,bH,u,v,wu,wv,col){
    const a=ptFn(A,B,bH,u,v+wv),b=ptFn(A,B,bH,u+wu,v+wv),c=ptFn(A,B,bH,u+wu,v),d=ptFn(A,B,bH,u,v);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);
    ctx.closePath();ctx.fillStyle=col;ctx.fill();
  }

  // Per-type building detail config
  const BLD_DETAIL = {
    house:{roof:'gable',wins:[2,1],door:'R'},
    cabin:{roof:'gable',wins:[1,1],door:'R'},
    garage:{roof:'flat',bayDoor:'R'},
    shop:{roof:'flat',wins:[1,1],storefront:'R'},
    cafe:{roof:'flat',wins:[2,1],awning:'R'},
    bar:{roof:'flat',wins:[1,1],door:'R'},
    pharmacy:{roof:'flat',wins:[1,1],cross:true,door:'L'},
    laundromat:{roof:'flat',wins:[3,1],door:'R'},
    gas_station:{roof:'canopy'},
    ranger_station:{roof:'gable',wins:[1,1],door:'R'},
    office:{roof:'flat',wins:[4,3],door:'L'},
    police:{roof:'flat',wins:[3,2],door:'R',stripe:'#2244aa'},
    fire_station:{roof:'flat',wins:[2,2],bayDoor:'R',stripe:'#aa2211'},
    bank:{roof:'flat',wins:[2,2],door:'R'},
    clinic:{roof:'flat',wins:[3,2],cross:true,door:'L'},
    church:{roof:'spire',wins:[2,2],door:'R'},
    supermarket:{roof:'flat',wins:[3,1],storefront:'R'},
    warehouse:{roof:'flat',wins:[1,1],bayDoor:'R'},
    military:{roof:'flat',wins:[2,2],stripe:'#445522'},
    factory:{roof:'flat',wins:[2,2],smokestack:true},
    school:{roof:'flat',wins:[4,3],door:'L',flag:true},
    hotel:{roof:'flat',wins:[3,5],door:'R'},
  };

  for (const n of buildingNodes) {
    const csx = isoX(n.gx+0.5, n.gy+0.5), csy = isoY(n.gx+0.5, n.gy+0.5);
    if (csx < -halfTW*12 || csx > w+halfTW*12 || csy < -halfTH*24 || csy > h+halfTH*24) continue;

    const isHere = n.id === G.world.currentNodeId;
    const isSelected = n.id === mapState.selectedNode;
    const isHome = n.building && G.world.homeBase === n.building?.id;

    if (n.type === 'building' && n.building) {
      const bType = n.building.type;
      const meta = BUILDING_META[bType] || { w:1, h:1, color:'#337744' };
      const bw = n.buildingW || 1;
      const bh = n.buildingH || 1;
      let bldH = (BLD_H[bType] || 2) * halfTH * 0.85;

      // Inset for spacing between buildings
      const pad = 0.06;
      // Four top-face corners (grid space → screen) with padding
      const N = { x: isoX(n.gx+pad,    n.gy+pad),    y: isoY(n.gx+pad,    n.gy+pad) };
      const E = { x: isoX(n.gx+bw-pad, n.gy+pad),    y: isoY(n.gx+bw-pad, n.gy+pad) };
      const S = { x: isoX(n.gx+bw-pad, n.gy+bh-pad), y: isoY(n.gx+bw-pad, n.gy+bh-pad) };
      const W = { x: isoX(n.gx+pad,    n.gy+bh-pad), y: isoY(n.gx+pad,    n.gy+bh-pad) };

      // Determine which wall faces a road (for door placement)
      let doorWall = null; // 'R' = right/SE wall, 'L' = left/SW wall
      if (n.connections) {
        for (const adjId of n.connections) {
          const adj = nodes[adjId];
          if (!adj || (adj.type !== 'road' && adj.type !== 'intersection')) continue;
          const dx = adj.gx - n.gx, dy = adj.gy - n.gy;
          // Road is to the SE (+gx direction) → door on right wall
          if (dx >= bw) { doorWall = 'R'; break; }
          // Road is to the SW (+gy direction) → door on left wall
          if (dy >= bh) { doorWall = 'L'; break; }
          // Road is to the NW (-gx direction) → door on left wall (back)
          if (dx < 0) { doorWall = 'L'; break; }
          // Road is to the NE (-gy direction) → door on right wall (back)
          if (dy < 0) { doorWall = 'R'; break; }
        }
      }
      if (!doorWall) doorWall = 'R'; // default

      let topCol, rightCol, leftCol, edgeCol;
      if (n.visited) {
        topCol   = scaleColor(meta.color, 0.95);
        rightCol = scaleColor(meta.color, 0.55);
        leftCol  = scaleColor(meta.color, 0.25);
        edgeCol  = isHere ? '#00FF41' : isSelected ? '#00BCD4' : isHome ? '#00FF41' : 'rgba(0,255,65,0.22)';
      } else {
        topCol   = '#181e18'; rightCol = '#0f140f'; leftCol = '#090d09';
        edgeCol  = 'rgba(0,255,65,0.06)';
      }

      ctx.globalAlpha = mapState.xrayLevel === 2 ? 0 : (isHere || isSelected) ? Math.max(bldOpacity, 0.7) : bldOpacity;

      // Roof thickness (visible as a band between roof and walls)
      const roofThk = Math.max(1, halfTH * 0.12);

      // Ground footprint (building lot)
      ctx.beginPath();
      ctx.moveTo(N.x,N.y); ctx.lineTo(E.x,E.y); ctx.lineTo(S.x,S.y); ctx.lineTo(W.x,W.y);
      ctx.closePath(); ctx.fillStyle = n.visited ? '#0c150c' : '#070a07'; ctx.fill();

      // ── Drop shadow (offset SE, proportional to height) ──
      if (n.visited) {
        const shOff = bldH * 0.25;
        ctx.beginPath();
        ctx.moveTo(E.x+shOff*0.6, E.y+shOff); ctx.lineTo(S.x+shOff*0.6, S.y+shOff);
        ctx.lineTo(S.x+shOff*0.6, S.y+shOff-bldH*0.7); ctx.lineTo(E.x+shOff*0.6, E.y+shOff-bldH*0.7);
        ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(S.x+shOff*0.6, S.y+shOff); ctx.lineTo(W.x+shOff*0.6, W.y+shOff);
        ctx.lineTo(W.x+shOff*0.6, W.y+shOff-bldH*0.5); ctx.lineTo(S.x+shOff*0.6, S.y+shOff-bldH*0.5);
        ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill();
      }

      // ── Right wall (SE face, lit side) ──
      ctx.beginPath();
      ctx.moveTo(E.x, E.y); ctx.lineTo(S.x, S.y);
      ctx.lineTo(S.x, S.y-bldH); ctx.lineTo(E.x, E.y-bldH);
      ctx.closePath(); ctx.fillStyle = rightCol; ctx.fill();
      // Upper specular highlight (top 25% of right wall brighter)
      if (n.visited) {
        ctx.beginPath();
        ctx.moveTo(E.x,E.y-bldH*0.75); ctx.lineTo(S.x,S.y-bldH*0.75);
        ctx.lineTo(S.x,S.y-bldH); ctx.lineTo(E.x,E.y-bldH);
        ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      }
      // Lower shadow (bottom 40%)
      if (n.visited) {
        ctx.beginPath();
        ctx.moveTo(E.x,E.y); ctx.lineTo(S.x,S.y);
        ctx.lineTo(S.x,S.y-bldH*0.4); ctx.lineTo(E.x,E.y-bldH*0.4);
        ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fill();
      }

      // ── Left wall (SW face, shadow side) ──
      ctx.beginPath();
      ctx.moveTo(S.x, S.y); ctx.lineTo(W.x, W.y);
      ctx.lineTo(W.x, W.y-bldH); ctx.lineTo(S.x, S.y-bldH);
      ctx.closePath(); ctx.fillStyle = leftCol; ctx.fill();
      // Lower shadow (bottom 50%)
      if (n.visited) {
        ctx.beginPath();
        ctx.moveTo(S.x,S.y); ctx.lineTo(W.x,W.y);
        ctx.lineTo(W.x,W.y-bldH*0.5); ctx.lineTo(S.x,S.y-bldH*0.5);
        ctx.closePath(); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
      }

      // ── S-corner crease (where two walls meet — darkest line) ──
      if (n.visited) {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(1, z*0.35);
        ctx.beginPath(); ctx.moveTo(S.x, S.y); ctx.lineTo(S.x, S.y-bldH); ctx.stroke();
      }

      // ── Roof slab (visible thickness) ──
      // SE face of roof slab
      ctx.beginPath();
      ctx.moveTo(E.x, E.y-bldH); ctx.lineTo(S.x, S.y-bldH);
      ctx.lineTo(S.x, S.y-bldH-roofThk); ctx.lineTo(E.x, E.y-bldH-roofThk);
      ctx.closePath();
      ctx.fillStyle = n.visited ? scaleColor(meta.color, 0.4) : '#0d120d'; ctx.fill();
      // SW face of roof slab
      ctx.beginPath();
      ctx.moveTo(S.x, S.y-bldH); ctx.lineTo(W.x, W.y-bldH);
      ctx.lineTo(W.x, W.y-bldH-roofThk); ctx.lineTo(S.x, S.y-bldH-roofThk);
      ctx.closePath();
      ctx.fillStyle = n.visited ? scaleColor(meta.color, 0.22) : '#080b08'; ctx.fill();

      // Top face (roof) — sits on top of slab
      ctx.beginPath();
      ctx.moveTo(N.x, N.y-bldH-roofThk); ctx.lineTo(E.x, E.y-bldH-roofThk);
      ctx.lineTo(S.x, S.y-bldH-roofThk); ctx.lineTo(W.x, W.y-bldH-roofThk);
      ctx.closePath(); ctx.fillStyle = topCol; ctx.fill();
      // Roof N-half lighter
      if (n.visited) {
        const rcx=(N.x+S.x)/2, rcy=(N.y+S.y)/2-bldH-roofThk;
        ctx.beginPath();
        ctx.moveTo(N.x,N.y-bldH-roofThk); ctx.lineTo(E.x,E.y-bldH-roofThk);
        ctx.lineTo(rcx,rcy); ctx.lineTo(W.x,W.y-bldH-roofThk);
        ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      }

      // From here on, bldH includes roof slab thickness
      bldH += roofThk;

      // ── Edges & outlines ──
      ctx.strokeStyle = edgeCol;
      ctx.lineWidth = isHere || isSelected ? 1.5 : 0.7;
      if (isHere || isSelected) {
        ctx.shadowColor = isHere ? '#00FF41' : '#00BCD4'; ctx.shadowBlur = 10;
      }
      // Roof top outline
      ctx.beginPath();
      ctx.moveTo(N.x,N.y-bldH-roofThk); ctx.lineTo(E.x,E.y-bldH-roofThk);
      ctx.lineTo(S.x,S.y-bldH-roofThk); ctx.lineTo(W.x,W.y-bldH-roofThk);
      ctx.closePath(); ctx.stroke();
      // Vertical pillars (E, S, W) — ground to roof slab bottom
      ctx.beginPath();
      ctx.moveTo(E.x,E.y); ctx.lineTo(E.x,E.y-bldH);
      ctx.moveTo(S.x,S.y); ctx.lineTo(S.x,S.y-bldH);
      ctx.moveTo(W.x,W.y); ctx.lineTo(W.x,W.y-bldH);
      ctx.stroke();
      // Ground edges
      ctx.beginPath();
      ctx.moveTo(E.x,E.y); ctx.lineTo(S.x,S.y);
      ctx.moveTo(S.x,S.y); ctx.lineTo(W.x,W.y);
      ctx.stroke();
      // Roof slab outer edges
      ctx.beginPath();
      ctx.moveTo(E.x,E.y-bldH); ctx.lineTo(E.x,E.y-bldH-roofThk);
      ctx.moveTo(S.x,S.y-bldH); ctx.lineTo(S.x,S.y-bldH-roofThk);
      ctx.moveTo(W.x,W.y-bldH); ctx.lineTo(W.x,W.y-bldH-roofThk);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // ── Ambient occlusion (dark line at wall base) ──
      if (n.visited) {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = Math.max(1.2, z*0.5);
        ctx.beginPath();
        ctx.moveTo(E.x,E.y); ctx.lineTo(S.x,S.y); ctx.lineTo(W.x,W.y);
        ctx.stroke();
      }

      // ── E-corner highlight (bright vertical edge, light catches it) ──
      if (n.visited) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = Math.max(0.5, z*0.2);
        ctx.beginPath(); ctx.moveTo(E.x,E.y-bldH); ctx.lineTo(E.x,E.y); ctx.stroke();
      }

      // ── Top-edge highlight (N→E, N→W bright rim) ──
      if (n.visited) {
        ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = Math.max(0.5, z*0.15);
        ctx.beginPath();
        ctx.moveTo(N.x,N.y-bldH-roofThk); ctx.lineTo(E.x,E.y-bldH-roofThk);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.moveTo(N.x,N.y-bldH-roofThk); ctx.lineTo(W.x,W.y-bldH-roofThk);
        ctx.stroke();
      }

      // ── Building details (windows, doors, roofs, features) ──
      if (n.visited && z >= 1.2) {
        const det = BLD_DETAIL[bType];
        if (det) {
          const winCol = 'rgba(220,210,140,0.5)';
          const winColDim = 'rgba(60,70,45,0.4)';
          const winFrame = 'rgba(0,0,0,0.3)';
          const doorCol = 'rgba(35,25,12,0.75)';
          const seed = n.gx*31+n.gy*17;

          // ── Foundation strip (base band on both walls) ──
          if (z >= 1.5) {
            wallRect(rwPt,E,S,bldH, 0,0.0,1,0.07, 'rgba(0,0,0,0.18)');
            wallRect(lwPt,S,W,bldH, 0,0.0,1,0.07, 'rgba(0,0,0,0.22)');
          }

          // ── Horizontal wall course lines (subtle texture) ──
          if (z >= 2.5 && (!det.wins || det.wins[1] <= 1)) {
            ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.3;
            for (let cl=1;cl<6;cl++) {
              const cv = cl/6;
              let a=rwPt(E,S,bldH,0,cv), b=rwPt(E,S,bldH,1,cv);
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
              a=lwPt(S,W,bldH,0,cv); b=lwPt(S,W,bldH,1,cv);
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
            }
          }

          // ── Floor separator lines (multi-story buildings) ──
          if (det.wins && det.wins[1] > 1 && z >= 1.8) {
            const rows = det.wins[1];
            ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 0.5;
            for (let f=1;f<rows;f++) {
              const fv = 0.08 + f/rows * 0.82;
              let a=rwPt(E,S,bldH,0.0,fv), b=rwPt(E,S,bldH,1.0,fv);
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
              a=lwPt(S,W,bldH,0.0,fv); b=lwPt(S,W,bldH,1.0,fv);
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
            }
            // Subtle cornice line at top
            ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.6;
            let a=rwPt(E,S,bldH,0.0,0.95), b=rwPt(E,S,bldH,1.0,0.95);
            ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
            a=lwPt(S,W,bldH,0.0,0.95); b=lwPt(S,W,bldH,1.0,0.95);
            ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
          }

          // ── Wall panel divisions (vertical lines for large buildings) ──
          if (bw >= 2 && z >= 2) {
            ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.4;
            for (let p=1;p<bw;p++) {
              const pu = p/bw;
              let a=rwPt(E,S,bldH,pu,0.06), b=rwPt(E,S,bldH,pu,0.94);
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
            }
          }
          if (bh >= 2 && z >= 2) {
            ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 0.4;
            for (let p=1;p<bh;p++) {
              const pu = p/bh;
              let a=lwPt(S,W,bldH,pu,0.06), b=lwPt(S,W,bldH,pu,0.94);
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
            }
          }

          // ── Windows with frames on both walls (skip door zone) ──
          // Fixed-size door (same for all buildings, in normalized 0-1 coords)
          const wallLenPx = bw * halfTW * 2; // approximate wall pixel length
          const doorAbsW = Math.min(0.18, 8 / wallLenPx); // ~8px wide max
          const doorAbsH = Math.min(0.35, 12 / (bldH || 20)); // ~12px tall max
          const doorU = 0.5 - doorAbsW/2, doorW2 = doorAbsW, doorV = 0.02, doorH2 = doorAbsH;

          if (det.wins && z >= 1.8) {
            const [cols,rows] = det.wins;
            const wPad = 0.12;
            // Fixed window size (~5x5px regardless of building size)
            const winAbsW = Math.min(0.15, 5 / wallLenPx);
            const winAbsH = Math.min(0.12, 5 / (bldH || 20));
            const cellW = (1-wPad*2)/cols, cellH = (1-wPad*2-0.1)/rows;
            const wu = Math.min(cellW*0.6, winAbsW + 0.02);
            const wv = Math.min(cellH*0.5, winAbsH + 0.02);
            const drawWins = (ptFn,A,B,seedOff,hasDoor) => {
              for (let r=0;r<rows;r++) {
                for (let c=0;c<cols;c++) {
                  const u = wPad + c*cellW + (cellW-wu)/2;
                  const v = wPad + 0.08 + r*cellH + (cellH-wv)/2;
                  // Skip window if it overlaps the door area (any row, not just r===0)
                  if (hasDoor && u+wu > doorU-0.03 && u < doorU+doorW2+0.03 && v < doorV+doorH2+0.05) continue;
                  const lit = ((seed+seedOff+c*3+r*7)%7) > 1;
                  if (z >= 2.5) {
                    wallRect(ptFn,A,B,bldH, u-0.008,v-0.008,wu+0.016,wv+0.016, winFrame);
                  }
                  wallRect(ptFn,A,B,bldH, u,v,wu,wv, lit?winCol:winColDim);
                  if (z >= 3) {
                    const sa=ptFn(A,B,bldH,u-0.01,v), sb=ptFn(A,B,bldH,u+wu+0.01,v);
                    ctx.strokeStyle='rgba(180,170,140,0.2)';ctx.lineWidth=0.6;
                    ctx.beginPath();ctx.moveTo(sa.x,sa.y);ctx.lineTo(sb.x,sb.y);ctx.stroke();
                  }
                  if (z >= 3 && lit && ((seed+c*11+r*3)%5)===0) {
                    wallRect(ptFn,A,B,bldH, u,v+wv*0.5,wu*0.45,wv*0.5, 'rgba(160,140,100,0.15)');
                  }
                }
              }
            };
            drawWins(rwPt,E,S,0, doorWall==='R');
            drawWins(lwPt,S,W,53, doorWall==='L');
          }

          // ── Door with frame and step (placed on road-facing wall, fixed size) ──
          if (det.door || det.bayDoor) {
            const ptFn = doorWall==='R' ? rwPt : lwPt;
            const A = doorWall==='R' ? E : S;
            const B = doorWall==='R' ? S : W;
            // Use fixed-size door variables from above
            const dU = doorU, dW = doorW2, dV = doorV, dH = doorH2;
            // Door frame
            if (z >= 2) {
              wallRect(ptFn,A,B,bldH, dU-0.02,0.0,dW+0.04,dH+0.04, 'rgba(0,0,0,0.25)');
            }
            // Door
            wallRect(ptFn,A,B,bldH, dU,dV,dW,dH, doorCol);
            // Door knob
            if (z >= 3) {
              const dk=ptFn(A,B,bldH,dU+dW*0.7,dV+dH*0.5);
              ctx.fillStyle='rgba(200,180,100,0.5)';
              ctx.beginPath();ctx.arc(dk.x,dk.y,Math.max(0.5,z*0.3),0,Math.PI*2);ctx.fill();
            }
            // Step / porch
            if (z >= 2) {
              const stepW = dW + 0.04;
              const stepU = dU - 0.02;
              const s1=ptFn(A,B,bldH,stepU,0.0), s2=ptFn(A,B,bldH,stepU+stepW,0.0);
              const s3={x:s2.x+(B.x-A.x)*0.02,y:s2.y+(B.y-A.y)*0.02+halfTH*0.08};
              const s4={x:s1.x+(B.x-A.x)*0.02,y:s1.y+(B.y-A.y)*0.02+halfTH*0.08};
              ctx.beginPath();ctx.moveTo(s1.x,s1.y);ctx.lineTo(s2.x,s2.y);
              ctx.lineTo(s3.x,s3.y);ctx.lineTo(s4.x,s4.y);ctx.closePath();
              ctx.fillStyle='rgba(100,90,70,0.4)';ctx.fill();
            }
            // Overhead light above door
            if (z >= 3) {
              const lt=ptFn(A,B,bldH,0.5,0.36);
              ctx.fillStyle='rgba(255,230,150,0.3)';
              ctx.beginPath();ctx.arc(lt.x,lt.y,Math.max(1,z*0.4),0,Math.PI*2);ctx.fill();
            }
          }

          // ── Bay door (garage/warehouse/fire_station, faces road) ──
          if (det.bayDoor) {
            const bayPt = doorWall==='R' ? rwPt : lwPt;
            const bayA = doorWall==='R' ? E : S;
            const bayB = doorWall==='R' ? S : W;
            // Fixed-size bay door (~12px wide, ~15px tall)
            const bayW = Math.min(0.5, 12 / wallLenPx);
            const bayH = Math.min(0.55, 15 / (bldH || 20));
            const bayU = 0.5 - bayW/2;
            // Frame
            if (z >= 2) wallRect(bayPt,bayA,bayB,bldH, bayU-0.02,0.0,bayW+0.04,bayH+0.04, 'rgba(0,0,0,0.2)');
            wallRect(bayPt,bayA,bayB,bldH, bayU,0.02,bayW,bayH, 'rgba(20,15,10,0.6)');
            // Horizontal slats
            if (z >= 2) {
              ctx.strokeStyle='rgba(100,100,80,0.3)';ctx.lineWidth=0.5;
              for (let s=0;s<5;s++) {
                const sv=0.02+bayH*(s+1)/6;
                const a=bayPt(bayA,bayB,bldH,bayU,sv),b=bayPt(bayA,bayB,bldH,bayU+bayW,sv);
                ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
              }
            }
            // Handle
            if (z >= 3) {
              const hd=bayPt(bayA,bayB,bldH,0.4,0.12);
              ctx.fillStyle='rgba(150,150,140,0.4)';
              ctx.fillRect(hd.x-z*0.3,hd.y-z*0.1,z*0.6,z*0.2);
            }
          }

          // ── Storefront with awning (shop/supermarket, faces road) ──
          if (det.storefront) {
            const sfPt = doorWall==='R' ? rwPt : lwPt;
            const sfA = doorWall==='R' ? E : S;
            const sfB = doorWall==='R' ? S : W;
            // Large glass panel
            wallRect(sfPt,sfA,sfB,bldH, 0.06,0.02,0.88,0.48, 'rgba(100,160,140,0.15)');
            // Glass frame dividers
            if (z >= 2.5) {
              ctx.strokeStyle='rgba(80,120,100,0.2)';ctx.lineWidth=0.4;
              for (let d=1;d<3;d++) {
                const du=0.06+d*0.29;
                const a=sfPt(sfA,sfB,bldH,du,0.02),b=sfPt(sfA,sfB,bldH,du,0.50);
                ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
              }
            }
            // Reflection diagonal
            const ra=sfPt(sfA,sfB,bldH,0.15,0.15),rb=sfPt(sfA,sfB,bldH,0.55,0.42);
            ctx.strokeStyle='rgba(200,240,220,0.1)';ctx.lineWidth=1;
            ctx.beginPath();ctx.moveTo(ra.x,ra.y);ctx.lineTo(rb.x,rb.y);ctx.stroke();
            // Awning over storefront
            if (z >= 1.5) {
              const a1=sfPt(sfA,sfB,bldH,0.03,0.52),a2=sfPt(sfA,sfB,bldH,0.97,0.52);
              const ext=0.06;
              const a3={x:a2.x+(sfB.x-sfA.x)*ext,y:a2.y+(sfB.y-sfA.y)*ext+halfTH*0.25};
              const a4={x:a1.x+(sfB.x-sfA.x)*ext,y:a1.y+(sfB.y-sfA.y)*ext+halfTH*0.25};
              ctx.beginPath();ctx.moveTo(a1.x,a1.y);ctx.lineTo(a2.x,a2.y);
              ctx.lineTo(a3.x,a3.y);ctx.lineTo(a4.x,a4.y);ctx.closePath();
              ctx.fillStyle=scaleColor(meta.color,0.65);ctx.fill();
              ctx.strokeStyle='rgba(0,0,0,0.25)';ctx.lineWidth=0.5;ctx.stroke();
              // Awning stripes
              if (z >= 2.5) {
                ctx.strokeStyle='rgba(0,0,0,0.12)';ctx.lineWidth=0.4;
                for (let si=1;si<4;si++) {
                  const t=si/4;
                  const sx=a1.x+(a2.x-a1.x)*t, sy=a1.y+(a2.y-a1.y)*t;
                  const ex=a4.x+(a3.x-a4.x)*t, ey=a4.y+(a3.y-a4.y)*t;
                  ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();
                }
              }
            }
          }

          // ── Awning (cafe, faces road) ──
          if (det.awning && !det.storefront && z >= 1.5) {
            const awPt = doorWall==='R' ? rwPt : lwPt;
            const awA = doorWall==='R' ? E : S;
            const awB = doorWall==='R' ? S : W;
            const a1=awPt(awA,awB,bldH,0.05,0.48),a2=awPt(awA,awB,bldH,0.95,0.48);
            const a3={x:a2.x+(awB.x-awA.x)*0.06,y:a2.y+(awB.y-awA.y)*0.06+halfTH*0.3};
            const a4={x:a1.x+(awB.x-awA.x)*0.06,y:a1.y+(awB.y-awA.y)*0.06+halfTH*0.3};
            ctx.beginPath();ctx.moveTo(a1.x,a1.y);ctx.lineTo(a2.x,a2.y);
            ctx.lineTo(a3.x,a3.y);ctx.lineTo(a4.x,a4.y);ctx.closePath();
            ctx.fillStyle=scaleColor(meta.color,0.7);ctx.fill();
            ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=0.5;ctx.stroke();
            // Scalloped edge
            if (z >= 2.5) {
              const scallops=5;
              ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=0.4;
              for(let si=0;si<scallops;si++){
                const t1=si/scallops, t2=(si+1)/scallops, tm=(t1+t2)/2;
                const bx1=a4.x+(a3.x-a4.x)*t1,by1=a4.y+(a3.y-a4.y)*t1;
                const bx2=a4.x+(a3.x-a4.x)*t2,by2=a4.y+(a3.y-a4.y)*t2;
                const mx=a4.x+(a3.x-a4.x)*tm,my=a4.y+(a3.y-a4.y)*tm+halfTH*0.08;
                ctx.beginPath();ctx.moveTo(bx1,by1);ctx.quadraticCurveTo(mx,my,bx2,by2);ctx.stroke();
              }
            }
          }

          // ── Stripe (police/fire/military) ──
          if (det.stripe) {
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = prevAlpha * 0.4;
            wallRect(rwPt,E,S,bldH, 0,0.02,1,0.1, det.stripe);
            wallRect(lwPt,S,W,bldH, 0,0.02,1,0.1, det.stripe);
            ctx.globalAlpha = prevAlpha;
            // Second thin stripe
            if (z >= 2) {
              ctx.globalAlpha = prevAlpha * 0.2;
              wallRect(rwPt,E,S,bldH, 0,0.88,1,0.04, det.stripe);
              wallRect(lwPt,S,W,bldH, 0,0.88,1,0.04, det.stripe);
              ctx.globalAlpha = prevAlpha;
            }
          }

          // ── Hotel balconies ──
          if (bType === 'hotel' && det.wins && z >= 2.5) {
            const [cols,rows] = det.wins;
            const cellW = (1-0.24)/cols, cellH = (1-0.34)/rows;
            ctx.strokeStyle='rgba(150,140,120,0.3)';ctx.lineWidth=0.5;
            for (let r=0;r<rows;r++) {
              for (let c=0;c<cols;c++) {
                const bu = 0.12+c*cellW+cellW*0.1, bv = 0.08+0.08+r*cellH;
                const bw2 = cellW*0.8;
                // Balcony railing on right wall
                const bl=rwPt(E,S,bldH,bu,bv),br=rwPt(E,S,bldH,bu+bw2,bv);
                const blo={x:bl.x+(S.x-E.x)*0.015,y:bl.y+(S.y-E.y)*0.015};
                const bro={x:br.x+(S.x-E.x)*0.015,y:br.y+(S.y-E.y)*0.015};
                ctx.beginPath();ctx.moveTo(bl.x,bl.y);ctx.lineTo(blo.x,blo.y);
                ctx.lineTo(bro.x,bro.y);ctx.lineTo(br.x,br.y);ctx.stroke();
              }
            }
          }

          // ── Bank columns on right wall ──
          if (bType === 'bank' && z >= 2) {
            const numCol = 3;
            ctx.strokeStyle='rgba(200,190,150,0.25)';ctx.lineWidth=Math.max(1,z*0.4);
            for (let ci=0;ci<numCol;ci++) {
              const cu = 0.1+ci*(0.8/(numCol-1));
              const a=rwPt(E,S,bldH,cu,0.06), b=rwPt(E,S,bldH,cu,0.92);
              ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
              // Column capital (wider top)
              if (z >= 3) {
                const ct=rwPt(E,S,bldH,cu,0.9);
                ctx.fillStyle='rgba(200,190,150,0.15)';
                ctx.beginPath();ctx.arc(ct.x,ct.y,z*0.5,0,Math.PI*2);ctx.fill();
              }
            }
          }

          // ── Gable roof ──
          if (det.roof === 'gable') {
            const ridgeH = bldH * 0.35;
            const rN={x:N.x,y:N.y-bldH}, rE={x:E.x,y:E.y-bldH};
            const rS={x:S.x,y:S.y-bldH}, rW={x:W.x,y:W.y-bldH};
            const peakE={x:(rN.x+rE.x)/2, y:(rN.y+rE.y)/2 - ridgeH};
            const peakW={x:(rS.x+rW.x)/2, y:(rS.y+rW.y)/2 - ridgeH};
            // Right roof slope
            ctx.beginPath();ctx.moveTo(rE.x,rE.y);ctx.lineTo(rS.x,rS.y);
            ctx.lineTo(peakW.x,peakW.y);ctx.lineTo(peakE.x,peakE.y);ctx.closePath();
            ctx.fillStyle=scaleColor(meta.color,0.55);ctx.fill();
            // Left roof slope
            ctx.beginPath();ctx.moveTo(rS.x,rS.y);ctx.lineTo(rW.x,rW.y);
            ctx.lineTo(peakW.x,peakW.y);ctx.closePath();
            ctx.fillStyle=scaleColor(meta.color,0.35);ctx.fill();
            // Ridge line & outline
            ctx.strokeStyle='rgba(0,0,0,0.3)';ctx.lineWidth=0.7;
            ctx.beginPath();ctx.moveTo(peakE.x,peakE.y);ctx.lineTo(peakW.x,peakW.y);ctx.stroke();
            ctx.beginPath();ctx.moveTo(rE.x,rE.y);ctx.lineTo(rS.x,rS.y);
            ctx.lineTo(peakW.x,peakW.y);ctx.closePath();
            ctx.strokeStyle=edgeCol;ctx.lineWidth=0.5;ctx.stroke();
            // Roof tile lines
            if (z >= 3) {
              ctx.strokeStyle='rgba(0,0,0,0.08)';ctx.lineWidth=0.3;
              for (let ti=1;ti<4;ti++) {
                const t=ti/4;
                const la={x:rE.x+(peakE.x-rE.x)*t,y:rE.y+(peakE.y-rE.y)*t};
                const lb={x:rS.x+(peakW.x-rS.x)*t,y:rS.y+(peakW.y-rS.y)*t};
                ctx.beginPath();ctx.moveTo(la.x,la.y);ctx.lineTo(lb.x,lb.y);ctx.stroke();
              }
            }
          }

          // ── Church spire (enhanced) ──
          if (det.roof === 'spire') {
            const cx=(N.x+S.x)/2, cy=(N.y+S.y)/2 - bldH;
            const spH = bldH * 1.2;
            const spW = halfTW * bw * 0.18;
            // Spire base (wider)
            ctx.beginPath();
            ctx.moveTo(cx-spW*1.5,cy);ctx.lineTo(cx+spW*1.5,cy);
            ctx.lineTo(cx+spW*0.8,cy-spH*0.15);ctx.lineTo(cx-spW*0.8,cy-spH*0.15);
            ctx.closePath();ctx.fillStyle=scaleColor(meta.color,0.5);ctx.fill();
            // Main spire
            ctx.beginPath();
            ctx.moveTo(cx,cy-spH);
            ctx.lineTo(cx+spW,cy-spH*0.15);ctx.lineTo(cx-spW,cy-spH*0.15);ctx.closePath();
            ctx.fillStyle=scaleColor(meta.color,0.55);ctx.fill();
            ctx.strokeStyle=edgeCol;ctx.lineWidth=0.5;ctx.stroke();
            // Cross on top
            if (z >= 1.5) {
              const topY=cy-spH;
              ctx.strokeStyle='rgba(255,220,100,0.7)';ctx.lineWidth=Math.max(1,z*0.35);
              ctx.beginPath();ctx.moveTo(cx,topY-halfTH*0.6);ctx.lineTo(cx,topY+halfTH*0.15);ctx.stroke();
              ctx.beginPath();ctx.moveTo(cx-halfTW*0.1,topY-halfTH*0.35);ctx.lineTo(cx+halfTW*0.1,topY-halfTH*0.35);ctx.stroke();
            }
            // Round stained glass window on front
            if (z >= 2.5) {
              const gx2=(E.x+S.x)/2, gy2=(E.y+S.y)/2-bldH*0.7;
              const gr=Math.max(1.5,halfTW*0.06);
              ctx.beginPath();ctx.arc(gx2,gy2,gr,0,Math.PI*2);
              ctx.fillStyle='rgba(180,120,200,0.35)';ctx.fill();
              ctx.strokeStyle='rgba(200,150,220,0.3)';ctx.lineWidth=0.5;ctx.stroke();
            }
          }

          // ── Canopy (gas station) — isometric 3D ──
          if (det.roof === 'canopy') {
            // Canopy is wider than building, elevated above
            const canH = halfTH * 0.15;
            const canLift = bldH * 0.4;
            const ext = 0.3; // extend beyond building in grid units
            const cN={x:isoX(n.gx-ext,n.gy-ext),y:isoY(n.gx-ext,n.gy-ext)-bldH-canLift};
            const cE={x:isoX(n.gx+bw+ext,n.gy-ext),y:isoY(n.gx+bw+ext,n.gy-ext)-bldH-canLift};
            const cS={x:isoX(n.gx+bw+ext,n.gy+bh+ext),y:isoY(n.gx+bw+ext,n.gy+bh+ext)-bldH-canLift};
            const cW={x:isoX(n.gx-ext,n.gy+bh+ext),y:isoY(n.gx-ext,n.gy+bh+ext)-bldH-canLift};
            // Support pillars (isometric vertical lines from ground to canopy)
            const pillarCol = 'rgba(130,130,120,0.5)';
            ctx.strokeStyle=pillarCol;ctx.lineWidth=Math.max(1.5,z*0.4);
            ctx.beginPath();
            ctx.moveTo(cE.x,cE.y+bldH+canLift);ctx.lineTo(cE.x,cE.y);
            ctx.moveTo(cS.x,cS.y+bldH+canLift);ctx.lineTo(cS.x,cS.y);
            ctx.stroke();
            // Canopy slab — SE face
            ctx.beginPath();ctx.moveTo(cE.x,cE.y);ctx.lineTo(cS.x,cS.y);
            ctx.lineTo(cS.x,cS.y-canH);ctx.lineTo(cE.x,cE.y-canH);
            ctx.closePath();ctx.fillStyle='rgba(75,75,68,0.55)';ctx.fill();
            // Canopy slab — SW face
            ctx.beginPath();ctx.moveTo(cS.x,cS.y);ctx.lineTo(cW.x,cW.y);
            ctx.lineTo(cW.x,cW.y-canH);ctx.lineTo(cS.x,cS.y-canH);
            ctx.closePath();ctx.fillStyle='rgba(55,55,50,0.5)';ctx.fill();
            // Canopy top
            ctx.beginPath();ctx.moveTo(cN.x,cN.y-canH);ctx.lineTo(cE.x,cE.y-canH);
            ctx.lineTo(cS.x,cS.y-canH);ctx.lineTo(cW.x,cW.y-canH);ctx.closePath();
            ctx.fillStyle='rgba(95,95,85,0.5)';ctx.fill();
            ctx.strokeStyle=edgeCol;ctx.lineWidth=0.5;ctx.stroke();
            // Fuel pumps as small isometric boxes under canopy
            if (z >= 2.5) {
              const pumpH = halfTH * 0.6;
              isoBox(bw*0.3,bh*0.6, 0.12,0.08, pumpH, 'rgba(200,60,50,0.5)','rgba(170,40,35,0.5)','rgba(130,30,25,0.5)');
              isoBox(bw*0.6,bh*0.6, 0.12,0.08, pumpH, 'rgba(50,60,200,0.5)','rgba(35,45,170,0.5)','rgba(25,30,130,0.5)');
            }
          }


          // ── Helper: isometric 3D box on roof ──
          // gx,gy = grid offset from building origin, bw2/bh2 = box size in grid units, boxH = height in px
          function isoBox(gx0,gy0,bw2,bh2,boxH,topC,rightC,leftC) {
            const bN={x:isoX(n.gx+gx0,n.gy+gy0),y:isoY(n.gx+gx0,n.gy+gy0)-bldH};
            const bE={x:isoX(n.gx+gx0+bw2,n.gy+gy0),y:isoY(n.gx+gx0+bw2,n.gy+gy0)-bldH};
            const bS={x:isoX(n.gx+gx0+bw2,n.gy+gy0+bh2),y:isoY(n.gx+gx0+bw2,n.gy+gy0+bh2)-bldH};
            const bW={x:isoX(n.gx+gx0,n.gy+gy0+bh2),y:isoY(n.gx+gx0,n.gy+gy0+bh2)-bldH};
            // Right wall
            ctx.beginPath();ctx.moveTo(bE.x,bE.y);ctx.lineTo(bS.x,bS.y);
            ctx.lineTo(bS.x,bS.y-boxH);ctx.lineTo(bE.x,bE.y-boxH);
            ctx.closePath();ctx.fillStyle=rightC;ctx.fill();
            // Left wall
            ctx.beginPath();ctx.moveTo(bS.x,bS.y);ctx.lineTo(bW.x,bW.y);
            ctx.lineTo(bW.x,bW.y-boxH);ctx.lineTo(bS.x,bS.y-boxH);
            ctx.closePath();ctx.fillStyle=leftC;ctx.fill();
            // Top
            ctx.beginPath();ctx.moveTo(bN.x,bN.y-boxH);ctx.lineTo(bE.x,bE.y-boxH);
            ctx.lineTo(bS.x,bS.y-boxH);ctx.lineTo(bW.x,bW.y-boxH);
            ctx.closePath();ctx.fillStyle=topC;ctx.fill();
            // Edges
            ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=0.4;
            ctx.beginPath();
            ctx.moveTo(bE.x,bE.y);ctx.lineTo(bE.x,bE.y-boxH);
            ctx.moveTo(bS.x,bS.y);ctx.lineTo(bS.x,bS.y-boxH);
            ctx.moveTo(bW.x,bW.y);ctx.lineTo(bW.x,bW.y-boxH);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(bN.x,bN.y-boxH);ctx.lineTo(bE.x,bE.y-boxH);
            ctx.lineTo(bS.x,bS.y-boxH);ctx.lineTo(bW.x,bW.y-boxH);ctx.closePath();ctx.stroke();
          }

          // ── Smokestack (factory, isometric 3D) ──
          if (det.smokestack && z >= 1.3) {
            const stH = bldH * 0.65;
            // Main tall stack
            isoBox(bw*0.65,bh*0.15, 0.2,0.2, stH, '#666655','#555544','#3a3a30');
            // Warning bands
            if (z >= 2.5) {
              const bandGx=n.gx+bw*0.65, bandGy=n.gy+bh*0.15;
              const bE2={x:isoX(bandGx+0.2,bandGy),y:isoY(bandGx+0.2,bandGy)-bldH};
              const bS2={x:isoX(bandGx+0.2,bandGy+0.2),y:isoY(bandGx+0.2,bandGy+0.2)-bldH};
              const bandH=stH*0.08;
              for (const bv of [0.7,0.9]) {
                ctx.beginPath();
                ctx.moveTo(bE2.x,bE2.y-stH*bv);ctx.lineTo(bS2.x,bS2.y-stH*bv);
                ctx.lineTo(bS2.x,bS2.y-stH*bv-bandH);ctx.lineTo(bE2.x,bE2.y-stH*bv-bandH);
                ctx.closePath();ctx.fillStyle='rgba(200,50,30,0.3)';ctx.fill();
              }
            }
            // Second shorter stack
            isoBox(bw*0.35,bh*0.25, 0.18,0.18, stH*0.55, '#5a5a4a','#4a4a3a','#333328');
            // Pipes on left wall
            if (z >= 2.5) {
              ctx.strokeStyle='rgba(100,100,90,0.3)';ctx.lineWidth=Math.max(0.8,z*0.25);
              const p1=lwPt(S,W,bldH,0.2,0.3), p2=lwPt(S,W,bldH,0.2,0.85);
              ctx.beginPath();ctx.moveTo(p1.x,p1.y);ctx.lineTo(p2.x,p2.y);ctx.stroke();
              const p3=lwPt(S,W,bldH,0.35,0.2), p4=lwPt(S,W,bldH,0.35,0.7);
              ctx.beginPath();ctx.moveTo(p3.x,p3.y);ctx.lineTo(p4.x,p4.y);ctx.stroke();
            }
          }

          // ── Roof equipment (AC units as isometric boxes) ──
          if (det.roof === 'flat' && z >= 2.5 && (bType==='office'||bType==='supermarket'||bType==='hotel'||bType==='school')) {
            const acH = halfTH * 0.4;
            isoBox(bw*0.2,bh*0.15, 0.22,0.18, acH, 'rgba(90,95,90,0.5)','rgba(70,75,70,0.5)','rgba(50,55,50,0.5)');
            if (bw >= 2) {
              isoBox(bw*0.55,bh*0.2, 0.18,0.15, acH*0.7, 'rgba(80,85,80,0.45)','rgba(60,65,60,0.45)','rgba(45,50,45,0.45)');
            }
          }

          // ── Cross on roof (pharmacy/clinic) ──
          if (det.cross && z >= 1.5) {
            const cx2=(N.x+S.x)/2, cy2=(N.y+S.y)/2-bldH;
            const cs=Math.max(2,halfTW*bw*0.13);
            // Glow background
            ctx.fillStyle='rgba(255,40,40,0.12)';
            ctx.beginPath();ctx.arc(cx2,cy2,cs*1.3,0,Math.PI*2);ctx.fill();
            // Cross lines
            ctx.strokeStyle='rgba(255,50,50,0.75)';ctx.lineWidth=Math.max(1.2,z*0.5);
            ctx.beginPath();ctx.moveTo(cx2,cy2-cs);ctx.lineTo(cx2,cy2+cs);ctx.stroke();
            ctx.beginPath();ctx.moveTo(cx2-cs*0.6,cy2);ctx.lineTo(cx2+cs*0.6,cy2);ctx.stroke();
          }

          // ── Flag (school, enhanced) ──
          if (det.flag && z >= 1.5) {
            const fx=N.x+(E.x-N.x)*0.12, fy=N.y+(E.y-N.y)*0.12-bldH;
            const fh=bldH*0.55;
            // Pole
            ctx.strokeStyle='rgba(180,180,170,0.5)';ctx.lineWidth=Math.max(0.7,z*0.2);
            ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(fx,fy-fh);ctx.stroke();
            // Pole ball top
            ctx.fillStyle='rgba(200,200,180,0.4)';
            ctx.beginPath();ctx.arc(fx,fy-fh,Math.max(0.8,z*0.25),0,Math.PI*2);ctx.fill();
            // Flag cloth (waving shape)
            const fw=halfTW*0.15, fht=halfTH*0.3;
            ctx.beginPath();ctx.moveTo(fx,fy-fh);
            ctx.quadraticCurveTo(fx+fw*0.6,fy-fh+fht*0.3,fx+fw,fy-fh+fht*0.5);
            ctx.lineTo(fx,fy-fh+fht);ctx.closePath();
            ctx.fillStyle='rgba(200,40,40,0.6)';ctx.fill();
            ctx.strokeStyle='rgba(180,30,30,0.4)';ctx.lineWidth=0.4;ctx.stroke();
          }

          // ── Bar neon sign accent ──
          if (bType === 'bar' && z >= 2.5) {
            const sg=rwPt(E,S,bldH,0.25,0.7);
            ctx.fillStyle='rgba(255,150,50,0.2)';
            ctx.beginPath();ctx.arc(sg.x,sg.y,Math.max(2,z*0.8),0,Math.PI*2);ctx.fill();
          }

          // ── Laundromat large windows on left wall ──
          if (bType === 'laundromat' && z >= 2.5) {
            wallRect(lwPt,S,W,bldH, 0.08,0.08,0.84,0.55, 'rgba(130,170,180,0.12)');
          }
        }
      }

      // Icon on roof
      if (z >= 2 && meta.icon && n.visited) {
        const rcx=(N.x+S.x)/2, rcy=(N.y+S.y)/2 - bldH;
        const fSize=Math.max(7, Math.min(16, halfTW*bw*0.32));
        ctx.fillStyle = isHere ? '#00FF41' : 'rgba(255,255,255,0.4)';
        ctx.font=`bold ${fSize}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(meta.icon, rcx, rcy); ctx.textBaseline='alphabetic';
      }

      // NPC trader marker
      if (n.building?.isTraderShop && n.visited) {
        const tcx=(N.x+S.x)/2, tcy=(N.y+S.y)/2 - bldH;
        const tSz = Math.max(8, Math.min(18, halfTW*bw*0.35));
        ctx.fillStyle = '#ffcc44';
        ctx.shadowColor = '#ffcc44'; ctx.shadowBlur = 4;
        ctx.font = `bold ${tSz}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText('👤', tcx, tcy);
        ctx.shadowBlur = 0; ctx.textBaseline='alphabetic';
        // Trader name below building
        if (z >= 1.5) {
          const traderName = LANG?.current === 'en' ? n.building.trader?.nameEn : n.building.trader?.name;
          if (traderName) {
            ctx.fillStyle = '#ffcc44'; ctx.globalAlpha = 0.7;
            ctx.font = `${Math.max(6,7*z)}px monospace`;
            labelsToDraw.push({ x:(N.x+S.x)/2, y:S.y+12, label:traderName, isHere, color:'#ffcc44' });
          }
        }
      }

      // Ruined building marker
      if (n.building?.isRuin && n.visited) {
        const rcx2=(N.x+S.x)/2, rcy2=(N.y+S.y)/2 - bldH;
        const tSz = Math.max(8, Math.min(18, halfTW*bw*0.35));
        ctx.fillStyle = n.building.ruin?.owned ? '#00ff41' : '#aa8833';
        ctx.font = `bold ${tSz}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText(n.building.ruin?.owned ? '🏠' : '🏚️', rcx2, rcy2);
        ctx.textBaseline='alphabetic';
      }

      // "БАЗА" marker
      if (isHome) {
        ctx.fillStyle='#00FF41'; ctx.shadowColor='#00FF41'; ctx.shadowBlur=6;
        ctx.font=`bold ${Math.max(8,10*z)}px monospace`; ctx.textAlign='center';
        ctx.fillText('БАЗА', (N.x+S.x)/2, N.y-bldH-5); ctx.shadowBlur=0;
      }

      // Name label (with address if available) — skip in xray mode 2
      if (z >= 2 && n.visited && mapState.xrayLevel !== 2) {
        let label=(n.building.name||'').replace(/\s*#\d+/,'');
        if (n.building.address && z >= 2.5) label = label + '\n' + n.building.address;
        if (label) labelsToDraw.push({ x:(N.x+S.x)/2, y:S.y+10, label, isHere, color:meta.color });
      }

    }
    ctx.globalAlpha = 1.0;
  }

  // ── Pass 4.1: Draw deferred POI icons ON TOP of buildings ──
  for (const poi of _poiIcons) {
    ctx.globalAlpha = 0.8;
    if (poi.icon === '_airdrop') {
      // Pulsing orange airdrop marker
      ctx.globalAlpha = 0.7 + Math.sin(Date.now() / 300) * 0.3;
      ctx.fillStyle = '#ff8c00';
      ctx.beginPath(); ctx.arc(poi.x, poi.y, Math.max(4, 5*z), 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(poi.x, poi.y, Math.max(6, 9*z), 0, Math.PI*2); ctx.stroke();
    } else if (poi.icon === 'car_wreck') {
      // Bright red X marker — always visible on top
      const r = Math.max(4, 5*z);
      ctx.globalAlpha = poi.searched ? 0.35 : 0.85;
      ctx.strokeStyle = poi.searched ? '#663333' : '#ee3344';
      ctx.lineWidth = Math.max(2, 2.5*z);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(poi.x-r, poi.y-r); ctx.lineTo(poi.x+r, poi.y+r); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(poi.x+r, poi.y-r); ctx.lineTo(poi.x-r, poi.y+r); ctx.stroke();
      // Small car icon on top if zoomed in
      if (z >= 2.5) drawMapIcon('car_wreck', poi.x, poi.y, poi.sz);
    } else {
      drawMapIcon(poi.icon, poi.x, poi.y, poi.sz);
    }
  }
  ctx.globalAlpha = 1.0;

  // ── Pass 4.5: Road glow overlay (when buildings are transparent) ──
  if (bldOpacity < 1.0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glowAlpha = mapState.xray ? 0.5 : 0.3;
    ctx.strokeStyle = `rgba(0,255,65,${glowAlpha})`;
    ctx.lineWidth = Math.max(2, halfTW*0.35);
    ctx.lineCap = 'round';
    // Batch all road segments into one path (no shadowBlur — major perf win)
    ctx.beginPath();
    const drawnGlow = new Set();
    for (const n of groundNodes) {
      if (!roadSet.has(n.type)) continue;
      for (const adjId of n.connections) {
        const adj = nodes[adjId];
        if (!adj || !adj.discovered || !roadSet.has(adj.type)) continue;
        const key = n.id < adjId ? n.id+'|'+adjId : adjId+'|'+n.id;
        if (drawnGlow.has(key)) continue;
        drawnGlow.add(key);
        if (!n.visited && !adj.visited) continue;
        const nx = isoX(n.gx+0.5, n.gy+0.5), ny = isoY(n.gx+0.5, n.gy+0.5);
        const ax = isoX(adj.gx+0.5, adj.gy+0.5), ay = isoY(adj.gx+0.5, adj.gy+0.5);
        ctx.moveTo(nx,ny); ctx.lineTo(ax,ay);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // ── Preview path (dashed cyan) ──
  if (mapState.previewPath && mapState.previewPath.length > 1) {
    ctx.strokeStyle = 'rgba(0,188,212,0.65)';
    ctx.lineWidth = Math.max(1.5, 2*z);
    ctx.setLineDash([4,4]); ctx.lineCap='round';
    ctx.shadowColor='#00BCD4'; ctx.shadowBlur=3;
    ctx.beginPath();
    mapState.previewPath.forEach((pid,i) => {
      const pn=nodes[pid]; if (!pn) return;
      const px=isoX(pn.gx+0.5,pn.gy+0.5), py=isoY(pn.gx+0.5,pn.gy+0.5);
      i===0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
    });
    ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur=0;
  }

  // ── Active route (solid cyan) ──
  if (G.world.currentRoute?.path.length > 1) {
    const route = G.world.currentRoute;
    ctx.strokeStyle='#00E5FF'; ctx.lineWidth=Math.max(2,2.5*z);
    ctx.lineCap='round'; ctx.shadowColor='#00E5FF'; ctx.shadowBlur=5;
    ctx.beginPath();
    for (let i=route.currentStep; i<route.path.length; i++) {
      const pn=nodes[route.path[i]]; if (!pn) continue;
      const px=isoX(pn.gx+0.5,pn.gy+0.5), py=isoY(pn.gx+0.5,pn.gy+0.5);
      i===route.currentStep ? ctx.moveTo(px,py) : ctx.lineTo(px,py);
    }
    ctx.stroke(); ctx.shadowBlur=0;
  }

  // ── Labels (with overlap avoidance) ──
  ctx.textAlign='center'; ctx.textBaseline='alphabetic';
  const lbRects=[];
  const fSz=Math.max(6,Math.min(9,7*z));
  ctx.font=`${fSz}px monospace`;
  for (const lb of labelsToDraw) {
    const tw2=ctx.measureText(lb.label).width;
    const lx=lb.x-tw2/2-2, ly=lb.y-fSz, rw2=tw2+4, rh2=fSz+2;
    if (lbRects.some(r=>lx<r.x+r.w&&lx+rw2>r.x&&ly<r.y+r.h&&ly+rh2>r.y)) continue;
    ctx.fillStyle='rgba(2,6,2,0.88)'; ctx.fillRect(lx,ly,rw2,rh2);
    ctx.fillStyle=lb.isHere?'#00FF41':(lb.color||'#507850');
    ctx.fillText(lb.label,lb.x,lb.y);
    lbRects.push({x:lx,y:ly,w:rw2,h:rh2});
  }

  // ── Player marker (downward arrow above current location) ──
  let pSX, pSY;
  const cur = nodes[G.world.currentNodeId];
  if (mapState.moveAnim) {
    const ma=mapState.moveAnim, fN=nodes[ma.fromId], tN=nodes[ma.toId];
    if (fN && tN) {
      const t=Math.min(1,ma.progress);
      pSX = isoX(fN.gx+0.5,fN.gy+0.5)*(1-t)+isoX(tN.gx+0.5,tN.gy+0.5)*t;
      pSY = isoY(fN.gx+0.5,fN.gy+0.5)*(1-t)+isoY(tN.gx+0.5,tN.gy+0.5)*t;
    }
  }
  if (pSX===undefined && cur?.discovered) {
    pSX=isoX(cur.gx+0.5,cur.gy+0.5); pSY=isoY(cur.gx+0.5,cur.gy+0.5);
  }
  if (pSX!==undefined) {
    const markerSz = Math.max(14, 16*z);
    // If player is in a building, offset above the building roof
    let markerY = pSY;
    if (cur && cur.type === 'building' && cur.building) {
      const cbH = (BLD_H[cur.building.type]||2) * halfTH * 0.85 + Math.max(1, halfTH*0.12);
      markerY = pSY - cbH;
    }
    // Bobbing animation
    const bob = Math.sin(Date.now()*0.004)*2;
    markerY += bob - markerSz*0.5;
    // Glow
    ctx.shadowColor='#00FF41'; ctx.shadowBlur=10;
    const pulse = Math.sin(Date.now()*0.005)*0.3+0.6;
    ctx.globalAlpha = pulse;
    drawMapIcon('player', pSX, markerY, markerSz);
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur=0;
  }

  // ── Remote player markers (cyan) with smooth movement ──
  if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE') {
    Object.entries(Net.players).forEach(([pid, pInfo]) => {
      if (pid === Net.localId || !pInfo.nodeId) return;
      const pNode = nodes[pInfo.nodeId];
      if (!pNode || !pNode.discovered) return;

      // Smooth movement — lerp screen position
      const targetX = isoX(pNode.gx + 0.5, pNode.gy + 0.5);
      let targetY = isoY(pNode.gx + 0.5, pNode.gy + 0.5);
      if (pNode.type === 'building' && pNode.building) {
        targetY -= (BLD_H[pNode.building.type] || 2) * halfTH * 0.85;
      }
      if (!pInfo._mapX) { pInfo._mapX = targetX; pInfo._mapY = targetY; }
      pInfo._mapX += (targetX - pInfo._mapX) * 0.08;
      pInfo._mapY += (targetY - pInfo._mapY) * 0.08;
      const rpX = pInfo._mapX;
      let rpY = pInfo._mapY;

      const rpBob = Math.sin(Date.now() * 0.004 + pid.charCodeAt(0)) * 2;
      rpY += rpBob - 8;
      ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath(); ctx.arc(rpX, rpY, Math.max(4, 5 * z), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      // Name label
      if (z >= 1.5 && pInfo.name) {
        ctx.globalAlpha = 0.6;
        ctx.font = `${Math.max(7, 8 * z)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(pInfo.name, rpX, rpY - 8);
      }
      ctx.globalAlpha = 1;
    });
  }

  updateMoveAnim();
  if (document.getElementById('map-canvas')) {
    if (mapState.animFrame) cancelAnimationFrame(mapState.animFrame);
    mapState.animFrame=requestAnimationFrame(renderMapCanvas);
  }
}

function mapTravelTo(ri, li) {
  // Legacy fallback — unused in node system
}

function renderMiniMap() {
  // Handled by renderMapCanvas now
}

// ── DEATH ──
function playerDeath(cause) {
  G.player.alive = false;
  if (navigator.vibrate) navigator.vibrate(200);
  addLog(`═══ СМЕРТЬ ═══`, 'danger');
  addLog(`Причина: ${cause}`, 'danger');
  addLog(`Прожито дней: ${G.player.daysSurvived}. Зомби убито: ${G.stats.zombiesKilled}.`, '');
  playSound('death');

  if (G.difficulty.permadeath) {
    localStorage.removeItem('echo7_save');
  }

  setTimeout(() => {
    const kills = G.stats.zombiesKilled || 0;
    const days = G.player.daysSurvived || 1;
    const explored = Object.values(G.world.nodes).filter(n=>n.visited).length;

    let epitaph;
    if (days <= 1) epitaph = 'Не дожил даже до заката первого дня.';
    else if (days <= 3) epitaph = 'Мир пожрал ещё одну жертву.';
    else if (kills > 50) epitaph = 'Умер как жил — с оружием в руках.';
    else if (kills === 0) epitaph = 'Пацифист до самого конца.';
    else if (G.player.skills.stealth >= 5) epitaph = 'Тени не спасли от неизбежного.';
    else if (days > 20) epitaph = 'Долгий путь закончился. Но он запомнится.';
    else epitaph = 'Ещё одно имя, забытое в тишине.';

    let html = '<div id="death-screen" style="text-align:center">';
    html += '<div style="color:var(--red);font-size:20px;letter-spacing:.3em;margin-bottom:4px">СМЕРТЬ</div>';
    html += `<div style="color:var(--text-dim);font-size:11px;margin-bottom:16px">${G.characterName || 'Выживший'} · ${OCCUPATIONS.find(o=>o.id===G.occupation)?.name || 'Безработный'}</div>`;

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;text-align:left">';
    html += `<div style="border:1px solid var(--border);padding:8px;border-radius:3px"><div style="color:var(--text-dim);font-size:9px">ДНЕЙ ПРОЖИТО</div><div style="color:var(--green);font-size:18px">${days}</div></div>`;
    html += `<div style="border:1px solid var(--border);padding:8px;border-radius:3px"><div style="color:var(--text-dim);font-size:9px">ЗОМБИ УБИТО</div><div style="color:var(--green);font-size:18px">${kills}</div></div>`;
    html += `<div style="border:1px solid var(--border);padding:8px;border-radius:3px"><div style="color:var(--text-dim);font-size:9px">ЛОКАЦИЙ ИССЛЕДОВАНО</div><div style="color:var(--green);font-size:18px">${explored}</div></div>`;
    html += `<div style="border:1px solid var(--border);padding:8px;border-radius:3px"><div style="color:var(--text-dim);font-size:9px">ПРИЧИНА</div><div style="color:var(--red);font-size:11px">${cause || 'Неизвестно'}</div></div>`;
    html += '</div>';

    html += `<div style="color:var(--text-dim);font-size:11px;font-style:italic;margin-bottom:16px;padding:8px;border:1px solid var(--border);border-radius:3px">"${epitaph}"</div>`;

    html += '<div style="display:flex;gap:6px">';
    html += `<button class="act-btn" onclick="closeModal();exitToMenuDirect();setTimeout(()=>menuShowPanel('panel-newgame'),100)" style="flex:1;border-color:var(--green)">Новая игра</button>`;
    html += `<button class="act-btn" onclick="closeModal();exitToMenuDirect()" style="flex:1">Главное меню</button>`;
    html += '</div></div>';

    openModal('', html);
    document.getElementById('modal-close').style.display = 'none';

    const epitaphEl = document.querySelector('#death-screen [style*="italic"]');
    if (epitaphEl) {
      const fullText = epitaphEl.textContent;
      epitaphEl.textContent = '';
      let ci = 0;
      const typeTimer = setInterval(() => {
        if (ci < fullText.length) { epitaphEl.textContent += fullText[ci]; ci++; }
        else clearInterval(typeTimer);
      }, 40);
    }
  }, 1500);
}

// ── SAVE / LOAD ──
function saveGame() {
  if (!G) return;
  G._lastSaveTime = Date.now();
  // Convert Set to Array BEFORE serialization (Set → {} in JSON)
  const explArr = [...(G.world.exploredLocations || [])];
  G.world.exploredLocations = explArr;
  const json = JSON.stringify(G);
  G.world.exploredLocations = new Set(explArr);
  localStorage.setItem('echo7_save', json);
}

function loadGame() {
  try {
    const data = JSON.parse(localStorage.getItem('echo7_save'));
    if (!data) return false;
    // Version 2 saves are incompatible with node-graph world
    if (data.version < 3) {
      addLog('Сохранение устарело (v' + data.version + '). Начните новую игру.', 'warning');
      return false;
    }
    G = data;
    // Migration: old saves have G.player as a real property, new saves have G.players dict
    if (!G.localPlayerId) G.localPlayerId = 'local';
    if (!G.players) {
      // Old save: G.player is a plain object — migrate to G.players dict
      const playerData = G.player;
      G.players = { local: playerData };
    }
    // Remove real 'player' property if it exists (from old save or JSON leak)
    if (Object.getOwnPropertyDescriptor(G, 'player') && !Object.getOwnPropertyDescriptor(G, 'player').get) {
      delete G.player;
    }
    // Define non-enumerable getter: G.player → G.players[G.localPlayerId]
    Object.defineProperty(G, 'player', { get() { return this.players[this.localPlayerId]; }, configurable: true, enumerable: false });
    G.world.exploredLocations = new Set(G.world.exploredLocations || []);
    if (G.world.currentFloor === undefined) G.world.currentFloor = 0;
    // Ensure building rooms have floorNum
    if (G.world.nodes) {
      Object.values(G.world.nodes).forEach(node => {
        if (node.building && node.building.rooms) {
          node.building.rooms.forEach(room => {
            if (room.floorNum === undefined) room.floorNum = 0;
            if (room.roomType === undefined) room.roomType = 'room';
          });
        }
      });
    }
    // Legacy region compat (if still present)
    if (G.world.regions) {
      G.world.regions.forEach(r => r.locations && r.locations.forEach(loc => {
        if (loc.rooms) loc.rooms.forEach(room => {
          if (room.floorNum === undefined) room.floorNum = 0;
          if (room.roomType === undefined) room.roomType = 'room';
        });
      }));
    }
    // Migration: ensure new fields exist
    if (G.time.minute === undefined) G.time.minute = 0;
    if (G.paused === undefined) G.paused = false;
    G.lastRealTime = Date.now(); // Always reset — saved timestamp is stale
    G.realTimeAccum = 0; // Reset — stale accumulator causes time jumps
    G.activeAction = null; // Never restore timed actions
    if (G.player.weaponSlot1 === undefined) G.player.weaponSlot1 = G.player.equipped !== 'fist' ? G.player.equipped : null;
    if (G.player.weaponSlot2 === undefined) G.player.weaponSlot2 = null;
    if (G.player.activeSlot === undefined) G.player.activeSlot = 1;
    // Ensure new equipment slots exist
    if (!G.player.equipment) G.player.equipment = {};
    if (G.player.equipment.face === undefined) G.player.equipment.face = null;
    if (G.player.equipment.armor === undefined) G.player.equipment.armor = null;
    if (G.player.equipment.rig === undefined) G.player.equipment.rig = null;
    if (G.player.equipment.gloves === undefined) G.player.equipment.gloves = null;
    // Migrate moodles: bodyTemp, wetness, illness
    if (G.player.moodles.bodyTemp === undefined) G.player.moodles.bodyTemp = 36.6;
    if (G.player.moodles.wetness === undefined) G.player.moodles.wetness = 0;
    if (G.player.moodles.illness === undefined) G.player.moodles.illness = 0;
    delete G.player.moodles.temperature; // remove old abstract temperature
    // Migrate old armor vests from torso to armor slot
    const torsoId = G.player.equipment.torso;
    if (torsoId && ITEMS[torsoId]?.slot === 'armor') {
      G.player.equipment.armor = torsoId;
      G.player.equipment.torso = null;
    }
    // Ensure modifiers have new fields
    const m = G.modifiers || {};
    if (m.accuracyBonus === undefined) m.accuracyBonus = 0;
    if (m.reloadMult === undefined) m.reloadMult = 1;
    if (m.meleeDmgMult === undefined) m.meleeDmgMult = 1;
    if (m.luckBonus === undefined) m.luckBonus = 0;
    if (m.movementNoiseMult === undefined) m.movementNoiseMult = 1;
    G.modifiers = m;
    // Ensure node-graph fields
    if (!G.world.nodes) G.world.nodes = {};
    if (!G.world.currentNodeId) G.world.currentNodeId = null;
    if (G.world.currentRoute === undefined) G.world.currentRoute = null;
    // Migrate weather state
    if (!G.world.weather) G.world.weather = 'clear';
    if (!G.world.season) G.world.season = 'summer';
    if (G.world.outsideTemp === undefined) G.world.outsideTemp = 20;
    if (!G.player.quickSlots) G.player.quickSlots = [null,null,null];
    if (!G.diary) G.diary = [];
    if (!G.loreNotes) G.loreNotes = [];
    if (!G.radio) G.radio = { charge:0, transmissions:[], nextTransmission:0, airdropNodeId:null, airdropDiscovered:false, npcCampDiscovered:false, lastAirdropDay:0 };
    if (G.radio.lastAirdropDay === undefined) G.radio.lastAirdropDay = 0;
    if (!G.triggers) G.triggers = {};
    if (!G._dayStats) G._dayStats = {kills:0,itemsFound:0,nodesVisited:0,wasHurt:false,wasAtBase:false};

    rng = new RNG(G.seed + G.time.day * 1000 + G.time.hour);
    document.getElementById('title-screen').style.display = 'none';
    document.getElementById('game').style.display = 'flex';
    initCanvas();
    initAudio();

    // Set player/camera position from current room or front door
    const loc = currentLocation();
    if (loc) {
      const layout = getLocationLayout(loc);
      if (layout) {
        if (G.world.currentRoom >= 0 && layout.rooms[G.world.currentRoom]) {
          const lr = layout.rooms[G.world.currentRoom];
          sceneData.playerX = lr.cx; sceneData.playerY = lr.cy;
          sceneData.camX = lr.cx; sceneData.camY = lr.cy;
          sceneData.targetCamX = lr.cx; sceneData.targetCamY = lr.cy;
        } else {
          sceneData.playerX = layout.frontDoorX; sceneData.playerY = layout.frontDoorY;
          sceneData.camX = layout.frontDoorX; sceneData.camY = layout.frontDoorY;
          sceneData.targetCamX = layout.frontDoorX; sceneData.targetCamY = layout.frontDoorY;
        }
      }
    }

    addLog('Игра загружена.', 'info');
    updateUI();
    transitionScene();
    return true;
  } catch (e) {
    return false;
  }
}

// ═══════════════════════════════════════════
