// ═══════════════════════════════════════════
// MULTIPLAYER NETWORKING (WebSocket Relay)
// ═══════════════════════════════════════════

const RELAY_SERVER = 'wss://echo7-signal.onrender.com';

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
      this.ws.send(JSON.stringify({ t: 'join', code: roomCode, name: playerName }));
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

  sendPosition(x, y, dir, nodeId, roomIdx) {
    const now = Date.now();
    if (now - this._lastPosSend < this._posInterval) return;
    this._lastPosSend = now;
    const msg = { t: 'p', x: Math.round(x), y: Math.round(y), d: dir, n: nodeId, r: roomIdx };
    if (this.mode === 'HOST') {
      this.players[this.localId].x = x;
      this.players[this.localId].y = y;
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
    // Store welcome data — will be applied after world gen
    this._welcomeData = msg;
    Bus.emit('net:welcome', msg);
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
    if (!this.players[id]) this.players[id] = { name:'???', nodeId:null, roomIdx:-1, x:0, y:0, dir:2 };
    Object.assign(this.players[id], { x:msg.x, y:msg.y, dir:msg.d, nodeId:msg.n, roomIdx:msg.r });
    if (!sceneData.remotePlayers[id]) sceneData.remotePlayers[id] = { x:msg.x, y:msg.y, dir:msg.d, nodeId:msg.n, roomIdx:msg.r, name:this.players[id].name, color:'#00E5FF' };
    const rp = sceneData.remotePlayers[id];
    rp.targetX=msg.x; rp.targetY=msg.y; rp.dir=msg.d; rp.nodeId=msg.n; rp.roomIdx=msg.r;
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
        // Another player took an item — remove from local world state
        const ltNode = G?.world?.nodes?.[msg.nodeId];
        if (ltNode?.building?.rooms?.[msg.roomIdx]?.containers?.[msg.ci]) {
          const ltCont = ltNode.building.rooms[msg.roomIdx].containers[msg.ci];
          const ltIdx = ltCont.loot?.findIndex(i => i.id === msg.itemId);
          if (ltIdx >= 0) ltCont.loot.splice(ltIdx, 1);
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
      case 'trade_request':
        if (msg.targetId && msg.targetId !== Net.localId && Net.mode === 'HOST') {
          // Host relays to target
          Net.send(msg.targetId, { t:'e', e:'trade_request', fromId: senderId, fromName: msg.fromName });
        } else if (!msg.targetId || msg.fromId) {
          // This is for us
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

function initiateTrade() {
  // Find nearby player (same node)
  const myNode = G?.world?.currentNodeId;
  const nearby = Object.entries(Net.players).find(([id, p]) => id !== Net.localId && p.nodeId === myNode);
  if (!nearby) { addLog('Нет игроков рядом для обмена.', 'warning'); return; }
  const [targetId, targetInfo] = nearby;
  addLog(`📡 Запрос обмена с ${targetInfo.name}...`, 'info');
  const msg = { t: 'e', e: 'trade_request', fromId: Net.localId, fromName: G?.characterName || 'Player' };
  if (Net.mode === 'HOST') Net.send(targetId, msg);
  else Net.send(null, { ...msg, targetId });
}

function acceptTrade(fromId) {
  closeModal();
  addLog('🤝 Обмен принят! (функция в разработке)', 'success');
  // TODO: open trade UI with both inventories
}

function declineTrade(fromId) {
  closeModal();
  addLog('Обмен отклонён.', 'info');
}

// ── Wire Bus events to network ──
Bus.on('net:host_disconnected', () => {
  if (G) saveGame();
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
