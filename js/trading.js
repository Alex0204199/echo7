// ═══════════════════════════════════════════
// NPC TRADING SYSTEM
// ═══════════════════════════════════════════

// NPC dialog greetings
const NPC_GREETINGS = {
  weapons: {
    ru: ['Ищешь стволы? Ты по адресу.', 'У меня лучший арсенал в городе.', 'Заходи, покажу что есть.', 'Патроны, ножи, автоматы — всё найдётся.'],
    en: ['Looking for guns? You came to the right place.', 'Best arsenal in the city.', 'Come in, let me show what I have.', 'Ammo, knives, rifles — I got it all.'],
  },
  medic: {
    ru: ['Привет, выживший. Нужна помощь?', 'Бинты, таблетки, антибиотики — всё есть.', 'Выглядишь паршиво. Могу помочь.', 'Здоровье — главный ресурс. Не забывай.'],
    en: ['Hey survivor. Need help?', 'Bandages, pills, antibiotics — got it all.', 'You look rough. I can help.', 'Health is the main resource. Don\'t forget.'],
  },
  gear: {
    ru: ['Добро пожаловать на барахолку!', 'Рюкзаки, броники, ботинки — налетай.', 'Всё б/у, но в рабочем состоянии.', 'Тут найдёшь всё для выживания.'],
    en: ['Welcome to the flea market!', 'Backpacks, armor, boots — come grab it.', 'All used, but working condition.', 'You\'ll find everything for survival here.'],
  },
};

function showNPCDialog(trader) {
  const isEn = LANG?.current === 'en';
  const name = isEn ? trader.nameEn : trader.name;
  const greetings = NPC_GREETINGS[trader.type]?.[isEn ? 'en' : 'ru'] || ['...'];
  const greeting = greetings[Math.floor(Math.random() * greetings.length)];

  const typeIcons = { weapons: '🔫', medic: '💊', gear: '🎽' };
  const typeNames = {
    weapons: isEn ? 'Weapons Dealer' : 'Оружейный торговец',
    medic: isEn ? 'Medic' : 'Медик',
    gear: isEn ? 'Gear Trader' : 'Торговец снаряжением',
  };

  let html = '';
  // NPC portrait area
  html += `<div style="text-align:center;padding:12px 0">`;
  html += `<div style="width:60px;height:60px;margin:0 auto 8px;border-radius:50%;border:2px solid var(--cyan);background:rgba(0,229,255,.08);display:flex;align-items:center;justify-content:center;font-size:28px">${typeIcons[trader.type] || '👤'}</div>`;
  html += `<div style="color:var(--cyan);font-size:14px;letter-spacing:.05em">${name}</div>`;
  html += `<div style="color:var(--text-dim);font-size:10px;margin-top:2px">${typeNames[trader.type] || ''}</div>`;
  html += `</div>`;

  // Greeting speech bubble
  html += `<div style="background:rgba(0,229,255,.05);border:1px solid rgba(0,229,255,.15);border-radius:8px;padding:10px 14px;margin-bottom:14px;position:relative">`;
  html += `<div style="color:var(--text);font-size:11px;font-style:italic;line-height:1.5">"${greeting}"</div>`;
  html += `<div style="position:absolute;top:-6px;left:20px;width:12px;height:12px;background:rgba(0,229,255,.05);border-left:1px solid rgba(0,229,255,.15);border-top:1px solid rgba(0,229,255,.15);transform:rotate(45deg)"></div>`;
  html += `</div>`;

  // Action buttons
  html += `<div style="display:flex;flex-direction:column;gap:6px">`;
  html += `<button class="act-btn" onclick="closeModal();showTradeUI(currentLocation().trader)" style="width:100%;padding:10px;border-color:var(--cyan);color:var(--cyan)">${isEn ? '🏪 View goods' : '🏪 Посмотреть товары'}</button>`;
  html += `<button class="act-btn" onclick="closeModal()" style="width:100%;padding:10px">${isEn ? '👋 Leave' : '👋 Уйти'}</button>`;
  html += `</div>`;

  openModal(`👤 ${name}`, html);
}

function showTradeUI(trader) {
  if (!trader) return;
  const isEn = LANG?.current === 'en';

  // Check if restock needed
  const daysSinceRestock = (G.player.daysSurvived || 0) - (trader.lastRestock || 0);
  if (daysSinceRestock >= trader.restockInterval || !trader.stock || trader.stock.length === 0) {
    trader.stock = generateTraderStock(trader);
    trader.lastRestock = G.player.daysSurvived || 0;
  }

  const traderName = isEn ? trader.nameEn : trader.name;
  const typeLabels = {
    weapons: isEn ? 'Weapons Dealer' : 'Оружейный торговец',
    medic: isEn ? 'Medical Supplies' : 'Медикаменты',
    gear: isEn ? 'Gear & Equipment' : 'Снаряжение',
  };

  let html = '';

  // Header
  html += `<div style="text-align:center;margin-bottom:10px">`;
  html += `<div style="font-size:14px;color:var(--cyan);letter-spacing:.1em">${traderName}</div>`;
  html += `<div style="font-size:10px;color:var(--text-dim);margin-top:2px">${typeLabels[trader.type] || trader.type}</div>`;
  html += `<div style="font-size:9px;color:var(--text-muted);margin-top:4px">${isEn ? 'Stock refreshes every 7 days' : 'Ассортимент обновляется раз в 7 дней'} · ${isEn ? 'Next' : 'Следующее'}: ${isEn ? 'day' : 'день'} ${(trader.lastRestock || 0) + 7}</div>`;
  html += `</div>`;

  // Stock list
  if (trader.stock.length === 0) {
    html += `<div style="text-align:center;color:var(--text-dim);padding:20px">${isEn ? 'Nothing in stock' : 'Товаров нет'}</div>`;
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto">';

    trader.stock.forEach((offer, oi) => {
      const sellDef = ITEMS[offer.sell.id];
      if (!sellDef) return;

      // Check if player can afford
      const canAfford = offer.price.every(p => hasItem(p.id, p.qty));

      // Price pills
      const pricePills = offer.price.map(p => {
        const pDef = ITEMS[p.id];
        const has = hasItem(p.id, p.qty);
        const count = countItem(p.id);
        return `<span style="display:inline-block;padding:1px 5px;margin:1px;border-radius:2px;font-size:9px;border:1px solid ${has ? 'var(--green-dim)' : 'rgba(255,34,68,.3)'};color:${has ? 'var(--green)' : 'var(--red)'};background:${has ? 'rgba(0,255,65,.05)' : 'rgba(255,34,68,.05)'}">${pDef?.name || p.id}${p.qty > 1 ? ' ×'+p.qty : ''} <span style="opacity:.5">(${count})</span></span>`;
      }).join('');

      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid ${canAfford ? 'var(--cyan)' : 'var(--border)'};border-radius:4px;background:${canAfford ? 'rgba(0,229,255,.03)' : 'rgba(0,0,0,.2)'}">`;

      // Item being sold
      html += `<div style="flex-shrink:0">${itemIconHtml(offer.sell.id, 32)}</div>`;
      html += `<div style="flex:1;min-width:0">`;
      html += `<div style="color:${canAfford ? 'var(--cyan)' : 'var(--text-dim)'};font-size:11px;font-weight:bold">${sellDef.name}${offer.sell.qty > 1 ? ' ×'+offer.sell.qty : ''}</div>`;
      html += `<div style="margin-top:3px">${pricePills}</div>`;
      html += `</div>`;

      // Trade button
      html += `<button class="act-btn" style="flex-shrink:0;padding:6px 10px;font-size:10px;${canAfford ? 'border-color:var(--cyan);color:var(--cyan)' : 'opacity:.3'}" ${canAfford ? `onclick="executeTrade('${trader.id}',${oi})"` : 'disabled'}>${isEn ? 'Trade' : 'Обмен'}</button>`;

      html += `</div>`;
    });

    html += '</div>';
  }

  // Weight info
  html += `<div style="text-align:center;margin-top:8px;color:var(--text-dim);font-size:10px">${G.player.weight}/${maxWeight()} ${t('hud.weight')}</div>`;

  openModal(`🏪 ${traderName}`, html);
}

function executeTrade(traderId, offerIdx) {
  // Find trader
  let trader = null;
  Object.values(G.world.nodes).forEach(n => {
    if (n.building?.trader?.id === traderId) trader = n.building.trader;
  });
  if (!trader || !trader.stock[offerIdx]) return;

  const offer = trader.stock[offerIdx];

  // Verify player has all items
  if (!offer.price.every(p => hasItem(p.id, p.qty))) {
    addLog('Недостаточно предметов для обмена.', 'warning');
    return;
  }

  // Remove price items
  offer.price.forEach(p => removeItem(p.id, p.qty));

  // Add sold item
  addItem(offer.sell.id, offer.sell.qty);

  // Remove offer from stock (one-time per restock)
  trader.stock.splice(offerIdx, 1);

  const sellDef = ITEMS[offer.sell.id];
  addLog(`Обмен: получено ${sellDef?.name || offer.sell.id}${offer.sell.qty > 1 ? ' ×'+offer.sell.qty : ''}`, 'success');

  calcWeight();
  playSound('trade');
  if (typeof showLootAnimation === 'function') showLootAnimation(sellDef?.name || offer.sell.id);

  // Refresh UI
  showTradeUI(trader);
  saveGame();
}

// Check if current building is a trader shop
function isTraderBuilding() {
  const loc = currentLocation();
  return loc?.isTraderShop && loc?.trader;
}

// Check if player is in NPC base safe zone
function isInSafeZone() {
  const node = G?.world?.nodes?.[G?.world?.currentNodeId];
  if (!node) return false;
  return isInNPCBase(node.gx, node.gy);
}
