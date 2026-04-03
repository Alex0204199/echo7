// ═══════════════════════════════════════════
// MULTIPLAYER NETWORKING (WebSocket Relay)
// ═══════════════════════════════════════════

const RELAY_SERVER = 'wss://echo7-signal.onrender.com';

// ── Session persistence ──
function saveMPSession(data) {
  try {
    const sessions = JSON.parse(localStorage.getItem('echo7_sessions') || '[]');
    const idx = sessions.findIndex(s => s.roomCode === data.roomCode);
    const entry = {
      roomCode: data.roomCode,
      hostName: data.hostName || 'Host',
      seed: data.seed || 0,
      playerId: data.playerId || null,
      characterName: data.characterName || 'Player',
      occupation: data.occupation || 'unemployed',
      traitIds: data.traitIds || [],
      timestamp: data.timestamp || Date.now(),
      lastActive: Date.now(),
    };
    if (idx >= 0) sessions[idx] = entry;
    else sessions.unshift(entry);
    // Keep last 20 sessions
    localStorage.setItem('echo7_sessions', JSON.stringify(sessions.slice(0, 20)));
  } catch(e) {}
}

function loadMPSessions() {
  try { return JSON.parse(localStorage.getItem('echo7_sessions') || '[]'); } catch(e) { return []; }
}

function removeMPSession(roomCode) {
  try {
    const sessions = loadMPSessions().filter(s => s.roomCode !== roomCode);
    localStorage.setItem('echo7_sessions', JSON.stringify(sessions));
  } catch(e) {}
}

const Net = {
  mode: 'OFFLINE',      // 'OFFLINE' | 'HOST' | 'CLIENT'
  ws: null,             // WebSocket connection
  localId: 'local',
  players: {},
  roomCode: null,
  _lastPosSend: 0,
  _posInterval: 100,
  _timeSyncInterval: null,
  _worldSyncInterval: null,
  _dirtyNodes: new Set(),

  _genCode() {
    let code = '';
    for (let i = 0; i < 8; i++) code += Math.floor(Math.random() * 10);
    return code;
  },

  // ── HOST ──
  hostGame(playerName) {
    this.roomCode = this._genCode();
    this.localId = 'host';
    this.mode = 'HOST';

    this.ws = new WebSocket(RELAY_SERVER);
    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({ t: 'host', code: this.roomCode, name: playerName }));
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'hosted') {
        this.players[this.localId] = { name: playerName, nodeId: null, roomIdx: -1, x: 0, y: 0, dir: 2 };
        this._timeSyncInterval = setInterval(() => this._broadcastTime(), 5000);
        this._worldSyncInterval = setInterval(() => this._broadcastWorldDelta(), 30000);
        this._startPing();
        saveMPSession({ roomCode: this.roomCode, hostName: playerName, seed: G?.seed, playerId: 'host', characterName: playerName });
        Bus.emit('net:host_ready', { roomCode: this.roomCode });
      }
      if (msg.t === 'join') this._onPlayerJoin(msg.id, msg);
      if (msg.t === 'fromclient') this._handleMessage(msg.id, msg.data);
      if (msg.t === 'leave') this._onPlayerDisconnect(msg.id);
      if (msg.t === 'error') Bus.emit('net:error', { error: msg.error });
    };
    this.ws.onerror = () => Bus.emit('net:error', { error: 'Ошибка WebSocket' });
    this.ws.onclose = () => { if (this.mode === 'HOST') { this.mode = 'OFFLINE'; } };
  },

  // ── CLIENT ──
  joinGame(roomCode, playerName) {
    this.mode = 'CLIENT';
    this.roomCode = roomCode;
    this._playerName = playerName;

    this.ws = new WebSocket(RELAY_SERVER);
    this._connectTimeout = setTimeout(() => {
      Bus.emit('net:error', { error: 'Таймаут подключения (15с)' });
      this.disconnect();
    }, 15000);

    this.ws.onopen = () => {
      // Send playerId if reconnecting (server will recognize)
      const existingSession = loadMPSessions().find(s => s.roomCode === roomCode);
      this.ws.send(JSON.stringify({ t: 'join', code: roomCode, name: playerName, playerId: existingSession?.playerId || null }));
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.t === 'joined') {
        clearTimeout(this._connectTimeout);
        this.localId = msg.id;
        console.log('[NET] Joined room as', msg.id);
      }
      if (msg.t === 'fromhost') this._handleMessage('host', msg.data);
      if (msg.t === 'error') {
        clearTimeout(this._connectTimeout);
        Bus.emit('net:error', { error: msg.error });
      }
    };
    this.ws.onerror = () => {
      clearTimeout(this._connectTimeout);
      Bus.emit('net:error', { error: 'Ошибка WebSocket. Проверьте интернет.' });
    };
    this.ws.onclose = () => {
      if (this.mode === 'CLIENT' && !this._intentionalDisconnect) {
        // Auto-reconnect attempt
        this._reconnectAttempts = (this._reconnectAttempts || 0) + 1;
        if (this._reconnectAttempts <= 3) {
          addLog(`📡 Соединение потеряно. Переподключение (${this._reconnectAttempts}/3)...`, 'warning');
          setTimeout(() => {
            if (this.mode === 'CLIENT') this.joinGame(this.roomCode, this._playerName || 'Player');
          }, 2000 * this._reconnectAttempts);
        } else {
          this._reconnectAttempts = 0;
          Bus.emit('net:host_disconnected', {});
        }
      }
    };
  },

  // ── Send to host (client) or to specific client (host) ──
  send(idOrNull, msg) {
    if (!this.ws || this.ws.readyState !== 1) return;
    if (this.mode === 'HOST') {
      this.ws.send(JSON.stringify({ t: 'toclient', id: idOrNull, data: msg }));
    } else {
      this.ws.send(JSON.stringify({ t: 'tohost', data: msg }));
    }
  },

  broadcast(msg) {
    if (!this.ws || this.ws.readyState !== 1 || this.mode !== 'HOST') return;
    this.ws.send(JSON.stringify({ t: 'broadcast', data: msg }));
  },

  sendPosition(x, y, dir, nodeId, roomIdx, status) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const now = Date.now();
    if (now - this._lastPosSend < this._posInterval) return;
    this._lastPosSend = now;
    const msg = { t: 'p', x: +x.toFixed(4), y: +y.toFixed(4), d: dir, n: nodeId, r: roomIdx };
    if (status) msg.s = status;
    if (this.mode === 'HOST') {
      if (!this.players[this.localId]) return; // not ready yet
      const _cw = (typeof canvas !== 'undefined' && canvas) ? canvas.width / window.devicePixelRatio : 400;
      const _ch = (typeof canvas !== 'undefined' && canvas) ? canvas.height / window.devicePixelRatio : 400;
      this.players[this.localId].x = x * _cw;
      this.players[this.localId].y = y * _ch;
      this.players[this.localId].dir = dir;
      this.players[this.localId].nodeId = nodeId;
      this.players[this.localId].roomIdx = roomIdx;
      this.broadcast({ ...msg, id: this.localId });
    } else if (this.mode === 'CLIENT') {
      this.send(null, msg);
    }
  },

  // ── Message router ──
  _handleMessage(senderId, msg) {
    if (!msg || !msg.t) return;
    switch (msg.t) {
      case 'J': // Welcome (client receives)
        if (this.mode === 'CLIENT') this._onWelcome(msg);
        break;
      case 'p': // Position
        this._onPositionUpdate(senderId, msg);
        break;
      case 'T': // Time sync
        if (this.mode === 'CLIENT' && G) {
          G.time.day = msg.day; G.time.hour = msg.hour; G.time.minute = msg.min;
          G.world.weather = msg.weather; G.world.season = msg.season; G.world.outsideTemp = msg.temp;
        }
        break;
      case 'W': // World delta
        if (this.mode === 'CLIENT' && G && msg.nodes) {
          Object.entries(msg.nodes).forEach(([nid, data]) => {
            const node = G.world.nodes[nid];
            if (node) Object.assign(node, data);
          });
        }
        break;
      case 'player_join':
        this.players[msg.id] = msg.player;
        sceneData.remotePlayers[msg.id] = { ...msg.player, color: '#00E5FF' };
        addLog(`📡 ${msg.player.name} присоединился`, 'success');
        Bus.emit('net:player_join', msg);
        break;
      case 'ping':
        // Respond with pong
        if (this.mode === 'HOST') this.send(senderId, { t:'pong', ts: msg.ts });
        else this.send(null, { t:'pong', ts: msg.ts });
        break;
      case 'pong':
        this.ping = Date.now() - (msg.ts || 0);
        break;
      case 'emote':
        if (msg.id && msg.id !== this.localId && sceneData.remotePlayers[msg.id]) {
          sceneData.remotePlayers[msg.id].emote = msg.emote;
          sceneData.remotePlayers[msg.id].emoteTime = Date.now();
        }
        if (this.mode === 'HOST') this.broadcast(msg);
        break;
      case 'player_leave':
        delete this.players[msg.id];
        delete sceneData.remotePlayers[msg.id];
        addLog(`📡 ${msg.name} отключился`, 'warning');
        Bus.emit('net:player_leave', msg);
        break;
      case 'host_disconnected':
        Bus.emit('net:host_disconnected', {});
        this.disconnect();
        break;
      case 'game_start':
        if (this.mode === 'CLIENT') Bus.emit('net:game_start', msg);
        break;
      case 'e':
        this._onGameEvent(senderId, msg);
        break;
      case 'chat':
        addLog(`💬 ${msg.name}: ${msg.text}`, 'info');
        if (this.mode === 'HOST') this.broadcast(msg);
        break;
    }
  },

  _onPlayerJoin(playerId, msg) {
    const playerInfo = { name: msg.name, nodeId: null, roomIdx: -1, x: 0, y: 0, dir: 2 };
    this.players[playerId] = playerInfo;
    if (G) {
      G.players[playerId] = {
        hp:{head:100,torso:100,armL:100,armR:100,legL:100,legR:100},
        moodles:{hunger:0,thirst:0,fatigue:0,noise:0,infection:0,bleeding:0,pain:0,panic:0,depression:0,bodyTemp:36.6,wetness:0,illness:0},
        equipment:{head:null,face:null,torso:null,armor:null,rig:null,gloves:null,legs:null,feet:null,back:null},
        skills:{strength:0,stealth:0,scouting:0,firstAid:0,mechanics:0,cooking:0,lockpicking:0,firearms:0},
        skillXp:{strength:0,stealth:0,scouting:0,firstAid:0,mechanics:0,cooking:0,lockpicking:0,firearms:0},
        inventory:[{id:'water',qty:1,durability:0,freshDays:999}],
        equipped:'fist',weaponSlot1:null,weaponSlot2:null,activeSlot:1,
        stealthMode:false,weight:0,alive:true,daysSurvived:0,quickSlots:[null,null,null],
      };
    }
    // Build world delta
    const worldDelta = {};
    if (G?.world?.nodes) {
      Object.entries(G.world.nodes).forEach(([nid, n]) => {
        const c = {};
        if (n.searched) c.searched = true;
        if (n.visited) c.visited = true;
        if (Object.keys(c).length) worldDelta[nid] = c;
      });
    }
    let spawnId = null;
    if (G?.world?.nodes) {
      const gate = Object.values(G.world.nodes).find(n => n.type === 'npc_gate');
      spawnId = gate?.id || G.world.currentNodeId;
    }
    this.send(playerId, {
      t:'J', id:playerId, seed:G?.seed, difficulty:G?.difficulty,
      time:G?{...G.time}:{day:1,hour:8,minute:0},
      weather:G?.world?.weather||'clear', season:G?.world?.season||'summer', temp:G?.world?.outsideTemp||20,
      players:{...this.players}, spawnNodeId:spawnId, worldDelta,
    });
    sceneData.remotePlayers[playerId] = { ...playerInfo, color: '#00E5FF' };
    this.broadcast({ t:'player_join', id:playerId, player:playerInfo });
    addLog(`📡 ${msg.name} присоединился`, 'success');
    Bus.emit('net:player_join', { id: playerId, player: playerInfo });
  },

  _onWelcome(msg) {
    this.localId = msg.id;
    console.log('[NET] Welcome! ID:', msg.id);
    Object.entries(msg.players).forEach(([id, info]) => {
      this.players[id] = info;
      if (id !== this.localId) sceneData.remotePlayers[id] = { ...info, color: '#00E5FF' };
    });
    this._welcomeData = msg;
    // Save session
    saveMPSession({
      roomCode: this.roomCode,
      hostName: msg.players?.host?.name || 'Host',
      seed: msg.seed,
      playerId: this.localId,
      characterName: G?.characterName || this._playerName || 'Player',
      occupation: G?.scenario,
      traitIds: G?.traitIds,
    });
    Bus.emit('net:welcome', msg);

    // Auto-enter: if client has a game with different seed, regenerate world
    if (G && msg.seed && msg.seed !== G.seed) {
      closeModal();
      const saved = JSON.parse(JSON.stringify(G.player));
      window._forceSeed = msg.seed;
      newGame({ name: G.characterName, occupation: G.scenario || 'unemployed', traits: G.traitIds || [], difficulty: msg.difficulty?.id || 'normal', startSeason: msg.season || 'summer', sandbox: msg.difficulty });
      setTimeout(() => {
        if (G) {
          Object.assign(G.player, { skills: saved.skills, skillXp: saved.skillXp, inventory: saved.inventory, equipment: saved.equipment, equipped: saved.equipped, weaponSlot1: saved.weaponSlot1, weaponSlot2: saved.weaponSlot2 });
          this._applyWelcomeData();
          if (typeof calcWeight === 'function') calcWeight();
          G.lastRealTime = Date.now(); G.realTimeAccum = 0; G.paused = false;
          addLog('📡 Подключено! Мир синхронизирован.', 'success');
          updateUI();
        }
      }, 5000);
    } else if (G) {
      // Same seed — just apply
      closeModal();
      this._applyWelcomeData();
      G.lastRealTime = Date.now(); G.realTimeAccum = 0; G.paused = false;
      addLog('📡 Подключено к серверу!', 'success');
      updateUI();
    }
  },

  // Apply welcome data after client creates world
  _applyWelcomeData() {
    const msg = this._welcomeData;
    if (!msg || !G) return;
    G.time.day = msg.time.day; G.time.hour = msg.time.hour; G.time.minute = msg.time.minute;
    G.world.weather = msg.weather; G.world.season = msg.season; G.world.outsideTemp = msg.temp;
    G.localPlayerId = this.localId;
    if (this.localId !== 'local' && G.players.local) {
      G.players[this.localId] = G.players.local;
      delete G.players.local;
    }
    Object.defineProperty(G, 'player', { get() { return this.players[this.localPlayerId]; }, configurable: true, enumerable: false });
    if (msg.worldDelta) {
      Object.entries(msg.worldDelta).forEach(([nid, changes]) => {
        const node = G.world.nodes[nid];
        if (node) Object.assign(node, changes);
      });
    }
    G.lastRealTime = Date.now(); G.realTimeAccum = 0; G.paused = false;
    this._welcomeData = null;
  },

  _onPositionUpdate(senderId, msg) {
    const id = msg.id || senderId;
    if (id === this.localId) return;
    // Denormalize position from 0..1 to local canvas size
    const cw = (typeof canvas !== 'undefined' && canvas) ? canvas.width / window.devicePixelRatio : 400;
    const ch = (typeof canvas !== 'undefined' && canvas) ? canvas.height / window.devicePixelRatio : 400;
    const localX = msg.x * cw;
    const localY = msg.y * ch;
    if (!this.players[id]) this.players[id] = { name:'???', nodeId:null, roomIdx:-1, x:0, y:0, dir:2 };
    Object.assign(this.players[id], { x:localX, y:localY, dir:msg.d, nodeId:msg.n, roomIdx:msg.r, status:msg.s||'' });
    if (!sceneData.remotePlayers[id]) sceneData.remotePlayers[id] = { x:localX, y:localY, dir:msg.d, nodeId:msg.n, roomIdx:msg.r, name:this.players[id].name, color:'#00E5FF' };
    const rp = sceneData.remotePlayers[id];
    rp.targetX=localX; rp.targetY=localY; rp.dir=msg.d; rp.nodeId=msg.n; rp.roomIdx=msg.r; rp.status=msg.s||'';
    if (this.mode === 'HOST') this.broadcast({ ...msg, id });
  },

  _onGameEvent(senderId, msg) {
    switch(msg.e) {
      case 'player_moved':
        if (msg.playerId && msg.playerId !== this.localId) {
          if (this.players[msg.playerId]) this.players[msg.playerId].nodeId = msg.nodeId;
          if (sceneData.remotePlayers[msg.playerId]) sceneData.remotePlayers[msg.playerId].nodeId = msg.nodeId;
        }
        break;
      case 'move':
        if (this.mode === 'HOST') {
          const pInfo = this.players[senderId];
          if (pInfo) { pInfo.nodeId = msg.nodeId; this.broadcast({ t:'e', e:'player_moved', playerId:senderId, nodeId:msg.nodeId }); }
        }
        break;
      case 'loot_claim':
        if (this.mode === 'HOST' && G) this._handleLootClaim(senderId, msg);
        break;
      case 'loot_grant':
        if (this.mode === 'CLIENT') Bus.emit('net:loot_grant', msg);
        break;
      case 'loot_deny':
        if (this.mode === 'CLIENT') addLog(msg.reason || 'Контейнер занят', 'warning');
        break;
      case 'join_combat':
        if (this.mode === 'HOST' && G) {
          // Find active zombie in the room
          const jcNode = G.world.nodes[msg.nodeId];
          const jcRoom = jcNode?.building?.rooms?.[msg.roomIdx];
          if (jcRoom?.zombies) {
            this.send(senderId, { t:'e', e:'combat_started', nodeId:msg.nodeId, roomIdx:msg.roomIdx, zombie:{ name:jcRoom.zombies.name, hp:jcRoom.zombies.hp, currentHp:jcRoom.zombies.currentHp, dmg:jcRoom.zombies.dmg, type:jcRoom.zombies.type } });
          }
        }
        break;
      case 'node_searched':
        if (G?.world?.nodes?.[msg.nodeId]) G.world.nodes[msg.nodeId].searched = true;
        break;
      case 'zombie_killed': {
        // Zombie killed in a room — remove from local state
        const zkNode = G?.world?.nodes?.[msg.nodeId];
        if (zkNode?.building?.rooms?.[msg.roomIdx]) {
          zkNode.building.rooms[msg.roomIdx].zombies = null;
        }
        // Remove zombie entity from LIDAR
        if (typeof sceneData !== 'undefined') {
          sceneData.zombieEntities = sceneData.zombieEntities.filter(ze => ze.roomIdx !== msg.roomIdx);
        }
        break;
      }
      case 'loot_taken': {
        // Another player took an item — remove from local world state + mark taken
        const ltNode = G?.world?.nodes?.[msg.nodeId];
        if (ltNode?.building?.rooms?.[msg.roomIdx]?.containers?.[msg.ci]) {
          const ltCont = ltNode.building.rooms[msg.roomIdx].containers[msg.ci];
          if (ltCont.loot) {
            const ltIdx = ltCont.loot.findIndex(i => i.id === msg.itemId && !i._taken);
            if (ltIdx >= 0) {
              ltCont.loot[ltIdx]._taken = true;
              ltCont.loot.splice(ltIdx, 1);
            }
          }
        }
        break;
      }
      case 'trigger_seen':
        if (G?.triggers?.[msg.triggerId]) G.triggers[msg.triggerId].seen = true;
        break;
      case 'base_set':
        if (G) {
          G.world.homeBase = msg.homeBase;
          G.world.homeBaseSecurity = msg.security;
          addLog(`📡 Убежище обновлено`, 'info');
        }
        break;
      case 'combat_started': {
        // Another player started combat at same location — offer to assist
        if (msg.nodeId === G?.world?.currentNodeId) {
          addLog(`⚔ Бой начался! ${msg.zombie?.name} атакует!`, 'danger');
          // If we're not already in combat, offer to join
          if (!G.combatState) {
            const isEn = LANG?.current === 'en';
            const z = msg.zombie;
            let cHtml = `<div style="text-align:center;padding:8px">`;
            cHtml += `<div style="color:var(--red);font-size:14px;margin-bottom:6px">⚔ ${z.name}</div>`;
            cHtml += `<div style="color:var(--text-dim);font-size:10px;margin-bottom:10px">HP: ${z.currentHp}/${z.hp} · ${isEn ? 'Nearby player is fighting!' : 'Другой игрок сражается!'}</div>`;
            cHtml += `<div style="display:flex;gap:6px">`;
            cHtml += `<button class="act-btn danger" onclick="joinCombat()" style="flex:2;padding:10px">⚔ ${isEn ? 'JOIN FIGHT' : 'ВСТУПИТЬ В БОЙ'}</button>`;
            cHtml += `<button class="act-btn" onclick="closeModal()" style="flex:1;padding:10px">${isEn ? 'Ignore' : 'Нет'}</button>`;
            cHtml += `</div></div>`;
            openModal('⚔ ' + (isEn ? 'Combat' : 'Бой'), cHtml);
          }
        }
        break;
      }
      case 'combat_damage': {
        // Someone dealt damage to zombie — update local combat state
        if (G?.combatState?.zombie && msg.nodeId === G.world.currentNodeId) {
          G.combatState.zombie.currentHp = Math.max(0, msg.zombieHp);
          if (typeof showCombatUI === 'function' && G.combatState) showCombatUI();
          if (msg.zombieHp <= 0) {
            addLog(`${G.combatState.zombie.name} уничтожен совместными усилиями!`, 'success');
            if (typeof combatVictory === 'function') combatVictory();
          }
        }
        break;
      }
      case 'social_request':
        // Someone asks permission — relay if needed, then show dialog
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, msg); // relay to target
        } else {
          _handleSocialRequest(msg);
        }
        break;
      case 'social_denied':
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, msg);
        } else {
          addLog(LANG?.current==='en'?'Request denied.':'Запрос отклонён.', 'warning');
        }
        break;
      case 'social_response':
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, msg);
        } else {
          _showSocialResponse(msg);
        }
        break;
      case 'remote_heal': {
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, msg);
        } else {
          // Apply healing to our player
          const med = ITEMS[msg.medId];
          if (med && G?.player) {
            if (med.hp) Object.keys(G.player.hp).forEach(k => { G.player.hp[k] = Math.min(100, G.player.hp[k] + (med.hp || 0)); });
            if (med.infection) G.player.moodles.infection = Math.max(0, G.player.moodles.infection + med.infection);
            if (med.pain) G.player.moodles.pain = Math.max(0, G.player.moodles.pain + med.pain);
            if (med.bleeding !== undefined) G.player.moodles.bleeding = 0;
            addLog(`💊 ${msg.fromName} вылечил вас: ${med.name}`, 'success');
            if (typeof updateUI === 'function') updateUI();
          }
        }
        break;
      }
      case 'party_invite': {
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, msg); break;
        }
        const pFromName = msg.fromName || msg.fromId;
        const isEn = LANG?.current === 'en';
        let piHtml = `<div style="text-align:center;padding:10px">`;
        piHtml += `<div style="font-size:14px;color:var(--cyan);margin-bottom:8px">${pFromName} ${isEn ? 'invites you to a party' : 'приглашает в группу'}</div>`;
        piHtml += `<div style="display:flex;gap:8px;justify-content:center">`;
        piHtml += `<button class="act-btn" onclick="_acceptParty('${msg.fromId}')" style="flex:1;padding:10px;border-color:var(--green);color:var(--green)">${isEn ? 'Accept' : 'Принять'}</button>`;
        piHtml += `<button class="act-btn" onclick="closeModal()" style="flex:1;padding:10px;border-color:var(--red);color:var(--red)">${isEn ? 'Decline' : 'Отклонить'}</button>`;
        piHtml += `</div></div>`;
        openModal('👥 ' + (isEn ? 'Party' : 'Группа'), piHtml);
        break;
      }
      case 'party_accepted': {
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, msg); break;
        }
        const paName = msg.fromName || msg.fromId;
        if (!window._party.members.includes(Net.localId)) window._party.members.push(Net.localId);
        if (!window._party.members.includes(msg.fromId)) window._party.members.push(msg.fromId);
        window._party.leader = Net.localId;
        addLog(`👥 ${paName} присоединился к группе!`, 'success');
        break;
      }
      case 'introduce':
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') { Net.send(msg.targetId, msg); }
        else { _handleIntroduce(msg); }
        break;
      case 'introduce_back':
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') { Net.send(msg.targetId, msg); }
        else { _handleIntroduceBack(msg); }
        break;
      case 'map_marker': {
        if (msg.marker) {
          if (typeof _mapMarkers !== 'undefined') _mapMarkers.push(msg.marker);
          addLog(`📍 ${msg.marker.label}`, 'info');
          setTimeout(() => { if (typeof _mapMarkers !== 'undefined') _mapMarkers = _mapMarkers.filter(m => m !== msg.marker); }, 300000);
        }
        break;
      }
      case 'party_left': {
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, msg); break;
        }
        window._party.members = window._party.members.filter(id => id !== msg.fromId);
        addLog(`👥 Игрок покинул группу`, 'info');
        break;
      }
      case 'trade_request':
        if (msg.targetId && msg.targetId !== Net.localId && this.mode === 'HOST') {
          Net.send(msg.targetId, { t:'e', e:'trade_request', fromId: msg.fromId || senderId, fromName: msg.fromName });
        } else if (msg.fromId) {
          showTradeRequest(msg.fromId);
        }
        break;
      default:
        Bus.emit('net:event', { senderId, event: msg.e, data: msg });
    }
  },

  _handleLootClaim(playerId, msg) {
    const node = G.world.nodes[msg.nodeId];
    if (!node?.building?.rooms?.[msg.roomIdx]?.containers?.[msg.ci]) {
      this.send(playerId, { t:'e', e:'loot_deny', reason:'Контейнер не найден' }); return;
    }
    const cont = node.building.rooms[msg.roomIdx].containers[msg.ci];
    if (cont._claimedBy && cont._claimedBy !== playerId) {
      this.send(playerId, { t:'e', e:'loot_deny', reason:'Контейнер обыскивает другой игрок' }); return;
    }
    cont._claimedBy = playerId;
    setTimeout(() => { if (cont._claimedBy === playerId) cont._claimedBy = null; }, 10000);
    this.send(playerId, { t:'e', e:'loot_grant', nodeId:msg.nodeId, roomIdx:msg.roomIdx, ci:msg.ci, loot:cont.loot });
    this.markDirty(msg.nodeId);
  },

  _onPlayerDisconnect(playerId) {
    const name = this.players[playerId]?.name || playerId;
    delete this.players[playerId];
    delete sceneData.remotePlayers[playerId];
    if (G?.players?.[playerId]) delete G.players[playerId];
    if (G?.world?.nodes) {
      Object.values(G.world.nodes).forEach(n => {
        if (n.building?.rooms) n.building.rooms.forEach(r => {
          if (r.containers) r.containers.forEach(c => { if (c._claimedBy === playerId) c._claimedBy = null; });
        });
      });
    }
    this.broadcast({ t:'player_leave', id:playerId, name });
    addLog(`📡 ${name} отключился`, 'warning');
    Bus.emit('net:player_leave', { id:playerId, name });
  },

  _broadcastTime() {
    if (this.mode !== 'HOST' || !G) return;
    this.broadcast({ t:'T', day:G.time.day, hour:G.time.hour, min:G.time.minute, weather:G.world.weather, season:G.world.season, temp:G.world.outsideTemp });
  },

  _broadcastWorldDelta() {
    if (this.mode !== 'HOST' || !G || this._dirtyNodes.size === 0) return;
    const delta = {};
    this._dirtyNodes.forEach(nid => {
      const node = G.world.nodes[nid];
      if (node) { delta[nid] = { searched:node.searched, visited:node.visited, discovered:node.discovered }; }
    });
    this.broadcast({ t:'W', nodes:delta });
    this._dirtyNodes.clear();
  },

  markDirty(nodeId) { if (this.mode === 'HOST') this._dirtyNodes.add(nodeId); },

  sendChat(text) {
    if (!text.trim()) return;
    const name = G?.characterName || 'Player';
    const msg = { t:'chat', name, text:text.trim() };
    addLog(`💬 ${name}: ${text.trim()}`, 'info');
    if (this.mode === 'HOST') this.broadcast(msg);
    else if (this.mode === 'CLIENT') this.send(null, msg);
  },

  disconnect() {
    this._intentionalDisconnect = true;
    this._reconnectAttempts = 0;
    clearTimeout(this._connectTimeout);
    clearInterval(this._timeSyncInterval);
    clearInterval(this._worldSyncInterval);
    clearInterval(this._pingInterval);
    if (this.ws) try { this.ws.close(); } catch(e){}
    this.ws = null;
    this.players = {};
    this.mode = 'OFFLINE';
    this.localId = 'local';
    this.roomCode = null;
    sceneData.remotePlayers = {};
    this._dirtyNodes.clear();
    this._intentionalDisconnect = false;
  },

  ping: 0,
  _pingInterval: null,

  _startPing() {
    this._pingInterval = setInterval(() => {
      if (this.ws?.readyState === 1) {
        this._pingSent = Date.now();
        // Host pings clients, client pings host
        if (this.mode === 'HOST') this.broadcast({ t:'ping', ts: this._pingSent });
        else this.send(null, { t:'ping', ts: this._pingSent });
      }
    }, 5000);
  },

  playerCount() { return Object.keys(this.players).length; }
};

// ── Emotes system ──
const EMOTES = [
  { id: 'wave', icon: '👋', label: 'Привет' },
  { id: 'help', icon: '🆘', label: 'Помощь' },
  { id: 'thumbsup', icon: '👍', label: 'Класс' },
  { id: 'follow', icon: '👉', label: 'За мной' },
  { id: 'danger', icon: '⚠️', label: 'Опасность' },
  { id: 'stop', icon: '✋', label: 'Стой' },
  { id: 'loot', icon: '💰', label: 'Лут тут' },
  { id: 'thanks', icon: '🙏', label: 'Спасибо' },
];

function sendEmote(emoteId) {
  const emote = EMOTES.find(e => e.id === emoteId);
  if (!emote || Net.mode === 'OFFLINE') return;
  // Show locally
  sceneData.localEmote = emote.icon;
  sceneData.localEmoteTime = Date.now();
  // Send to others
  const msg = { t: 'emote', id: Net.localId, emote: emote.icon };
  if (Net.mode === 'HOST') Net.broadcast(msg);
  else Net.send(null, msg);
  // Close menu
  const menu = document.getElementById('emote-menu');
  if (menu) menu.remove();
}

function toggleEmoteMenu() {
  let menu = document.getElementById('emote-menu');
  if (menu) { menu.remove(); return; }
  menu = document.createElement('div');
  menu.id = 'emote-menu';
  menu.style.cssText = 'position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:2000;display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:320px;background:rgba(0,10,0,.95);border:1px solid var(--cyan);padding:8px;border-radius:8px';
  EMOTES.forEach(e => {
    menu.innerHTML += `<button onclick="sendEmote('${e.id}')" style="padding:6px 10px;background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.2);border-radius:4px;color:var(--text);font-family:monospace;font-size:12px;cursor:pointer" title="${e.label}">${e.icon} ${e.label}</button>`;
  });
  document.body.appendChild(menu);
  // Auto-close after 5s
  setTimeout(() => { const m = document.getElementById('emote-menu'); if (m) m.remove(); }, 5000);
}

// ── Player Trading ──
function showTradeRequest(fromId) {
  const fromName = Net.players[fromId]?.name || fromId;
  const isEn = LANG?.current === 'en';
  let html = `<div style="text-align:center;padding:10px">`;
  html += `<div style="font-size:14px;color:var(--cyan);margin-bottom:8px">${fromName} ${isEn ? 'wants to trade' : 'предлагает обмен'}</div>`;
  html += `<div style="display:flex;gap:8px;justify-content:center">`;
  html += `<button class="act-btn" onclick="acceptTrade('${fromId}')" style="flex:1;padding:10px;border-color:var(--green);color:var(--green)">${isEn ? 'Accept' : 'Принять'}</button>`;
  html += `<button class="act-btn" onclick="declineTrade('${fromId}')" style="flex:1;padding:10px;border-color:var(--red);color:var(--red)">${isEn ? 'Decline' : 'Отклонить'}</button>`;
  html += `</div></div>`;
  openModal('🤝 ' + (isEn ? 'Trade' : 'Обмен'), html);
}

// ── Social Menu (nearby players) ──
function showSocialMenu() {
  const myNode = G?.world?.currentNodeId;
  const isEn = LANG?.current === 'en';
  const nearby = Object.entries(Net.players).filter(([id, p]) => id !== Net.localId && p.nodeId === myNode);

  if (nearby.length === 0) {
    addLog(isEn ? 'No players nearby.' : 'Нет игроков рядом.', 'warning');
    return;
  }

  let html = '';
  html += `<div style="color:var(--text-dim);font-size:10px;margin-bottom:8px">${isEn ? 'Players at your location' : 'Игроки в вашей локации'}:</div>`;

  nearby.forEach(([id, info]) => {
    const isKnown = _introductions[id]?.introduced;
    const displayName = isKnown ? (info.name || id) : '???';
    html += `<div style="border:1px solid ${isKnown?'rgba(0,229,255,.2)':'rgba(80,96,80,.3)'};border-radius:4px;padding:8px;margin-bottom:6px;background:${isKnown?'rgba(0,229,255,.03)':'rgba(0,0,0,.2)'}">`;
    html += `<div style="color:${isKnown?'var(--cyan)':'var(--text-dim)'};font-size:12px;font-weight:bold;margin-bottom:6px">● ${displayName}</div>`;
    // Introduce button for strangers
    if (!isKnown) {
      html += `<button class="act-btn" onclick="introduceToPlayer('${id}')" style="width:100%;padding:8px;font-size:10px;border-color:var(--cyan);color:var(--cyan);margin-bottom:4px">👋 ${isEn?'Introduce yourself':'Представиться'}</button>`;
    }
    html += `<div style="display:flex;gap:3px;flex-wrap:wrap">`;
    html += `<button class="act-btn" onclick="requestTrade('${id}')" style="flex:1;padding:5px;font-size:8px;border-color:var(--green);color:var(--green)">🔄 ${isEn?'Trade':'Обмен'}</button>`;
    html += `<button class="act-btn" onclick="inviteToParty('${id}')" style="flex:1;padding:5px;font-size:8px;border-color:var(--cyan);color:var(--cyan)">👥 ${isEn?'Party':'Группа'}</button>`;
    html += `<button class="act-btn" onclick="assistPlayer('${id}')" style="flex:1;padding:5px;font-size:8px">⚔ ${isEn?'Assist':'Помочь'}</button>`;
    html += `</div><div style="display:flex;gap:3px;margin-top:3px">`;
    html += `<button class="act-btn" onclick="requestInspectHealth('${id}')" style="flex:1;padding:5px;font-size:8px">❤ ${isEn?'Health':'Здоровье'}</button>`;
    html += `<button class="act-btn" onclick="requestHealPlayer('${id}')" style="flex:1;padding:5px;font-size:8px;border-color:var(--green);color:var(--green)">💊 ${isEn?'Heal':'Лечить'}</button>`;
    html += `<button class="act-btn" onclick="requestViewBackpack('${id}')" style="flex:1;padding:5px;font-size:8px">🎒 ${isEn?'Backpack':'Рюкзак'}</button>`;
    html += `</div><div style="display:flex;gap:3px;margin-top:3px">`;
    html += `<button class="act-btn" onclick="followPlayer('${id}')" style="flex:1;padding:5px;font-size:8px">👣 ${isEn?'Follow':'Следовать'}</button>`;
    html += `<button class="act-btn" onclick="showMarkerMenu()" style="flex:1;padding:5px;font-size:8px">📍 ${isEn?'Marker':'Маркер'}</button>`;
    html += `</div></div>`;
  });

  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:8px;margin-top:4px">${isEn ? 'Close' : 'Закрыть'}</button>`;
  openModal('🤝 ' + (isEn ? 'Social' : 'Социум'), html);
}

function requestTrade(targetId) {
  const targetName = Net.players[targetId]?.name || targetId;
  addLog(`📡 Запрос обмена с ${targetName}...`, 'info');
  const msg = { t:'e', e:'trade_request', fromId:Net.localId, fromName:G?.characterName||'Player' };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, { ...msg, targetId });
  closeModal();
}

function showTradeRequest(fromId) {
  const fromName = Net.players[fromId]?.name || fromId;
  const isEn = LANG?.current === 'en';
  let html = `<div style="text-align:center;padding:10px">`;
  html += `<div style="font-size:14px;color:var(--cyan);margin-bottom:8px">${fromName} ${isEn ? 'wants to trade' : 'предлагает обмен'}</div>`;
  html += `<div style="display:flex;gap:8px;justify-content:center">`;
  html += `<button class="act-btn" onclick="acceptTrade('${fromId}')" style="flex:1;padding:10px;border-color:var(--green);color:var(--green)">${isEn ? 'Accept' : 'Принять'}</button>`;
  html += `<button class="act-btn" onclick="closeModal()" style="flex:1;padding:10px;border-color:var(--red);color:var(--red)">${isEn ? 'Decline' : 'Отклонить'}</button>`;
  html += `</div></div>`;
  openModal('🤝 ' + (isEn ? 'Trade' : 'Обмен'), html);
}

function acceptTrade(fromId) {
  closeModal();
  addLog('🤝 Обмен принят! (в разработке)', 'success');
}

// ── Party System ──
if (!window._party) window._party = { members: [], leader: null };

function inviteToParty(targetId) {
  const targetName = Net.players[targetId]?.name || targetId;
  addLog(`👥 Приглашение в группу: ${targetName}`, 'info');
  const msg = { t:'e', e:'party_invite', fromId:Net.localId, fromName:G?.characterName||'Player' };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, { ...msg, targetId });
  closeModal();
}

function _acceptParty(fromId) {
  closeModal();
  const fromName = Net.players[fromId]?.name || fromId;
  window._party.leader = fromId;
  if (!window._party.members.includes(Net.localId)) window._party.members.push(Net.localId);
  if (!window._party.members.includes(fromId)) window._party.members.push(fromId);
  addLog(`👥 Вы в группе с ${fromName}!`, 'success');
  // Notify leader
  const msg = { t:'e', e:'party_accepted', fromId:Net.localId, fromName:G?.characterName||'Player' };
  if (Net.mode === 'HOST') Net.send(fromId, msg);
  else Net.send(null, { ...msg, targetId: fromId });
}

function isInParty(playerId) {
  return window._party.members.includes(playerId);
}

function leaveParty() {
  const members = [...window._party.members];
  window._party = { members: [], leader: null };
  addLog('👥 Вы покинули группу', 'info');
  members.forEach(id => {
    if (id !== Net.localId) {
      const msg = { t:'e', e:'party_left', fromId:Net.localId };
      if (Net.mode === 'HOST') Net.send(id, msg);
      else Net.send(null, { ...msg, targetId: id });
    }
  });
}

function assistPlayer(targetId) {
  closeModal();
  joinCombat();
}

// ── Introduction System ──
// Players must introduce themselves to each other before seeing full profile
const _introductions = {}; // { playerId: { name, occupation, daysSurvived, introduced: true } }

function _loadIntroductions() {
  try { Object.assign(_introductions, JSON.parse(localStorage.getItem('echo7_intros') || '{}')); } catch(e) {}
}
function _saveIntroductions() {
  try { localStorage.setItem('echo7_intros', JSON.stringify(_introductions)); } catch(e) {}
}
_loadIntroductions();

function introduceToPlayer(targetId) {
  closeModal();
  const myProfile = {
    name: G?.characterName || 'Player',
    occupation: G?.scenario || 'unemployed',
    daysSurvived: G?.player?.daysSurvived || 0,
    playerId: Net.localId,
  };
  addLog(`👋 Представляемся...`, 'info');
  const msg = { t:'e', e:'introduce', fromId:Net.localId, profile:myProfile, targetId };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, msg);
}

function _handleIntroduce(msg) {
  const p = msg.profile;
  const isEn = LANG?.current === 'en';
  const occNames = { unemployed:'Безработный', police:'Полицейский', military:'Военный', mechanic:'Механик', doctor:'Доктор', cook:'Повар', thief:'Вор', builder:'Строитель', soldier:'Солдат', hunter:'Охотник', trucker:'Дальнобойщик', vagabond:'Бродяга' };

  let html = `<div style="text-align:center;padding:10px">`;
  html += `<div style="font-size:32px;margin-bottom:8px">👋</div>`;
  html += `<div style="font-size:16px;color:var(--cyan);font-weight:bold;margin-bottom:4px">${p.name}</div>`;
  html += `<div style="font-size:10px;color:var(--text-dim);margin-bottom:2px">${occNames[p.occupation] || p.occupation}</div>`;
  html += `<div style="font-size:9px;color:var(--text-muted);margin-bottom:12px">${isEn ? 'Day' : 'День'} ${p.daysSurvived}</div>`;
  html += `<div style="color:var(--text-dim);font-size:10px;margin-bottom:10px">${isEn ? 'wants to introduce themselves' : 'хочет представиться'}</div>`;
  html += `<div style="display:flex;gap:6px">`;
  html += `<button class="act-btn" onclick="_acceptIntroduce('${msg.fromId}')" style="flex:1;padding:10px;border-color:var(--green);color:var(--green)">👋 ${isEn ? 'Introduce back' : 'Представиться'}</button>`;
  html += `<button class="act-btn" onclick="closeModal()" style="flex:1;padding:10px;border-color:var(--red);color:var(--red)">${isEn ? 'Ignore' : 'Игнор'}</button>`;
  html += `</div></div>`;

  // Save their intro regardless
  _introductions[msg.fromId] = { ...p, introduced: true };
  _saveIntroductions();
  // Update remote player name in sceneData
  if (sceneData.remotePlayers[msg.fromId]) sceneData.remotePlayers[msg.fromId].name = p.name;

  openModal('👋 ' + (isEn ? 'Introduction' : 'Знакомство'), html);
}

function _acceptIntroduce(fromId) {
  closeModal();
  // Send our profile back
  const myProfile = {
    name: G?.characterName || 'Player',
    occupation: G?.scenario || 'unemployed',
    daysSurvived: G?.player?.daysSurvived || 0,
    playerId: Net.localId,
  };
  const msg = { t:'e', e:'introduce_back', fromId:Net.localId, profile:myProfile, targetId:fromId };
  if (Net.mode === 'HOST') Net.send(fromId, msg);
  else Net.send(null, msg);
  addLog(`👋 Вы познакомились с ${_introductions[fromId]?.name || '???'}!`, 'success');
}

function _handleIntroduceBack(msg) {
  const p = msg.profile;
  _introductions[msg.fromId] = { ...p, introduced: true };
  _saveIntroductions();
  if (sceneData.remotePlayers[msg.fromId]) sceneData.remotePlayers[msg.fromId].name = p.name;
  addLog(`👋 ${p.name} представился! Теперь вы знакомы.`, 'success');
}

// ── Mini-profile (tap on player on LIDAR) ──
function showMiniProfile(playerId) {
  const info = _introductions[playerId];
  if (!info?.introduced) {
    addLog('Вы не знакомы с этим игроком. Представьтесь через 🤝', 'info');
    return;
  }
  const isEn = LANG?.current === 'en';
  const occNames = { unemployed:'Безработный', police:'Полицейский', military:'Военный', mechanic:'Механик', doctor:'Доктор', cook:'Повар', thief:'Вор', builder:'Строитель', soldier:'Солдат', hunter:'Охотник', trucker:'Дальнобойщик', vagabond:'Бродяга' };
  const pInfo = Net.players[playerId] || {};
  const status = pInfo.status || '';
  const statusLabels = { '⚔':'В бою', '🔍':'Обыскивает', '🥷':'Скрытность', '🏃':'В пути' };

  let html = `<div style="text-align:center;padding:8px">`;
  html += `<div style="font-size:28px;margin-bottom:6px;filter:drop-shadow(0 0 6px rgba(0,229,255,.5))">👤</div>`;
  html += `<div style="font-size:16px;color:var(--cyan);font-weight:bold;margin-bottom:4px">${info.name}</div>`;
  html += `<div style="font-size:10px;color:var(--text-dim);margin-bottom:2px">${occNames[info.occupation] || info.occupation}</div>`;
  html += `<div style="font-size:9px;color:var(--text-muted);margin-bottom:6px">${isEn ? 'Survived' : 'Выжил'}: ${info.daysSurvived} ${isEn ? 'days' : 'дн.'}</div>`;
  if (status) {
    html += `<div style="font-size:11px;margin-bottom:6px">${status} ${statusLabels[status] || ''}</div>`;
  }
  // Same location indicator
  const sameNode = pInfo.nodeId === G?.world?.currentNodeId;
  html += `<div style="font-size:9px;color:${sameNode?'var(--green)':'var(--text-muted)'};margin-bottom:8px">${sameNode ? '📍 '+(isEn?'Nearby':'Рядом') : '🗺 '+(isEn?'Elsewhere':'В другом месте')}</div>`;
  html += `</div>`;
  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:6px">OK</button>`;
  openModal('👤 ' + info.name, html);
}

// Check if click on canvas hit a remote player
function _checkPlayerClick(clickX, clickY) {
  if (typeof Net === 'undefined' || Net.mode === 'OFFLINE') return false;
  const w = canvas ? canvas.width / window.devicePixelRatio : 400;
  const h = canvas ? canvas.height / window.devicePixelRatio : 400;
  for (const [rpId, rp] of Object.entries(sceneData.remotePlayers)) {
    if (!rp || rp.nodeId !== G?.world?.currentNodeId || rp.roomIdx !== G?.world?.currentRoom) continue;
    const rpSX = rp.x - sceneData.camX + w / 2;
    const rpSY = rp.y - sceneData.camY + h / 2;
    const dist = Math.hypot(clickX - rpSX, clickY - rpSY);
    if (dist < 20) { showMiniProfile(rpId); return true; }
  }
  return false;
}

// ── Permission-based social actions ──
function requestInspectHealth(targetId) {
  closeModal();
  const name = G?.characterName || 'Player';
  const msg = { t:'e', e:'social_request', action:'inspect_health', fromId:Net.localId, fromName:name, targetId };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, msg);
  addLog(`📡 Запрос на осмотр здоровья...`, 'info');
}

function requestHealPlayer(targetId) {
  closeModal();
  // Check if we have medicine
  const meds = G?.player?.inventory?.filter(i => ITEMS[i.id]?.type === 'medicine');
  if (!meds || meds.length === 0) { addLog('У вас нет медикаментов!', 'warning'); return; }
  const name = G?.characterName || 'Player';
  const msg = { t:'e', e:'social_request', action:'heal', fromId:Net.localId, fromName:name, targetId };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, msg);
  addLog(`📡 Запрос на лечение...`, 'info');
}

function requestViewBackpack(targetId) {
  closeModal();
  const name = G?.characterName || 'Player';
  const msg = { t:'e', e:'social_request', action:'view_backpack', fromId:Net.localId, fromName:name, targetId };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, msg);
  addLog(`📡 Запрос на просмотр рюкзака...`, 'info');
}

// Handle incoming social request — show permission dialog
function _handleSocialRequest(msg) {
  const isEn = LANG?.current === 'en';
  const actions = {
    inspect_health: { icon: '❤', label: isEn ? 'wants to check your health' : 'хочет осмотреть ваше здоровье' },
    heal: { icon: '💊', label: isEn ? 'wants to heal you' : 'хочет вылечить вас' },
    view_backpack: { icon: '🎒', label: isEn ? 'wants to see your backpack' : 'хочет посмотреть ваш рюкзак' },
  };
  const action = actions[msg.action] || { icon: '❓', label: msg.action };

  let html = `<div style="text-align:center;padding:10px">`;
  html += `<div style="font-size:24px;margin-bottom:6px">${action.icon}</div>`;
  html += `<div style="font-size:12px;color:var(--cyan);margin-bottom:4px">${msg.fromName}</div>`;
  html += `<div style="font-size:11px;color:var(--text-dim);margin-bottom:12px">${action.label}</div>`;
  html += `<div style="display:flex;gap:8px">`;
  html += `<button class="act-btn" onclick="_respondSocial('${msg.fromId}','${msg.action}',true)" style="flex:1;padding:10px;border-color:var(--green);color:var(--green)">✓ ${isEn ? 'Allow' : 'Разрешить'}</button>`;
  html += `<button class="act-btn" onclick="_respondSocial('${msg.fromId}','${msg.action}',false)" style="flex:1;padding:10px;border-color:var(--red);color:var(--red)">✕ ${isEn ? 'Deny' : 'Отказать'}</button>`;
  html += `</div></div>`;
  openModal(action.icon + ' ' + (isEn ? 'Request' : 'Запрос'), html);
}

function _respondSocial(fromId, action, allowed) {
  closeModal();
  if (!allowed) {
    const msg = { t:'e', e:'social_denied', action, targetId: fromId };
    if (Net.mode === 'HOST') Net.send(fromId, msg);
    else Net.send(null, msg);
    return;
  }
  const p = G.player;
  let data = {};
  if (action === 'inspect_health') {
    data = { hp: {...p.hp}, moodles: {...p.moodles}, alive: p.alive, name: G.characterName };
  } else if (action === 'heal') {
    data = { hp: {...p.hp}, name: G.characterName, targetId: Net.localId };
  } else if (action === 'view_backpack') {
    data = { inventory: p.inventory.map(i => ({ id:i.id, qty:i.qty })), name: G.characterName };
  }
  const msg = { t:'e', e:'social_response', action, targetId: fromId, data };
  if (Net.mode === 'HOST') Net.send(fromId, msg);
  else Net.send(null, msg);
}

function _showSocialResponse(msg) {
  const isEn = LANG?.current === 'en';
  const d = msg.data;
  if (!d) return;

  if (msg.action === 'inspect_health') {
    const partNames = { head:'Голова', torso:'Торс', armL:'Л.рука', armR:'П.рука', legL:'Л.нога', legR:'П.нога' };
    let html = `<div style="font-size:11px">`;
    Object.entries(d.hp || {}).forEach(([k, v]) => {
      const col = v >= 80 ? 'var(--green)' : v >= 40 ? 'var(--yellow)' : 'var(--red)';
      html += `<div style="display:flex;justify-content:space-between;padding:2px 0"><span>${partNames[k]||k}</span><span style="color:${col}">${v}%</span></div>`;
    });
    const moodleNames = { hunger:'Голод', thirst:'Жажда', fatigue:'Усталость', infection:'Инфекция', pain:'Боль', bleeding:'Кровотеч.', bodyTemp:'Темп. тела' };
    if (d.moodles) {
      html += `<div style="margin-top:6px;border-top:1px solid var(--border);padding-top:4px">`;
      Object.entries(d.moodles).forEach(([k, v]) => {
        if (!moodleNames[k] || (k !== 'bodyTemp' && v === 0)) return;
        const display = k === 'bodyTemp' ? v.toFixed(1) + '°C' : Math.round(v) + '%';
        html += `<div style="display:flex;justify-content:space-between;padding:1px 0;font-size:10px"><span style="color:var(--text-dim)">${moodleNames[k]}</span><span>${display}</span></div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
    html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:6px;margin-top:6px">OK</button>`;
    openModal(`❤ ${d.name || '???'}`, html);

  } else if (msg.action === 'heal') {
    // Show OUR medicine list to use on the other player
    const healTargetId = d.targetId || msg.targetId;
    const meds = G.player.inventory.filter(i => ITEMS[i.id]?.type === 'medicine');
    let html = `<div style="font-size:10px;color:var(--text-dim);margin-bottom:6px">${isEn ? 'Choose medicine for' : 'Выберите лекарство для'} ${d.name || '???'}:</div>`;
    if (meds.length === 0) {
      html += `<div style="color:var(--red);font-size:10px;text-align:center;padding:10px">${isEn ? 'No medicine!' : 'Нет медикаментов!'}</div>`;
    } else {
      meds.forEach(m => {
        const def = ITEMS[m.id];
        if (!def) return;
        html += `<button class="act-btn" onclick="doHealPlayer('${healTargetId}','${m.id}');closeModal()" style="width:100%;padding:6px;margin-bottom:3px;font-size:10px">${typeof itemIconHtml==='function'?itemIconHtml(m.id,16):''} ${def.name}</button>`;
      });
    }
    html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:6px;margin-top:4px">${isEn ? 'Cancel' : 'Отмена'}</button>`;
    openModal(`💊 ${d.name || '???'}`, html);

  } else if (msg.action === 'view_backpack') {
    let html = `<div style="max-height:50vh;overflow-y:auto">`;
    if (!d.inventory || d.inventory.length === 0) {
      html += `<div style="color:var(--text-dim);text-align:center;padding:10px">${isEn ? 'Empty' : 'Пусто'}</div>`;
    } else {
      d.inventory.forEach(item => {
        const def = ITEMS[item.id];
        if (!def) return;
        html += `<div class="inv-item" style="padding:4px 6px"><div class="item-info">${typeof itemIconHtml==='function'?itemIconHtml(item.id,18):''}<span style="font-size:10px">${def.name}${item.qty>1?' ×'+item.qty:''}</span></div></div>`;
      });
    }
    html += `</div>`;
    html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:6px;margin-top:6px">OK</button>`;
    openModal(`🎒 ${d.name || '???'}`, html);
  }
}

function doHealPlayer(targetId, medId) {
  // Remove medicine from our inventory, notify target to heal
  removeItem(medId, 1);
  const msg = { t:'e', e:'remote_heal', targetId, medId, fromName: G?.characterName || 'Player' };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, msg);
  addLog(`💊 Использовано ${ITEMS[medId]?.name} на другом игроке`, 'success');
}

// ── Follow System ──
let _followTarget = null;

function followPlayer(targetId) {
  closeModal();
  _followTarget = targetId;
  const name = Net.players[targetId]?.name || targetId;
  addLog(`👣 Следую за ${name}`, 'info');
}

function stopFollow() {
  if (_followTarget) {
    addLog('👣 Перестал следовать', 'info');
    _followTarget = null;
  }
}

// Check follow — called from Bus player:move
Bus.on('player:move', () => { /* local player moved — stop following */ if (_followTarget) stopFollow(); });

// ── Map Markers for Group ──
let _mapMarkers = []; // { x, y (grid), label, color, time }

function placeMapMarker(type) {
  closeModal();
  const node = G?.world?.nodes?.[G?.world?.currentNodeId];
  if (!node) return;
  const labels = { here: '📍 Сюда!', danger: '⚠ Опасно!', loot: '💰 Лут!', meet: '🤝 Встреча' };
  const marker = { gx: node.gx, gy: node.gy, label: labels[type] || type, color: type === 'danger' ? '#ff2244' : '#00e5ff', time: Date.now() };
  _mapMarkers.push(marker);
  // Broadcast to party/all
  Net.broadcast({ t:'e', e:'map_marker', marker });
  addLog(`${marker.label} — маркер поставлен`, 'info');
  // Auto-remove after 5 minutes
  setTimeout(() => { _mapMarkers = _mapMarkers.filter(m => m !== marker); }, 300000);
}

function showMarkerMenu() {
  const isEn = LANG?.current === 'en';
  let html = '<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:center">';
  html += `<button class="act-btn" onclick="placeMapMarker('here')" style="padding:8px 12px;font-size:11px">📍 ${isEn?'Here':'Сюда'}</button>`;
  html += `<button class="act-btn" onclick="placeMapMarker('danger')" style="padding:8px 12px;font-size:11px;border-color:var(--red);color:var(--red)">⚠ ${isEn?'Danger':'Опасно'}</button>`;
  html += `<button class="act-btn" onclick="placeMapMarker('loot')" style="padding:8px 12px;font-size:11px;border-color:var(--green);color:var(--green)">💰 ${isEn?'Loot':'Лут'}</button>`;
  html += `<button class="act-btn" onclick="placeMapMarker('meet')" style="padding:8px 12px;font-size:11px;border-color:var(--cyan);color:var(--cyan)">🤝 ${isEn?'Meet':'Встреча'}</button>`;
  html += '</div>';
  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:6px;margin-top:8px">${isEn?'Cancel':'Отмена'}</button>`;
  openModal('📍 ' + (isEn ? 'Map Marker' : 'Маркер'), html);
}

function joinCombat() {
  closeModal();
  // Find the active combat zombie from the broadcast
  if (G.combatState) { addLog('Вы уже в бою!', 'warning'); return; }
  // Request combat state from host
  addLog('⚔ Вступаешь в бой!', 'danger');
  const msg = { t:'e', e:'join_combat', nodeId: G.world.currentNodeId, roomIdx: G.world.currentRoom };
  if (Net.mode === 'HOST') {
    // Host already has combat — find zombie in room
    const room = currentRoom();
    if (room?.zombies) {
      startCombat(room.zombies, room);
    }
  } else {
    Net.send(null, msg);
  }
}

// ── Wire Bus events to network ──
Bus.on('net:host_disconnected', () => {
  if (G) {
    G.mpSession = { roomCode: Net.roomCode, seed: G.seed, playerId: Net.localId };
    saveGame();
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace';
  overlay.innerHTML = `<div style="color:var(--red);font-size:16px;letter-spacing:.3em;margin-bottom:12px">СОЕДИНЕНИЕ ПОТЕРЯНО</div><div style="color:var(--text-dim);font-size:11px;margin-bottom:20px">Хост отключился. Прогресс сохранён.</div><button onclick="this.parentElement.remove();exitToMenuDirect()" style="padding:10px 30px;border:1px solid var(--green);background:rgba(0,255,65,.08);color:var(--green);font-family:monospace;font-size:12px;cursor:pointer">ГЛАВНОЕ МЕНЮ</button>`;
  document.body.appendChild(overlay);
});

Bus.on('player:move', (data) => {
  if (Net.mode === 'OFFLINE') return;
  if (Net.mode === 'HOST') Net.broadcast({ t:'e', e:'player_moved', playerId:Net.localId, nodeId:data.nodeId });
  else Net.send(null, { t:'e', e:'move', nodeId:data.nodeId });
});

Bus.on('loot:claim', (data) => {
  if (Net.mode === 'CLIENT') Net.send(null, { t:'e', e:'loot_claim', nodeId:data.nodeId, roomIdx:data.roomIdx, ci:data.ci });
  if (Net.mode === 'HOST') Net.markDirty(data.nodeId);
});

Bus.on('room:change', (data) => {
  if (Net.mode === 'OFFLINE') return;
  if (Net.mode === 'HOST') Net.broadcast({ t:'e', e:'player_moved', playerId:Net.localId, nodeId:data.nodeId, roomIdx:data.roomIdx });
});

// ── Chat ──
function toggleChatInput() {
  let el = document.getElementById('mp-chat-input');
  if (el) { el.remove(); return; }
  el = document.createElement('div');
  el.id = 'mp-chat-input';
  el.style.cssText = 'position:fixed;bottom:60px;left:50%;transform:translateX(-50%);z-index:2000;display:flex;gap:4px;width:90%;max-width:400px';
  el.innerHTML = `<input id="chat-text" type="text" maxlength="100" placeholder="Сообщение..." style="flex:1;padding:8px;background:rgba(0,10,0,.9);border:1px solid var(--cyan);color:var(--cyan);font-family:monospace;font-size:11px;border-radius:3px" autofocus><button onclick="submitChat()" style="padding:8px 12px;background:rgba(0,229,255,.1);border:1px solid var(--cyan);color:var(--cyan);font-family:monospace;cursor:pointer;border-radius:3px">→</button>`;
  document.body.appendChild(el);
  const input = document.getElementById('chat-text');
  input.focus();
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key==='Enter') submitChat(); if (e.key==='Escape') el.remove(); });
}

function submitChat() {
  const input = document.getElementById('chat-text');
  if (input?.value.trim()) Net.sendChat(input.value);
  document.getElementById('mp-chat-input')?.remove();
}
