// ═══════════════════════════════════════════
// MAP EDITOR
// ═══════════════════════════════════════════
const editorState = {
  active: false, nodes: {},
  regions: JSON.parse(JSON.stringify(WORLD_CONFIG.regions)),
  tool: 'road', selectedType: 'house', subType: 'road',
  brushElevation: 0, brushRegion: 'suburbs',
  panX: 0, panY: 0, zoom: 1.0,
  hoverGX: -1, hoverGY: -1,
  fileName: 'Новая карта', animFrame: null,
  _canvas: null, _ctx: null, _dragging: false, _wasDrag: false,
  _dragSX: 0, _dragSY: 0,
};

function openMapEditor(mode) {
  if (mode === 'current' && G?.world?.nodes) {
    editorState.nodes = JSON.parse(JSON.stringify(G.world.nodes));
    editorState.fileName = 'Текущий мир';
  } else if (mode !== 'load') {
    editorState.nodes = {};
    editorState.fileName = 'Новая карта';
  }
  editorState.active = true;
  editorState.panX = 0; editorState.panY = 0; editorState.zoom = 1.0;
  document.getElementById('title-screen').style.display = 'none';

  let edDiv = document.getElementById('map-editor');
  if (!edDiv) {
    edDiv = document.createElement('div');
    edDiv.id = 'map-editor';
    document.body.appendChild(edDiv);
  }
  edDiv.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:5000;background:#000;display:flex;flex-direction:column;font-family:"Courier New",monospace';

  // ── Build UI ──
  edDiv.innerHTML = `
    <style>
      #ed-toolbar{display:flex;align-items:center;gap:4px;padding:4px 8px;background:#080c08;border-bottom:1px solid #0d2a0d;flex-shrink:0}
      #ed-toolbar button{background:#0a0f0a;border:1px solid #0d2a0d;color:#00ff41;padding:4px 8px;font-size:9px;font-family:monospace;cursor:pointer;border-radius:2px}
      #ed-toolbar button:hover{border-color:#00ff41;background:#0d1a0d}
      #ed-body{display:flex;flex:1;min-height:0}
      #ed-sidebar{width:180px;background:#050a05;border-right:1px solid #0d2a0d;display:flex;flex-direction:column;overflow-y:auto;flex-shrink:0}
      .ed-section{padding:6px 8px;border-bottom:1px solid #0a1a0a}
      .ed-section-title{color:#00a82b;font-size:8px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
      .ed-tool-btn{display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid transparent;background:transparent;color:#507850;font-size:10px;cursor:pointer;width:100%;text-align:left;font-family:monospace;border-radius:2px}
      .ed-tool-btn:hover{background:#0a1a0a;color:#00ff41}
      .ed-tool-btn.active{border-color:#00e5ff;color:#00e5ff;background:rgba(0,229,255,.08)}
      .ed-select{width:100%;background:#0a0f0a;color:#00ff41;border:1px solid #0d2a0d;padding:3px 4px;font-size:9px;font-family:monospace;border-radius:2px;margin-top:3px}
      .ed-label{color:#507850;font-size:9px;margin-top:4px}
      #ed-canvas-wrap{flex:1;position:relative;overflow:hidden;min-width:0}
      #ed-canvas{position:absolute;inset:0;width:100%!important;height:100%!important}
      #ed-info{position:absolute;bottom:4px;left:4px;color:#507850;font-size:9px;pointer-events:none;z-index:1}
      #ed-coords{position:absolute;top:4px;right:4px;color:#507850;font-size:9px;pointer-events:none;z-index:1}
    </style>
    <div id="ed-toolbar">
      <span style="color:#00e5ff;font-size:10px;letter-spacing:.08em;flex:1">🛠 ${editorState.fileName}</span>
      <button onclick="editorSave()">💾 СОХР</button>
      <button onclick="editorExport()">📤 ЭКСПОРТ</button>
      <button onclick="editorImport()">📥 ИМПОРТ</button>
      <button onclick="editorPlay()" style="border-color:#00ff41;color:#00ff41">▸ ИГРАТЬ</button>
      <button onclick="closeMapEditor()" style="border-color:#ff2244;color:#ff2244">✕</button>
    </div>
    <div id="ed-body">
      <div id="ed-sidebar">
        <div class="ed-section">
          <div class="ed-section-title">Инструменты</div>
          <button class="ed-tool-btn" data-tool="road" onclick="edSetTool('road')">🛣️ Дорога</button>
          <button class="ed-tool-btn" data-tool="building" onclick="edSetTool('building')">🏠 Здание</button>
          <button class="ed-tool-btn" data-tool="water" onclick="edSetTool('water')">🌊 Вода</button>
          <button class="ed-tool-btn" data-tool="nature" onclick="edSetTool('nature')">🌳 Природа</button>
          <button class="ed-tool-btn" data-tool="poi" onclick="edSetTool('poi')">🚗 POI</button>
          <button class="ed-tool-btn" data-tool="elevation" onclick="edSetTool('elevation')">⛰️ Рельеф</button>
          <button class="ed-tool-btn" data-tool="region" onclick="edSetTool('region')">📋 Регион</button>
          <button class="ed-tool-btn" data-tool="eraser" onclick="edSetTool('eraser')">🗑️ Ластик</button>
        </div>
        <div class="ed-section" id="ed-props">
          <div class="ed-section-title">Свойства</div>
          <div id="ed-props-content"></div>
        </div>
        <div class="ed-section" style="margin-top:auto">
          <div style="color:#507850;font-size:9px">Узлов: <span id="ed-cnt-nodes">0</span></div>
          <div style="color:#507850;font-size:9px">Зданий: <span id="ed-cnt-bldg">0</span></div>
          <div style="color:#507850;font-size:9px;margin-top:4px">ЛКМ — поставить · ПКМ — удалить</div>
          <div style="color:#507850;font-size:9px">Колесо — зум · Перетяг. — сдвиг</div>
        </div>
      </div>
      <div id="ed-canvas-wrap">
        <canvas id="ed-canvas"></canvas>
        <div id="ed-info"></div>
        <div id="ed-coords"></div>
      </div>
    </div>
  `;

  edSetTool(editorState.tool);
  _edInitCanvas();
}

function closeMapEditor() {
  editorState.active = false;
  if (editorState.animFrame) { cancelAnimationFrame(editorState.animFrame); editorState.animFrame = null; }
  const edDiv = document.getElementById('map-editor');
  if (edDiv) edDiv.style.display = 'none';
  document.getElementById('title-screen').style.display = '';
}

function edSetTool(id) {
  editorState.tool = id;
  document.querySelectorAll('.ed-tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === id));

  // Build property panel based on tool
  const props = document.getElementById('ed-props-content');
  if (!props) return;

  const buildingOpts = Object.entries(BUILDING_META).map(([k,m]) =>
    `<option value="${k}" ${editorState.selectedType===k?'selected':''}>${m.icon||''} ${LOCATION_TEMPLATES[k]?.name||k} (${m.w}×${m.h})</option>`
  ).join('');

  const roadOpts = [['road','Дорога'],['intersection','Перекрёсток'],['alley','Переулок']].map(([v,l]) =>
    `<option value="${v}" ${editorState.subType===v?'selected':''}>${l}</option>`
  ).join('');

  const natureOpts = [['park','Сквер'],['forest_trail','Тропа'],['forest_clearing','Поляна']].map(([v,l]) =>
    `<option value="${v}" ${editorState.subType===v?'selected':''}>${l}</option>`
  ).join('');

  const poiOpts = [['car_wreck','Авария'],['bus_stop','Остановка'],['parking','Парковка'],['barricade','Баррикада'],['gas_station','АЗС']].map(([v,l]) =>
    `<option value="${v}" ${editorState.subType===v?'selected':''}>${l}</option>`
  ).join('');

  const regionOpts = WORLD_CONFIG.regions.map(r =>
    `<option value="${r.id}" ${editorState.brushRegion===r.id?'selected':''}>${r.name}</option>`
  ).join('');

  let html = '';
  switch(id) {
    case 'building':
      html = `<div class="ed-label">Тип здания</div><select class="ed-select" onchange="editorState.selectedType=this.value">${buildingOpts}</select>`;
      break;
    case 'road':
      html = `<div class="ed-label">Тип дороги</div><select class="ed-select" onchange="editorState.subType=this.value">${roadOpts}</select>`;
      break;
    case 'nature':
      html = `<div class="ed-label">Тип природы</div><select class="ed-select" onchange="editorState.subType=this.value">${natureOpts}</select>`;
      break;
    case 'poi':
      html = `<div class="ed-label">Тип POI</div><select class="ed-select" onchange="editorState.subType=this.value">${poiOpts}</select>`;
      break;
    case 'elevation':
      html = `<div class="ed-label">Высота: <b id="ed-elev-v">${editorState.brushElevation}</b></div><input type="range" min="0" max="5" value="${editorState.brushElevation}" oninput="editorState.brushElevation=+this.value;document.getElementById('ed-elev-v').textContent=this.value" style="width:100%">`;
      break;
    case 'region':
      html = `<div class="ed-label">Регион</div><select class="ed-select" onchange="editorState.brushRegion=this.value">${regionOpts}</select>`;
      break;
    case 'water': html = `<div class="ed-label">Клик = водоём (непроходимый)</div>`; break;
    case 'eraser': html = `<div class="ed-label">Клик = удалить узел<br>ПКМ тоже удаляет</div>`; break;
  }
  props.innerHTML = html;
}

// ── Canvas initialization (isolated event handlers) ──
function _edInitCanvas() {
  const wrap = document.getElementById('ed-canvas-wrap');
  const canvas = document.getElementById('ed-canvas');
  if (!canvas || !wrap) return;
  const ctx = canvas.getContext('2d');
  editorState._canvas = canvas;
  editorState._ctx = ctx;

  const dpr = window.devicePixelRatio || 1;
  function resize() {
    const w = wrap.clientWidth || wrap.offsetWidth || 500;
    const h = wrap.clientHeight || wrap.offsetHeight || 400;
    if (w > 0 && h > 0) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
  }
  // Delay initial resize to let flex layout settle
  setTimeout(resize, 50);
  setTimeout(resize, 200);
  const resizeObs = new ResizeObserver(resize);
  resizeObs.observe(wrap);

  // ── Mouse/touch on CANVAS only (not window) ──
  let isDrag = false, wasDrag = false, startX = 0, startY = 0;

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    isDrag = true; wasDrag = false;
    startX = e.clientX; startY = e.clientY;
  });
  canvas.addEventListener('touchstart', e => {
    isDrag = true; wasDrag = false;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
  }, {passive:true});
  canvas.addEventListener('mousemove', e => {
    // Hover info
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cell = _edScreenToGrid(mx, my);
    editorState.hoverGX = cell.gx; editorState.hoverGY = cell.gy;
    const nid = `n_${cell.gx}_${cell.gy}`;
    const node = editorState.nodes[nid];
    const info = document.getElementById('ed-info');
    if (info) info.textContent = `[${cell.gx}, ${cell.gy}] ${node ? node.name || node.type : 'пусто'}`;

    if (!isDrag) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDrag = true;
    if (wasDrag) {
      editorState.panX += dx; editorState.panY += dy;
      startX = e.clientX; startY = e.clientY;
    }
  });
  canvas.addEventListener('touchmove', e => {
    if (!isDrag) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wasDrag = true;
    if (wasDrag) {
      editorState.panX += dx; editorState.panY += dy;
      startX = t.clientX; startY = t.clientY;
    }
  }, {passive:true});
  canvas.addEventListener('mouseup', e => {
    if (e.button !== 0) { isDrag = false; return; }
    if (!wasDrag && isDrag) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const cell = _edScreenToGrid(mx, my);
      if (cell.gx >= 0 && cell.gx < WORLD_CONFIG.gridW && cell.gy >= 0 && cell.gy < WORLD_CONFIG.gridH) {
        try { _edPlaceTool(cell.gx, cell.gy); } catch(err) { console.error('Editor place error:', err); }
      }
    }
    isDrag = false; wasDrag = false;
  });
  canvas.addEventListener('touchend', e => {
    if (!wasDrag && isDrag) {
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const mx = t.clientX - rect.left, my = t.clientY - rect.top;
      const cell = _edScreenToGrid(mx, my);
      if (cell.gx >= 0 && cell.gx < WORLD_CONFIG.gridW && cell.gy >= 0 && cell.gy < WORLD_CONFIG.gridH) {
        try { _edPlaceTool(cell.gx, cell.gy); } catch(err) { console.error('Editor place error:', err); }
      }
    }
    isDrag = false; wasDrag = false;
  });
  canvas.addEventListener('mouseleave', () => { isDrag = false; });

  // Right-click = erase
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cell = _edScreenToGrid(mx, my);
    const nid = `n_${cell.gx}_${cell.gy}`;
    delete editorState.nodes[nid];
    Object.values(editorState.nodes).forEach(n => { if(n.connections) n.connections = n.connections.filter(c => c !== nid); });
    _edUpdateCounts();
  });

  // Zoom
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    editorState.zoom = Math.max(0.3, Math.min(4, editorState.zoom + (e.deltaY < 0 ? 0.15 : -0.15)));
  }, { passive: false });

  // ── Render loop ──
  function render() {
    if (!editorState.active) return;
    try { _edRenderFrame(); } catch(e) {
      console.error('Editor render error:', e);
      const info = document.getElementById('ed-info');
      if (info) info.textContent = 'RENDER ERROR: ' + e.message;
      info.style.color = '#ff2244';
    }
    editorState.animFrame = requestAnimationFrame(render);
  }
  function _edRenderFrame() {
    // Retry resize if canvas has no size yet
    if (canvas.width < 10 || canvas.height < 10) {
      const wr = wrap.clientWidth || wrap.offsetWidth;
      const hr = wrap.clientHeight || wrap.offsetHeight;
      if (wr > 0 && hr > 0) { canvas.width = wr * dpr; canvas.height = hr * dpr; }
    }
    const w = canvas.width / dpr || 100, h = canvas.height / dpr || 100;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#020602';
    ctx.fillRect(0, 0, w, h);

    const z = editorState.zoom;
    const halfTW = WORLD_CONFIG.cellPx * z;
    const halfTH = halfTW / 2;
    const px = editorState.panX, py = editorState.panY;

    function eiX(gx, gy) { return (gx - gy) * halfTW + px + w/2; }
    function eiY(gx, gy) { return (gx + gy) * halfTH + py + h*0.35; }

    // Grid lines
    ctx.strokeStyle = 'rgba(0,255,65,0.03)';
    ctx.lineWidth = 0.3;
    const gw = WORLD_CONFIG.gridW, gh = WORLD_CONFIG.gridH;
    for (let i = 0; i <= gw; i++) {
      ctx.beginPath(); ctx.moveTo(eiX(i,0),eiY(i,0)); ctx.lineTo(eiX(i,gh),eiY(i,gh)); ctx.stroke();
    }
    for (let i = 0; i <= gh; i++) {
      ctx.beginPath(); ctx.moveTo(eiX(0,i),eiY(0,i)); ctx.lineTo(eiX(gw,i),eiY(gw,i)); ctx.stroke();
    }

    // Region borders + labels
    ctx.setLineDash([4,4]);
    ctx.strokeStyle = 'rgba(0,255,65,0.1)'; ctx.lineWidth = 0.8;
    for (const r of WORLD_CONFIG.regions) {
      const pts = [[r.gx,r.gy],[r.gx+r.w,r.gy],[r.gx+r.w,r.gy+r.h],[r.gx,r.gy+r.h]];
      ctx.beginPath();
      pts.forEach((p,i) => { const sx=eiX(p[0],p[1]),sy=eiY(p[0],p[1]); i?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy); });
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,255,65,0.06)';
      ctx.font = `bold ${Math.max(8,10*z)}px monospace`; ctx.textAlign = 'center';
      ctx.fillText(r.name, eiX(r.gx+r.w/2,r.gy+r.h/2), eiY(r.gx+r.w/2,r.gy+r.h/2));
    }
    ctx.setLineDash([]);

    // Nodes (sorted by depth)
    const sorted = Object.values(editorState.nodes).sort((a,b) => (a.gx+a.gy) - (b.gx+b.gy));
    for (const n of sorted) {
      if (n.parentBuildingId) continue;
      const pad = 0.06;
      const bw = n.buildingW || 1, bh = n.buildingH || 1;
      const elev = (n.elevation || 0) * halfTH * 0.5;
      const N = {x:eiX(n.gx+pad,n.gy+pad), y:eiY(n.gx+pad,n.gy+pad)-elev};
      const E = {x:eiX(n.gx+bw-pad,n.gy+pad), y:eiY(n.gx+bw-pad,n.gy+pad)-elev};
      const S = {x:eiX(n.gx+bw-pad,n.gy+bh-pad), y:eiY(n.gx+bw-pad,n.gy+bh-pad)-elev};
      const W = {x:eiX(n.gx+pad,n.gy+bh-pad), y:eiY(n.gx+pad,n.gy+bh-pad)-elev};

      ctx.beginPath(); ctx.moveTo(N.x,N.y); ctx.lineTo(E.x,E.y); ctx.lineTo(S.x,S.y); ctx.lineTo(W.x,W.y); ctx.closePath();

      if (n.type === 'water') {
        ctx.fillStyle = 'rgba(20,50,110,0.6)'; ctx.fill();
        ctx.strokeStyle = 'rgba(60,120,220,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
      } else if (n.type === 'building' && n.building) {
        const meta = BUILDING_META[n.building.type] || {color:'#337744'};
        const bldH = (BLD_H[n.building.type]||2) * halfTH * 0.7;
        ctx.fillStyle = scaleColor(meta.color,0.48); ctx.fill();
        // Walls
        ctx.beginPath(); ctx.moveTo(E.x,E.y); ctx.lineTo(S.x,S.y); ctx.lineTo(S.x,S.y-bldH); ctx.lineTo(E.x,E.y-bldH); ctx.closePath();
        ctx.fillStyle = scaleColor(meta.color,0.35); ctx.fill();
        ctx.beginPath(); ctx.moveTo(S.x,S.y); ctx.lineTo(W.x,W.y); ctx.lineTo(W.x,W.y-bldH); ctx.lineTo(S.x,S.y-bldH); ctx.closePath();
        ctx.fillStyle = scaleColor(meta.color,0.2); ctx.fill();
        // Roof
        ctx.beginPath(); ctx.moveTo(N.x,N.y-bldH); ctx.lineTo(E.x,E.y-bldH); ctx.lineTo(S.x,S.y-bldH); ctx.lineTo(W.x,W.y-bldH); ctx.closePath();
        ctx.fillStyle = scaleColor(meta.color,0.7); ctx.fill();
        ctx.strokeStyle = 'rgba(0,255,65,0.15)'; ctx.lineWidth = 0.4; ctx.stroke();
      } else {
        const nt = NODE_TYPES[n.type];
        ctx.fillStyle = nt?.color || '#1a3a1a'; ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(0,255,65,0.06)'; ctx.lineWidth = 0.3; ctx.stroke();
      }
    }

    // Hover highlight
    const hx = editorState.hoverGX, hy = editorState.hoverGY;
    if (hx >= 0 && hx < gw && hy >= 0 && hy < gh) {
      const hN={x:eiX(hx,hy),y:eiY(hx,hy)}, hE={x:eiX(hx+1,hy),y:eiY(hx+1,hy)};
      const hS={x:eiX(hx+1,hy+1),y:eiY(hx+1,hy+1)}, hW={x:eiX(hx,hy+1),y:eiY(hx,hy+1)};
      ctx.beginPath(); ctx.moveTo(hN.x,hN.y); ctx.lineTo(hE.x,hE.y); ctx.lineTo(hS.x,hS.y); ctx.lineTo(hW.x,hW.y); ctx.closePath();
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(0,229,255,0.06)'; ctx.fill();
    }

    // Zoom indicator
    const coords = document.getElementById('ed-coords');
    if (coords) coords.textContent = `×${editorState.zoom.toFixed(1)}`;
  }
  editorState.animFrame = requestAnimationFrame(render);
}

function _edScreenToGrid(mx, my) {
  const c = editorState._canvas;
  if (!c) return {gx:-1,gy:-1};
  const dpr = window.devicePixelRatio||1;
  const w = c.width/dpr, h = c.height/dpr;
  const z = editorState.zoom, halfTW = WORLD_CONFIG.cellPx*z, halfTH = halfTW/2;
  const rx = mx - editorState.panX - w/2, ry = my - editorState.panY - h*0.35;
  return { gx: Math.floor((rx/halfTW + ry/halfTH)/2), gy: Math.floor((ry/halfTH - rx/halfTW)/2) };
}

function _edPlaceTool(gx, gy) {
  const nid = `n_${gx}_${gy}`;
  const tool = editorState.tool;

  if (tool === 'eraser') {
    delete editorState.nodes[nid];
    Object.values(editorState.nodes).forEach(n => { if(n.connections) n.connections = n.connections.filter(c => c !== nid); });
  } else if (tool === 'building') {
    const bType = editorState.selectedType;
    const meta = BUILDING_META[bType] || {w:1,h:1};
    const bNum = Object.values(editorState.nodes).filter(n=>n.type==='building').length+1;
    const bld = { id:'bld-ed-'+bNum, type:bType, name:(LOCATION_TEMPLATES[bType]?.name||bType)+' #'+bNum, rooms:[], infest:1, condition:'intact' };
    editorState.nodes[nid] = { id:nid, gx,gy, type:'building', regionId:editorState.brushRegion, name:bld.name, building:bld, buildingW:meta.w, buildingH:meta.h, connections:[], discovered:true, visited:true, elevation:editorState.brushElevation };
    _edAutoConnect(gx,gy);
  } else if (tool === 'road') {
    const sub = editorState.subType||'road';
    const nt = NODE_TYPES[sub]||NODE_TYPES.road;
    editorState.nodes[nid] = { id:nid, gx,gy, type:sub, regionId:editorState.brushRegion, name:nt.name, connections:[], discovered:true, visited:true, traverseTime:nt.time, dangerLevel:nt.danger, elevation:editorState.brushElevation };
    _edAutoConnect(gx,gy);
  } else if (tool === 'water') {
    editorState.nodes[nid] = { id:nid, gx,gy, type:'water', regionId:editorState.brushRegion, name:'Водоём', connections:[], discovered:true, visited:true, blocked:true, elevation:editorState.brushElevation };
  } else if (tool === 'nature') {
    const sub = editorState.subType||'park';
    const nt = NODE_TYPES[sub]||NODE_TYPES.park;
    editorState.nodes[nid] = { id:nid, gx,gy, type:sub, regionId:editorState.brushRegion, name:nt.name, connections:[], discovered:true, visited:true, traverseTime:nt.time, dangerLevel:nt.danger, elevation:editorState.brushElevation };
  } else if (tool === 'poi') {
    const sub = editorState.subType||'car_wreck';
    const nt = NODE_TYPES[sub]||{};
    editorState.nodes[nid] = { id:nid, gx,gy, type:sub, regionId:editorState.brushRegion, name:nt.name||sub, connections:[], discovered:true, visited:true, traverseTime:nt.time, dangerLevel:nt.danger, blocked:nt.blocked||false, elevation:editorState.brushElevation };
  } else if (tool === 'elevation') {
    if (editorState.nodes[nid]) editorState.nodes[nid].elevation = editorState.brushElevation;
    return;
  } else if (tool === 'region') {
    if (editorState.nodes[nid]) editorState.nodes[nid].regionId = editorState.brushRegion;
    return;
  }
  _edUpdateCounts();
}

function _edAutoConnect(gx, gy) {
  const nid = `n_${gx}_${gy}`;
  const node = editorState.nodes[nid];
  if (!node) return;
  for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    const adjId = `n_${gx+dx}_${gy+dy}`;
    const adj = editorState.nodes[adjId];
    if (!adj) continue;
    if (!node.connections) node.connections = [];
    if (!adj.connections) adj.connections = [];
    if (!node.connections.includes(adjId)) node.connections.push(adjId);
    if (!adj.connections.includes(nid)) adj.connections.push(nid);
  }
}

function _edUpdateCounts() {
  const c1 = document.getElementById('ed-cnt-nodes');
  const c2 = document.getElementById('ed-cnt-bldg');
  if (c1) c1.textContent = Object.keys(editorState.nodes).length;
  if (c2) c2.textContent = Object.values(editorState.nodes).filter(n=>n.type==='building').length;
}

// ── Save / Load / Export / Import / Play ──
function editorSave() {
  localStorage.setItem('echo7_editor_map', JSON.stringify({ nodes:editorState.nodes, regions:editorState.regions, fileName:editorState.fileName }));
  const tb = document.querySelector('#ed-toolbar span');
  if (tb) { const orig = tb.textContent; tb.textContent = '✓ Сохранено!'; setTimeout(()=>tb.textContent=orig, 1500); }
}

function editorLoadMap() {
  try {
    const raw = localStorage.getItem('echo7_editor_map');
    if (!raw) { alert('Нет сохранённой карты.'); return; }
    const data = JSON.parse(raw);
    editorState.nodes = data.nodes || {};
    editorState.regions = data.regions || JSON.parse(JSON.stringify(WORLD_CONFIG.regions));
    editorState.fileName = data.fileName || 'Загруженная карта';
    openMapEditor('load');
  } catch(e) { alert('Ошибка загрузки.'); }
}

function editorExport() {
  const blob = new Blob([JSON.stringify({ nodes:editorState.nodes, regions:editorState.regions, fileName:editorState.fileName })], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = (editorState.fileName||'map')+'.json'; a.click(); URL.revokeObjectURL(a.href);
}

function editorImport() {
  const inp = document.createElement('input'); inp.type='file'; inp.accept='.json';
  inp.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => {
      try {
        const d = JSON.parse(ev.target.result);
        editorState.nodes = d.nodes||{}; editorState.regions = d.regions||JSON.parse(JSON.stringify(WORLD_CONFIG.regions));
        editorState.fileName = d.fileName||f.name;
        closeMapEditor(); openMapEditor('load');
      } catch(e) { alert('Ошибка импорта.'); }
    };
    r.readAsText(f);
  };
  inp.click();
}

function editorPlay() {
  if (Object.keys(editorState.nodes).length === 0) { alert('Карта пуста!'); return; }
  closeMapEditor();
  const roadNode = Object.values(editorState.nodes).find(n => n.type==='road'||n.type==='intersection');
  const startNode = roadNode || Object.values(editorState.nodes)[0];
  const charData = { name:'Редактор', occupation:'unemployed', traits:[], difficulty:'normal', sandbox:null, editorNodes:editorState.nodes, editorStart:startNode.id };
  const origGen = window._origGenWorld || generateWorld;
  window._origGenWorld = origGen;
  window.generateWorld = function() {
    G.world.nodes = JSON.parse(JSON.stringify(charData.editorNodes));
    G.world.currentNodeId = charData.editorStart;
    Object.values(G.world.nodes).forEach(n => { if(!n.connections) n.connections=[]; if(n.discovered===undefined) n.discovered=true; });
  };
  newGame(charData);
  window.generateWorld = origGen;
}

// [audio engine extracted]



