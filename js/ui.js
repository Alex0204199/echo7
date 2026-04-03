// ═══════════════════════════════════════════
// UI UPDATE
// ═══════════════════════════════════════════
function updateUI() {
  if (!G) return;

  // Time
  document.getElementById('game-time').textContent = getTimeString();
  const period = getTimePeriod();
  const timeEl = document.getElementById('game-time');
  timeEl.style.color = period === 'night' ? 'var(--red)' : period === 'dusk' ? 'var(--yellow)' : 'var(--green)';

  // Weather display next to time
  let weatherEl = document.getElementById('weather-display');
  if (!weatherEl) {
    weatherEl = document.createElement('div');
    weatherEl.id = 'weather-display';
    weatherEl.style.cssText = 'font-size:10px;color:var(--text-dim);letter-spacing:.05em;white-space:nowrap';
    timeEl.parentElement.appendChild(weatherEl);
  }
  if (G.world.weather) {
    const season = typeof getCurrentSeason === 'function' ? getCurrentSeason() : (G.world.season || 'summer');
    weatherEl.textContent = getWeatherIcon() + ' ' + t('weather.' + G.world.weather) + ' · ' + t('season.' + season) + ' · ' + (G.world.outsideTemp || 0) + '\u00B0C';
  }

  // Unsaved indicator
  const timeSinceSave = Date.now() - (G._lastSaveTime || Date.now());
  const unsavedEl = document.getElementById('unsaved-indicator');
  if (timeSinceSave > 600000) {
    if (!unsavedEl) {
      const ti = document.getElementById('game-time');
      if (ti) {
        const ind = document.createElement('span');
        ind.id = 'unsaved-indicator';
        ind.textContent = ' ' + t('hud.unsaved');
        ind.style.cssText = 'color:var(--red);font-size:9px;animation:blink 1s infinite';
        ti.appendChild(ind);
      }
    }
  } else if (unsavedEl) unsavedEl.remove();

  // Dynamic page title
  if (G?.world?.currentNodeId) {
    const cn = G.world.nodes[G.world.currentNodeId];
    document.title = `ECHO-7 | День ${G.player.daysSurvived} | ${cn?.name || cn?.building?.name || 'Мир'}`;
  }

  // Weight
  document.getElementById('weight-display').textContent = `${G.player.weight}/${maxWeight()} ${t('hud.weight')}`;
  document.getElementById('weight-display').style.color = isEncumbered() ? 'var(--red)' : 'var(--text-dim)';

  // HP bar
  const hpBar = document.getElementById('hp-bar');
  const avgHp = getTotalHp();
  hpBar.innerHTML = '';
  if (!G._prevHpSegs) G._prevHpSegs = 10;
  const newSegs = Math.ceil(avgHp / 10);
  const hpChanged = newSegs !== G._prevHpSegs;
  const _oldHpSegs = G._prevHpSegs;
  G._prevHpSegs = newSegs;
  for (let i = 0; i < 10; i++) {
    const seg = document.createElement('div');
    seg.className = 'hp-seg';
    const threshold = i * 10;
    if (avgHp <= threshold) seg.classList.add('dead');
    else if (avgHp < threshold + 15) seg.classList.add('critical');
    else if (avgHp < threshold + 30) seg.classList.add('damaged');
    hpBar.appendChild(seg);
    if (hpChanged && i >= newSegs && i < _oldHpSegs + 1) {
      seg.style.animation = 'hpFlash .3s';
    }
  }

  // Noise indicator (left side)
  const noiseVal = Math.round(G.player.moodles.noise);
  const noiseFill = document.getElementById('noise-bar-fill');
  const noiseNum = document.getElementById('noise-value');
  if (noiseFill) {
    noiseFill.style.height = noiseVal + '%';
    noiseFill.style.background = noiseVal > 70 ? 'var(--red)' : noiseVal > 40 ? '#ff8800' : noiseVal > 15 ? 'var(--yellow)' : 'var(--green)';
  }
  if (noiseNum) noiseNum.textContent = noiseVal;

  // Health status label
  const healthStatusEl = document.getElementById('health-status');
  if (healthStatusEl) {
    let hLabel, hColor;
    if (avgHp >= 100) { hLabel = t('hp.excellent'); hColor = 'var(--green)'; }
    else if (avgHp >= 90) { hLabel = t('hp.minor'); hColor = '#88cc88'; }
    else if (avgHp >= 80) { hLabel = t('hp.minor'); hColor = '#88cc44'; }
    else if (avgHp >= 70) { hLabel = t('hp.light'); hColor = 'var(--yellow)'; }
    else if (avgHp >= 60) { hLabel = t('hp.moderate'); hColor = '#ccaa00'; }
    else if (avgHp >= 50) { hLabel = t('hp.severe'); hColor = '#ff8800'; }
    else if (avgHp >= 40) { hLabel = t('hp.vsevere'); hColor = '#ff6600'; }
    else if (avgHp >= 20) { hLabel = t('hp.critical'); hColor = 'var(--red)'; }
    else if (avgHp >= 10) { hLabel = t('hp.vcritical'); hColor = '#cc0033'; }
    else { hLabel = t('hp.lethal'); hColor = '#ff0044'; }
    healthStatusEl.textContent = hLabel;
    healthStatusEl.style.color = hColor;
    healthStatusEl.style.borderColor = hColor;
  }

  // Moodles
  const moodlesEl = document.getElementById('moodles');
  moodlesEl.innerHTML = '';
  const moodleConfig = [
    { key:'hunger', uiIcon:'moodle_hunger', name: t('mood.hunger') },
    { key:'thirst', uiIcon:'moodle_thirst', name: t('mood.thirst') },
    { key:'fatigue', uiIcon:'moodle_fatigue', name: t('mood.fatigue') },
    { key:'depression', uiIcon:'moodle_depression', name: t('mood.depression') },
    { key:'infection', uiIcon:'moodle_infection', name: t('mood.infection') },
    { key:'pain', uiIcon:'moodle_pain', name: t('mood.pain') },
    { key:'panic', uiIcon:'moodle_panic', name: t('mood.panic') },
  ];

  moodleConfig.forEach(mc => {
    const val = G.player.moodles[mc.key];
    const level = getMoodleLevel(val);
    if (level === 'ok') return;
    const div = document.createElement('div');
    div.className = `moodle ${level}`;
    div.innerHTML = `${uiIconHtml(mc.uiIcon,14)} ${mc.name}`;
    moodlesEl.appendChild(div);
  });
  if (G.player.moodles.bleeding > 0) {
    const div = document.createElement('div');
    div.className = 'moodle critical';
    div.innerHTML = `${uiIconHtml('moodle_pain',14)} ${t('mood.bleeding')}`;
    moodlesEl.appendChild(div);
  }

  // Temperature moodle
  const bt = G.player.moodles.bodyTemp || 36.6;
  if (typeof getTemperatureStatus === 'function' && (bt < 35.5 || bt > 37.5)) {
    const tempStatus = getTemperatureStatus();
    const div = document.createElement('div');
    if (bt < 33 || bt > 42) div.className = 'moodle critical';
    else if (bt < 35 || bt > 40) div.className = 'moodle severe';
    else div.className = 'moodle warning';
    div.style.borderColor = tempStatus.color;
    div.style.color = tempStatus.color;
    div.textContent = tempStatus.icon + ' ' + t(tempStatus.key);
    moodlesEl.appendChild(div);
  }

  // Wetness moodle
  if (typeof getWetnessStatus === 'function' && G.player.moodles.wetness > 20) {
    const wetStatus = getWetnessStatus();
    const div = document.createElement('div');
    div.className = 'moodle';
    if (G.player.moodles.wetness >= 80) div.className = 'moodle severe';
    else if (G.player.moodles.wetness >= 50) div.className = 'moodle warning';
    div.style.borderColor = wetStatus.color;
    div.style.color = wetStatus.color;
    div.textContent = wetStatus.icon + ' ' + t(wetStatus.key);
    moodlesEl.appendChild(div);
  }

  // Illness moodle
  if (G.player.moodles.illness > 0) {
    const div = document.createElement('div');
    div.className = G.player.moodles.illness > 50 ? 'moodle severe' : 'moodle warning';
    div.style.borderColor = '#ff6600';
    div.style.color = '#ff6600';
    div.textContent = '\uD83E\uDD12 ' + t('mood.illness');
    moodlesEl.appendChild(div);
  }
  if (G.player.stealthMode) {
    const div = document.createElement('div');
    div.className = 'moodle';
    div.style.borderColor = 'var(--cyan)';
    div.style.color = 'var(--cyan)';
    div.textContent = '👁 Скрытность';
    moodlesEl.appendChild(div);
  }
  if (isEncumbered()) {
    const div = document.createElement('div');
    div.className = 'moodle severe';
    div.textContent = '⚖ Перегруз';
    moodlesEl.appendChild(div);
  }

  // Route progress indicator
  let routeEl = document.getElementById('route-indicator');
  if (!routeEl) {
    routeEl = document.createElement('div');
    routeEl.id = 'route-indicator';
    routeEl.style.cssText = 'font-size:10px;padding:4px 8px;margin:4px 0;border-radius:3px;display:none';
    const moodlesParent = moodlesEl.parentElement;
    if (moodlesParent) moodlesParent.insertBefore(routeEl, moodlesEl.nextSibling);
  }
  if (G.world.currentRoute) {
    const rt = G.world.currentRoute;
    const progress = rt.currentStep / Math.max(1, rt.path.length - 1);
    const pct = Math.round(progress * 100);
    const dest = G.world.nodes[rt.destinationId];
    const destNt = dest ? NODE_TYPES[dest.type] : null;
    const destName = dest ? (dest.name || destNt?.name || '???') : '???';
    routeEl.style.display = '';
    routeEl.style.border = `1px solid ${rt.paused ? 'var(--yellow)' : 'var(--cyan)'}`;
    routeEl.style.color = rt.paused ? 'var(--yellow)' : 'var(--cyan)';
    routeEl.innerHTML = `${rt.paused ? '⏸' : '►'} ${destName} · ${rt.currentStep}/${rt.path.length - 1} (${pct}%)`
      + `<div style="height:3px;background:rgba(0,0,0,.5);margin-top:3px;border-radius:2px"><div style="height:100%;width:${pct}%;background:${rt.paused ? 'var(--yellow)' : 'var(--cyan)'};border-radius:2px"></div></div>`;
  } else {
    routeEl.style.display = 'none';
  }

  // Current node info
  const _curNode = currentNode();
  if (_curNode) {
    const _nt = NODE_TYPES[_curNode.type] || {};
    const _nodeName = _curNode.name || _nt.name || '';
    const _reg = WORLD_CONFIG.regions.find(r => r.id === _curNode.regionId);
    const nodeInfoEl = document.getElementById('game-time');
    if (nodeInfoEl && nodeInfoEl.parentElement) {
      let locLabel = document.getElementById('node-location-label');
      if (!locLabel) {
        locLabel = document.createElement('div');
        locLabel.id = 'node-location-label';
        locLabel.style.cssText = 'font-size:9px;color:var(--text-dim);letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px';
        nodeInfoEl.parentElement.appendChild(locLabel);
      }
      locLabel.textContent = `${_reg ? _reg.name : ''} · ${_nodeName}`;
    }
  }

  // Actions
  const actionsEl = document.getElementById('actions');
  const loc = currentLocation();
  const isBase = G.world.homeBase === loc?.id;

  const node = currentNode();
  const inBuilding = !!(node && node.type === 'building' && node.building);
  const isLootableNode = node && node.type !== 'building' && (NODE_TYPES[node.type]?.lootable || node.isAirdrop);
  const isSpecialBuilding = loc?.isTraderShop || loc?.isRuin;
  const canSearch = G.world.currentRoom >= 0 || (isLootableNode && !node.searched) || isSpecialBuilding;
  const hasRoute = !!G.world.currentRoute;

  // Check if player is on stairs (can go up/down)
  const curRoom = G.world.currentRoom >= 0 && loc?.rooms?.[G.world.currentRoom];
  const onStairs = curRoom && curRoom.roomType === 'stairs';
  const curFloor = G.world.currentFloor || 0;
  const hasSecondFloor = loc?.hasSecondFloor;
  const canGoUp = onStairs && curFloor === 0 && hasSecondFloor;
  const canGoDown = onStairs && curFloor === 1;

  const actions = [
    { id:'search', uiIcon:'hud_search', label: loc?.isRuin ? (LANG.current==='en'?'BUILD':'СТРОИТЬ') : loc?.isTraderShop ? (LANG.current==='en'?'TRADE':'ТОРГОВЛЯ') : t('act.search'), show: canSearch },
    // Floor buttons moved to canvas overlay (see updateFloorButtons)
    { id:'move', uiIcon:'hud_rooms', label: t('act.rooms'), show: inBuilding },
    { id:'travel', uiIcon:'hud_travel', label: hasRoute ? 'Маршрут' : t('act.travel'), show: true },
    // Scout moved to Map menu
    { id:'stealth', uiIcon:'hud_stealth', label: G.player.stealthMode ? t('act.stealth')+'ON' : t('act.stealth'), show: true, cls: G.player.stealthMode ? 'stealth-on' : '' },
    { id:'rest', uiIcon:'hud_rest', label: t('act.rest'), show: G.world.currentRoom >= 0 },
    { id:'inventory', uiIcon:'hud_inventory', label: t('act.inventory'), show: true },
    { id:'health', uiIcon:'hud_health', label: t('act.health'), show: true },
    { id:'craft', uiIcon:'hud_craft', label: t('act.craft'), show: true },
    { id:'base', uiIcon:'hud_base', label: isBase ? 'База' : t('act.base'), show: (inBuilding && G.world.currentRoom >= 0) || isBase },
    { id:'radio', uiIcon:'hud_radio', label: LANG.current==='en'?'RADIO':'РАЦИЯ', show: hasItem('radio') },
    { id:'map', uiIcon:'hud_map', label: t('act.map'), show: true },
    { id:'save', uiIcon:'hud_save', label: t('act.save'), show: true },
  ];

  actionsEl.innerHTML = '';
  actions.forEach(a => {
    if (!a.show) return;
    const btn = document.createElement('button');
    btn.className = `act-btn ${a.cls || ''}`;
    btn.innerHTML = `${uiIconHtml(a.uiIcon,22)}${a.label}`;
    btn.onclick = () => { ensureAudio(); doAction(a.id); };
    if (!G.player.alive) btn.disabled = true;
    actionsEl.appendChild(btn);
  });

  // Multiplayer: floating buttons on canvas (not in action bar)
  if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE') {
    let mpBtns = document.getElementById('mp-canvas-btns');
    if (!mpBtns) {
      mpBtns = document.createElement('div');
      mpBtns.id = 'mp-canvas-btns';
      mpBtns.style.cssText = 'position:absolute;bottom:8px;right:8px;z-index:15;display:flex;flex-direction:column;gap:4px';
      document.getElementById('canvas-wrap')?.appendChild(mpBtns);
    }
    mpBtns.innerHTML = `
      <button onclick="toggleEmoteMenu()" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(0,229,255,.3);background:rgba(0,10,0,.8);color:var(--cyan);font-size:16px;cursor:pointer">😀</button>
      <button onclick="showSocialMenu()" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(0,229,255,.3);background:rgba(0,10,0,.8);color:var(--cyan);font-size:16px;cursor:pointer">🤝</button>
    `;
    if (window._party?.members?.length > 1) {
      mpBtns.innerHTML += `<button onclick="leaveParty()" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,34,68,.3);background:rgba(0,10,0,.8);color:var(--red);font-size:12px;cursor:pointer;font-family:monospace" title="Покинуть группу">✕👥</button>`;
    }
    // Follow cancel buttons
    if (typeof _followTarget !== 'undefined' && _followTarget) {
      mpBtns.innerHTML += `<button onclick="stopFollow()" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,34,68,.3);background:rgba(0,10,0,.8);color:var(--red);font-size:11px;cursor:pointer" title="Перестать следовать">✕👣</button>`;
    }
    if (typeof _follower !== 'undefined' && _follower) {
      mpBtns.innerHTML += `<button onclick="kickFollower()" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,140,0,.3);background:rgba(0,10,0,.8);color:#ff8c00;font-size:11px;cursor:pointer" title="Отменить следование">🚫👣</button>`;
    }
  }

  if (G.creative) {
    // Add creative panel button
    const cBtn = document.createElement('button');
    cBtn.className = 'act-btn';
    cBtn.style.borderColor = 'var(--cyan)';
    cBtn.style.color = 'var(--cyan)';
    cBtn.innerHTML = '<span style="font-size:20px">☆</span>';
    cBtn.onclick = () => showCreativePanel();
    actionsEl.appendChild(cBtn);
  }
  updateQuickSlots();

  // Floor change buttons on canvas
  const floorBtns = document.getElementById('floor-btns');
  const btnUp = document.getElementById('btn-floor-up');
  const btnDown = document.getElementById('btn-floor-down');
  if (floorBtns && btnUp && btnDown) {
    if (canGoUp || canGoDown) {
      floorBtns.style.display = 'flex';
      btnUp.style.display = canGoUp ? '' : 'none';
      btnDown.style.display = canGoDown ? '' : 'none';
    } else {
      floorBtns.style.display = 'none';
    }
  }

  // Multiplayer status indicator
  if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE') {
    let mpEl = document.getElementById('mp-status');
    if (!mpEl) {
      mpEl = document.createElement('div');
      mpEl.id = 'mp-status';
      mpEl.style.cssText = 'position:absolute;top:36px;left:6px;z-index:10;font-size:9px;font-family:monospace;pointer-events:none';
      document.getElementById('canvas-wrap')?.appendChild(mpEl);
    }
    const count = Net.playerCount();
    const isHost = Net.mode === 'HOST';
    const pingMs = Net.ping || 0;
    const pingColor = pingMs < 100 ? 'var(--green)' : pingMs < 300 ? 'var(--yellow)' : 'var(--red)';
    mpEl.innerHTML = `<span style="color:var(--cyan);opacity:.6">📡 ${isHost ? 'HOST' : 'CLIENT'} · ${count} ${count === 1 ? 'игрок' : 'игроков'}</span>${pingMs > 0 ? ` <span style="color:${pingColor};opacity:.5">${pingMs}ms</span>` : ''}`;

    // Party HUD — full panel with names, status, HP
    if (window._party?.members?.length > 1) {
      let partyHtml = '<div style="margin-top:3px;border-top:1px solid rgba(0,229,255,.15);padding-top:2px">';
      partyHtml += '<div style="color:rgba(0,229,255,.4);font-size:7px;letter-spacing:.1em;margin-bottom:1px">👥 ГРУППА</div>';
      window._party.members.forEach(pid => {
        if (pid === Net.localId) return;
        const pInfo = Net.players[pid];
        if (!pInfo) return;
        const intro = typeof _introductions !== 'undefined' ? _introductions[pid] : null;
        const name = intro?.name || pInfo.name || '???';
        const sameNode = pInfo.nodeId === G?.world?.currentNodeId;
        const status = pInfo.status || '';
        const statusIcons = { '⚔':'В бою', '🔍':'Обыск', '🥷':'Тихо', '🏃':'В пути' };
        partyHtml += `<div style="display:flex;align-items:center;gap:3px;margin-top:1px;opacity:${sameNode?'0.9':'0.4'}">`;
        partyHtml += `<span style="color:${sameNode?'var(--green)':'var(--text-muted)'};font-size:6px">●</span>`;
        partyHtml += `<span style="color:var(--text-dim);font-size:8px;flex:1">${name}</span>`;
        if (status) partyHtml += `<span style="font-size:8px" title="${statusIcons[status]||''}">${status}</span>`;
        partyHtml += `</div>`;
      });
      partyHtml += '</div>';
      mpEl.innerHTML += partyHtml;
    }
    // Also show followers
    if (typeof _followTarget !== 'undefined' && _followTarget) {
      const fName = Net.players[_followTarget]?.name || '???';
      mpEl.innerHTML += `<div style="font-size:7px;color:rgba(0,229,255,.4);margin-top:2px">👣 → ${fName}</div>`;
    }
    if (typeof _follower !== 'undefined' && _follower) {
      const fName = Net.players[_follower]?.name || '???';
      mpEl.innerHTML += `<div style="font-size:7px;color:rgba(0,229,255,.4);margin-top:2px">👣 ${fName} → вы</div>`;
    }
  }

  // Check achievements every UI update
  if (typeof checkAchievements === 'function') checkAchievements();
  // Ambient sounds (rain etc)
  if (typeof updateAmbientSounds === 'function') updateAmbientSounds();
  // Visual effects (heartbeat, frost, rain drops)
  if (typeof updateEffects === 'function') updateEffects();
}

// ── LOG ──
function addLog(text, cls = '') {
  const log = document.getElementById('log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${cls}`;
  const ts = G ? `<span class="ts">${getTimeString()}</span>` : '';
  entry.innerHTML = ts + text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;

  // Keep log manageable
  while (log.children.length > 100) log.removeChild(log.firstChild);
}

// ── MODAL (with stack for nested modals, max depth 3) ──
let _modalStack = [];

function openModal(title, html, modalType) {
  const overlay = document.getElementById('modal-overlay');
  const curType = document.getElementById('modal')?.className || '';
  // Don't push to stack if same modal type is refreshing itself
  const sameType = modalType && curType.includes(modalType);
  if (overlay?.classList.contains('active') && _modalStack.length < 3 && !sameType) {
    _modalStack.push({
      title: document.getElementById('modal-title').textContent,
      html: document.getElementById('modal-body').innerHTML,
      type: curType,
    });
  }
  const modal = document.getElementById('modal');
  modal.className = modalType ? 'modal-' + modalType : '';
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  overlay.classList.add('active');
  document.getElementById('modal-close').style.display = '';
}

// Replace current modal without pushing to stack (same-level navigation)
function replaceModal(title, html, modalType) {
  const modal = document.getElementById('modal');
  modal.className = modalType ? 'modal-' + modalType : '';
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById('modal-close').style.display = '';
}

function closeModal() {
  if (_modalStack.length > 0) {
    const prev = _modalStack.pop();
    const modal = document.getElementById('modal');
    modal.className = prev.type || '';
    document.getElementById('modal-title').textContent = prev.title;
    document.getElementById('modal-body').innerHTML = prev.html;
    document.getElementById('modal-close').style.display = '';
    return;
  }
  _modalStack = [];
  document.getElementById('modal-overlay').classList.remove('active');
  if (G) G._zombieLoot = null;
  // Reset modal flex overrides (set by map)
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  if (modal) { modal.className = ''; modal.style.display = ''; modal.style.flexDirection = ''; modal.style.overflow = ''; }
  if (modalBody) { modalBody.style.flex = ''; modalBody.style.overflow = ''; modalBody.style.padding = ''; }
  // Stop map animation loop
  if (mapState && mapState.animFrame) {
    cancelAnimationFrame(mapState.animFrame);
    mapState.animFrame = null;
  }
  // If player exited building (currentRoom === -1), put them back in entry room
  if (G && G.world.currentRoom === -1) {
    const loc = currentLocation();
    if (loc) {
      roomLayouts.clear();
      const layout = getLocationLayout(loc);
      if (layout) {
        const entryIdx = layout.rooms.findIndex(r => r.floorNum === 0);
        if (entryIdx >= 0) {
          G.world.currentRoom = entryIdx;
          const er = layout.rooms[entryIdx];
          sceneData.playerX = er.cx; sceneData.playerY = er.cy;
          sceneData.camX = er.cx; sceneData.camY = er.cy;
          sceneData.targetCamX = er.cx; sceneData.targetCamY = er.cy;
        }
      }
    }
  }
}

