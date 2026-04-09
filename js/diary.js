// ═══════════════════════════════════════════
// SURVIVAL DIARY
// ═══════════════════════════════════════════
function generateDiaryEntry() {
  if (!G?.diary) G.diary = [];
  if (!G._dayStats) return;
  const ds = G._dayStats;
  const day = G.player.daysSurvived;
  const node = G.world.nodes[G.world.currentNodeId];
  const region = node?.regionId || 'неизвестно';
  const curNode = G.world.nodes[G.world.currentNodeId];
  const atBase = G.world.homeBase && curNode?.building ? curNode.building.id === G.world.homeBase : false;

  const templates = {
    opening: [`День ${day}.`, `Запись ${day}.`, `${day}-й день.`],
    location: [
      `Провёл день в районе ${region}.`,
      `Бродил по ${region}.`,
      `Исследовал ${region}.`,
      `Снова ${region}. Начинаю привыкать.`,
    ],
    kills0: ['Зомби не встретил — повезло.', 'Тихий день, без столкновений.', ''],
    kills1: ['Один зомби — справился.', 'Пришлось прикончить одного.'],
    killsMany: [`Убил ${ds.kills} зомби. Руки до сих пор трясутся.`, `${ds.kills} зомби. Патроны тают.`, `Тяжёлый день: ${ds.kills} мертвецов.`],
    hurt: ['Получил ранение — надо найти бинты.', 'Ранен, но жив.', 'Саднит всё тело после стычки.'],
    noHurt: ['Ни царапины.', ''],
    loot: ds.itemsFound > 5 ? [`Неплохой улов: ${ds.itemsFound} предметов.`] : ds.itemsFound > 0 ? [`Нашёл ${ds.itemsFound} предметов.`] : ['Ничего полезного не нашёл.'],
    base: atBase ? ['К ночи вернулся на базу. Здесь безопаснее.'] : ['Ночую где придётся.', 'Без базы тяжело.'],
    mood: G.player.moodles.depression > 50 ? ['Тоска накрывает.'] : G.player.moodles.hunger > 60 ? ['Живот сводит от голода.'] : [''],
  };

  const pick = arr => arr[Math.floor(Math.random()*arr.length)] || '';
  const killText = ds.kills === 0 ? pick(templates.kills0) : ds.kills === 1 ? pick(templates.kills1) : pick(templates.killsMany);
  const hurtText = ds.wasHurt ? pick(templates.hurt) : pick(templates.noHurt);

  const entry = [pick(templates.opening), pick(templates.location), killText, hurtText, pick(templates.loot), pick(templates.base), pick(templates.mood)].filter(s=>s).join(' ');

  G.diary.push({ day, text: entry });
  G._dayStats = { kills:0, itemsFound:0, nodesVisited:0, wasHurt:false, wasAtBase:false };
}

let _diaryTab = 'diary';
function showDiary() {
  const isEn = LANG?.current === 'en';
  const notes = G?.loreNotes || [];
  let html = '';

  // Tabs
  html += `<div style="display:flex;gap:4px;margin-bottom:10px">`;
  html += `<button class="act-btn" style="flex:1;padding:6px;${_diaryTab==='diary'?'border-color:var(--green);color:var(--green);background:rgba(0,255,65,.08)':''}" onclick="_diaryTab='diary';showDiary()">📖 ${isEn?'DIARY':'ДНЕВНИК'}</button>`;
  html += `<button class="act-btn" style="flex:1;padding:6px;${_diaryTab==='notes'?'border-color:var(--cyan);color:var(--cyan);background:rgba(0,229,255,.08)':''}" onclick="_diaryTab='notes';showDiary()">📜 ${isEn?'NOTES':'ЗАПИСКИ'} ${notes.length>0?'('+notes.length+')':''}</button>`;
  html += `</div>`;

  html += '<div style="max-height:55vh;overflow-y:auto">';

  if (_diaryTab === 'diary') {
    if (!G?.diary || G.diary.length === 0) {
      html += `<div style="text-align:center;color:var(--text-dim);padding:20px">${isEn?'No entries yet. Diary updates each new day.':'Пока нет записей. Дневник обновляется каждый новый день.'}</div>`;
    } else {
      for (let i = G.diary.length - 1; i >= 0; i--) {
        const e = G.diary[i];
        html += `<div style="margin-bottom:12px;padding:8px;border-left:2px solid var(--green-dim)">`;
        html += `<div style="color:var(--green);font-size:10px;letter-spacing:.1em;margin-bottom:4px">${isEn?'DAY':'ДЕНЬ'} ${e.day}</div>`;
        html += `<div style="color:var(--text);font-size:11px;line-height:1.6">${e.text}</div>`;
        html += '</div>';
      }
    }
  } else {
    // Notes tab
    if (notes.length === 0) {
      html += `<div style="text-align:center;color:var(--text-dim);padding:20px">${isEn?'No notes found yet. Search buildings to find survivor notes.':'Записок пока нет. Обыскивайте здания, чтобы найти записки выживших.'}</div>`;
    } else {
      notes.forEach(note => {
        html += `<div style="margin-bottom:10px;padding:10px;border:1px solid rgba(0,229,255,.15);border-radius:4px;background:rgba(0,229,255,.03);cursor:pointer" onclick="showLoreNote(LORE_NOTES.find(n=>n.id==='${note.id}'))">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center">`;
        html += `<span style="color:var(--cyan);font-size:11px;font-weight:bold">📜 ${note.title}</span>`;
        html += `<span style="color:var(--text-muted);font-size:9px">${isEn?'Day':'День'} ${note.day}</span>`;
        html += `</div>`;
        html += `<div style="color:var(--text-dim);font-size:9px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${note.text.substring(0,60)}...</div>`;
        html += `</div>`;
      });
    }
  }

  html += '</div>';
  openModal(isEn ? 'Survival Diary' : 'Дневник выживания', html);
}

