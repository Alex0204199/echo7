// ═══════════════════════════════════════════
// RUINED BUILDING RESTORATION & UPGRADES
// ═══════════════════════════════════════════

// Cost to restore one room (by room type)
const ROOM_RESTORE_COST = {
  corridor: { planks:3, nails:2 },
  stairs:   { planks:3, nails:2, tape:1 },
  room:     { planks:5, nails:4, tape:2, scrap_metal:1 },
};

function showRuinUI(building) {
  if (!building?.isRuin || !building?.ruin) return;
  if (typeof _modalStack !== 'undefined') _modalStack = [];
  const r = building.ruin;
  const isEn = LANG?.current === 'en';
  const bName = isEn ? (RUIN_BUILDINGS.find(rb=>rb.id===r.id)?.nameEn || building.name) : building.name;

  let html = '';
  const restoredCount = building.rooms.filter(rm => rm._ruinRestored).length;
  const totalRooms = building.rooms.length;
  const floor1Done = building.rooms.filter(rm => rm.floorNum === 0).every(rm => rm._ruinRestored);

  // Header
  html += `<div style="text-align:center;margin-bottom:8px">`;
  html += `<div style="font-size:14px;color:${r.owned ? 'var(--green)' : 'var(--yellow)'}">${r.owned ? '🏠' : '🏚️'} ${bName}</div>`;
  html += `<div style="font-size:10px;color:var(--text-dim);margin-top:2px">${isEn?'Restored':'Восстановлено'}: ${restoredCount}/${totalRooms} ${isEn?'rooms':'комнат'}</div>`;
  html += `</div>`;

  // Rooms by floor
  for (const floor of [0, 1]) {
    const floorRooms = building.rooms.map((rm,i) => ({...rm, _idx:i})).filter(rm => rm.floorNum === floor);
    const floorLocked = floor === 1 && !floor1Done;
    const floorLabel = floor === 0 ? (isEn?'1st Floor':'1-й этаж') : (isEn?'2nd Floor':'2-й этаж');

    html += `<div style="color:var(--cyan);font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin:6px 0 3px;border-bottom:1px solid rgba(0,229,255,.15);padding-bottom:2px">${floorLabel}${floorLocked?' 🔒':''}</div>`;

    if (floorLocked) {
      html += `<div style="color:var(--text-muted);font-size:9px;padding:4px;text-align:center">${isEn?'Restore all 1st floor rooms first':'Сначала восстановите все комнаты 1-го этажа'}</div>`;
      continue;
    }

    for (const room of floorRooms) {
      const restored = room._ruinRestored;
      const costKey = room.roomType === 'corridor' ? 'corridor' : room.roomType === 'stairs' ? 'stairs' : 'room';
      const cost = ROOM_RESTORE_COST[costKey];
      const canAfford = !restored && Object.entries(cost).every(([id,qty]) => hasItem(id,qty));

      html += `<div style="display:flex;align-items:center;gap:6px;padding:4px 6px;margin-bottom:2px;border:1px solid ${restored?'var(--green-dim)':canAfford?'var(--yellow)':'var(--border)'};border-radius:3px;background:${restored?'rgba(0,255,65,.03)':'rgba(0,0,0,.2)'}">`;
      html += `<div style="flex:1;min-width:0">`;
      html += `<div style="color:${restored?'var(--green)':'var(--text)'};font-size:10px;font-weight:bold">${room.name}</div>`;

      if (restored) {
        const realRoom = building.rooms[room._idx];
        const contNames = (realRoom.containers||[]).map(c => c.name).join(', ');
        if (contNames) html += `<div style="color:var(--text-dim);font-size:8px">📦 ${contNames}</div>`;
      } else {
        const pills = Object.entries(cost).map(([id,qty]) => {
          const has = hasItem(id,qty);
          return `<span style="font-size:7px;padding:0 3px;border-radius:2px;border:1px solid ${has?'var(--green-dim)':'rgba(255,34,68,.3)'};color:${has?'var(--green)':'var(--red)'}">${ITEMS[id]?.name||id} ×${qty}</span>`;
        }).join(' ');
        html += `<div style="margin-top:2px">${pills}</div>`;
      }
      html += `</div>`;

      if (restored) {
        html += `<span style="color:var(--green);font-size:10px">✓</span>`;
      } else {
        html += `<button class="act-btn" style="flex-shrink:0;padding:3px 8px;font-size:8px;${canAfford?'border-color:var(--yellow);color:var(--yellow)':'opacity:.3'}" ${canAfford?`onclick="restoreRoom('${r.id}',${room._idx})"`:' disabled'}>${isEn?'Restore':'Строить'}</button>`;
      }
      html += `</div>`;
    }
  }

  // Upgrades (only if at least 1 room restored)
  if (restoredCount > 0) {
    html += `<div style="color:var(--cyan);font-size:9px;letter-spacing:.1em;text-transform:uppercase;margin:8px 0 3px;border-bottom:1px solid rgba(0,229,255,.15);padding-bottom:2px">${isEn?'UPGRADES':'УЛУЧШЕНИЯ'}</div>`;
    html += '<div style="display:flex;flex-direction:column;gap:2px;max-height:25vh;overflow-y:auto">';
    for (const up of RUIN_UPGRADES) {
      const installed = r.upgrades.includes(up.id);
      const reqMet = !up.requires || r.upgrades.includes(up.requires);
      const canAfford = !installed && reqMet && Object.entries(up.cost).every(([id,qty]) => hasItem(id,qty));
      const upName = isEn ? up.nameEn : up.name;

      html += `<div style="display:flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid ${installed?'var(--green-dim)':'var(--border)'};border-radius:3px">`;
      html += `<span style="font-size:12px">${up.icon}</span>`;
      html += `<div style="flex:1"><div style="color:${installed?'var(--green)':'var(--text)'};font-size:9px">${upName}</div>`;
      if (!installed) {
        const pills = Object.entries(up.cost).map(([id,qty]) => `<span style="font-size:7px;color:${hasItem(id,qty)?'var(--green)':'var(--red)'}">${ITEMS[id]?.name||id}×${qty}</span>`).join(' ');
        html += `<div>${pills}</div>`;
      }
      html += `</div>`;
      if (installed) html += `<span style="color:var(--green);font-size:8px">✓</span>`;
      else if (!reqMet) html += `<span style="color:var(--text-muted);font-size:7px">→${up.requires}</span>`;
      else html += `<button class="act-btn" style="flex-shrink:0;padding:2px 6px;font-size:7px;${canAfford?'border-color:var(--cyan);color:var(--cyan)':'opacity:.3'}" ${canAfford?`onclick="installUpgrade('${r.id}','${up.id}')"`:' disabled'}>${isEn?'Build':'Строить'}</button>`;
      html += `</div>`;
    }
    html += '</div>';
  }

  // Quick actions
  const hasWater = r.upgrades.includes('water_collector');
  const hasGarden = r.upgrades.includes('garden');
  if (hasWater || hasGarden) {
    html += `<div style="display:flex;gap:3px;margin-top:6px">`;
    if (hasWater) html += `<button class="act-btn" onclick="collectWater('${r.id}')" style="flex:1;font-size:9px">💧 ${isEn?'Water':'Вода'}</button>`;
    if (hasGarden) {
      const d = (G.player.daysSurvived||0)-(r.gardenLastHarvest||0);
      html += `<button class="act-btn" ${d>=3?`onclick="harvestGarden('${r.id}')"`:' disabled'} style="flex:1;font-size:9px;${d>=3?'':'opacity:.4'}">🌱 ${d>=3?(isEn?'Harvest':'Урожай'):(3-d)+(isEn?'d':'дн')}</button>`;
    }
    html += `</div>`;
  }

  // Storage quick access (if any storage installed)
  const hasStorage = r.upgrades.some(u => u.startsWith('storage_'));
  if (hasStorage) {
    const maxSlots = r.upgrades.includes('storage_3') ? 24 : r.upgrades.includes('storage_2') ? 12 : 6;
    html += `<div style="margin-top:6px"><button class="act-btn" onclick="showRuinStorage('${r.id}')" style="width:100%;border-color:var(--cyan);color:var(--cyan)">📦 ${isEn?'Storage':'Хранилище'} (${r.storage.length}/${maxSlots})</button></div>`;
  }

  // Enter building button (if rooms restored)
  if (restoredCount > 0) {
    html += `<div style="margin-top:4px"><button class="act-btn" onclick="closeModal();enterRestoredRoom('${r.id}')" style="width:100%;border-color:var(--green);color:var(--green)">🚪 ${isEn?'Enter building':'Войти в здание'}</button></div>`;
  }

  openModal(`🏚️ ${bName}`, html);
}

function enterRestoredRoom(ruinId) {
  const building = _findBuilding(ruinId);
  if (!building) return;
  // Find first restored room on current floor
  const floor = G.world.currentFloor || 0;
  const room = building.rooms.find(rm => rm.floorNum === floor && rm._ruinRestored);
  if (!room) return;
  const idx = building.rooms.indexOf(room);
  G.world.currentRoom = idx;
  const layout = getLocationLayout(building);
  if (layout && layout.rooms[idx]) {
    sceneData.playerX = layout.rooms[idx].cx;
    sceneData.playerY = layout.rooms[idx].cy;
    sceneData.targetCamX = layout.rooms[idx].cx;
    sceneData.targetCamY = layout.rooms[idx].cy;
    sceneData.camX = layout.rooms[idx].cx;
    sceneData.camY = layout.rooms[idx].cy;
  }
  layout?.rooms?.forEach((_,i) => sceneData.scannedRooms?.add(building.id + '-' + i));
  addLog(`Входишь в: ${room.name}`, 'info');
  updateUI();
}

function restoreRoom(ruinId, roomIdx) {
  const building = _findBuilding(ruinId);
  if (!building || !building.rooms[roomIdx]) return;
  const room = building.rooms[roomIdx];
  if (room._ruinRestored) return;
  const costKey = room.roomType==='corridor'?'corridor':room.roomType==='stairs'?'stairs':'room';
  const cost = ROOM_RESTORE_COST[costKey];
  if (!Object.entries(cost).every(([id,qty]) => hasItem(id,qty))) return;
  Object.entries(cost).forEach(([id,qty]) => removeItem(id,qty));
  room._ruinRestored = true;
  room._inspected = true;
  building.ruin.owned = true;
  calcWeight();
  addLog(`"${room.name}" восстановлена!`, 'success');
  playSound('build');
  // Clear layout cache so new rooms appear on canvas
  roomLayouts.clear();
  showRuinUI(building);
  saveGame();
}

function installUpgrade(ruinId, upgradeId) {
  const building = _findBuilding(ruinId);
  const ruin = building?.ruin;
  if (!ruin || ruin.upgrades.includes(upgradeId)) return;
  const up = RUIN_UPGRADES.find(u => u.id === upgradeId);
  if (!up || (up.requires && !ruin.upgrades.includes(up.requires))) return;
  if (!Object.entries(up.cost).every(([id,qty]) => hasItem(id,qty))) return;
  Object.entries(up.cost).forEach(([id,qty]) => removeItem(id,qty));
  ruin.upgrades.push(upgradeId);

  // Place upgrade as container in a restored room
  const targetRoom = building.rooms.find(rm => rm._ruinRestored && rm.roomType==='room')
    || building.rooms.find(rm => rm._ruinRestored);
  if (targetRoom) {
    if (up.id.startsWith('storage_')) {
      targetRoom.containers = (targetRoom.containers||[]).filter(c => !c._isStorage);
      targetRoom.containers.push({ name:up.name, icon:up.icon, loot:ruin.storage, searched:true, locked:null, _isStorage:true });
    } else {
      if (!targetRoom.containers) targetRoom.containers = [];
      targetRoom.containers.push({ name:up.name, icon:up.icon, loot:[], searched:true, locked:null });
    }
  }

  calcWeight();
  addLog(`Установлено: ${up.name}`, 'success');
  playSound('loot');
  showRuinUI(building);
  saveGame();
}

function collectWater(ruinId) {
  addItem('water', 1); calcWeight();
  addLog('Набрана бутылка воды.', 'success');
  closeModal();
}

function harvestGarden(ruinId) {
  const ruin = _findRuin(ruinId);
  if (!ruin) return;
  ruin.gardenLastHarvest = G.player.daysSurvived || 0;
  const foods = ['canned_food','bread','chips','energy_bar'];
  const food = foods[Math.floor(Math.random()*foods.length)];
  addItem(food, 2); calcWeight();
  addLog(`Урожай: ${ITEMS[food]?.name} ×2`, 'success');
  const b = _findBuilding(ruinId); if(b) showRuinUI(b);
  saveGame();
}

// ── Storage UI with drag-and-drop ──
function showRuinStorage(ruinId) {
  const ruin = _findRuin(ruinId);
  if (!ruin) return;
  const isEn = LANG?.current === 'en';
  const maxSlots = ruin.upgrades.includes('storage_3') ? 24 : ruin.upgrades.includes('storage_2') ? 12 : 6;
  const full = ruin.storage.length >= maxSlots;

  function renderItem(item, idx, source) {
    const def = ITEMS[item.id];
    if (!def) return '';
    const name = item.keyName || def.name;
    const qty = item.qty > 1 ? ' ×'+item.qty : '';
    return `<div class="stor-item" draggable="true" data-src="${source}" data-idx="${idx}"
      style="display:flex;align-items:center;gap:5px;padding:4px 6px;border:1px solid var(--border);border-radius:3px;margin-bottom:2px;cursor:grab;background:rgba(0,10,0,.4);transition:background .15s"
      ondragstart="storDragStart(event,'${source}',${idx},'${ruinId}')"
      onclick="${source==='inv'?'depositItem':'withdrawItem'}('${ruinId}',${idx})">
      ${itemIconHtml(item.id,18)}
      <span style="flex:1;font-size:9px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}${qty}</span>
      <span style="font-size:8px;color:var(--text-muted)">${source==='inv'?'→':'←'}</span>
    </div>`;
  }

  let html = `<style>
    .stor-col{flex:1;min-width:0;display:flex;flex-direction:column}
    .stor-header{font-size:9px;letter-spacing:.08em;padding:3px 6px;margin-bottom:4px;border-radius:2px}
    .stor-list{flex:1;min-height:60px;max-height:40vh;overflow-y:auto;padding:2px;border:1px dashed var(--border);border-radius:3px}
    .stor-list.drag-over{border-color:var(--cyan);background:rgba(0,229,255,.04)}
    .stor-item:active{background:rgba(0,255,65,.1)}
    .stor-item.dragging{opacity:.4}
  </style>`;

  // Weight bar
  html += `<div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:9px;color:var(--text-dim)">`;
  html += `<span>📦 ${ruin.storage.length}/${maxSlots}</span>`;
  html += `<span>🎒 ${G.player.weight}/${maxWeight()} ${t('hud.weight')}</span>`;
  html += `</div>`;

  // Two columns: Storage | Inventory
  html += `<div style="display:flex;gap:6px">`;

  // Left: Storage
  html += `<div class="stor-col">`;
  html += `<div class="stor-header" style="color:var(--cyan);background:rgba(0,229,255,.06)">${isEn?'STORAGE':'ХРАНИЛИЩЕ'}</div>`;
  html += `<div class="stor-list" id="stor-box" ondragover="storDragOver(event)" ondrop="storDrop(event,'storage','${ruinId}')">`;
  if (ruin.storage.length === 0) {
    html += `<div style="text-align:center;color:var(--text-muted);font-size:9px;padding:15px">${isEn?'Empty — drag items here':'Пусто — перетащите сюда'}</div>`;
  } else {
    ruin.storage.forEach((item, i) => { html += renderItem(item, i, 'stor'); });
  }
  html += `</div></div>`;

  // Right: Inventory
  html += `<div class="stor-col">`;
  html += `<div class="stor-header" style="color:var(--green);background:rgba(0,255,65,.06)">${isEn?'INVENTORY':'ИНВЕНТАРЬ'}</div>`;
  html += `<div class="stor-list" id="stor-inv" ondragover="storDragOver(event)" ondrop="storDrop(event,'inventory','${ruinId}')">`;
  if (G.player.inventory.length === 0) {
    html += `<div style="text-align:center;color:var(--text-muted);font-size:9px;padding:15px">${isEn?'Empty':'Пусто'}</div>`;
  } else {
    G.player.inventory.forEach((item, i) => { html += renderItem(item, i, 'inv'); });
  }
  html += `</div></div>`;

  html += `</div>`;

  // Hint
  html += `<div style="text-align:center;margin-top:4px;font-size:8px;color:var(--text-muted)">${isEn?'Drag items between columns or click to transfer':'Перетащите предметы между колонками или кликните для переноса'}</div>`;

  // Back
  html += `<div style="margin-top:6px"><button class="act-btn" onclick="showRuinUI(_findBuilding('${ruinId}'))" style="width:100%">${isEn?'← Back':'← Назад'}</button></div>`;

  openModal(`📦 ${isEn?'Storage':'Хранилище'}`, html);
}

// Drag-and-drop handlers
let _storDrag = null;

function storDragStart(e, source, idx, ruinId) {
  _storDrag = { source, idx, ruinId };
  e.dataTransfer.effectAllowed = 'move';
  e.target.classList.add('dragging');
}

function storDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}

function storDrop(e, target, ruinId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!_storDrag || _storDrag.ruinId !== ruinId) return;

  if (_storDrag.source === 'inv' && target === 'storage') {
    depositItem(ruinId, _storDrag.idx);
  } else if (_storDrag.source === 'stor' && target === 'inventory') {
    withdrawItem(ruinId, _storDrag.idx);
  }
  _storDrag = null;
}

// Remove drag-over highlight on drag leave
document.addEventListener('dragleave', e => {
  if (e.target.classList) e.target.classList.remove('drag-over');
});

function depositItem(ruinId, invIdx) {
  const ruin = _findRuin(ruinId);
  if (!ruin) return;
  const maxSlots = ruin.upgrades.includes('storage_3') ? 24 : ruin.upgrades.includes('storage_2') ? 12 : 6;
  if (ruin.storage.length >= maxSlots) { addLog('Хранилище полное!', 'warning'); return; }
  const item = G.player.inventory[invIdx];
  if (!item) return;
  ruin.storage.push({ ...item });
  G.player.inventory.splice(invIdx, 1);
  calcWeight();
  addLog(`→ Хранилище: ${ITEMS[item.id]?.name || item.id}`, 'info');
  showRuinStorage(ruinId);
  saveGame();
}

function withdrawItem(ruinId, storIdx) {
  const ruin = _findRuin(ruinId);
  if (!ruin || !ruin.storage[storIdx]) return;
  const item = ruin.storage[storIdx];
  addItem(item.id, item.qty||1, { durability:item.durability, freshDays:item.freshDays, loadedAmmo:item.loadedAmmo, insertedMag:item.insertedMag, keyId:item.keyId, keyName:item.keyName });
  ruin.storage.splice(storIdx, 1);
  calcWeight();
  addLog(`← Хранилище: ${ITEMS[item.id]?.name || item.id}`, 'info');
  showRuinStorage(ruinId);
  saveGame();
}

function _findRuin(ruinId) {
  for (const n of Object.values(G.world.nodes)) if (n.building?.ruin?.id===ruinId) return n.building.ruin;
  return null;
}
function _findBuilding(ruinId) {
  for (const n of Object.values(G.world.nodes)) if (n.building?.ruin?.id===ruinId) return n.building;
  return null;
}
