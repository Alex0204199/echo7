// ═══════════════════════════════════════════
// MULTIPLAYER LOBBY UI
// ═══════════════════════════════════════════

// ── HOST LOBBY (shown after world gen + server connect) ──
function showHostLobby() {
  const isEn = LANG?.current === 'en';
  let html = '';

  // Room code
  html += `<div style="text-align:center;margin-bottom:14px">`;
  html += `<div style="color:var(--text-dim);font-size:10px;letter-spacing:.15em;margin-bottom:8px">${isEn ? 'ROOM CODE' : 'КОД КОМНАТЫ'}</div>`;
  html += `<div id="lobby-code" style="font-size:36px;color:var(--cyan);letter-spacing:.5em;font-weight:bold;text-shadow:0 0 15px rgba(0,229,255,.5);cursor:pointer;user-select:all" onclick="navigator.clipboard?.writeText('${Net.roomCode||''}');this.style.color='var(--green)';setTimeout(()=>this.style.color='var(--cyan)',500)">${Net.roomCode || '...'}</div>`;
  html += `<div style="color:var(--text-muted);font-size:9px;margin-top:4px">${isEn ? 'Tap to copy' : 'Нажмите чтобы скопировать'}</div>`;
  html += `</div>`;

  // Tips
  html += `<div style="background:rgba(0,229,255,.03);border:1px solid rgba(0,229,255,.1);border-radius:4px;padding:6px 8px;margin-bottom:10px;font-size:9px;color:var(--text-dim)">`;
  html += `📡 ${isEn ? 'Other player' : 'Другой игрок'}: ${isEn ? 'Join → create character → enter code' : 'Подключиться → создать персонажа → ввести код'}`;
  html += `</div>`;

  // Player list
  html += `<div style="border:1px solid var(--border);border-radius:4px;padding:8px;margin-bottom:12px;min-height:60px">`;
  html += `<div style="color:var(--text-dim);font-size:9px;letter-spacing:.1em;margin-bottom:6px">${isEn ? 'PLAYERS' : 'ИГРОКИ'} (<span id="lobby-count">${Net.playerCount()}</span>/20)</div>`;
  html += `<div id="lobby-players"></div>`;
  html += `</div>`;

  // Buttons
  html += `<div style="display:flex;gap:6px">`;
  html += `<button class="act-btn" onclick="lobbyStartGame()" style="flex:2;padding:10px;border-color:var(--green);color:var(--green)">${isEn ? 'START GAME' : 'НАЧАТЬ ИГРУ'}</button>`;
  html += `<button class="act-btn" onclick="lobbyDisconnect()" style="flex:1;padding:10px;border-color:var(--red);color:var(--red)">${isEn ? 'CANCEL' : 'ОТМЕНА'}</button>`;
  html += `</div>`;

  openModal(isEn ? '📡 Host Game' : '📡 Хост игры', html);
  refreshLobbyPlayers();
}

// ── CLIENT: Code input (shown after chargen, world already created) ──
function showJoinCodeInput() {
  const isEn = LANG?.current === 'en';
  let html = '';

  html += `<div style="text-align:center;margin-bottom:16px">`;
  html += `<div style="color:var(--text-dim);font-size:10px;letter-spacing:.15em;margin-bottom:8px">${isEn ? 'ENTER ROOM CODE' : 'ВВЕДИТЕ КОД КОМНАТЫ'}</div>`;
  html += `<input id="join-code-input" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="12345678" style="width:100%;text-align:center;font-size:24px;letter-spacing:.4em;padding:12px;background:rgba(0,229,255,.05);border:1px solid var(--cyan);color:var(--cyan);font-family:monospace;border-radius:4px">`;
  html += `</div>`;

  html += `<div id="join-status" style="text-align:center;color:var(--text-dim);font-size:10px;min-height:20px;margin-bottom:8px"></div>`;

  html += `<div style="display:flex;gap:6px">`;
  html += `<button class="act-btn" id="join-btn" onclick="doJoinConnect()" style="flex:2;padding:10px;border-color:var(--cyan);color:var(--cyan)">${isEn ? 'CONNECT' : 'ПОДКЛЮЧИТЬСЯ'}</button>`;
  html += `<button class="act-btn" onclick="closeModal()" style="flex:1;padding:10px">${isEn ? 'CANCEL' : 'ОТМЕНА'}</button>`;
  html += `</div>`;

  openModal(isEn ? '📡 Join Game' : '📡 Подключиться', html);
  setTimeout(() => document.getElementById('join-code-input')?.focus(), 100);
}

// ── CLIENT: Connect to host ──
function doJoinConnect() {
  const code = document.getElementById('join-code-input')?.value?.trim();
  if (!code || code.length < 4) return;

  const status = document.getElementById('join-status');
  if (status) { status.style.color = 'var(--cyan)'; status.textContent = 'Подключение...'; }
  const btn = document.getElementById('join-btn');
  if (btn) btn.disabled = true;

  const playerName = G?.characterName || 'Player';
  Net.joinGame(code, playerName);

  // Wait for welcome from host
  const onWelcome = (msg) => {
    Bus._h['net:welcome'] = (Bus._h['net:welcome'] || []).filter(f => f !== onWelcome);
    Bus._h['net:error'] = (Bus._h['net:error'] || []).filter(f => f !== onError);
    closeModal();
    showJoinWaiting();
  };
  const onError = (data) => {
    Bus._h['net:welcome'] = (Bus._h['net:welcome'] || []).filter(f => f !== onWelcome);
    Bus._h['net:error'] = (Bus._h['net:error'] || []).filter(f => f !== onError);
    if (status) { status.style.color = 'var(--red)'; status.textContent = data.error || 'Ошибка'; }
    if (btn) btn.disabled = false;
  };
  Bus.on('net:welcome', onWelcome);
  Bus.on('net:error', onError);
}

// ── CLIENT: Waiting for host to start ──
function showJoinWaiting() {
  const isEn = LANG?.current === 'en';
  let html = '';
  html += `<div style="text-align:center;padding:20px">`;
  html += `<div style="font-size:14px;color:var(--cyan);margin-bottom:8px">✅ ${isEn ? 'Connected!' : 'Подключено!'}</div>`;
  html += `<div style="color:var(--text-dim);font-size:11px;margin-bottom:16px">${isEn ? 'Waiting for host to start...' : 'Ожидание запуска от хоста...'}</div>`;
  html += `<div id="join-player-list" style="text-align:left;border:1px solid var(--border);border-radius:4px;padding:8px;margin-bottom:12px">`;
  Object.entries(Net.players).forEach(([id, info]) => {
    const isH = id === 'host';
    html += `<div style="font-size:10px;color:${isH ? 'var(--green)' : 'var(--cyan)'};margin-bottom:2px">● ${info.name || id}${isH ? ' (HOST)' : ''}</div>`;
  });
  html += `</div>`;
  html += `<button class="act-btn" onclick="lobbyDisconnect()" style="padding:8px;border-color:var(--red);color:var(--red)">${isEn ? 'DISCONNECT' : 'ОТКЛЮЧИТЬСЯ'}</button>`;
  html += `</div>`;
  openModal(isEn ? '📡 Lobby' : '📡 Лобби', html);
}

// ── HOST: Start game ──
function lobbyStartGame() {
  if (Net.mode !== 'HOST' || !G) return;
  Net.broadcast({
    t: 'game_start',
    seed: G.seed,
    difficulty: G.difficulty,
    time: { ...G.time },
    weather: G.world.weather,
    season: G.world.season,
    temp: G.world.outsideTemp,
  });
  closeModal();
  G.lastRealTime = Date.now(); G.realTimeAccum = 0; G.paused = false;
  addLog(`📡 Мультиплеер: игра началась! Игроков: ${Net.playerCount()}`, 'success');
  playSound('scan');
  updateUI();
}

// ── CLIENT: Receive game_start ──
Bus.on('net:game_start', (msg) => {
  closeModal();
  if (!G) return;

  // Save client's chargen data before regenerating world
  const savedPlayer = JSON.parse(JSON.stringify(G.player));
  const savedName = G.characterName;
  const savedOcc = G.scenario || 'unemployed';
  const savedTraits = G.traitIds || [];

  if (msg.seed && msg.seed !== G.seed) {
    // Regenerate world with host's seed (same world for everyone)
    window._forceSeed = msg.seed;
    newGame({ name: savedName, occupation: savedOcc, traits: savedTraits, difficulty: msg.difficulty?.id || 'normal', startSeason: msg.season || 'summer', sandbox: msg.difficulty });
    setTimeout(() => {
      if (!G) return;
      // Restore chargen player data (skills, inventory from occupation/traits)
      Object.assign(G.player, { skills: savedPlayer.skills, skillXp: savedPlayer.skillXp, inventory: savedPlayer.inventory, equipment: savedPlayer.equipment, equipped: savedPlayer.equipped, weaponSlot1: savedPlayer.weaponSlot1, weaponSlot2: savedPlayer.weaponSlot2 });
      Net._applyWelcomeData();
      G.lastRealTime = Date.now(); G.realTimeAccum = 0; G.paused = false;
      calcWeight();
      addLog('📡 Мир синхронизирован. Игра началась!', 'success');
      updateUI();
    }, 5000);
  } else {
    Net._applyWelcomeData();
    G.lastRealTime = Date.now(); G.realTimeAccum = 0; G.paused = false;
    addLog('📡 Игра началась!', 'success');
    updateUI();
  }
});

// ── Disconnect ──
function lobbyDisconnect() {
  Net.disconnect();
  closeModal();
}

// ── Refresh player list in lobby ──
function refreshLobbyPlayers() {
  const el = document.getElementById('lobby-players');
  const countEl = document.getElementById('lobby-count');
  if (!el) return;
  let html = '';
  Object.entries(Net.players).forEach(([id, info]) => {
    const isH = id === Net.localId && Net.mode === 'HOST';
    html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:2px">`;
    html += `<span style="color:${isH ? 'var(--green)' : 'var(--cyan)'}">●</span>`;
    html += `<span style="color:var(--text)">${info.name || id}</span>`;
    if (isH) html += `<span style="color:var(--text-muted);font-size:8px;margin-left:auto">ХОСТ</span>`;
    html += `</div>`;
  });
  el.innerHTML = html;
  if (countEl) countEl.textContent = Net.playerCount();
}

Bus.on('net:player_join', refreshLobbyPlayers);
Bus.on('net:player_leave', refreshLobbyPlayers);
