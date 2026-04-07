// ═══════════════════════════════════════════
// INVENTORY SORTING
// ═══════════════════════════════════════════
function invSort(mode) {
  if (!G?.player?.inventory) return;
  settings.invSort = mode;
  saveSettings();
  const typeOrder = {weapon:0,magazine:1,ammo:2,medicine:3,food:4,clothing:5,material:6,comfort:7,book:8,radio:9,lore:10,throwable:11};
  G.player.inventory.sort((a, b) => {
    const da = ITEMS[a.id], db = ITEMS[b.id];
    if (!da || !db) return 0;
    switch(mode) {
      case 'type': return (typeOrder[da.type]||99) - (typeOrder[db.type]||99);
      case 'weight': return (db.weight||0) - (da.weight||0);
      case 'alpha': return (da.name||'').localeCompare(db.name||'','ru');
      case 'newest': return -1;
      case 'fresh': {
        // Food with lowest freshDays first (eat spoiling food first), non-food at end
        const af = da.type === 'food' ? (a.freshDays ?? 999) : 9999;
        const bf = db.type === 'food' ? (b.freshDays ?? 999) : 9999;
        return af - bf;
      }
      default: return 0;
    }
  });
  if (mode === 'newest') G.player.inventory.reverse();
  G.player.inventory.forEach(it => { it.gridX = undefined; it.gridY = undefined; });
  showInventory();
}

