// ═══════════════════════════════════════════
// CHARACTER CREATION SYSTEM
// ═══════════════════════════════════════════
const ccState = {
  mode: 'story', // 'story' or 'sandbox'
  occupation: 'unemployed',
  traits: [],
  difficulty: 'normal',
  tab: 0,
  sandbox: null, // custom difficulty settings
};

const BASE_TRAIT_POINTS = 0; // Start with 0, earn from negative traits or occupation bonus

function ccGetTotalPoints() {
  const occ = OCCUPATIONS.find(o => o.id === ccState.occupation);
  let pts = BASE_TRAIT_POINTS + (occ?.bonusPoints || 0);
  ccState.traits.forEach(tid => {
    const t = TRAITS.find(tr => tr.id === tid);
    if (t) pts -= t.cost; // positive cost reduces points, negative cost adds points
  });
  return pts;
}

function ccSetMode(mode, btnEl) {
  ccState.mode = mode;
  document.querySelectorAll('#mode-select .diff-btn').forEach(b => b.classList.remove('selected'));
  btnEl.classList.add('selected');

  const worldTab = document.getElementById('cc-tab-world');
  worldTab.textContent = mode === 'sandbox' ? t('cg.sandbox') : mode === 'creative' ? t('cg.creative') : t('cg.difficulty');
  ccRenderWorldTab();
}

function ccShowTab(idx) {
  ccState.tab = idx;
  document.querySelectorAll('.cc-tab').forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.cc-panel').forEach((p, i) => {
    p.classList.toggle('active', i === idx);
  });

  if (idx === 0) ccRenderPreview();
  if (idx === 1) ccRenderOccupations();
  if (idx === 2) ccRenderTraits();
  if (idx === 3) ccRenderWorldTab();
}

function ccRenderOccupations() {
  const container = document.getElementById('occ-list');
  container.innerHTML = OCCUPATIONS.map(occ => {
    const sel = ccState.occupation === occ.id;
    const skillTags = occ.skills ? Object.entries(occ.skills).filter(([,v]) => v !== 0).map(([k,v]) =>
      `<span class="occ-tag ${v > 0 ? 'positive' : 'negative'}">${v > 0 ? '+' : ''}${v} ${SKILL_NAMES[k]}</span>`
    ).join('') : '';
    const itemTags = (occ.items || []).slice(0, 4).map(id =>
      `<span class="occ-tag item">${ITEMS[id]?.name || id}</span>`
    ).join('') + (occ.items.length > 4 ? `<span class="occ-tag item">+${occ.items.length - 4}</span>` : '');
    const pointsInfo = occ.bonusPoints !== 0 ? `<span class="occ-tag ${occ.bonusPoints > 0 ? 'positive' : 'negative'}">${occ.bonusPoints > 0 ? '+' : ''}${occ.bonusPoints} очков черт</span>` : '';
    const profIcon = UI_MAP['prof_'+occ.id] ? uiIconHtml('prof_'+occ.id, 28) : '';
    return `<div class="occ-card ${sel ? 'selected' : ''}" onclick="ccSelectOcc('${occ.id}')">
      <div class="occ-name" style="display:flex;align-items:center;gap:6px">${profIcon}${occ.name}</div>
      <div class="occ-desc">${occ.desc}</div>
      <div class="occ-stats">${skillTags}${pointsInfo}${itemTags}</div>
    </div>`;
  }).join('');
}

function ccSelectOcc(id) {
  ccState.occupation = id;
  // Remove traits that would push points below 0
  let safetyLoop = 10;
  while (ccGetTotalPoints() < 0 && safetyLoop-- > 0) {
    // Remove the most expensive positive trait
    const posTraits = ccState.traits.filter(tid => { const t = TRAITS.find(tr => tr.id === tid); return t && t.cost > 0; });
    if (posTraits.length === 0) break;
    const mostExpensive = posTraits.sort((a, b) => {
      const ta = TRAITS.find(tr => tr.id === a);
      const tb = TRAITS.find(tr => tr.id === b);
      return tb.cost - ta.cost;
    })[0];
    ccState.traits = ccState.traits.filter(tid => tid !== mostExpensive);
  }
  ccRenderOccupations();
  ccUpdatePointsDisplay();
}

function ccRenderTraits() {
  const pts = ccGetTotalPoints();
  document.getElementById('pts-trait-val').textContent = pts;
  document.getElementById('pts-trait-val').className = `pts-val ${pts < 0 ? 'negative' : ''}`;

  const posTraits = TRAITS.filter(t => t.type === 'pos');
  const negTraits = TRAITS.filter(t => t.type === 'neg');

  document.getElementById('trait-list-pos').innerHTML =
    `<div class="trait-section-label">Положительные черты (стоят очки)</div>
    <div class="trait-list">${posTraits.map(t => ccRenderTraitCard(t, pts)).join('')}</div>`;

  document.getElementById('trait-list-neg').innerHTML =
    `<div class="trait-section-label">Отрицательные черты (дают очки)</div>
    <div class="trait-list">${negTraits.map(t => ccRenderTraitCard(t, pts)).join('')}</div>`;
}

function ccRenderTraitCard(t, pts) {
  const sel = ccState.traits.includes(t.id);
  const isExcluded = !sel && t.exclusive.some(ex => ccState.traits.includes(ex));
  const cantAfford = !sel && t.cost > 0 && pts < t.cost;
  const disabled = isExcluded || cantAfford;

  return `<div class="trait-card ${sel ? 'selected' : ''} ${t.type === 'neg' && sel ? 'neg' : ''} ${disabled ? 'disabled' : ''}"
    onclick="${disabled ? '' : `ccToggleTrait('${t.id}')`}">
    <div class="tc-cost ${t.cost > 0 ? 'pos' : 'neg'}">${t.cost > 0 ? '-' : '+'}${Math.abs(t.cost)}</div>
    <div class="tc-info">
      <div class="tc-name">${t.name}</div>
      <div class="tc-desc">${t.desc}${isExcluded ? ' [несовместимо]' : ''}</div>
    </div>
    <div class="tc-check">${sel ? '✓' : ''}</div>
  </div>`;
}

function ccToggleTrait(id) {
  if (ccState.traits.includes(id)) {
    ccState.traits = ccState.traits.filter(t => t !== id);
  } else {
    const trait = TRAITS.find(t => t.id === id);
    if (!trait) return;
    // Check exclusions
    if (trait.exclusive.some(ex => ccState.traits.includes(ex))) return;
    // Check affordability for positive traits
    if (trait.cost > 0 && ccGetTotalPoints() < trait.cost) return;
    ccState.traits.push(id);
  }
  ccRenderTraits();
  ccUpdatePointsDisplay();
}

function ccUpdatePointsDisplay() {
  const pts = ccGetTotalPoints();
  const el = document.getElementById('pts-trait-val');
  if (el) {
    el.textContent = pts;
    el.className = `pts-val ${pts < 0 ? 'negative' : ''}`;
  }
}

function ccRenderPreview() {
  const occ = OCCUPATIONS.find(o => o.id === ccState.occupation);
  const skills = { strength:0, stealth:0, scouting:0, firstAid:0, mechanics:0, cooking:0, lockpicking:0 };
  if (occ?.skills) Object.keys(occ.skills).forEach(k => skills[k] += occ.skills[k]);
  ccState.traits.forEach(tid => {
    const t = TRAITS.find(tr => tr.id === tid);
    if (t?.effect?.skills) Object.keys(t.effect.skills).forEach(k => skills[k] = Math.max(0, skills[k] + t.effect.skills[k]));
  });

  const statsHtml = `<div class="cc-preview">
    <div class="cc-preview-title">Навыки персонажа</div>
    ${Object.entries(skills).map(([k, v]) => {
      const boosted = v > 0;
      const bars = '█'.repeat(Math.min(v, 10)) + '░'.repeat(Math.max(0, 5 - v));
      return `<div class="cc-stat-row">
        <span class="stat-name">${SKILL_NAMES[k]}</span>
        <span class="stat-val ${boosted ? 'boosted' : ''}">${bars} ${v}</span>
      </div>`;
    }).join('')}
  </div>`;
  document.getElementById('cc-preview-stats').innerHTML = statsHtml;

  // Items preview
  const items = occ?.items || [];
  if (items.length > 0) {
    document.getElementById('cc-preview-items').innerHTML = `<div class="cc-preview">
      <div class="cc-preview-title">Стартовый инвентарь</div>
      ${items.map(id => `<div class="cc-stat-row"><span class="stat-name">${ITEMS[id]?.name || id}</span><span class="stat-val" style="color:var(--text-dim)">1</span></div>`).join('')}
    </div>`;
  } else {
    document.getElementById('cc-preview-items').innerHTML = `<div class="cc-preview">
      <div class="cc-preview-title">Стартовый инвентарь</div>
      <div style="color:var(--text-muted);font-size:11px;padding:4px 0">Пустой рюкзак</div>
    </div>`;
  }

  // Selected traits
  if (ccState.traits.length > 0) {
    const traitsPreview = ccState.traits.map(tid => {
      const t = TRAITS.find(tr => tr.id === tid);
      return `<span class="occ-tag ${t.type === 'pos' ? 'positive' : 'negative'}">${t.name}</span>`;
    }).join('');
    document.getElementById('cc-preview-items').innerHTML += `<div class="cc-preview" style="margin-top:8px">
      <div class="cc-preview-title">Черты</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;padding:4px 0">${traitsPreview}</div>
    </div>`;
  }
}

function ccRenderWorldTab() {
  const container = document.getElementById('world-settings-content');

  if (ccState.mode === 'creative') {
    container.innerHTML = `
      <div style="border:1px solid var(--cyan);padding:12px;border-radius:4px;background:rgba(0,229,255,.05)">
        <div style="color:var(--cyan);font-size:12px;letter-spacing:.15em;margin-bottom:8px">☆ РЕЖИМ КРЕАТИВ</div>
        <div style="font-size:11px;color:var(--text-dim);line-height:1.7">
          ▸ Бесконечное здоровье и ресурсы<br>
          ▸ Все предметы доступны через панель<br>
          ▸ Мгновенная телепортация по карте<br>
          ▸ Нет голода, жажды и усталости<br>
          ▸ Зомби не атакуют<br>
          ▸ Мгновенный крафт<br>
          ▸ Вся карта открыта<br>
          ▸ Бесконечная вместимость инвентаря
        </div>
      </div>`;
  } else if (ccState.mode === 'story') {
    if (!ccState.startSeason) ccState.startSeason = 'summer';
    // Simple difficulty selection + season
    container.innerHTML = `
      <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">Сложность</div>
      <div class="occ-list">
        ${DIFFICULTIES.map(d => `
          <div class="occ-card ${ccState.difficulty === d.id ? 'selected' : ''}" onclick="ccSelectDifficulty('${d.id}')">
            <div class="occ-name">${d.name}</div>
            <div class="occ-desc">${difficultyDesc(d)}</div>
          </div>
        `).join('')}
      </div>
      <div style="color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;margin:12px 0 6px">Время года</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${[['spring','🌱 Весна'],['summer','☀️ Лето'],['autumn','🍂 Осень'],['winter','❄️ Зима']].map(([id,name]) =>
          `<button class="sub-back" style="flex:1;padding:6px;font-size:10px;${ccState.startSeason===id?'border-color:var(--green);color:var(--green)':''}" onclick="ccState.startSeason='${id}';ccRenderWorldTab()">${name}</button>`
        ).join('')}
      </div>`;
  } else {
    // Sandbox — full customization
    if (!ccState.sandbox) ccResetSandbox();
    const sb = ccState.sandbox;
    container.innerHTML = `
      <div class="sb-section">
        <div class="sb-section-title">Зомби</div>
        <div class="sb-row"><span class="sb-label">Популяция</span>
          <select class="sb-select" onchange="ccSandbox('population',this.value)">
            ${sbOpt([0.25,'Очень мало'],[0.5,'Мало'],[1,'Средне'],[1.5,'Много'],[2.5,'Орда'],sb.population)}</select></div>
        <div class="sb-row"><span class="sb-label">Скорость</span>
          <select class="sb-select" onchange="ccSandbox('zombieSpeed',this.value)">
            ${sbOptStr(['slow','Медленные'],['mixed','Смешанные'],['fast','Быстрые'],sb.zombieSpeed)}</select></div>
        <div class="sb-row"><span class="sb-label">Здоровье</span>
          <select class="sb-select" onchange="ccSandbox('zombieHp',this.value)">
            ${sbOpt([0.5,'Хрупкие'],[0.7,'Слабые'],[1,'Обычные'],[1.5,'Крепкие'],[2,'Танки'],sb.zombieHp)}</select></div>
        <div class="sb-row"><span class="sb-label">Урон игроку</span>
          <select class="sb-select" onchange="ccSandbox('zombieDmg',this.value)">
            ${sbOpt([0.5,'Слабый'],[0.7,'Пониженный'],[1,'Обычный'],[1.5,'Повышенный'],[2,'Смертельный'],sb.zombieDmg)}</select></div>
        <div class="sb-row"><span class="sb-label">Слух зомби</span>
          <select class="sb-select" onchange="ccSandbox('zombieHearing',this.value)">
            ${sbOpt([0.5,'Глухие'],[0.7,'Слабый'],[1,'Обычный'],[1.5,'Чуткий'],[2,'Ультразвук'],sb.zombieHearing)}</select></div>
        <div class="sb-row"><span class="sb-label">Зрение зомби</span>
          <select class="sb-select" onchange="ccSandbox('zombieSight',this.value)">
            ${sbOpt([0.5,'Слепые'],[0.7,'Близорукие'],[1,'Обычное'],[1.5,'Острое'],[2,'Орлиное'],sb.zombieSight)}</select></div>
        <div class="sb-row"><span class="sb-label">Шанс заражения</span>
          <select class="sb-select" onchange="ccSandbox('infectionChance',this.value)">
            ${sbOpt([0,'Нет'],[0.1,'Минимальный'],[0.3,'Низкий'],[0.5,'Средний'],[0.8,'Высокий'],[1,'Каждый укус'],sb.infectionChance)}</select></div>
      </div>

      <div class="sb-section">
        <div class="sb-section-title">Мир</div>
        <div class="sb-row"><span class="sb-label">Количество лута</span>
          <select class="sb-select" onchange="ccSandbox('lootMult',this.value)">
            ${sbOpt([3,'Очень много'],[1.5,'Много'],[1,'Средне'],[0.5,'Мало'],[0.25,'Почти нет'],sb.lootMult)}</select></div>
        <div class="sb-row"><span class="sb-label">Порча продуктов</span>
          <select class="sb-select" onchange="ccSandbox('foodSpoilMult',this.value)">
            ${sbOpt([0,'Не портятся'],[0.5,'Медленно'],[1,'Обычно'],[2,'Быстро'],[4,'Мгновенно'],sb.foodSpoilMult)}</select></div>
        <div class="sb-row"><span class="sb-label">Появление лута</span>
          <select class="sb-select" onchange="ccSandbox('respawnLoot',this.value)">
            ${sbOptStr(['true','Да'],['false','Нет'],String(sb.respawnLoot))}</select></div>
        <div class="sb-row"><span class="sb-label">Штраф ночи</span>
          <select class="sb-select" onchange="ccSandbox('nightPenalty',this.value)">
            ${sbOpt([0,'Нет'],[0.1,'Слабый'],[0.2,'Обычный'],[0.4,'Сильный'],[0.6,'Экстремальный'],sb.nightPenalty)}</select></div>
      </div>

      <div class="sb-section">
        <div class="sb-section-title">Правила</div>
        <div class="sb-row"><span class="sb-label">Перманентная смерть</span>
          <select class="sb-select" onchange="ccSandbox('permadeath',this.value)">
            ${sbOptStr(['true','Да'],['false','Нет'],String(sb.permadeath))}</select></div>
        <div class="sb-row"><span class="sb-label">Лечение заражения</span>
          <select class="sb-select" onchange="ccSandbox('infectionCure',this.value)">
            ${sbOptStr(['true','Возможно'],['false','Невозможно'],String(sb.infectionCure))}</select></div>
        <div class="sb-row"><span class="sb-label">Закрытые двери</span>
          <select class="sb-select" onchange="ccSandbox('lockedFreq',this.value)">
            ${sbOpt([0,'Никогда'],[0.25,'Редко'],[0.5,'Средне'],[0.75,'Часто'],[1,'Очень часто'],sb.lockedFreq)}</select></div>
      </div>

      <div class="sb-section">
        <div class="sb-section-title">Игрок</div>
        <div class="sb-row"><span class="sb-label">Здоровье игрока</span>
          <select class="sb-select" onchange="ccSandbox('playerHp',this.value)">
            ${sbOpt([0.5,'Хрупкий'],[0.75,'Слабый'],[1,'Обычное'],[1.5,'Крепкий'],[2,'Танк'],sb.playerHp)}</select></div>
        <div class="sb-row"><span class="sb-label">Скорость бега</span>
          <select class="sb-select" onchange="ccSandbox('playerSpeed',this.value)">
            ${sbOpt([0.5,'Очень медленно'],[0.75,'Медленно'],[1,'Обычная'],[1.25,'Быстрая'],[1.5,'Спринтер'],sb.playerSpeed)}</select></div>
        <div class="sb-row"><span class="sb-label">Голод/жажда</span>
          <select class="sb-select" onchange="ccSandbox('hungerRate',this.value)">
            ${sbOpt([0,'Не голодает'],[0.5,'Медленно'],[1,'Обычно'],[1.5,'Быстро'],[2,'Очень быстро'],sb.hungerRate)}</select></div>
        <div class="sb-row"><span class="sb-label">Усталость</span>
          <select class="sb-select" onchange="ccSandbox('fatigueRate',this.value)">
            ${sbOpt([0,'Не устаёт'],[0.5,'Медленно'],[1,'Обычно'],[1.5,'Быстро'],[2,'Очень быстро'],sb.fatigueRate)}</select></div>
        <div class="sb-row"><span class="sb-label">Рост навыков</span>
          <select class="sb-select" onchange="ccSandbox('skillRate',this.value)">
            ${sbOpt([0.25,'Очень медленно'],[0.5,'Медленно'],[1,'Обычно'],[2,'Быстро'],[4,'Мгновенно'],sb.skillRate)}</select></div>
      </div>

      <div class="sb-section">
        <div class="sb-section-title">Окружение</div>
        <div class="sb-row"><span class="sb-label">Длина дня</span>
          <select class="sb-select" onchange="ccSandbox('dayLength',this.value)">
            ${sbOpt([0.5,'Короткий'],[0.75,'Уменьшенный'],[1,'Обычный'],[1.5,'Длинный'],[2,'Очень длинный'],sb.dayLength)}</select></div>
        <div class="sb-row"><span class="sb-label">Погода</span>
          <select class="sb-select" onchange="ccSandbox('weather',this.value)">
            ${sbOptStr(['normal','Обычная'],['rain','Всегда дождь'],['clear','Всегда ясно'],['harsh','Суровая'],sb.weather)}</select></div>
        <div class="sb-row"><span class="sb-label">Стартовый сезон</span>
          <select class="sb-select" onchange="ccSandbox('startSeason',this.value)">
            ${sbOptStr(['spring','Весна'],['summer','Лето'],['autumn','Осень'],['winter','Зима'],sb.startSeason)}</select></div>
      </div>

      <div style="margin-top:10px;text-align:center">
        <button class="sub-back" onclick="ccResetSandbox();ccRenderWorldTab()" style="font-size:10px">Сброс настроек</button>
      </div>`;
  }
}

function difficultyDesc(d) {
  const parts = [];
  if (d.zombieSpeed === 'slow') parts.push('Медленные зомби');
  else if (d.zombieSpeed === 'fast') parts.push('Быстрые зомби');
  if (!d.permadeath) parts.push('Без перма-смерти');
  else parts.push('Перма-смерть');
  if (d.lootMult > 1) parts.push('Много лута');
  else if (d.lootMult < 1) parts.push('Мало лута');
  if (!d.infectionCure) parts.push('Заражение неизлечимо');
  return parts.join(' · ');
}

function sbOpt(...args) {
  const val = args.pop();
  return args.map(([v, label]) => `<option value="${v}" ${parseFloat(v) === parseFloat(val) ? 'selected' : ''}>${label}</option>`).join('');
}

function sbOptStr(...args) {
  const val = args.pop();
  return args.map(([v, label]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${label}</option>`).join('');
}

function ccSelectDifficulty(id) {
  ccState.difficulty = id;
  ccRenderWorldTab();
}

function ccResetSandbox() {
  const base = DIFFICULTIES.find(d => d.id === 'normal');
  ccState.sandbox = { ...base, id:'sandbox', name:'Песочница', playerHp:1, playerSpeed:1, hungerRate:1, fatigueRate:1, skillRate:1, dayLength:1, weather:'normal', startSeason:'summer', lockedFreq:0.5 };
}

function ccSandbox(key, val) {
  if (!ccState.sandbox) ccResetSandbox();
  if (val === 'true') val = true;
  else if (val === 'false') val = false;
  else if (!isNaN(parseFloat(val))) val = parseFloat(val);
  ccState.sandbox[key] = val;
}

function ccStartGame() {
  const name = document.getElementById('cc-name').value.trim();
  if (ccGetTotalPoints() < 0) {
    openModal('', '<div style="text-align:center;color:var(--text)">Недостаточно очков для выбранных черт!</div>');
    return;
  }

  const charData = {
    name: name || 'Выживший',
    occupation: ccState.occupation,
    traits: [...ccState.traits],
    difficulty: ccState.difficulty,
    sandbox: ccState.mode === 'sandbox' ? ccState.sandbox : null,
    creative: ccState.mode === 'creative',
    startSeason: ccState.startSeason || ccState.sandbox?.startSeason || 'summer',
  };

  stopMenuBg();
  newGame(charData);
}

function gameConfirm(msg, onYes, onNo) {
  window._gcYes = onYes;
  window._gcNo = onNo;
  let html = `<div style="text-align:center;margin-bottom:14px;color:var(--text);font-size:12px;line-height:1.6">${msg}</div>`;
  html += '<div style="display:flex;gap:6px">';
  html += `<button class="act-btn" onclick="closeModal();if(window._gcYes)window._gcYes()" style="flex:1">${t('misc.yes')}</button>`;
  html += `<button class="act-btn" onclick="closeModal();if(window._gcNo)window._gcNo()" style="flex:1;border-color:#661122;color:var(--red)">${t('misc.no')}</button>`;
  html += '</div>';
  openModal('', html);
}

function updateDevButton() {
  const btn = document.getElementById('btn-editor');
  if (btn) btn.style.display = settings.devMode ? '' : 'none';
}

