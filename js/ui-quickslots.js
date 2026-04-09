// ═══════════════════════════════════════════
// QUICK SLOTS
// ═══════════════════════════════════════════
function updateQuickSlots() {
  const panel = document.getElementById('quick-slots');
  if (!panel || !G?.player) { if(panel) panel.style.display='none'; return; }
  panel.style.display = 'flex';
  const qs = G.player.quickSlots || [null,null,null];
  panel.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const slot = qs[i];
    const div = document.createElement('div');
    div.className = 'qslot' + (slot ? ' has-item' : '');
    if (slot) {
      const def = ITEMS[slot.id];
      const invIt = G.player.inventory.find(it => it.id === slot.id);
      if (def && invIt) {
        div.innerHTML = itemIconHtml(slot.id, 20) + `<span>${def.name.substring(0,8)}</span>`;
        div.onclick = () => useQuickSlot(i);
      } else {
        qs[i] = null;
        div.innerHTML = '[—]';
      }
    } else {
      div.innerHTML = '[—]';
    }
    panel.appendChild(div);
  }
}

function useQuickSlot(slotIdx) {
  if (!G?.player) return;
  const slot = G.player.quickSlots?.[slotIdx];
  if (!slot) return;
  const idx = G.player.inventory.findIndex(it => it.id === slot.id);
  if (idx < 0) { G.player.quickSlots[slotIdx] = null; updateQuickSlots(); return; }
  const def = ITEMS[slot.id];
  if (!def) return;
  if (def.type === 'food') { useFood(idx); }
  else if (def.type === 'medicine') { useMedicine(idx); }
  else if (def.type === 'comfort') { useComfort(idx); }
  else if (def.type === 'weapon') { invEquipWeapon(idx); }
  else if (def.type === 'clothing') { invEquipClothing(idx); }
  updateQuickSlots();
  updateUI();
}

