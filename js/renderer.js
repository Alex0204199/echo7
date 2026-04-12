// LIDAR TOP-DOWN RENDERER v4
// ═══════════════════════════════════════════
let canvas, ctx, animId;

// Persistent scene geometry — scanned environments stay visible
const sceneData = {
  particles: [],       // Transient particles (pulse waves, ambient)
  persistentPoints: [], // Permanent scanned geometry points
  zombieEntities: [],  // Active zombie point-cloud representations
  scanWaves: [],       // Active radial scan waves
  soundPulses: [],     // Sound visualization rings from other rooms
  scannedRooms: new Set(), // Room IDs that have been scanned
  scannedOutdoor: false,   // Whether outdoor area was scanned
  playerGlow: 0,       // Player indicator pulse phase
  shakeAmount: 0,      // Screen shake intensity
  shakeDecay: 0.92,
  lastScanTime: 0,
  // Camera system
  camX: 0, camY: 0,
  targetCamX: 0, targetCamY: 0,
  // Player movement
  playerX: 0, playerY: 0,
  playerTargetX: 0, playerTargetY: 0,
  playerMoving: false,
  playerMoveCallback: null,
  playerGX: 0, playerGY: 0,
  playerDir: 2,
  currentRoomIdx: -1,
  ambientParticles: [],
  playerTrail: [],     // last 20 positions for walking trail
  // Hover state for clickable rooms
  hoverRoomIdx: -1,
  selectedFurnIdx: -1,
  // Drag-to-pan camera
  // Multiplayer: remote players visible in same scene
  remotePlayers: {}, // { playerId: { x, y, dir, nodeId, roomIdx, name, color, emote, emoteTime } }
  localEmote: null, localEmoteTime: 0, // current player's emote
  isDragging: false,
  wasDragging: false,
  dragStartX: 0, dragStartY: 0,
  dragCamStartX: 0, dragCamStartY: 0,
  cameraDragOffsetX: 0, cameraDragOffsetY: 0,
  dragReturnTimer: null,
  dragReturning: false,
  // Zoom
  zoom: 1.0,
  // CRT scanline
  scanLineY: 0,
  // Glitch
  glitchFrames: 0,
  glitchY: 0,
  glitchW: 0,
  glitchX: 0,
};

// Room layout generation — deterministic per location
const roomLayouts = new Map();

function initCanvas() {
  canvas = document.getElementById('pointcloud');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  requestAnimationFrame(() => { resizeCanvas(); roomLayouts.clear(); });
  window.addEventListener('resize', () => { resizeCanvas(); roomLayouts.clear(); });
  clearScene();

  // Click-to-move and hover
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('mousemove', handleCanvasHover);
  canvas.addEventListener('mouseleave', () => { sceneData.hoverRoomIdx = -1; sceneData.isDragging = false; canvas.style.cursor = 'default'; });

  // Drag-to-pan camera
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    sceneData.isDragging = true;
    sceneData.wasDragging = false;
    sceneData.dragReturning = false;
    if (sceneData.dragReturnTimer) { clearTimeout(sceneData.dragReturnTimer); sceneData.dragReturnTimer = null; }
    sceneData.dragStartX = e.clientX;
    sceneData.dragStartY = e.clientY;
    sceneData.dragCamStartX = sceneData.cameraDragOffsetX;
    sceneData.dragCamStartY = sceneData.cameraDragOffsetY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!sceneData.isDragging) return;
    const dx = sceneData.dragStartX - e.clientX;
    const dy = sceneData.dragStartY - e.clientY;
    sceneData.cameraDragOffsetX = sceneData.dragCamStartX + dx;
    sceneData.cameraDragOffsetY = sceneData.dragCamStartY + dy;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) sceneData.wasDragging = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    if (sceneData.isDragging) {
      sceneData.isDragging = false;
      if (sceneData.wasDragging) {
        if (sceneData.dragReturnTimer) clearTimeout(sceneData.dragReturnTimer);
        sceneData.dragReturnTimer = setTimeout(() => {
          sceneData.dragReturning = true;
          sceneData.dragReturnTimer = null;
        }, 5000);
      } else {
        sceneData.cameraDragOffsetX = 0;
        sceneData.cameraDragOffsetY = 0;
      }
    }
  });

  // ── WASD keyboard movement ──
  const _keysHeld = new Set();
  document.addEventListener('keydown', (e) => {
    if (!G || !G.player?.alive) return;
    const modal = document.getElementById('modal-overlay');
    if (modal?.classList.contains('active')) return;
    const key = e.key.toLowerCase();
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) {
      _keysHeld.add(key);
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => {
    _keysHeld.delete(e.key.toLowerCase());
  });

  // Chat input (Enter key, multiplayer only)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && typeof Net !== 'undefined' && Net.mode !== 'OFFLINE' && G?.player?.alive) {
      const modal = document.getElementById('modal-overlay');
      if (modal?.classList.contains('active')) return;
      e.preventDefault();
      toggleChatInput();
    }
  });

  // Process WASD in animLoop — store reference on sceneData
  sceneData._keysHeld = _keysHeld;

  animLoop();
}

function screenToWorld(sx, sy) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas ? canvas.width / dpr : 500;
  const ch = canvas ? canvas.height / dpr : 400;
  const zm = sceneData.zoom || 1;
  const ux = (sx - cw / 2) / zm + cw / 2;
  const uy = (sy - ch / 2) / zm + ch / 2;
  return { x: ux + sceneData.camX - cw / 2, y: uy + sceneData.camY - ch / 2 };
}

function worldToScreen(wx, wy) {
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas ? canvas.width / dpr : 500;
  const ch = canvas ? canvas.height / dpr : 400;
  const zm = sceneData.zoom || 1;
  const ux = wx - sceneData.camX + cw / 2;
  const uy = wy - sceneData.camY + ch / 2;
  return { x: (ux - cw / 2) * zm + cw / 2, y: (uy - ch / 2) * zm + ch / 2 };
}

function handleCanvasClick(e) {
  if (!G || sceneData.playerMoving) return;
  if (sceneData.wasDragging) { sceneData.wasDragging = false; return; }
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  // Check if clicked on a remote player (multiplayer mini-profile)
  if (typeof _checkPlayerClick === 'function' && _checkPlayerClick(sx, sy)) return;
  const world = screenToWorld(sx, sy);

  const loc = currentLocation();
  if (!loc) return;
  const layout = getLocationLayout(loc);
  if (!layout) return;

  const currentFloor = G.world.currentFloor || 0;

  // Check if clicked on furniture in current room
  if (G.world.currentRoom >= 0) {
    const curRoom = layout.rooms[G.world.currentRoom];
    if (curRoom && curRoom.furniture) {
      for (let fi = 0; fi < curRoom.furniture.length; fi++) {
        const f = curRoom.furniture[fi];
        const fw = (f.w || 4) / 2 + 2, fh = (f.h || 4) / 2 + 2;
        if (world.x >= f.x - fw && world.x <= f.x + fw &&
            world.y >= f.y - fh && world.y <= f.y + fh) {
          sceneData.selectedFurnIdx = fi;
          renderPointCloud('scan');
          searchContainer(fi);
          return;
        }
      }
    }
  }

  // Check if clicked on a room
  for (let i = 0; i < layout.rooms.length; i++) {
    const lr = layout.rooms[i];
    if (lr.floorNum !== currentFloor) continue;
    if (i === G.world.currentRoom) continue;
    const hw = lr.w / 2, hh = lr.h / 2;
    if (world.x >= lr.cx - hw - 5 && world.x <= lr.cx + hw + 5 &&
        world.y >= lr.cy - hh - 5 && world.y <= lr.cy + hh + 5) {
      const rKey = loc.id + '-' + i;
      if (sceneData.scannedRooms.has(rKey) || sceneData.scannedOutdoor) {
        movePlayerToRoom(i, layout, loc);
      }
      return;
    }
  }

  // Click on front door from inside — exit building to map
  if (G.world.currentRoom >= 0) {
    const fdDist = Math.hypot(world.x - layout.frontDoorX, world.y - layout.frontDoorY);
    if (fdDist < 15) {
      G.world.currentRoom = -1;
      showMap();
      return;
    }
  }

  // Click on building shell from outdoor — enter via front door
  if (G.world.currentRoom === -1) {
    const hw = layout.buildingW / 2, hh = layout.buildingH / 2;
    if (world.x >= layout.cx - hw && world.x <= layout.cx + hw &&
        world.y >= layout.cy - hh && world.y <= layout.cy + hh) {
      const entryIdx = layout.rooms.findIndex(r => r.floorNum === 0);
      if (entryIdx >= 0) movePlayerToRoom(entryIdx, layout, loc);
    }
  }
}

function handleCanvasHover(e) {
  if (!G) return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const world = screenToWorld(sx, sy);

  const loc = currentLocation();
  if (!loc) return;
  const layout = getLocationLayout(loc);
  if (!layout) return;

  const currentFloor = G.world.currentFloor || 0;
  let found = -1;

  for (let i = 0; i < layout.rooms.length; i++) {
    const lr = layout.rooms[i];
    if (lr.floorNum !== currentFloor) continue;
    if (i === G.world.currentRoom) continue;
    const hw = lr.w / 2, hh = lr.h / 2;
    if (world.x >= lr.cx - hw - 5 && world.x <= lr.cx + hw + 5 &&
        world.y >= lr.cy - hh - 5 && world.y <= lr.cy + hh + 5) {
      const rKey = loc.id + '-' + i;
      if (sceneData.scannedRooms.has(rKey) || sceneData.scannedOutdoor) {
        found = i;
        break;
      }
    }
  }

  sceneData.hoverRoomIdx = found;
  canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
}

// ── BFS pathfinding between rooms via adjacency graph ──
function findRoomPath(fromIdx, toIdx, layout) {
  if (fromIdx === toIdx) return [fromIdx];
  const adj = layout.adjacency;
  if (!adj) return null;
  const visited = new Set([fromIdx]);
  const queue = [[fromIdx]];
  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    const neighbors = adj[last] || [];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      // Only traverse same floor
      const lr = layout.rooms.find(r => r.idx === n);
      if (!lr || lr.floorNum !== (G.world.currentFloor || 0)) continue;
      const newPath = [...path, n];
      if (n === toIdx) return newPath;
      visited.add(n);
      queue.push(newPath);
    }
  }
  return null; // no path
}

// ── Find shared door between two adjacent rooms ──
function findSharedDoor(roomA, roomB) {
  if (!roomA.sharedDoors) return null;
  for (const sd of roomA.sharedDoors) {
    if (sd.rooms.includes(roomA.idx) && sd.rooms.includes(roomB.idx)) return sd;
  }
  return null;
}

// ── Build waypoint list: player → door → room center → door → room center... ──
function getPathWaypoints(roomPath, layout) {
  const waypoints = [];
  for (let i = 0; i < roomPath.length - 1; i++) {
    const fromRoom = layout.rooms.find(r => r.idx === roomPath[i]);
    const toRoom = layout.rooms.find(r => r.idx === roomPath[i + 1]);
    if (!fromRoom || !toRoom) continue;
    const door = findSharedDoor(fromRoom, toRoom);
    if (door) {
      waypoints.push({ x: door.x, y: door.y, type: 'door', enterRoom: roomPath[i + 1] });
    }
    waypoints.push({ x: toRoom.cx, y: toRoom.cy, type: 'room', roomIdx: roomPath[i + 1] });
  }
  return waypoints;
}

// ── Animate player through a sequence of waypoints ──
function animateWaypointPath(waypoints, onComplete) {
  if (waypoints.length === 0) { if (onComplete) onComplete(); return; }
  const wp = waypoints.shift();
  animatePlayerMove(wp.x, wp.y, () => {
    if (wp.type === 'door' && wp.enterRoom !== undefined) {
      G.world.currentRoom = wp.enterRoom;
      playSound('step');
    }
    animateWaypointPath(waypoints, onComplete);
  });
}

function movePlayerToRoom(targetIdx, layout, loc) {
  const targetRoom = layout.rooms.find(r => r.idx === targetIdx);
  if (!targetRoom) return;

  const gameRoom = loc.rooms[targetIdx];
  // Stairs room — switch floor
  if (gameRoom && gameRoom.roomType === 'stairs') {
    // Path to stairs first, then switch floor
    const currentRoom = G.world.currentRoom;
    const roomPath = currentRoom >= 0 ? findRoomPath(currentRoom, targetIdx, layout) : null;
    const waypoints = roomPath ? getPathWaypoints(roomPath, layout) : [{ x: targetRoom.cx, y: targetRoom.cy, type: 'room' }];
    animateWaypointPath(waypoints, () => {
      const targetFloor = (G.world.currentFloor || 0) === 0 ? 1 : 0;
      G.world.currentFloor = targetFloor;
      transitionScene();
      const destIdx = layout.rooms.findIndex(r => r.floorNum === targetFloor);
      if (destIdx >= 0) {
        G.world.currentRoom = destIdx;
        const dr = layout.rooms[destIdx];
        sceneData.playerX = dr.cx; sceneData.playerY = dr.cy;
        sceneData.camX = dr.cx; sceneData.camY = dr.cy;
        sceneData.targetCamX = dr.cx; sceneData.targetCamY = dr.cy;
      }
      renderPointCloud('scan');
      addLog(`Вы ${targetFloor === 1 ? 'поднялись на 2-й этаж' : 'спустились на 1-й этаж'}`, 'info');
      updateUI(); playSound('step');
    });
    return;
  }

  // Normal room — pathfind through doors
  const currentRoom = G.world.currentRoom;
  const roomPath = currentRoom >= 0 ? findRoomPath(currentRoom, targetIdx, layout) : null;

  if (roomPath && roomPath.length > 1) {
    const waypoints = getPathWaypoints(roomPath, layout);
    animateWaypointPath(waypoints, () => {
      enterRoom(targetIdx);
    });
  } else {
    // Fallback: direct move (entering from outside or no path found)
    animatePlayerMove(targetRoom.cx, targetRoom.cy, () => {
      enterRoom(targetIdx);
    });
  }
  playSound('step');
}

function animatePlayerMove(tx, ty, callback) {
  sceneData.playerTargetX = tx;
  sceneData.playerTargetY = ty;
  sceneData.playerMoving = true;
  sceneData.playerMoveCallback = callback;
}

// ── Sound pulse emitter ──
function emitSoundPulse(roomIdx, intensity, color) {
  const loc = currentLocation();
  if (!loc) return;
  const layout = getLocationLayout(loc);
  if (!layout || !layout.rooms[roomIdx]) return;
  const lr = layout.rooms[roomIdx];
  sceneData.soundPulses.push({
    x: lr.cx, y: lr.cy,
    radius: 0,
    maxRadius: 20 + intensity * 15,
    life: 1.0,
    decay: 0.015,
    color: color || '#FFAA00',
  });
}

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap || !canvas) return;
  canvas.width = wrap.clientWidth * window.devicePixelRatio;
  canvas.height = wrap.clientHeight * window.devicePixelRatio;
  canvas.style.width = wrap.clientWidth + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}

function clearScene() {
  sceneData.particles = [];
  sceneData.persistentPoints = [];
  sceneData.zombieEntities = [];
  sceneData.scanWaves = [];
  sceneData.scannedRooms.clear();
  sceneData.scannedOutdoor = false;
  sceneData.ambientParticles = [];
  sceneData.playerTrail = [];
  roomLayouts.clear();
}

// ── Deterministic room layout generator (spatial, multi-floor) ──
function getLocationLayout(loc) {
  if (!loc) return null;
  if (roomLayouts.has(loc.id)) return roomLayouts.get(loc.id);

  const seed = hashStr(loc.id);
  const lrng = new RNG(seed);
  const tmpl = LOCATION_TEMPLATES[loc.type] || LOCATION_TEMPLATES.house;

  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;

  const buildingW = w * (tmpl.buildingRelW || 0.7);
  const buildingH = h * (tmpl.buildingRelH || 0.5);
  const cx = w / 2, cy = h / 2;

  const rooms = [];
  const adjacency = [];
  loc.rooms.forEach(() => adjacency.push([]));

  // Group game rooms by floor
  const floorGroups = {};
  loc.rooms.forEach((gameRoom, i) => {
    const fn = gameRoom.floorNum || 0;
    if (!floorGroups[fn]) floorGroups[fn] = [];
    floorGroups[fn].push({ gameRoom, idx: i });
  });

  // Grid subdivision — fills entire building area with no gaps
  Object.keys(floorGroups).forEach(floorNum => {
    const group = floorGroups[floorNum];
    const n = group.length;
    const bx = cx - buildingW / 2;
    const by = cy - buildingH / 2;

    // Calculate total weight for proportional sizing
    const totalWeight = group.reduce((s, g) => s + (g.gameRoom.weight || 1), 0);

    // Decide layout: rows x cols based on room count
    let cols, rows;
    if (n <= 2) { cols = n; rows = 1; }
    else if (n <= 4) { cols = 2; rows = Math.ceil(n / 2); }
    else { cols = 3; rows = Math.ceil(n / 3); }

    // Sort: corridors/stairs first (bottom), then big rooms, then closets last
    const sorted = [...group].sort((a, b) => {
      const aEntry = a.gameRoom.type === 'corridor' || a.gameRoom.type === 'stairs' ? 0 : 1;
      const bEntry = b.gameRoom.type === 'corridor' || b.gameRoom.type === 'stairs' ? 0 : 1;
      if (aEntry !== bEntry) return aEntry - bEntry;
      return (b.gameRoom.weight || 1) - (a.gameRoom.weight || 1);
    });

    // Separate: big rooms, corridor/stairs, closets
    const bigRooms = sorted.filter(it => it.gameRoom.type !== 'corridor' && it.gameRoom.type !== 'stairs' && it.gameRoom.type !== 'closet');
    const entries = sorted.filter(it => it.gameRoom.type === 'corridor' || it.gameRoom.type === 'stairs');
    const closets = sorted.filter(it => it.gameRoom.type === 'closet');

    // Build row assignments: big rooms fill upper rows, closets attach to rows with space
    const rowAssign = [];
    for (let r = 0; r < rows; r++) rowAssign.push([]);

    // Entries go to bottom row
    entries.forEach(it => rowAssign[rows - 1].push(it));

    // Big rooms fill rows from top
    bigRooms.forEach(item => {
      let minRow = 0, minCount = Infinity;
      for (let r = 0; r < rows; r++) {
        if (r === rows - 1 && entries.length > 0) continue; // skip entry row if it has corridor
        if (rowAssign[r].length < minCount) { minCount = rowAssign[r].length; minRow = r; }
      }
      rowAssign[minRow].push(item);
    });

    // Closets attach to the row with most large rooms (they'll be small strips)
    closets.forEach(item => {
      // Find row with highest total weight (closet will be small next to big rooms)
      let bestRow = 0, bestWeight = 0;
      for (let r = 0; r < rows; r++) {
        const rw = rowAssign[r].reduce((s,g) => s + (g.gameRoom.weight||1), 0);
        if (rw > bestWeight || (rw === bestWeight && rowAssign[r].length < rowAssign[bestRow].length)) {
          bestWeight = rw; bestRow = r;
        }
      }
      rowAssign[bestRow].push(item);
    });

    // Remove empty rows
    const activeRows = rowAssign.filter(r => r.length > 0);
    const actualRows = activeRows.length;
    const wallGap = 1.5; // thin wall between rooms

    // Row heights proportional to max weight in each row (realistic sizing)
    const rowWeights = activeRows.map(rowItems => {
      const maxW = Math.max(...rowItems.map(g => g.gameRoom.weight || 1));
      // Closets/small rooms get reduced height
      const hasOnlySmall = rowItems.every(g => g.gameRoom.type === 'closet' || (g.gameRoom.weight || 1) <= 1);
      return hasOnlySmall ? maxW * 0.5 : maxW;
    });
    const totalRowWeight = rowWeights.reduce((s,w) => s + w, 0);
    const rowHeights = rowWeights.map(w => (w / totalRowWeight) * buildingH);

    activeRows.forEach((rowItems, ri) => {
      const rowY = by + rowHeights.slice(0, ri).reduce((s,h) => s+h, 0);
      const rowH = rowHeights[ri];
      const rowWeight = rowItems.reduce((s, g) => s + (g.gameRoom.weight || 1), 0);
      let colX = bx;

      rowItems.forEach((item, ci) => {
        const { gameRoom, idx } = item;
        const wRatio = (gameRoom.weight || 1) / rowWeight;
        const roomW = buildingW * wRatio - wallGap;
        const roomH2 = rowH - wallGap;
        const rcx = colX + roomW / 2 + wallGap / 2;
        const rcy = rowY + roomH2 / 2 + wallGap / 2;
        colX += buildingW * wRatio;

        // Generate named furniture from ROOM_FURNITURE definitions
        // Realistic wall-hugging placement system
        const furnDefs = ROOM_FURNITURE[gameRoom.name] || [{name:'Ящик',icon:'□',shape:'box'}];
        const furniture = [];
        const margin = 3;
        const innerW = roomW - margin * 2;
        const innerH = roomH2 - margin * 2;
        // Track used linear space on each wall: 0=top, 1=right, 2=bottom, 3=left
        const wallUsed = [0, 0, 0, 0];
        const wallLen = [innerW, innerH, innerW, innerH];
        // Room edges
        const left = rcx - roomW / 2 + margin;
        const right = rcx + roomW / 2 - margin;
        const top2 = rcy - roomH2 / 2 + margin;
        const bottom2 = rcy + roomH2 / 2 - margin;

        furnDefs.forEach((fd, fi) => {
          let fx, fy, fw, fh;
          if (fd.shape === 'tall') {
            fw = Math.min(6, innerW * 0.15); fh = Math.min(14, innerH * 0.4);
            if (wallUsed[3] + fh + 1 <= wallLen[3]) {
              fx = left + fw / 2;
              fy = top2 + wallUsed[3] + fh / 2;
              wallUsed[3] += fh + 2;
            } else {
              fx = right - fw / 2;
              fy = top2 + wallUsed[1] + fh / 2;
              wallUsed[1] += fh + 2;
            }
          } else if (fd.shape === 'wide') {
            fw = Math.min(18, innerW * 0.45); fh = Math.min(6, innerH * 0.15);
            if (wallUsed[0] + fw + 1 <= wallLen[0]) {
              fx = left + wallUsed[0] + fw / 2;
              fy = top2 + fh / 2;
              wallUsed[0] += fw + 2;
            } else {
              fx = left + wallUsed[2] + fw / 2;
              fy = bottom2 - fh / 2;
              wallUsed[2] += fw + 2;
            }
          } else if (fd.shape === 'line') {
            fw = Math.min(14, innerW * 0.35); fh = Math.min(2, innerH * 0.06);
            if (wallUsed[0] + fw + 1 <= wallLen[0]) {
              fx = left + wallUsed[0] + fw / 2;
              fy = top2 + fh / 2;
              wallUsed[0] += fw + 2;
            } else if (wallUsed[2] + fw + 1 <= wallLen[2]) {
              fx = left + wallUsed[2] + fw / 2;
              fy = bottom2 - fh / 2;
              wallUsed[2] += fw + 2;
            } else {
              fx = right - fh / 2;
              fy = top2 + wallUsed[1] + fw / 2;
              wallUsed[1] += fw + 2;
              const tmp = fw; fw = fh; fh = tmp;
            }
          } else {
            fw = Math.min(6, innerW * 0.15); fh = Math.min(6, innerH * 0.15);
            if (wallUsed[2] + fw + 1 <= wallLen[2]) {
              fx = left + wallUsed[2] + fw / 2;
              fy = bottom2 - fh / 2;
              wallUsed[2] += fw + 2;
            } else if (wallUsed[0] + fw + 1 <= wallLen[0]) {
              fx = left + wallUsed[0] + fw / 2;
              fy = top2 + fh / 2;
              wallUsed[0] += fw + 2;
            } else if (wallUsed[1] + fh + 1 <= wallLen[1]) {
              fx = right - fw / 2;
              fy = top2 + wallUsed[1] + fh / 2;
              wallUsed[1] += fh + 2;
            } else {
              fx = rcx + (fi % 2 === 0 ? -1 : 1) * innerW * 0.2;
              fy = rcy;
            }
          }
          furniture.push({
            x: fx, y: fy, w: fw, h: fh,
            name: fd.name, icon: fd.icon, shape: fd.shape, furnIdx: fi,
            size: 2, type: 'box', angle: 0, length: fw,
          });
        });

        // Door position — bottom wall for first row's last item, or nearest to corridor
        let doorSide = ri === actualRows - 1 ? 2 : lrng.int(0, 3);
        let doorX, doorY;
        if (doorSide === 0) { doorX = rcx; doorY = rcy - roomH2/2; }
        else if (doorSide === 1) { doorX = rcx + roomW/2; doorY = rcy; }
        else if (doorSide === 2) { doorX = rcx; doorY = rcy + roomH2/2; }
        else { doorX = rcx - roomW/2; doorY = rcy; }

        rooms.push({
          idx, cx: rcx, cy: rcy, w: roomW, h: roomH2,
          furniture, doorX, doorY, doorSide,
          floorNum: parseInt(floorNum),
          roomType: gameRoom.roomType || 'room',
          name: gameRoom.name,
        });

        // Adjacency — adjacent rooms share a wall
        rooms.forEach(p => {
          if (p.idx === idx || p.floorNum !== parseInt(floorNum)) return;
          const touching = Math.abs(p.cx - rcx) < (p.w + roomW) / 2 + 5 &&
                           Math.abs(p.cy - rcy) < (p.h + roomH2) / 2 + 5;
          if (touching) {
            if (!adjacency[idx].includes(p.idx)) adjacency[idx].push(p.idx);
            if (!adjacency[p.idx].includes(idx)) adjacency[p.idx].push(idx);
          }
        });
      });
    });
  });

  rooms.sort((a, b) => a.idx - b.idx);

  // ── Create shared doorways between adjacent rooms ──
  for (let i = 0; i < rooms.length; i++) {
    const r1 = rooms[i];
    for (const j of adjacency[r1.idx]) {
      if (j <= r1.idx) continue;
      const r2 = rooms.find(r => r.idx === j);
      if (!r2 || r1.floorNum !== r2.floorNum) continue;

      const r1L = r1.cx - r1.w/2, r1R = r1.cx + r1.w/2;
      const r1T = r1.cy - r1.h/2, r1B = r1.cy + r1.h/2;
      const r2L = r2.cx - r2.w/2, r2R = r2.cx + r2.w/2;
      const r2T = r2.cy - r2.h/2, r2B = r2.cy + r2.h/2;

      let doorX, doorY, doorDir;

      if (Math.abs(r1B - r2T) < 4) {
        const overlapL = Math.max(r1L, r2L);
        const overlapR = Math.min(r1R, r2R);
        if (overlapR - overlapL > 12) {
          doorX = (overlapL + overlapR) / 2;
          doorY = (r1B + r2T) / 2;
          doorDir = 'h';
        }
      } else if (Math.abs(r2B - r1T) < 4) {
        const overlapL = Math.max(r1L, r2L);
        const overlapR = Math.min(r1R, r2R);
        if (overlapR - overlapL > 12) {
          doorX = (overlapL + overlapR) / 2;
          doorY = (r2B + r1T) / 2;
          doorDir = 'h';
        }
      } else if (Math.abs(r1R - r2L) < 4) {
        const overlapT = Math.max(r1T, r2T);
        const overlapB = Math.min(r1B, r2B);
        if (overlapB - overlapT > 12) {
          doorX = (r1R + r2L) / 2;
          doorY = (overlapT + overlapB) / 2;
          doorDir = 'v';
        }
      } else if (Math.abs(r2R - r1L) < 4) {
        const overlapT = Math.max(r1T, r2T);
        const overlapB = Math.min(r1B, r2B);
        if (overlapB - overlapT > 12) {
          doorX = (r2R + r1L) / 2;
          doorY = (overlapT + overlapB) / 2;
          doorDir = 'v';
        }
      }

      if (doorX !== undefined) {
        if (!r1.sharedDoors) r1.sharedDoors = [];
        if (!r2.sharedDoors) r2.sharedDoors = [];
        const door = { x: doorX, y: doorY, dir: doorDir, rooms: [r1.idx, r2.idx] };
        r1.sharedDoors.push(door);
        r2.sharedDoors.push(door);
      }
    }
  }

  // ── Determine exterior walls for each room ──
  for (const room of rooms) {
    room.exteriorWalls = [true, true, true, true]; // top, right, bottom, left
    const rL = room.cx - room.w/2, rR = room.cx + room.w/2;
    const rT = room.cy - room.h/2, rB = room.cy + room.h/2;
    for (const other of rooms) {
      if (other.idx === room.idx || other.floorNum !== room.floorNum) continue;
      const oL = other.cx - other.w/2, oR = other.cx + other.w/2;
      const oT = other.cy - other.h/2, oB = other.cx + other.h/2;
      // Check if other room covers this wall
      const hOverlap = Math.min(rR, oR) - Math.max(rL, oL) > 6;
      const oT2 = other.cy - other.h/2, oB2 = other.cy + other.h/2;
      const vOverlap = Math.min(rB, oB2) - Math.max(rT, oT2) > 6;
      if (Math.abs(rT - oB2) < 4 && hOverlap) room.exteriorWalls[0] = false; // top
      if (Math.abs(rR - oL) < 4 && vOverlap) room.exteriorWalls[1] = false;  // right
      if (Math.abs(rB - oT2) < 4 && hOverlap) room.exteriorWalls[2] = false; // bottom
      if (Math.abs(rL - oR) < 4 && vOverlap) room.exteriorWalls[3] = false;  // left
    }
  }

  const frontDoorX = cx;
  const frontDoorY = cy + buildingH / 2 + 8;

  const outdoorObjects = [];
  const outdoorCount = 8 + lrng.int(0, 12);
  for (let i = 0; i < outdoorCount; i++) {
    const angle = lrng.next() * Math.PI * 2;
    const dist = Math.max(buildingW, buildingH) * 0.55 + lrng.next() * Math.min(w, h) * 0.2;
    outdoorObjects.push({
      x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist,
      type: lrng.pick(['debris', 'tree', 'car', 'fence', 'rock']),
      size: 4 + lrng.next() * 12, angle: lrng.next() * Math.PI * 2,
      pointCount: 6 + lrng.int(0, 10),
    });
  }

  const layout = {
    cx, cy, buildingW, buildingH, rooms, outdoorObjects,
    adjacency, frontDoorX, frontDoorY,
    hasSecondFloor: loc.hasSecondFloor || false,
  };
  roomLayouts.set(loc.id, layout);
  return layout;
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return Math.abs(h) || 1;
}

// ── Generate persistent point cloud for a room (v4: marks room as scanned) ──
function generateRoomPoints(layout, roomIdx, loc) {
  const room = layout.rooms[roomIdx];
  if (!room) return [];
  const rKey = loc.id + '-' + roomIdx;
  sceneData.scannedRooms.add(rKey);
  return [];
}

// ── Refresh room points (v4: no-op, rendering is immediate) ──
function refreshRoomPoints(layout, roomIdx, loc) {}

// ── Generate outdoor points (legacy compat, now a no-op for point storage) ──
function generateOutdoorPoints(layout) {
  return [];
}

// ── Zombie entity management ──
function updateZombieEntities() {
  if (!G) return;
  const loc = currentLocation();
  if (!loc) return;
  const layout = getLocationLayout(loc);
  if (!layout) return;

  sceneData.zombieEntities = sceneData.zombieEntities.filter(z => {
    const gameRoom = loc.rooms[z.roomIdx];
    return gameRoom && gameRoom.zombies && gameRoom.zombies.currentHp > 0;
  });

  loc.rooms.forEach((room, i) => {
    if (!room.zombies || room.zombies.currentHp <= 0) return;
    const roomKey = loc.id + '-' + i;
    if (!sceneData.scannedRooms.has(roomKey) && !sceneData.scannedOutdoor) return;
    const existing = sceneData.zombieEntities.find(z => z.roomIdx === i);
    if (existing) return;
    const layoutRoom = layout.rooms[i];
    if (!layoutRoom) return;

    sceneData.zombieEntities.push({
      roomIdx: i,
      x: layoutRoom.cx + (Math.random() - 0.5) * layoutRoom.w * 0.5,
      y: layoutRoom.cy + (Math.random() - 0.5) * layoutRoom.h * 0.5,
      targetX: layoutRoom.cx,
      targetY: layoutRoom.cy,
      homeX: layoutRoom.cx,
      homeY: layoutRoom.cy,
      roomW: layoutRoom.w,
      roomH: layoutRoom.h,
      moveTimer: 0,
      moveInterval: 60 + Math.random() * 120,
      type: room.zombies.type,
      attacking: false,
      approaching: false,
      attackPhase: 0,
      pulsePhase: Math.random() * Math.PI * 2,
      pointCount: room.zombies.type === 'fat' ? 18 : room.zombies.type === 'soldier' ? 14 : 10,
      bodyPoints: [],
    });
  });
}

// ── LIDAR Scan trigger ──
function renderPointCloud(type) {
  if (!canvas || !G) return;
  const w = canvas.width / window.devicePixelRatio;
  const h = canvas.height / window.devicePixelRatio;
  const period = getTimePeriod();
  const maxRadius = period === 'night' ? Math.min(w, h) * 0.25 :
                    period === 'dusk' || period === 'dawn' ? Math.min(w, h) * 0.38 :
                    Math.min(w, h) * 0.48;

  const node = currentNode();
  const isInBuilding = node && node.type === 'building' && node.building;
  const loc = isInBuilding ? node.building : null;
  const layout = loc ? getLocationLayout(loc) : null;

  const px = sceneData.playerX || (layout ? layout.cx : w / 2);
  const py = sceneData.playerY || (layout ? layout.cy : h / 2);

  // Scan wave
  const waveSpeed = type === 'pulse' ? 3.5 : 2.0;
  const waveDuration = type === 'pulse' ? 80 : 120;
  sceneData.scanWaves.push({
    x: px, y: py,
    radius: 0,
    maxRadius: maxRadius * 1.1,
    speed: waveSpeed,
    life: waveDuration,
    maxLife: waveDuration,
    color: type === 'pulse' ? '#00FF41' : '#00E5FF',
    type,
  });

  sceneData.lastScanTime = Date.now();

  // Transient scatter particles (200-400 green particles)
  const scatterCount = type === 'pulse' ? 200 : type === 'scan' ? 350 : 150;
  const maxP = 500;
  const toAdd = Math.min(scatterCount, maxP - sceneData.particles.length);
  for (let i = 0; i < toAdd; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * maxRadius;
    const speed = type === 'pulse' ? 2.5 + Math.random() * 3 : 1 + Math.random() * 2;
    let color;
    const r = Math.random();
    if (r < 0.08) color = '#00E5FF';
    else if (r < 0.2) color = '#1a1a1a';
    else color = '#00FF41';

    sceneData.particles.push({
      x: px, y: py,
      tx: px + Math.cos(angle) * dist,
      ty: py + Math.sin(angle) * dist,
      life: 1.0,
      decay: 0.006 + Math.random() * 0.012,
      size: 0.8 + Math.random() * 1.5,
      color, speed, progress: 0,
    });
  }

  // Persistent geometry scan
  if (layout) {
    const inRoom = G.world.currentRoom >= 0;
    const roomKey = inRoom ? loc.id + '-' + G.world.currentRoom : null;
    const currentFloor = G.world.currentFloor || 0;

    if (inRoom && roomKey && !sceneData.scannedRooms.has(roomKey)) {
      sceneData.scannedRooms.add(roomKey);
    }

    if (!sceneData.scannedOutdoor) {
      sceneData.scannedOutdoor = true;
      loc.rooms.forEach((room, ri) => {
        if ((room.floorNum || 0) !== currentFloor) return;
        const rKey = loc.id + '-' + ri;
        // Mark shells as visible
        if (!sceneData.scannedRooms.has(rKey)) {
          // Will be rendered directly by animLoop now
        }
      });
    }

    updateZombieEntities();
  } else if (!layout && !sceneData.scannedOutdoor) {
    sceneData.scannedOutdoor = true;
    const cx = w / 2, cy = h / 2;
    sceneData.playerX = cx;
    sceneData.playerY = cy;
    sceneData.camX = cx;
    sceneData.camY = cy;
    sceneData.targetCamX = cx;
    sceneData.targetCamY = cy;
  }

  if (type === 'pulse' && settings.screenShake) {
    sceneData.shakeAmount = 3;
  }
}

// ── Scene transition (new location) ──
function transitionScene() {
  sceneData.persistentPoints = [];
  sceneData.zombieEntities = [];
  sceneData.scanWaves = [];
  sceneData.scannedRooms.clear();
  sceneData.scannedOutdoor = false;
  sceneData.ambientParticles = [];
  sceneData.playerTrail = [];
  roomLayouts.clear();
  setTimeout(() => {
    const loc = currentLocation();
    if (loc) {
      const layout = getLocationLayout(loc);
      if (layout) {
        // If player is in a room, position at room center (not front door)
        const curRoom = G?.world?.currentRoom;
        if (curRoom >= 0 && layout.rooms?.[curRoom]) {
          const rm = layout.rooms[curRoom];
          sceneData.playerX = rm.cx; sceneData.playerY = rm.cy;
          sceneData.camX = rm.cx; sceneData.camY = rm.cy;
        } else {
          sceneData.playerX = layout.frontDoorX;
          sceneData.playerY = layout.frontDoorY;
          sceneData.camX = layout.frontDoorX;
          sceneData.camY = layout.frontDoorY;
        }
        sceneData.targetCamX = sceneData.camX;
        sceneData.targetCamY = sceneData.camY;
        layout.rooms.forEach((r, i) => sceneData.scannedRooms.add(loc.id + '-' + i));
      }
    }
    renderPointCloud('scan');
  }, 100);
}

// ── Zombie attack animation ──
function triggerZombieAttackAnimation(roomIdx) {
  const entity = sceneData.zombieEntities.find(z => z.roomIdx === roomIdx);
  if (entity) {
    entity.attacking = true;
    entity.attackPhase = 0;
    entity.targetX = sceneData.playerX;
    entity.targetY = sceneData.playerY;
    if (settings.screenShake) sceneData.shakeAmount = 6;
  }
}

// ── Helper: draw wall segments with gaps for doorways ──
function drawWallWithGaps(ctx, x1, y1, x2, y2, gapPositions, gapSize, isHorizontal) {
  if (gapPositions.length === 0) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    return;
  }
  const halfGap = gapSize / 2;
  gapPositions.sort((a, b) => a - b);

  if (isHorizontal) {
    const startX = Math.min(x1, x2), endX = Math.max(x1, x2);
    let curX = startX;
    for (const gx of gapPositions) {
      if (gx - halfGap > curX) {
        ctx.beginPath(); ctx.moveTo(curX, y1); ctx.lineTo(gx - halfGap, y1); ctx.stroke();
      }
      // Door edge markers
      const prevAlpha = ctx.globalAlpha;
      ctx.fillStyle = '#00E5FF'; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(gx - halfGap, y1, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + halfGap, y1, 1.2, 0, Math.PI * 2); ctx.fill();
      // Animated door indicator
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.004) * 0.15;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(gx - halfGap, y1);
      ctx.lineTo(gx + halfGap, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = prevAlpha;
      curX = gx + halfGap;
    }
    if (curX < endX) {
      ctx.beginPath(); ctx.moveTo(curX, y1); ctx.lineTo(endX, y1); ctx.stroke();
    }
  } else {
    const startY = Math.min(y1, y2), endY = Math.max(y1, y2);
    let curY = startY;
    for (const gy of gapPositions) {
      if (gy - halfGap > curY) {
        ctx.beginPath(); ctx.moveTo(x1, curY); ctx.lineTo(x1, gy - halfGap); ctx.stroke();
      }
      const prevAlpha = ctx.globalAlpha;
      ctx.fillStyle = '#00E5FF'; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(x1, gy - halfGap, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x1, gy + halfGap, 1.2, 0, Math.PI * 2); ctx.fill();
      // Animated door indicator
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.3 + Math.sin(Date.now() * 0.004) * 0.15;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, gy - halfGap);
      ctx.lineTo(x1, gy + halfGap);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = prevAlpha;
      curY = gy + halfGap;
    }
    if (curY < endY) {
      ctx.beginPath(); ctx.moveTo(x1, curY); ctx.lineTo(x1, endY); ctx.stroke();
    }
  }
}

// ═══════════════════════════════════════════
