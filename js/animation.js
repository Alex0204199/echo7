// TOP-DOWN LIDAR ANIMATION LOOP v4
// ═══════════════════════════════════════════

function animLoop() {
  animId = requestAnimationFrame(animLoop);
  if (!canvas || !ctx) return;
  try { _animLoopInner(); } catch(e) { console.error('[ANIM] Error:', e.message, e.stack?.split('\n')[1]); }
}

function _animLoopInner() {
  const dpr = window.devicePixelRatio;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const now = Date.now();

  // Real-time clock tick
  if (G && G.player?.alive) tickRealTime(now);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── WASD free movement within current room (only when inside a room) ──
  if (sceneData._keysHeld && sceneData._keysHeld.size > 0 && !sceneData.playerMoving && G?.player?.alive && G.world.currentRoom >= 0) {
    const keys = sceneData._keysHeld;
    let mdx = 0, mdy = 0;
    if (keys.has('w') || keys.has('arrowup')) mdy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) mdy += 1;
    if (keys.has('a') || keys.has('arrowleft')) mdx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mdx += 1;
    if (mdx !== 0 || mdy !== 0) {
      const len = Math.hypot(mdx, mdy);
      const stealthSpd = G.player.stealthMode ? 0.4 : 0.8;
      const stepX = (mdx / len) * stealthSpd;
      const stepY = (mdy / len) * stealthSpd;
      const nx = sceneData.playerX + stepX;
      const ny = sceneData.playerY + stepY;
      // Update facing direction
      if (Math.abs(mdx) > Math.abs(mdy)) sceneData.playerDir = mdx > 0 ? 1 : 3;
      else sceneData.playerDir = mdy > 0 ? 2 : 0;
      // Collision: stay within current room bounds
      const loc = currentLocation();
      const layout = loc ? getLocationLayout(loc) : null;
      const curRoom = layout && G.world.currentRoom >= 0 ? layout.rooms.find(r => r.idx === G.world.currentRoom) : null;
      let canMove = true;
      if (curRoom) {
        const margin = 4;
        const rl = curRoom.cx - curRoom.w/2 + margin, rr = curRoom.cx + curRoom.w/2 - margin;
        const rt = curRoom.cy - curRoom.h/2 + margin, rb = curRoom.cy + curRoom.h/2 - margin;
        if (nx < rl || nx > rr || ny < rt || ny > rb) {
          canMove = false;
          // Check if walking through a shared door → transition to next room
          if (curRoom.sharedDoors) {
            for (const sd of curRoom.sharedDoors) {
              const ddist = Math.hypot(nx - sd.x, ny - sd.y);
              if (ddist < 10) {
                const otherIdx = sd.rooms.find(r => r !== curRoom.idx);
                if (otherIdx !== undefined) {
                  G.world.currentRoom = otherIdx;
                  Bus.emit('room:change', { nodeId: G.world.currentNodeId, roomIdx: otherIdx });
                  canMove = true;
                  playSound('step');
                  const gameRoom = loc.rooms[otherIdx];
                  if (gameRoom && !gameRoom.searched) {
                    addLog(`Входишь в: ${gameRoom.name}`, 'info');
                  }
                  break;
                }
              }
            }
          }
          // Check exterior door → exit building and open world map
          if (!canMove && curRoom.doorSide !== undefined) {
            const ddist = Math.hypot(nx - curRoom.doorX, ny - curRoom.doorY);
            if (ddist < 10) {
              // Exit building — open world map
              G.world.currentRoom = -1;
              showMap();
              canMove = false;
            }
          }
        }
        // Furniture collision
        if (canMove && curRoom.furniture) {
          for (const f of curRoom.furniture) {
            const fw = (f.w||4)/2 + 1, fh = (f.h||4)/2 + 1;
            if (nx > f.x - fw && nx < f.x + fw && ny > f.y - fh && ny < f.y + fh) {
              canMove = false;
              break;
            }
          }
        }
      }
      if (canMove) {
        sceneData.playerX = nx;
        sceneData.playerY = ny;
        // Walking trail
        if (!sceneData.playerTrail) sceneData.playerTrail = [];
        if (now - (sceneData._lastTrailTime||0) > 100) {
          sceneData.playerTrail.push({x: nx, y: ny, t: now});
          if (sceneData.playerTrail.length > 20) sceneData.playerTrail.shift();
          sceneData._lastTrailTime = now;
        }
      }
    }
  }

  // ── Player movement animation (click-to-move / pathfinding) ──
  if (sceneData.playerMoving) {
    const dx = sceneData.playerTargetX - sceneData.playerX;
    const dy = sceneData.playerTargetY - sceneData.playerY;
    const dist = Math.hypot(dx, dy);
    const stealthMult = G?.player?.stealthMode ? 0.4 : 1.0;
    const moveSpeed = Math.max(0.5, dist * 0.035) * stealthMult;
    if (dist < 2) {
      sceneData.playerX = sceneData.playerTargetX;
      sceneData.playerY = sceneData.playerTargetY;
      sceneData.playerMoving = false;
      if (sceneData.playerMoveCallback) {
        sceneData.playerMoveCallback();
        sceneData.playerMoveCallback = null;
      }
    } else {
      sceneData.playerX += (dx / dist) * moveSpeed;
      sceneData.playerY += (dy / dist) * moveSpeed;
      if (Math.abs(dx) > Math.abs(dy)) {
        sceneData.playerDir = dx > 0 ? 1 : 3;
      } else {
        sceneData.playerDir = dy > 0 ? 2 : 0;
      }
    }
  }

  // ── Player trail ──
  if (sceneData.playerMoving) {
    const trail = sceneData.playerTrail;
    if (trail.length === 0 || Math.hypot(sceneData.playerX - trail[trail.length - 1].x, sceneData.playerY - trail[trail.length - 1].y) > 3) {
      trail.push({ x: sceneData.playerX, y: sceneData.playerY, t: now });
      if (trail.length > 20) trail.shift();
    }
  }

  // ── Camera smooth follow ──
  sceneData.targetCamX = sceneData.playerX;
  sceneData.targetCamY = sceneData.playerY;
  if (sceneData.dragReturning) {
    sceneData.cameraDragOffsetX *= 0.9;
    sceneData.cameraDragOffsetY *= 0.9;
    if (Math.abs(sceneData.cameraDragOffsetX) < 0.5 && Math.abs(sceneData.cameraDragOffsetY) < 0.5) {
      sceneData.cameraDragOffsetX = 0;
      sceneData.cameraDragOffsetY = 0;
      sceneData.dragReturning = false;
    }
  }
  const camTargetX = sceneData.targetCamX + sceneData.cameraDragOffsetX;
  const camTargetY = sceneData.targetCamY + sceneData.cameraDragOffsetY;
  const camLerp = sceneData.isDragging ? 0.15 : 0.08;
  sceneData.camX += (camTargetX - sceneData.camX) * camLerp;
  sceneData.camY += (camTargetY - sceneData.camY) * camLerp;

  // ── Background — solid dark fill ──
  ctx.fillStyle = '#040804';
  ctx.fillRect(0, 0, w, h);

  // Apply zoom
  const zm = sceneData.zoom;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zm, zm);
  ctx.translate(-w / 2, -h / 2);

  // Player screen position
  const screenPX = sceneData.playerX - sceneData.camX + w / 2;
  const screenPY = sceneData.playerY - sceneData.camY + h / 2;

  // Screen shake
  if (sceneData.shakeAmount > 0.1) {
    const shx = (Math.random() - 0.5) * sceneData.shakeAmount;
    const shy = (Math.random() - 0.5) * sceneData.shakeAmount;
    ctx.translate(shx, shy);
    sceneData.shakeAmount *= sceneData.shakeDecay;
  } else {
    sceneData.shakeAmount = 0;
  }

  // ══════════════════════════════════════
  // TOP-DOWN ROOM RENDERING
  // ══════════════════════════════════════
  if (G) {
    const loc = currentLocation();
    const layout = loc ? getLocationLayout(loc) : null;

    if (layout) {
      const currentFloor = G.world.currentFloor || 0;
      const currentRoomIdx = G.world.currentRoom;

      for (let ri = 0; ri < layout.rooms.length; ri++) {
        const lr = layout.rooms[ri];
        if (lr.floorNum !== currentFloor) continue;

        const rKey = loc.id + '-' + ri;
        const isScanned = sceneData.scannedRooms.has(rKey) || sceneData.scannedOutdoor;
        const isCurrent = ri === currentRoomIdx;
        const isHover = ri === sceneData.hoverRoomIdx;
        const gameRoom = loc.rooms[ri];
        const hasZ = gameRoom && gameRoom.zombies && gameRoom.zombies.currentHp > 0;
        const isSearched = gameRoom && gameRoom.searched;
        const isStairs = lr.roomType === 'stairs';
        const isCorridor = lr.roomType === 'corridor';

        // Room rect in screen coords
        const rx = lr.cx - lr.w / 2 - sceneData.camX + w / 2;
        const ry = lr.cy - lr.h / 2 - sceneData.camY + h / 2;
        const rw = lr.w;
        const rh = lr.h;

        // Cull off-screen rooms
        if (rx + rw < -20 || rx > w + 20 || ry + rh < -20 || ry > h + 20) continue;

        // ── Floor grid ──
        const gridAlpha = isCurrent ? 0.08 : isScanned ? 0.03 : 0.015;
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();

        // Floor fill — different tint per room type
        let floorColor;
        if (isCurrent) {
          if (isStairs) floorColor = 'rgba(255,224,0,0.06)';
          else if (isCorridor) floorColor = 'rgba(0,229,255,0.05)';
          else floorColor = 'rgba(0,229,255,0.08)';
        } else if (isScanned) {
          if (hasZ) floorColor = 'rgba(255,34,68,0.03)';
          else if (isStairs) floorColor = 'rgba(255,224,0,0.03)';
          else floorColor = 'rgba(0,255,65,0.04)';
        } else {
          floorColor = 'rgba(0,255,65,0.015)';
        }
        ctx.fillStyle = floorColor;
        ctx.fillRect(rx, ry, rw, rh);

        // Dotted grid pattern
        ctx.strokeStyle = isCurrent ? 'rgba(0,229,255,0.12)' : 'rgba(0,255,65,0.05)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([1, 4]);
        const gridStep = 15;
        for (let gx = rx - ((rx % gridStep) + gridStep) % gridStep; gx < rx + rw; gx += gridStep) {
          ctx.beginPath();
          ctx.moveTo(gx, ry);
          ctx.lineTo(gx, ry + rh);
          ctx.stroke();
        }
        for (let gy = ry - ((ry % gridStep) + gridStep) % gridStep; gy < ry + rh; gy += gridStep) {
          ctx.beginPath();
          ctx.moveTo(rx, gy);
          ctx.lineTo(rx + rw, gy);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();

        // Hover highlight
        if (isHover) {
          ctx.fillStyle = `rgba(0,255,65,${0.04 + Math.sin(now * 0.005) * 0.02})`;
          ctx.fillRect(rx, ry, rw, rh);
        }

        // ── Wall color selection ──
        let wallColor;
        if (isCurrent) wallColor = '#00E5FF';
        else if (isStairs) wallColor = '#FFE000';
        else if (isCorridor) wallColor = '#007766';
        else if (hasZ) wallColor = '#4a1520';
        else if (isSearched) wallColor = '#00a82b';
        else if (isScanned) wallColor = '#00FF41';
        else wallColor = '#0d2a0d';

        const wallAlpha = isCurrent ? 0.95 : isScanned ? 0.7 : 0.35;
        const wallWidth = isCurrent ? 4 : isScanned ? 3 : 2;

        // ── Walls with glow — thick bright lines ──
        ctx.save();
        ctx.globalAlpha = wallAlpha;
        ctx.strokeStyle = wallColor;
        ctx.lineWidth = wallWidth;
        if (isCurrent || (isScanned && !hasZ)) {
          ctx.shadowColor = wallColor;
          ctx.shadowBlur = 8;
        }

        // Draw 4 wall segments with gaps at all shared doorways
        const doorGap = 14;
        const sides = [
          { x1: rx, y1: ry, x2: rx + rw, y2: ry },             // top (0)
          { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh },   // right (1)
          { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh },   // bottom (2)
          { x1: rx, y1: ry + rh, x2: rx, y2: ry },              // left (3)
        ];

        for (let si = 0; si < 4; si++) {
          const side = sides[si];
          const isHoriz = (si === 0 || si === 2);
          const gaps = [];

          // Original room door
          if (lr.doorSide === si) {
            if (isHoriz) {
              gaps.push((side.x1 + side.x2) / 2);
            } else {
              gaps.push((side.y1 + side.y2) / 2);
            }
          }

          // Shared doors on this wall
          if (lr.sharedDoors) {
            for (const sd of lr.sharedDoors) {
              const sdScreenX = sd.x - sceneData.camX + w / 2;
              const sdScreenY = sd.y - sceneData.camY + h / 2;
              if (isHoriz && sd.dir === 'h') {
                const wallY = (si === 0) ? ry : ry + rh;
                if (Math.abs(wallY - sdScreenY) < 3) {
                  gaps.push(sdScreenX);
                }
              } else if (!isHoriz && sd.dir === 'v') {
                const wallX = (si === 1) ? rx + rw : rx;
                if (Math.abs(wallX - sdScreenX) < 3) {
                  gaps.push(sdScreenY);
                }
              }
            }
          }

          drawWallWithGaps(ctx, side.x1, side.y1, side.x2, side.y2, gaps, doorGap, isHoriz);

          // ── Exterior wall double-line effect ──
          if (lr.exteriorWalls && lr.exteriorWalls[si]) {
            ctx.save();
            ctx.globalAlpha = wallAlpha * 0.3;
            ctx.lineWidth = wallWidth + 2;
            drawWallWithGaps(ctx, side.x1, side.y1, side.x2, side.y2, gaps, doorGap, isHoriz);
            ctx.restore();
            // Restore wall style
            ctx.globalAlpha = wallAlpha;
            ctx.strokeStyle = wallColor;
            ctx.lineWidth = wallWidth;
            if (isCurrent || (isScanned && !hasZ)) {
              ctx.shadowColor = wallColor;
              ctx.shadowBlur = 8;
            }
          }

          // ── Windows on exterior walls ──
          if (lr.exteriorWalls && lr.exteriorWalls[si] && (isScanned || isCurrent)) {
            const wallLen = isHoriz ? Math.abs(side.x2 - side.x1) : Math.abs(side.y2 - side.y1);
            const numWindows = Math.floor(wallLen / 25);
            if (numWindows > 0) {
              ctx.save();
              ctx.strokeStyle = 'rgba(0,229,255,0.15)';
              ctx.lineWidth = 0.5;
              ctx.shadowBlur = 0;
              for (let wi = 0; wi < numWindows; wi++) {
                const t = (wi + 1) / (numWindows + 1);
                const wx = side.x1 + (side.x2 - side.x1) * t;
                const wy = side.y1 + (side.y2 - side.y1) * t;
                const wSize = 4;
                if (isHoriz) {
                  ctx.strokeRect(wx - wSize / 2, wy - 1.5, wSize, 3);
                } else {
                  ctx.strokeRect(wx - 1.5, wy - wSize / 2, 3, wSize);
                }
              }
              ctx.restore();
              // Restore wall style after window drawing
              ctx.globalAlpha = wallAlpha;
              ctx.strokeStyle = wallColor;
              ctx.lineWidth = wallWidth;
              if (isCurrent || (isScanned && !hasZ)) {
                ctx.shadowColor = wallColor;
                ctx.shadowBlur = 8;
              }
            }
          }
        }

        ctx.shadowBlur = 0;
        ctx.restore();

        // ── Furniture ──
        if (isCurrent || isSearched) {
          for (let fi = 0; fi < lr.furniture.length; fi++) {
            const furn = lr.furniture[fi];
            const fsx = furn.x - sceneData.camX + w / 2;
            const fsy = furn.y - sceneData.camY + h / 2;

            if (fsx < -30 || fsx > w + 30 || fsy < -30 || fsy > h + 30) continue;

            const isSelected = sceneData.selectedFurnIdx === fi && isCurrent;
            const distToPlayer = Math.hypot(furn.x - sceneData.playerX, furn.y - sceneData.playerY);
            const isNearby = distToPlayer < 30;

            const fw = (furn.w || 4) / 2;
            const fh = (furn.h || 4) / 2;

            // Furniture fill
            let furnFill, furnBorder;
            if (isSelected) {
              furnFill = 'rgba(0,229,255,0.25)';
              furnBorder = '#00E5FF';
            } else if (isNearby) {
              furnFill = 'rgba(0,255,65,0.15)';
              furnBorder = '#00FF41';
            } else if (isSearched) {
              furnFill = 'rgba(0,255,65,0.06)';
              furnBorder = '#004d12';
            } else {
              furnFill = 'rgba(0,255,65,0.1)';
              furnBorder = '#00a82b';
            }

            // Draw furniture based on shape type
            ctx.fillStyle = furnFill;
            ctx.strokeStyle = furnBorder;
            ctx.lineWidth = isSelected ? 1.5 : 0.8;
            ctx.globalAlpha = isSelected ? 0.9 : isNearby ? 0.7 : 0.5;

            if (isSelected) { ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 6; }

            if (furn.shape === 'tall') {
              // Wardrobe — filled rect with shelf lines
              ctx.fillRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.strokeRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.globalAlpha *= 0.4;
              const shelfCount = Math.max(2, Math.floor(fh*2 / 5));
              for (let sl=1; sl<shelfCount; sl++) {
                const sly = fsy - fh + sl * (fh*2/shelfCount);
                ctx.beginPath(); ctx.moveTo(fsx-fw+1, sly); ctx.lineTo(fsx+fw-1, sly); ctx.stroke();
              }
            } else if (furn.shape === 'wide') {
              // Table/bed — filled rect with center cross
              ctx.fillRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.strokeRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.globalAlpha *= 0.3;
              ctx.beginPath(); ctx.moveTo(fsx, fsy-fh+1); ctx.lineTo(fsx, fsy+fh-1); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(fsx-fw+1, fsy); ctx.lineTo(fsx+fw-1, fsy); ctx.stroke();
            } else if (furn.shape === 'line') {
              // Shelf — thin line with tick marks
              ctx.fillRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.strokeRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.globalAlpha *= 0.4;
              const ticks = Math.max(2, Math.floor(fw*2 / 4));
              for (let ti=1; ti<ticks; ti++) {
                const tx = fsx - fw + ti * (fw*2/ticks);
                ctx.beginPath(); ctx.moveTo(tx, fsy-fh); ctx.lineTo(tx, fsy+fh); ctx.stroke();
              }
            } else {
              // Box — small container with X mark
              ctx.fillRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.strokeRect(fsx-fw, fsy-fh, fw*2, fh*2);
              ctx.globalAlpha *= 0.4;
              ctx.beginPath(); ctx.moveTo(fsx-fw+1, fsy-fh+1); ctx.lineTo(fsx+fw-1, fsy+fh-1); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(fsx+fw-1, fsy-fh+1); ctx.lineTo(fsx-fw+1, fsy+fh-1); ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;

            // Name label when nearby
            if (isNearby && furn.name) {
              ctx.globalAlpha = isSelected ? 0.9 : 0.65;
              ctx.fillStyle = isSelected ? '#00E5FF' : '#00FF41';
              ctx.font = '7px "Courier New", monospace';
              ctx.textAlign = 'center';
              ctx.fillText(furn.name, fsx, fsy - fh - 4);
              ctx.globalAlpha = 1;
            }
          }
        }

        // ── Stairs indicator ──
        if (isStairs && (isScanned || isCurrent)) {
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#FFE000';
          ctx.lineWidth = 1;
          const rcx = lr.cx - sceneData.camX + w / 2;
          const rcy = lr.cy - sceneData.camY + h / 2;
          for (let k = 0; k < 5; k++) {
            const t = k / 5;
            const sy1 = rcy - rh * 0.3 + t * rh * 0.15;
            ctx.beginPath();
            ctx.moveTo(rcx - rw * 0.2, sy1);
            ctx.lineTo(rcx + rw * 0.2, sy1);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }

        // ── Room name label ──
        if (isScanned || isCurrent) {
          const rcx = lr.cx - sceneData.camX + w / 2;
          const rcy = lr.cy - sceneData.camY + h / 2;
          ctx.font = '8px "Courier New", monospace';
          ctx.textAlign = 'center';
          ctx.globalAlpha = isCurrent ? 0.7 : isHover ? 0.8 : 0.35;
          ctx.fillStyle = isCurrent ? '#00E5FF' : isHover ? '#00FF41' : wallColor;
          ctx.fillText(lr.name || '', rcx, rcy - rh * 0.3);
          ctx.globalAlpha = 1;
        }
      }

      // ── Building outer envelope ──
      if (layout) {
        const bx = layout.cx - layout.buildingW / 2 - sceneData.camX + w / 2;
        const by2 = layout.cy - layout.buildingH / 2 - sceneData.camY + h / 2;
        const bw2 = layout.buildingW;
        const bh2 = layout.buildingH;
        ctx.save();
        ctx.strokeStyle = '#00FF41';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;
        ctx.shadowColor = '#00FF41';
        ctx.shadowBlur = 4;
        ctx.strokeRect(bx, by2, bw2, bh2);
        ctx.restore();
      }

      // ── Floor indicator for multi-floor ──
      if (layout.hasSecondFloor) {
        const floorLabel = (G.world.currentFloor || 0) === 0 ? '1F' : '2F';
        const flx = layout.cx + layout.buildingW / 2 - 10 - sceneData.camX + w / 2;
        const fly = layout.cy - layout.buildingH / 2 + 8 - sceneData.camY + h / 2;
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#FFE000';
        ctx.font = '9px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(floorLabel, flx, fly);
        ctx.globalAlpha = 1;
      }

      // ── Front door marker ──
      if (sceneData.scannedOutdoor) {
        const fdx = layout.frontDoorX - sceneData.camX + w / 2;
        const fdy = layout.frontDoorY - sceneData.camY + h / 2;
        ctx.globalAlpha = 0.6 + Math.sin(now * 0.003) * 0.2;
        ctx.fillStyle = '#00E5FF';
        ctx.beginPath();
        ctx.arc(fdx, fdy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (sceneData.scannedOutdoor) {
      // ── Outdoor node rendering (roads, landmarks) ──
      // Scene is anchored to player position so it scrolls with camera
      const node = currentNode();
      const nt = node ? NODE_TYPES[node.type] : null;
      const ox = screenPX, oy = screenPY; // scene origin = player screen pos

      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = '#1a3a1a';
      ctx.lineWidth = 1.2;

      if (node && (node.type === 'road' || node.type === 'intersection' || node.type === 'alley' || node.type === 'car_wreck')) {
        const roadW = node.type === 'alley' ? 30 : 50;
        const heading = G.world.lastHeading || { dx: 1, dy: 0 };
        const isVert = Math.abs(heading.dy) > Math.abs(heading.dx);
        const ext = 140; // road extends this far from center

        if (node.type === 'intersection') {
          ctx.beginPath(); ctx.moveTo(ox - ext, oy - roadW/2); ctx.lineTo(ox + ext, oy - roadW/2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox - ext, oy + roadW/2); ctx.lineTo(ox + ext, oy + roadW/2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox - roadW/2, oy - ext); ctx.lineTo(ox - roadW/2, oy + ext); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox + roadW/2, oy - ext); ctx.lineTo(ox + roadW/2, oy + ext); ctx.stroke();
          ctx.strokeStyle = '#333300'; ctx.globalAlpha = 0.15; ctx.setLineDash([4, 8]);
          ctx.beginPath(); ctx.moveTo(ox - ext+20, oy); ctx.lineTo(ox + ext-20, oy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox, oy - ext+20); ctx.lineTo(ox, oy + ext-20); ctx.stroke();
          ctx.setLineDash([]);
        } else if (isVert) {
          ctx.beginPath(); ctx.moveTo(ox - roadW/2, oy - ext); ctx.lineTo(ox - roadW/2, oy + ext); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox + roadW/2, oy - ext); ctx.lineTo(ox + roadW/2, oy + ext); ctx.stroke();
          ctx.strokeStyle = '#333300'; ctx.globalAlpha = 0.15; ctx.setLineDash([4, 8]);
          ctx.beginPath(); ctx.moveTo(ox, oy - ext+20); ctx.lineTo(ox, oy + ext-20); ctx.stroke();
          ctx.setLineDash([]);
        } else {
          ctx.beginPath(); ctx.moveTo(ox - ext, oy - roadW/2); ctx.lineTo(ox + ext, oy - roadW/2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox - ext, oy + roadW/2); ctx.lineTo(ox + ext, oy + roadW/2); ctx.stroke();
          ctx.strokeStyle = '#333300'; ctx.globalAlpha = 0.15; ctx.setLineDash([4, 8]);
          ctx.beginPath(); ctx.moveTo(ox - ext+20, oy); ctx.lineTo(ox + ext-20, oy); ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw car wreck on road
        if (node.type === 'car_wreck') {
          ctx.globalAlpha = 0.5; ctx.strokeStyle = '#882233'; ctx.lineWidth = 1.5;
          // Car body
          ctx.strokeRect(ox - 22, oy - 12, 44, 24);
          // Windshield
          ctx.beginPath(); ctx.moveTo(ox - 10, oy - 12); ctx.lineTo(ox - 6, oy - 18); ctx.lineTo(ox + 6, oy - 18); ctx.lineTo(ox + 10, oy - 12); ctx.stroke();
          // Damage marks
          ctx.strokeStyle = '#661122'; ctx.globalAlpha = 0.3;
          ctx.beginPath(); ctx.moveTo(ox - 18, oy - 5); ctx.lineTo(ox - 8, oy + 3); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox + 12, oy - 8); ctx.lineTo(ox + 20, oy + 2); ctx.stroke();
          // "Lootable" indicator if not searched
          if (!node.searched) {
            ctx.globalAlpha = 0.6; ctx.fillStyle = '#ff8800'; ctx.font = '8px monospace'; ctx.textAlign = 'center';
            ctx.fillText('🔍', ox, oy + 28);
          }
        }
      }

      // Parking
      if (node && node.type === 'parking') {
        ctx.globalAlpha = 0.2; ctx.strokeStyle = '#1a2a1a'; ctx.lineWidth = 1;
        for (let c = 0; c < 4; c++) ctx.strokeRect(ox - 70 + c * 40, oy - 15 + (c%2)*35, 30, 15);
      }

      // Bus stop
      if (node && node.type === 'bus_stop') {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 1.3;
        ctx.strokeRect(ox + 15, oy - 25, 30, 25);
      }

      // Forest
      if (node && (node.type === 'forest_trail' || node.type === 'forest_clearing')) {
        ctx.globalAlpha = 0.2; ctx.fillStyle = '#0a2a0a';
        for (let t = 0; t < 12; t++) {
          ctx.beginPath(); ctx.arc(ox + Math.sin(t*1.7)*80, oy + Math.cos(t*2.3)*80, 5, 0, Math.PI*2); ctx.fill();
        }
      }

      // Gas station
      if (node && node.type === 'gas_station') {
        ctx.globalAlpha = 0.3; ctx.strokeStyle = '#3a3a1a'; ctx.lineWidth = 1.3;
        ctx.strokeRect(ox - 40, oy - 30, 80, 40);
        ctx.fillStyle = '#3a3a1a';
        for (let p2 = 0; p2 < 3; p2++) ctx.fillRect(ox - 25 + p2*25 - 2, oy - 12, 4, 4);
      }

      // Airdrop crate
      if (node && node.isAirdrop && !node.searched) {
        ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 2;
        ctx.strokeRect(ox - 18, oy - 14, 36, 28);
        ctx.beginPath(); ctx.moveTo(ox - 18, oy); ctx.lineTo(ox + 18, oy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy - 14); ctx.lineTo(ox, oy + 14); ctx.stroke();
        ctx.globalAlpha = 0.8; ctx.fillStyle = '#ff8c00'; ctx.font = '10px monospace'; ctx.textAlign = 'center';
        ctx.fillText('📦 СБРОС', ox, oy - 22);
      }

      // Location label
      if (node) {
        const nodeName = node.isAirdrop ? 'Точка сброса' : (node.streetName || node.name || (nt && nt.name) || '');
        ctx.globalAlpha = 0.6; ctx.fillStyle = '#00E5FF';
        ctx.font = '9px "Courier New", monospace'; ctx.textAlign = 'center';
        ctx.fillText(nodeName, ox, oy - 65);
      }

      ctx.globalAlpha = 1;
    }
  }

  // ══════════════════════════════════════
  // ZOMBIE ENTITIES (top-down red circles)
  // ══════════════════════════════════════
  const pWorldX = sceneData.playerX;
  const pWorldY = sceneData.playerY;
  for (let i = 0; i < sceneData.zombieEntities.length; i++) {
    const z = sceneData.zombieEntities[i];
    z.pulsePhase += 0.05;
    z.moveTimer++;

    if (z.approaching) {
      const dx = pWorldX - z.x;
      const dy = pWorldY - z.y;
      const dist = Math.hypot(dx, dy);
      const approachSpeed = z.type === 'runner' ? 0.8 : 0.4;
      if (dist < 15) {
        z.approaching = false;
        z.arrivedCombat = true;
        if (settings.screenShake) sceneData.shakeAmount = 6;
        const loc = currentLocation();
        if (loc && loc.rooms[z.roomIdx] && loc.rooms[z.roomIdx].zombies) {
          const gameZombie = loc.rooms[z.roomIdx].zombies;
          addLog(`${gameZombie.name} пришёл на шум и нападает!`, 'danger');
          playSound('alert');
          startCombat(gameZombie, loc.rooms[z.roomIdx]);
        }
      } else {
        z.x += (dx / dist) * approachSpeed;
        z.y += (dy / dist) * approachSpeed;
      }
    } else if (z.attacking) {
      z.attackPhase += 0.03;
      z.targetX = pWorldX;
      z.targetY = pWorldY;
      const t = Math.min(1, z.attackPhase);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      z.x = z.x + (z.targetX - z.x) * eased * 0.08;
      z.y = z.y + (z.targetY - z.y) * eased * 0.08;

      const distToPlayer = Math.hypot(z.x - pWorldX, z.y - pWorldY);
      if (distToPlayer < 40 && settings.screenShake) {
        sceneData.shakeAmount = Math.max(sceneData.shakeAmount, 2 + (1 - distToPlayer / 40) * 5);
      }

      if (z.attackPhase > 1.5) {
        z.attacking = false;
        z.x = z.homeX + (Math.random() - 0.5) * z.roomW * 0.3;
        z.y = z.homeY + (Math.random() - 0.5) * z.roomH * 0.3;
      }
    } else {
      if (z.moveTimer > z.moveInterval) {
        z.moveTimer = 0;
        z.moveInterval = 80 + Math.random() * 160;
        z.targetX = z.homeX + (Math.random() - 0.5) * z.roomW * 0.5;
        z.targetY = z.homeY + (Math.random() - 0.5) * z.roomH * 0.5;
      }
      z.x += (z.targetX - z.x) * 0.01;
      z.y += (z.targetY - z.y) * 0.01;

      if (settings.soundVis && z.moveTimer % 120 === 0 && G && G.world.currentRoom !== z.roomIdx) {
        emitSoundPulse(z.roomIdx, 1, '#FF4444');
      }
    }

    // Zombie noise attraction
    if (!z.attacking && !z.approaching && !z.arrivedCombat && G && G.world.currentRoom !== z.roomIdx) {
      const noise = G.player.moodles.noise || 0;
      const zombieHearing = G.difficulty.zombieHearing || 1;
      const distToPlayer = Math.hypot(z.x - pWorldX, z.y - pWorldY);
      if (noise > 30 && distToPlayer < 200) {
        if (Math.random() < 0.001 * noise * zombieHearing) {
          z.approaching = true;
          addLog(`Шум привлёк зомби из другой комнаты!`, 'warning');
          if (settings.soundVis) emitSoundPulse(z.roomIdx, 3, '#FF2244');
        }
      }
    }

    // Draw zombie — red circle core + scattered dots
    const zsx = z.x - sceneData.camX + w / 2;
    const zsy = z.y - sceneData.camY + h / 2;
    if (zsx < -30 || zsx > w + 30 || zsy < -30 || zsy > h + 30) continue;

    const zombiePulse = Math.sin(z.pulsePhase);
    const distToPlayer = Math.hypot(z.x - pWorldX, z.y - pWorldY);
    const pulseFreq = z.attacking || z.approaching ? 0.15 : 0.03 + Math.max(0, 1 - distToPlayer / 150) * 0.08;
    z.pulsePhase += pulseFreq;

    const zombieAlpha = z.attacking || z.approaching ?
      0.6 + Math.sin(z.pulsePhase * 3) * 0.4 :
      0.3 + zombiePulse * 0.2 + Math.max(0, 1 - distToPlayer / 100) * 0.3;

    const bodyRadius = z.type === 'fat' ? 5 : z.type === 'soldier' ? 4 : 3;
    const attackScale = z.attacking ? 1 + z.attackPhase * 0.8 : 1;

    // Pulsating red glow when approaching
    if ((z.approaching || z.attacking) && distToPlayer < 120) {
      const glowR = bodyRadius * 4 * attackScale;
      const glowAlpha = (1 - distToPlayer / 120) * 0.15 * (0.6 + zombiePulse * 0.4);
      const zGrad = ctx.createRadialGradient(zsx, zsy, 0, zsx, zsy, glowR);
      zGrad.addColorStop(0, `rgba(255,34,68,${glowAlpha})`);
      zGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = zGrad;
      ctx.fillRect(zsx - glowR, zsy - glowR, glowR * 2, glowR * 2);
    }

    // Zombie ambient glow (simple circle, no gradient for perf)
    const ambientGlowR = bodyRadius * 4 * attackScale;
    ctx.globalAlpha = (0.04 + (1 - Math.min(1, distToPlayer/150)) * 0.06) * (0.7 + zombiePulse*0.3);
    ctx.fillStyle = '#FF2244';
    ctx.beginPath(); ctx.arc(zsx, zsy, ambientGlowR, 0, Math.PI*2); ctx.fill();

    // Red body core with shadow glow
    ctx.save();
    ctx.globalAlpha = zombieAlpha;
    ctx.fillStyle = '#FF2244';
    ctx.shadowColor = '#FF2244'; ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(zsx, zsy, bodyRadius * attackScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bright eye dot
    ctx.fillStyle = '#FF6688';
    ctx.globalAlpha = zombieAlpha * 0.8;
    ctx.beginPath(); ctx.arc(zsx + 1, zsy - 1, 1.2, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // Scattered noise cloud (12-16 points, orbiting)
    const scatterPts = Math.min(z.pointCount + 4, 16);
    for (let p = 0; p < scatterPts; p++) {
      const angle = (p / scatterPts) * Math.PI * 2 + now * 0.001 + z.pulsePhase * 0.3;
      const dist2 = bodyRadius * (0.8 + Math.sin(angle*2 + now*0.003) * 0.6) * attackScale;
      const zpx = zsx + Math.cos(angle) * dist2;
      const zpy = zsy + Math.sin(angle) * dist2;
      const dotSz = 0.8 + Math.random() * 1.2;
      ctx.globalAlpha = zombieAlpha * (0.3 + Math.random() * 0.5);
      ctx.fillStyle = '#FF2244';
      ctx.fillRect(zpx - dotSz/2, zpy - dotSz/2, dotSz, dotSz);
    }

    // Red aura when close
    if (distToPlayer < 80 && !z.attacking && !z.approaching) {
      const haloAlpha = (1 - distToPlayer / 80) * 0.12 * (0.6 + zombiePulse * 0.4);
      const haloGrad = ctx.createRadialGradient(zsx, zsy, 0, zsx, zsy, bodyRadius * 4);
      haloGrad.addColorStop(0, `rgba(255,34,68,${haloAlpha})`);
      haloGrad.addColorStop(1, 'transparent');
      ctx.globalAlpha = 1;
      ctx.fillStyle = haloGrad;
      ctx.beginPath(); ctx.arc(zsx, zsy, bodyRadius*4, 0, Math.PI*2); ctx.fill();
    }

    // Attack/approach particles
    if ((z.attacking || z.approaching) && Math.random() < 0.4 && sceneData.particles.length < 500) {
      sceneData.particles.push({
        x: z.x + (Math.random() - 0.5) * 4, y: z.y + (Math.random() - 0.5) * 4,
        tx: z.x + (Math.random() - 0.5) * 8, ty: z.y + (Math.random() - 0.5) * 8,
        life: 0.4 + Math.random() * 0.3, decay: 0.02, size: 1, color: '#FF2244',
        speed: 0, progress: 1,
      });
    }
  }
  ctx.globalAlpha = 1;

  // ══════════════════════════════════════
  // SCAN WAVES (expanding circles)
  // ══════════════════════════════════════
  for (let i = sceneData.scanWaves.length - 1; i >= 0; i--) {
    const sw = sceneData.scanWaves[i];
    sw.radius += sw.speed;
    sw.life--;

    if (sw.life <= 0 || sw.radius > sw.maxRadius) {
      sceneData.scanWaves.splice(i, 1);
      continue;
    }

    const lifeRatio = sw.life / sw.maxLife;
    const alpha = lifeRatio * 0.4;
    const swSX = sw.x - sceneData.camX + w / 2;
    const swSY = sw.y - sceneData.camY + h / 2;

    // Expanding ring
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = sw.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(swSX, swSY, sw.radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner glow ring
    ctx.globalAlpha = alpha * 0.25;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(swSX, swSY, Math.max(0, sw.radius - 2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════
  // SOUND PULSES (expanding circles)
  // ══════════════════════════════════════
  if (settings.soundVis) {
    for (let i = sceneData.soundPulses.length - 1; i >= 0; i--) {
      const sp = sceneData.soundPulses[i];
      sp.radius += 1.2;
      sp.life -= sp.decay;
      if (sp.life <= 0 || sp.radius > sp.maxRadius) {
        sceneData.soundPulses.splice(i, 1);
        continue;
      }
      const spx = sp.x - sceneData.camX + w / 2;
      const spy = sp.y - sceneData.camY + h / 2;
      ctx.beginPath();
      ctx.arc(spx, spy, sp.radius, 0, Math.PI * 2);
      ctx.strokeStyle = sp.color;
      ctx.globalAlpha = sp.life * 0.3;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════
  // FOG OF WAR / VISIBILITY
  // ══════════════════════════════════════
  if (G) {
    const period = getTimePeriod();
    const hasTorch = hasItem('torch');
    const torchBonus = hasTorch ? 20 : 0;

    let visRadius;
    if (period === 'night') visRadius = 80 + torchBonus;
    else if (period === 'dusk' || period === 'dawn') visRadius = 140 + torchBonus * 0.5;
    else visRadius = 180;

    // Darkening gradient from player
    const darkStrength = period === 'night' ? 0.65 : period === 'dusk' || period === 'dawn' ? 0.45 : 0.25;
    const vGrad = ctx.createRadialGradient(screenPX, screenPY, visRadius * 0.4, screenPX, screenPY, visRadius * 1.8);
    vGrad.addColorStop(0, 'transparent');
    vGrad.addColorStop(0.6, `rgba(4,8,4,${darkStrength * 0.3})`);
    vGrad.addColorStop(1, `rgba(4,8,4,${darkStrength})`);
    ctx.fillStyle = vGrad;
    ctx.fillRect(-50, -50, w + 100, h + 100);

    // Torch warm glow at night
    if (hasTorch && (period === 'night' || period === 'dusk')) {
      const tGrad = ctx.createRadialGradient(screenPX, screenPY, 0, screenPX, screenPY, visRadius * 0.8);
      tGrad.addColorStop(0, 'rgba(255,160,40,0.04)');
      tGrad.addColorStop(0.5, 'rgba(255,100,20,0.015)');
      tGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = tGrad;
      ctx.fillRect(-50, -50, w + 100, h + 100);
    }
  }

  // ══════════════════════════════════════
  // PLAYER (top-down circle + ring + glow)
  // ══════════════════════════════════════
  sceneData.playerGlow = (sceneData.playerGlow + 0.03) % (Math.PI * 2);
  const glowIntensity = 0.3 + Math.sin(sceneData.playerGlow) * 0.15;

  // Walking trail — fading dots
  const trail = sceneData.playerTrail;
  for (let ti = 0; ti < trail.length; ti++) {
    const tp = trail[ti];
    const age = (now - tp.t) / 2000;
    if (age > 1) continue;
    const tsx = tp.x - sceneData.camX + w / 2;
    const tsy = tp.y - sceneData.camY + h / 2;
    ctx.globalAlpha = (1 - age) * 0.25;
    ctx.fillStyle = '#00FF41';
    ctx.beginPath();
    ctx.arc(tsx, tsy, 1 + (1 - age), 0, Math.PI * 2);
    ctx.fill();
  }

  // Large radial glow (visibility cone)
  ctx.save();
  const glowR = 40;
  const pGrad = ctx.createRadialGradient(screenPX, screenPY, 0, screenPX, screenPY, glowR);
  pGrad.addColorStop(0, `rgba(0,255,65,${glowIntensity * 0.2})`);
  pGrad.addColorStop(0.5, `rgba(0,255,65,${glowIntensity * 0.06})`);
  pGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = pGrad;
  ctx.beginPath(); ctx.arc(screenPX, screenPY, glowR, 0, Math.PI*2); ctx.fill();

  // Outer pulsating ring (10px)
  ctx.globalAlpha = 0.3 + Math.sin(sceneData.playerGlow) * 0.15;
  ctx.strokeStyle = '#00FF41';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(screenPX, screenPY, 10, 0, Math.PI*2); ctx.stroke();

  // Second outer ring (16px, dimmer)
  ctx.globalAlpha = 0.12 + Math.sin(sceneData.playerGlow * 0.7) * 0.06;
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.arc(screenPX, screenPY, 16, 0, Math.PI*2); ctx.stroke();

  // Core body (5px bright green)
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#00FF41';
  ctx.shadowColor = '#00FF41'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(screenPX, screenPY, 5, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // Direction arrow
  const dirMap = [
    { dx: 0, dy: -1 },  // 0 = up (N)
    { dx: 1, dy: 0 },   // 1 = right (E)
    { dx: 0, dy: 1 },   // 2 = down (S)
    { dx: -1, dy: 0 },  // 3 = left (W)
  ];
  const dir = dirMap[sceneData.playerDir] || dirMap[2];
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#00FF41';
  ctx.lineWidth = 2;
  const tipX = screenPX + dir.dx * 16, tipY = screenPY + dir.dy * 16;
  ctx.beginPath();
  ctx.moveTo(screenPX + dir.dx * 7, screenPY + dir.dy * 7);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  // Arrow head
  const perpX = -dir.dy * 4, perpY = dir.dx * 4;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - dir.dx*5 + perpX, tipY - dir.dy*5 + perpY);
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - dir.dx*5 - perpX, tipY - dir.dy*5 - perpY);
  ctx.stroke();
  ctx.restore();

  // ══════════════════════════════════════
  // REMOTE PLAYERS (cyan circles — same node + room only)
  // ══════════════════════════════════════
  let _rpIdx = 0;
  Object.entries(sceneData.remotePlayers).forEach(([rpId, rp]) => {
    if (!rp || rp.nodeId !== G?.world?.currentNodeId) return;
    const sameRoom = rp.roomIdx === G?.world?.currentRoom;
    const isPartyMember = typeof isInParty === 'function' && isInParty(rpId);
    // Show if same room, OR party member in same building (dimmed)
    if (!sameRoom && !isPartyMember) return;
    const _rpAlphaBase = sameRoom ? 1.0 : 0.3; // dimmed if different room
    _rpIdx++;
    // Small offset so players don't overlap when at same position
    const offsetAngle = (_rpIdx * 2.1) % (Math.PI * 2);
    const offsetDist = 12;
    const rpSX = rp.x - sceneData.camX + w / 2 + Math.cos(offsetAngle) * offsetDist;
    const rpSY = rp.y - sceneData.camY + h / 2 + Math.sin(offsetAngle) * offsetDist;
    // Skip if off screen
    if (rpSX < -50 || rpSX > w + 50 || rpSY < -50 || rpSY > h + 50) return;

    ctx.save();
    // Glow (dimmed for different-room party members)
    ctx.globalAlpha = 0.15 * _rpAlphaBase;
    const rpGrad = ctx.createRadialGradient(rpSX, rpSY, 0, rpSX, rpSY, 25);
    rpGrad.addColorStop(0, 'rgba(0,229,255,0.2)');
    rpGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = rpGrad;
    ctx.beginPath(); ctx.arc(rpSX, rpSY, 25, 0, Math.PI*2); ctx.fill();

    // Ring
    ctx.globalAlpha = 0.4 * _rpAlphaBase;
    ctx.strokeStyle = isPartyMember && !sameRoom ? '#22aa44' : '#00E5FF';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(rpSX, rpSY, 8, 0, Math.PI*2); ctx.stroke();

    // Core
    ctx.globalAlpha = 0.85 * _rpAlphaBase;
    ctx.fillStyle = isPartyMember && !sameRoom ? '#22aa44' : '#00E5FF';
    ctx.shadowColor = '#00E5FF'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(rpSX, rpSY, 4, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;

    // Direction arrow
    if (rp.dir !== undefined) {
      const rpDirMap = [{dx:0,dy:-1},{dx:1,dy:0},{dx:0,dy:1},{dx:-1,dy:0}];
      const rpDir = rpDirMap[rp.dir] || rpDirMap[2];
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rpSX + rpDir.dx * 6, rpSY + rpDir.dy * 6);
      ctx.lineTo(rpSX + rpDir.dx * 13, rpSY + rpDir.dy * 13);
      ctx.stroke();
    }

    // Status icon above head
    if (rp.status) {
      ctx.globalAlpha = 0.7;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rp.status, rpSX, rpSY - 22);
    }
    // Name label (show '???' if not introduced)
    const _introduced = typeof _introductions !== 'undefined' && _introductions?.[rpId];
    const _displayName = _introduced ? rp.name : '???';
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = _introduced ? '#00E5FF' : '#506050';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(_displayName, rpSX, rpSY - 14);

    // Emote bubble (3 seconds)
    if (rp.emote && rp.emoteTime && Date.now() - rp.emoteTime < 3000) {
      const age = (Date.now() - rp.emoteTime) / 3000;
      ctx.globalAlpha = 1 - age * 0.7;
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rp.emote, rpSX, rpSY - 24 - age * 10);
    }
    ctx.restore();
  });

  // Local player emote
  if (sceneData.localEmote && sceneData.localEmoteTime && Date.now() - sceneData.localEmoteTime < 3000) {
    const age = (Date.now() - sceneData.localEmoteTime) / 3000;
    ctx.globalAlpha = 1 - age * 0.7;
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(sceneData.localEmote, screenPX, screenPY - 24 - age * 10);
    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════
  // AMBIENT PARTICLES (floating green dots)
  // ══════════════════════════════════════
  const maxParticles = window.innerWidth < 600 ? 15 : 40;
  while (sceneData.ambientParticles.length < maxParticles) {
    sceneData.ambientParticles.push({
      x: sceneData.camX + (Math.random() - 0.5) * w * 1.5,
      y: sceneData.camY + (Math.random() - 0.5) * h * 1.5,
      vx: (Math.random() - 0.5) * 0.15,
      vy: -0.1 - Math.random() * 0.2,
      alpha: 0.2 + Math.random() * 0.3,
      size: 0.8 + Math.random() * 1.2,
      life: 1,
      decay: 0.002 + Math.random() * 0.003,
      color: Math.random() < 0.3 ? '#00FF41' : '#003d0f',
    });
  }

  for (let i = sceneData.ambientParticles.length - 1; i >= 0; i--) {
    const ap = sceneData.ambientParticles[i];
    ap.x += ap.vx;
    ap.y += ap.vy;
    ap.life -= ap.decay;
    if (ap.life <= 0) { sceneData.ambientParticles.splice(i, 1); continue; }
    const asx = ap.x - sceneData.camX + w / 2;
    const asy = ap.y - sceneData.camY + h / 2;
    if (asx < -10 || asx > w + 10 || asy < -10 || asy > h + 10) continue;
    ctx.globalAlpha = ap.life * 0.6;
    ctx.fillStyle = ap.color;
    ctx.fillRect(asx, asy, ap.size, ap.size);
  }
  ctx.globalAlpha = 1;

  // ══════════════════════════════════════
  // TRANSIENT PARTICLES (scan scatter etc)
  // ══════════════════════════════════════
  // Cap particles
  const maxTransient = window.innerWidth < 600 ? 200 : 500;
  while (sceneData.particles.length > maxTransient) sceneData.particles.shift();

  for (let i = sceneData.particles.length - 1; i >= 0; i--) {
    const p = sceneData.particles[i];
    p.progress = Math.min(1, p.progress + 0.025 * p.speed);
    p.life -= p.decay;
    if (p.life <= 0) { sceneData.particles.splice(i, 1); continue; }

    const ppx = p.x + (p.tx - p.x) * p.progress;
    const ppy = p.y + (p.ty - p.y) * p.progress;
    const psx = ppx - sceneData.camX + w / 2;
    const psy = ppy - sceneData.camY + h / 2;
    if (psx < -10 || psx > w + 10 || psy < -10 || psy > h + 10) continue;

    const isRed = p.color === '#FF2244';
    ctx.globalAlpha = p.life * (isRed ? 0.5 + Math.sin(now * 0.012 + i) * 0.5 : 1);
    ctx.fillStyle = p.color;
    ctx.fillRect(psx, psy, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // Restore zoom
  ctx.restore();

  // ══════════════════════════════════════
  // MINIMAP (top-right corner, shows room plan)
  // ══════════════════════════════════════
  const mmLoc = G ? currentLocation() : null;
  const mmLayout = mmLoc ? getLocationLayout(mmLoc) : null;
  if (G && mmLayout) {
    const layout = mmLayout, loc = mmLoc;
    const mmW = 80, mmH = 60;
    const mmX = w - mmW - 6, mmY = 6;
    const mmPad = 3;

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = 'rgba(0,255,65,0.3)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    // Scale rooms to fit minimap
    const bw = layout.buildingW, bh = layout.buildingH;
    const scX = (mmW - mmPad*2) / bw, scY = (mmH - mmPad*2) / bh;
    const sc = Math.min(scX, scY);
    const ofsX = mmX + mmPad + (mmW - mmPad*2 - bw*sc)/2 - (layout.cx - bw/2)*sc;
    const ofsY = mmY + mmPad + (mmH - mmPad*2 - bh*sc)/2 - (layout.cy - bh/2)*sc;

    const currentFloor = G.world.currentFloor || 0;
    for (const lr of layout.rooms) {
      if (lr.floorNum !== currentFloor) continue;
      const rx = lr.cx * sc + ofsX - lr.w/2 * sc;
      const ry = lr.cy * sc + ofsY - lr.h/2 * sc;
      const rw = lr.w * sc, rh = lr.h * sc;

      const isCur = lr.idx === G.world.currentRoom;
      const gameRoom = loc.rooms[lr.idx];
      const hasZ = gameRoom?.zombies?.currentHp > 0;

      // Room fill
      ctx.fillStyle = isCur ? 'rgba(0,229,255,0.25)' : hasZ ? 'rgba(255,34,68,0.15)' : 'rgba(0,255,65,0.1)';
      ctx.fillRect(rx, ry, rw, rh);
      // Room border
      ctx.strokeStyle = isCur ? '#00E5FF' : hasZ ? '#661122' : 'rgba(0,255,65,0.3)';
      ctx.lineWidth = isCur ? 1 : 0.5;
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // Player dot on minimap
    const pmmx = sceneData.playerX * sc + ofsX;
    const pmmy = sceneData.playerY * sc + ofsY;
    ctx.fillStyle = '#00FF41';
    ctx.beginPath(); ctx.arc(pmmx, pmmy, 2, 0, Math.PI*2); ctx.fill();

    // Zombie dots
    for (const z of sceneData.zombieEntities) {
      const zmx = z.x * sc + ofsX, zmy = z.y * sc + ofsY;
      ctx.fillStyle = '#FF2244';
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(zmx, zmy, 1.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ══════════════════════════════════════
  // POST-PROCESSING (screen-space)
  // ══════════════════════════════════════

  // Screen vignette — darker corners
  const vigGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
  vigGrad.addColorStop(0, 'transparent');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);

  // CRT scanline sweeping down
  sceneData.scanLineY = (now * 0.03) % h;
  ctx.globalAlpha = 0.02;
  ctx.fillStyle = '#00FF41';
  ctx.fillRect(0, sceneData.scanLineY, w, 1.5);
  ctx.globalAlpha = 1;

  // Subtle vignette darkness at edges (lighter than fog of war)
  const isNight = G && (G.time.hour >= 21 || G.time.hour < 5);
  if (isNight) {
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, w, h);
  }

  // Auto-scan pulse every 4 seconds
  if (G && G.player.alive && now - (sceneData._lastAutoScan || 0) > 4000) {
    sceneData._lastAutoScan = now;
    sceneData.scanWaves.push({
      x: sceneData.playerX, y: sceneData.playerY,
      radius: 0, maxRadius: 200, speed: 1.5, alpha: 0.2,
      color: '#00FF41', life: 1
    });
  }

  // Occasional horizontal glitch line
  if (Math.random() < 0.02) {
    sceneData.glitchFrames = 2;
    sceneData.glitchY = Math.random() * h;
    sceneData.glitchW = 30 + Math.random() * 100;
    sceneData.glitchX = Math.random() * (w - sceneData.glitchW);
  }
  if (sceneData.glitchFrames > 0) {
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#00FF41';
    ctx.fillRect(sceneData.glitchX, sceneData.glitchY, sceneData.glitchW, 1);
    sceneData.glitchFrames--;
    ctx.globalAlpha = 1;
  }

  // ── Multiplayer: broadcast NORMALIZED position + status ──
  if (typeof Net !== 'undefined' && Net.mode !== 'OFFLINE' && G) {
    const _cw = canvas ? canvas.width / window.devicePixelRatio : 400;
    const _ch = canvas ? canvas.height / window.devicePixelRatio : 400;
    // Determine player status icon
    let _pStatus = '';
    if (G.combatState) _pStatus = '⚔';
    else if (G.activeAction) _pStatus = '🔍';
    else if (G.player?.stealthMode) _pStatus = '🥷';
    else if (G.world.currentRoute && !G.world.currentRoute.paused) _pStatus = '🏃';
    Net.sendPosition(sceneData.playerX / _cw, sceneData.playerY / _ch, sceneData.playerDir, G.world.currentNodeId, G.world.currentRoom, _pStatus);

    // WASD follow: if following someone in the same room, move towards them
    if (typeof _followTarget !== 'undefined' && _followTarget && !G.combatState) {
      const _leader = sceneData.remotePlayers[_followTarget];
      if (_leader && _leader.nodeId === G.world.currentNodeId && _leader.roomIdx === G.world.currentRoom) {
        // Move towards leader with 15px offset behind
        const dx = _leader.x - sceneData.playerX;
        const dy = _leader.y - sceneData.playerY;
        const dist = Math.hypot(dx, dy);
        if (dist > 18) { // don't get too close
          const speed = 1.2; // follow speed
          sceneData.playerX += (dx / dist) * Math.min(speed, dist - 15);
          sceneData.playerY += (dy / dist) * Math.min(speed, dist - 15);
          // Update direction to face leader
          if (Math.abs(dx) > Math.abs(dy)) sceneData.playerDir = dx > 0 ? 1 : 3;
          else sceneData.playerDir = dy > 0 ? 2 : 0;
        }
      }
    }

    // Lerp remote player positions for smooth rendering
    Object.values(sceneData.remotePlayers).forEach(rp => {
      if (rp.targetX !== undefined) {
        rp.x += (rp.targetX - rp.x) * 0.15;
        rp.y += (rp.targetY - rp.y) * 0.15;
      }
    });
  }
}

// ═══════════════════════════════════════════
// END OF ANIMATION MODULE
