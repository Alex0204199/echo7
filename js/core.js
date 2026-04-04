// ECHO-7 — SURVIVAL HORROR ENGINE
// ═══════════════════════════════════════════

// ── DETERMINISTIC RNG (Mulberry32) ──
class RNG {
  constructor(seed) { this.state = seed | 0 || 1; }
  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min, max) { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(pct) { return this.next() * 100 < pct; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = this.int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}

// ── EVENT BUS ──
const Bus = {
  _h: {},
  on(e, fn) { (this._h[e] = this._h[e] || []).push(fn); },
  emit(e, d) { (this._h[e] || []).forEach(fn => fn(d)); }
};

// ── ITEM DATABASE ──
const ITEMS = {
  // ── Weapons — melee ──
  fist:      { name:'Кулаки', type:'weapon', subtype:'melee', dmg:3, dur:999, noise:8, weight:0, accuracy:0, infectionRisk:5, desc:'Голые руки. Последнее средство', descEn:'Bare fists. Last resort' },
  knife:     { name:'Нож', type:'weapon', subtype:'melee', dmg:15, dur:60, noise:10, weight:0.3, accuracy:10, infectionRisk:0, desc:'Универсальный нож. Тихое оружие ближнего боя', descEn:'Versatile knife. Silent melee weapon' },
  bat:       { name:'Бита', type:'weapon', subtype:'melee', dmg:25, dur:80, noise:20, weight:1.5, accuracy:5, infectionRisk:0, desc:'Бейсбольная бита. Надёжное дробящее оружие', descEn:'Baseball bat. Reliable blunt weapon' },
  axe:       { name:'Топор', type:'weapon', subtype:'melee', dmg:40, dur:50, noise:25, weight:2.0, accuracy:0, infectionRisk:0, desc:'Тяжёлый топор. Высокий урон, но медленный', descEn:'Heavy axe. High damage but slow' },
  machete:   { name:'Мачете', type:'weapon', subtype:'melee', dmg:35, dur:55, noise:15, weight:1.0, accuracy:10, infectionRisk:0, desc:'Длинный клинок. Быстрые широкие удары', descEn:'Long blade. Fast wide swings' },
  crowbar:   { name:'Монтировка', type:'weapon', subtype:'melee', dmg:22, dur:100, noise:18, weight:1.5, accuracy:5, infectionRisk:0, desc:'Монтировка. Прочная и универсальная', descEn:'Crowbar. Durable and versatile' },
  spear:     { name:'Копьё', type:'weapon', subtype:'melee', dmg:20, dur:30, noise:12, weight:1.0, accuracy:5, infectionRisk:0, crafted:true, desc:'Самодельное копьё. Хрупкое', descEn:'Crafted spear. Fragile' },
  pipe:      { name:'Труба', type:'weapon', subtype:'melee', dmg:18, dur:90, noise:22, weight:1.2, accuracy:-5, infectionRisk:0, desc:'Металлическая труба. Шумная', descEn:'Metal pipe. Noisy' },
  pan:       { name:'Сковорода', type:'weapon', subtype:'melee', dmg:12, dur:120, noise:30, weight:1.0, accuracy:0, infectionRisk:0, desc:'Сковорода. Очень шумная, но не ломается', descEn:'Frying pan. Very noisy but durable' },

  // ── Weapons — pistols (9x19) ──
  pm:        { name:'ПМ (Макаров)', type:'weapon', subtype:'firearm', dmg:30, dur:250, noise:75, weight:0.73, accuracy:18, infectionRisk:0, caliber:'9x18', magType:'mag_pm', magSize:8, desc:'Пистолет Макарова. 9x18мм', descEn:'Makarov pistol. 9x18mm' },
  glock17:   { name:'Glock 17', type:'weapon', subtype:'firearm', dmg:34, dur:200, noise:78, weight:0.63, accuracy:22, infectionRisk:0, caliber:'9x19', magType:'mag_glock', magSize:17, desc:'Австрийский пистолет. 9x19мм, 17 патронов', descEn:'Austrian pistol. 9x19mm, 17 rounds' },
  beretta:   { name:'Beretta 92', type:'weapon', subtype:'firearm', dmg:33, dur:220, noise:77, weight:0.95, accuracy:24, infectionRisk:0, caliber:'9x19', magType:'mag_beretta', magSize:15, desc:'Итальянский пистолет. 9x19мм, точный', descEn:'Italian pistol. 9x19mm, accurate' },
  tt:        { name:'ТТ-33', type:'weapon', subtype:'firearm', dmg:36, dur:180, noise:80, weight:0.85, accuracy:15, infectionRisk:0, caliber:'7.62x25', magType:'mag_tt', magSize:8, desc:'Пистолет Токарева. 7.62x25мм, мощный', descEn:'Tokarev pistol. 7.62x25mm, powerful' },
  // ── Weapons — revolvers (no magazine) ──
  revolver_nagant:{ name:'Наган', type:'weapon', subtype:'firearm', dmg:32, dur:300, noise:78, weight:0.79, accuracy:20, infectionRisk:0, caliber:'7.62x38R', magSize:7, noMag:true, desc:'Револьвер Наган. 7 патронов, очень надёжный', descEn:'Nagant revolver. 7 rounds, very reliable' },
  revolver_357:  { name:'Colt Python .357', type:'weapon', subtype:'firearm', dmg:48, dur:280, noise:88, weight:1.1, accuracy:28, infectionRisk:0, caliber:'.357', magSize:6, noMag:true, desc:'Мощный револьвер .357 Magnum', descEn:'Powerful .357 Magnum revolver' },
  // ── Weapons — shotguns (no magazine, internal tube) ──
  mp133:     { name:'МР-133', type:'weapon', subtype:'firearm', dmg:65, dur:180, noise:95, weight:3.4, accuracy:30, infectionRisk:0, caliber:'12ga', magSize:8, noMag:true, desc:'Помповое ружьё. 12 калибр, 8 патронов', descEn:'Pump-action shotgun. 12ga, 8 rounds' },
  remington: { name:'Remington 870', type:'weapon', subtype:'firearm', dmg:62, dur:200, noise:93, weight:3.6, accuracy:32, infectionRisk:0, caliber:'12ga', magSize:6, noMag:true, desc:'Помповое ружьё. 12 калибр, надёжное', descEn:'Pump-action shotgun. 12ga, reliable' },
  toz34:     { name:'ТОЗ-34 (двуств.)', type:'weapon', subtype:'firearm', dmg:55, dur:250, noise:90, weight:3.2, accuracy:28, infectionRisk:0, caliber:'12ga', magSize:2, noMag:true, desc:'Двуствольное ружьё. 2 выстрела', descEn:'Double-barrel shotgun. 2 shots' },
  // ── Weapons — rifles ──
  sks:       { name:'СКС', type:'weapon', subtype:'firearm', dmg:55, dur:200, noise:92, weight:3.8, accuracy:42, infectionRisk:0, caliber:'7.62x39', magType:'mag_sks', magSize:10, desc:'Самозарядный карабин. 7.62x39мм', descEn:'Semi-auto carbine. 7.62x39mm' },
  ak74:      { name:'АК-74', type:'weapon', subtype:'firearm', dmg:48, dur:180, noise:90, weight:3.3, accuracy:35, infectionRisk:0, caliber:'5.45x39', magType:'mag_ak74', magSize:30, auto:true, desc:'Автомат Калашникова. 5.45x39мм', descEn:'Kalashnikov assault rifle. 5.45x39mm' },
  akm:       { name:'АКМ', type:'weapon', subtype:'firearm', dmg:52, dur:170, noise:93, weight:3.6, accuracy:32, infectionRisk:0, caliber:'7.62x39', magType:'mag_akm', magSize:30, auto:true, desc:'Модернизированный АК. 7.62x39мм, мощный', descEn:'Modernized AK. 7.62x39mm, powerful' },
  mosin:     { name:'Мосин-Наган', type:'weapon', subtype:'firearm', dmg:65, dur:300, noise:95, weight:4.0, accuracy:50, infectionRisk:0, caliber:'7.62x54R', magSize:5, noMag:true, desc:'Винтовка Мосина. Точная, мощная', descEn:'Mosin rifle. Accurate, powerful' },
  svd:       { name:'СВД', type:'weapon', subtype:'firearm', dmg:70, dur:220, noise:95, weight:4.3, accuracy:55, infectionRisk:0, caliber:'7.62x54R', magType:'mag_svd', magSize:10, desc:'Снайперская винтовка Драгунова', descEn:'Dragunov sniper rifle' },
  ar15:      { name:'AR-15', type:'weapon', subtype:'firearm', dmg:46, dur:190, noise:88, weight:3.0, accuracy:40, infectionRisk:0, caliber:'5.56x45', magType:'mag_ar15', magSize:30, auto:true, desc:'Штурмовая винтовка. 5.56x45мм NATO', descEn:'Assault rifle. 5.56x45mm NATO' },
  // ── Weapons — SMG ──
  pp19:      { name:'ПП-19 Витязь', type:'weapon', subtype:'firearm', dmg:28, dur:200, noise:72, weight:2.7, accuracy:20, infectionRisk:0, caliber:'9x19', magType:'mag_pp19', magSize:30, auto:true, desc:'Пистолет-пулемёт. 9x19мм, автоматический', descEn:'Submachine gun. 9x19mm, automatic' },

  // ── Magazines ──
  mag_pm:    { name:'Маг. ПМ (8)', type:'magazine', caliber:'9x18', capacity:8, weight:0.07 },
  mag_glock: { name:'Маг. Glock (17)', type:'magazine', caliber:'9x19', capacity:17, weight:0.07 },
  mag_beretta:{ name:'Маг. Beretta (15)', type:'magazine', caliber:'9x19', capacity:15, weight:0.07 },
  mag_tt:    { name:'Маг. ТТ (8)', type:'magazine', caliber:'7.62x25', capacity:8, weight:0.06 },
  mag_sks:   { name:'Маг. СКС (10)', type:'magazine', caliber:'7.62x39', capacity:10, weight:0.12 },
  mag_ak74:  { name:'Маг. АК-74 (30)', type:'magazine', caliber:'5.45x39', capacity:30, weight:0.2 },
  mag_akm:   { name:'Маг. АКМ (30)', type:'magazine', caliber:'7.62x39', capacity:30, weight:0.22 },
  mag_svd:   { name:'Маг. СВД (10)', type:'magazine', caliber:'7.62x54R', capacity:10, weight:0.18 },
  mag_ar15:  { name:'Маг. AR-15 (30)', type:'magazine', caliber:'5.56x45', capacity:30, weight:0.13 },
  mag_pp19:  { name:'Маг. ПП-19 (30)', type:'magazine', caliber:'9x19', capacity:30, weight:0.14 },

  // ── Ammo (by caliber) ──
  ammo_9x18: { name:'9x18мм ПМ', type:'ammo', caliber:'9x18', weight:0.01, stackable:true },
  ammo_9x19: { name:'9x19мм Пара', type:'ammo', caliber:'9x19', weight:0.012, stackable:true },
  ammo_762x25:{ name:'7.62x25мм ТТ', type:'ammo', caliber:'7.62x25', weight:0.011, stackable:true },
  ammo_762x38R:{ name:'7.62x38R Наган', type:'ammo', caliber:'7.62x38R', weight:0.012, stackable:true },
  ammo_357:  { name:'.357 Magnum', type:'ammo', caliber:'.357', weight:0.015, stackable:true },
  ammo_12ga: { name:'12 калибр картечь', type:'ammo', caliber:'12ga', weight:0.04, stackable:true },
  ammo_762x39:{ name:'7.62x39мм', type:'ammo', caliber:'7.62x39', weight:0.016, stackable:true },
  ammo_545x39:{ name:'5.45x39мм', type:'ammo', caliber:'5.45x39', weight:0.01, stackable:true },
  ammo_762x54R:{ name:'7.62x54R', type:'ammo', caliber:'7.62x54R', weight:0.022, stackable:true },
  ammo_556x45:{ name:'5.56x45мм NATO', type:'ammo', caliber:'5.56x45', weight:0.012, stackable:true },
  // Legacy aliases for loot tables
  ammo_9mm:  { name:'9x19мм Пара', type:'ammo', caliber:'9x19', weight:0.012, stackable:true, _alias:'ammo_9x19' },
  ammo_shells:{ name:'12 калибр картечь', type:'ammo', caliber:'12ga', weight:0.04, stackable:true, _alias:'ammo_12ga' },
  ammo_rifle:{ name:'7.62x39мм', type:'ammo', caliber:'7.62x39', weight:0.016, stackable:true, _alias:'ammo_762x39' },
  // Legacy weapon aliases
  pistol:    { name:'ПМ (Макаров)', type:'weapon', subtype:'firearm', dmg:30, dur:250, noise:75, weight:0.73, accuracy:18, infectionRisk:0, caliber:'9x18', magType:'mag_pm', magSize:8, _alias:'pm' },
  shotgun:   { name:'МР-133', type:'weapon', subtype:'firearm', dmg:65, dur:180, noise:95, weight:3.4, accuracy:30, infectionRisk:0, caliber:'12ga', magSize:8, noMag:true, _alias:'mp133' },
  rifle:     { name:'СКС', type:'weapon', subtype:'firearm', dmg:55, dur:200, noise:92, weight:3.8, accuracy:42, infectionRisk:0, caliber:'7.62x39', magType:'mag_sks', magSize:10, _alias:'sks' },
  revolver:  { name:'Наган', type:'weapon', subtype:'firearm', dmg:32, dur:300, noise:78, weight:0.79, accuracy:20, infectionRisk:0, caliber:'7.62x38R', magSize:7, noMag:true, _alias:'revolver_nagant' },

  // ── Medicine ──
  bandage:   { name:'Бинт', type:'medicine', subtype:'bandage', weight:0.1, healType:'bleeding', desc:'Стерильный бинт для перевязки ран', descEn:'Sterile bandage for wound dressing' },
  antibiotics:{ name:'Антибиотики', type:'medicine', subtype:'antibiotics', weight:0.05, healType:'infection', desc:'Антибиотики. Лечат инфекцию', descEn:'Antibiotics. Treats infection' },
  painkillers:{ name:'Обезболивающее', type:'medicine', subtype:'painkillers', weight:0.05, healType:'pain', desc:'Обезболивающие таблетки', descEn:'Painkiller pills' },
  splint:    { name:'Шина', type:'medicine', subtype:'splint', weight:0.3, healType:'fracture', desc:'Шина для фиксации переломов', descEn:'Splint for fixing fractures' },
  disinfectant:{ name:'Дезинфектор', type:'medicine', subtype:'disinfectant', weight:0.15, healType:'wound', desc:'Дезинфицирующее средство для обработки ран', descEn:'Disinfectant for wound treatment' },
  vitamins:  { name:'Витамины', type:'medicine', subtype:'vitamins', weight:0.05, healType:'depression', desc:'Витаминный комплекс. Улучшает самочувствие', descEn:'Vitamin complex. Improves well-being' },
  antidepressants:{ name:'Антидепрессанты', type:'medicine', subtype:'antidepressants', weight:0.05, healType:'depression', desc:'Антидепрессанты. Снижают уровень стресса', descEn:'Antidepressants. Reduces stress' },

  // ── Food ──
  canned_food:{ name:'Консервы', type:'food', hunger:-25, weight:0.4, noise:3, freshness:999, desc:'Консервированная еда. Долго хранится', descEn:'Canned food. Long shelf life' },
  water:     { name:'Бутылка воды', type:'food', thirst:-30, weight:0.5, noise:0, freshness:999, desc:'Бутылка питьевой воды', descEn:'Bottle of drinking water' },
  bread:     { name:'Хлеб', type:'food', hunger:-15, weight:0.2, noise:5, freshness:3, desc:'Свежий хлеб. Быстро портится', descEn:'Fresh bread. Spoils quickly' },
  chips:     { name:'Чипсы', type:'food', hunger:-10, weight:0.15, noise:8, freshness:999, desc:'Пакет чипсов. Шумно открывать', descEn:'Bag of chips. Noisy to open' },
  meat_raw:  { name:'Сырое мясо', type:'food', hunger:-20, weight:0.3, noise:0, freshness:1, raw:true, desc:'Сырое мясо. Нужно приготовить', descEn:'Raw meat. Needs cooking' },
  soup:      { name:'Бульон', type:'food', hunger:-30, weight:0.3, noise:0, freshness:2, painRelief:10, crafted:true, desc:'Горячий бульон. Утоляет голод и снимает боль', descEn:'Hot broth. Sates hunger and relieves pain' },
  energy_bar:{ name:'Энергобатончик', type:'food', hunger:-12, weight:0.1, noise:3, freshness:999, desc:'Энергетический батончик. Компактный перекус', descEn:'Energy bar. Compact snack' },
  chocolate: { name:'Шоколад', type:'food', hunger:-8, weight:0.1, noise:2, freshness:999, depression:-5, desc:'Шоколадка. Поднимает настроение', descEn:'Chocolate bar. Boosts mood' },
  coffee:    { name:'Кофе (термос)', type:'food', thirst:-15, weight:0.3, noise:0, freshness:999, fatigue:-15, depression:-3, desc:'Горячий кофе в термосе. Снимает усталость', descEn:'Hot coffee in thermos. Reduces fatigue' },
  whiskey:   { name:'Виски', type:'food', thirst:-5, weight:0.5, noise:0, freshness:999, depression:-20, pain:-15, accuracy:-10, desc:'Виски. Снимает стресс и боль, но ухудшает точность', descEn:'Whiskey. Relieves stress and pain, but reduces accuracy' },
  soda:      { name:'Газировка', type:'food', thirst:-20, hunger:-5, weight:0.3, noise:5, freshness:999, desc:'Газированный напиток', descEn:'Carbonated drink' },

  // ── Comfort items (reduce depression) ──
  cigarettes:{ name:'Сигареты', type:'comfort', comfortType:'smoke', depression:-15, weight:0.05, uses:5, desc:'Пачка сигарет. Снимает стресс', descEn:'Pack of cigarettes. Relieves stress' },
  magazine:  { name:'Журнал', type:'comfort', comfortType:'read', depression:-10, weight:0.1, desc:'Глянцевый журнал. Можно почитать', descEn:'Glossy magazine. Something to read' },
  comics:    { name:'Комиксы', type:'comfort', comfortType:'read', depression:-8, weight:0.1, desc:'Комиксы. Поднимают настроение', descEn:'Comics. Boosts mood' },
  cards:     { name:'Колода карт', type:'comfort', comfortType:'play', depression:-5, weight:0.05, reusable:true, desc:'Колода карт. Многоразовое развлечение', descEn:'Deck of cards. Reusable entertainment' },
  photo:     { name:'Семейное фото', type:'comfort', comfortType:'look', depression:-3, weight:0, reusable:true, desc:'Семейное фото. Напоминание о прошлом', descEn:'Family photo. Reminder of the past' },
  mp3player: { name:'MP3-плеер', type:'comfort', comfortType:'listen', depression:-12, weight:0.1, reusable:true, desc:'MP3-плеер с музыкой. Хорошо снимает стресс', descEn:'MP3 player with music. Great stress relief' },

  // ── Books (skill XP boost) ──
  book_strength: { name:'«Сила и выносливость»', type:'book', skill:'strength', xpBoost:50, weight:0.3, desc:'Книга о тренировках. +50 XP к силе', descEn:'Training book. +50 XP to strength' },
  book_stealth:  { name:'«Искусство теней»', type:'book', skill:'stealth', xpBoost:50, weight:0.3, desc:'Книга о скрытности. +50 XP к стелсу', descEn:'Stealth book. +50 XP to stealth' },
  book_scouting: { name:'«Руководство разведчика»', type:'book', skill:'scouting', xpBoost:50, weight:0.3, desc:'Книга о разведке. +50 XP к разведке', descEn:'Scouting book. +50 XP to scouting' },
  book_firstaid: { name:'«Неотложная помощь»', type:'book', skill:'firstAid', xpBoost:50, weight:0.3, desc:'Медицинский справочник. +50 XP к медицине', descEn:'Medical guide. +50 XP to first aid' },
  book_mechanics:{ name:'«Механика для всех»', type:'book', skill:'mechanics', xpBoost:50, weight:0.3, desc:'Книга о механике. +50 XP к механике', descEn:'Mechanics book. +50 XP to mechanics' },
  book_cooking:  { name:'«Кулинарная книга»', type:'book', skill:'cooking', xpBoost:50, weight:0.3, desc:'Кулинарная книга. +50 XP к кулинарии', descEn:'Cookbook. +50 XP to cooking' },
  book_firearms: { name:'«Огнестрельное оружие»', type:'book', skill:'firearms', xpBoost:50, weight:0.3, desc:'Книга о стрелковом оружии. +50 XP к стрельбе', descEn:'Firearms book. +50 XP to firearms' },

  // ── Clothing — head ──
  // Гражданская
  hat_cap:   { name:'Кепка', type:'clothing', slot:'head', armor:1, warmth:5, weight:0.1, biteDefense:0, scratchDefense:5, bulletDefense:0, insulation:20, windResist:15, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Обычная бейсболка', descEn:'Regular baseball cap' },
  hat_winter:{ name:'Шапка зимняя', type:'clothing', slot:'head', armor:1, warmth:15, weight:0.15, biteDefense:0, scratchDefense:5, bulletDefense:0, insulation:70, windResist:60, waterResist:10, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Тёплая зимняя шапка', descEn:'Warm winter hat' },
  bandana:   { name:'Бандана', type:'clothing', slot:'head', armor:0, warmth:3, weight:0.05, biteDefense:0, scratchDefense:3, bulletDefense:0, insulation:10, windResist:5, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Тканевая повязка на голову', descEn:'Cloth headband' },
  hat_ushanka:{ name:'Ушанка', type:'clothing', slot:'head', armor:2, warmth:20, weight:0.25, biteDefense:5, scratchDefense:10, bulletDefense:0, insulation:85, windResist:80, waterResist:20, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Классическая шапка-ушанка', descEn:'Classic ushanka fur hat' },
  // Спецодежда
  helmet:    { name:'Каска строительная', type:'clothing', slot:'head', armor:10, warmth:3, weight:0.8, biteDefense:15, scratchDefense:40, bulletDefense:10, insulation:10, windResist:10, waterResist:5, runSpeed:0.98, meleeSpeed:0.97, repairable:false, desc:'Строительная каска. Защита от падающих предметов', descEn:'Construction hard hat. Protects from falling objects' },
  helmet_mil:{ name:'Шлем военный', type:'clothing', slot:'head', armor:15, warmth:5, weight:1.2, biteDefense:30, scratchDefense:60, bulletDefense:40, insulation:15, windResist:20, waterResist:10, runSpeed:0.96, meleeSpeed:0.95, repairable:false, desc:'Военный шлем. Отличная баллистическая защита', descEn:'Military helmet. Excellent ballistic protection' },
  helmet_riot:{ name:'Шлем ОМОН', type:'clothing', slot:'head', armor:18, warmth:4, weight:1.5, biteDefense:35, scratchDefense:70, bulletDefense:30, insulation:10, windResist:15, waterResist:5, runSpeed:0.95, meleeSpeed:0.93, repairable:false, desc:'Шлем ОМОН с забралом', descEn:'Riot helmet with visor' },
  helmet_fire:{ name:'Шлем пожарного', type:'clothing', slot:'head', armor:14, warmth:8, weight:1.3, biteDefense:25, scratchDefense:50, bulletDefense:5, insulation:70, windResist:60, waterResist:80, runSpeed:0.95, meleeSpeed:0.94, repairable:false, desc:'Защита от огня и высоких температур', descEn:'Fire protection helmet. Heat resistant' },
  mask_gas:  { name:'Противогаз', type:'clothing', slot:'head', armor:3, warmth:6, weight:0.7, biteDefense:10, scratchDefense:15, bulletDefense:0, insulation:30, windResist:40, waterResist:60, runSpeed:0.97, meleeSpeed:0.98, repairable:false, desc:'Защита от газов и отравляющих веществ', descEn:'Gas mask. Protection from toxic substances' },
  hat_medic: { name:'Медицинская шапочка', type:'clothing', slot:'head', armor:0, warmth:2, weight:0.05, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:0, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Одноразовая медицинская шапочка', descEn:'Disposable medical cap' },

  // ── Clothing — torso ──
  // Гражданская
  tshirt:    { name:'Футболка', type:'clothing', slot:'torso', armor:1, warmth:5, weight:0.2, biteDefense:0, scratchDefense:5, bulletDefense:0, insulation:15, windResist:5, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Лёгкая хлопковая футболка', descEn:'Light cotton t-shirt' },
  shirt:     { name:'Рубашка', type:'clothing', slot:'torso', armor:1, warmth:8, weight:0.25, biteDefense:0, scratchDefense:8, bulletDefense:0, insulation:25, windResist:15, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Рубашка с длинным рукавом', descEn:'Long-sleeved shirt' },
  hoodie:    { name:'Худи', type:'clothing', slot:'torso', armor:2, warmth:15, weight:0.5, biteDefense:5, scratchDefense:12, bulletDefense:0, insulation:50, windResist:35, waterResist:5, runSpeed:0.99, meleeSpeed:0.99, repairable:true, desc:'Толстовка с капюшоном', descEn:'Hooded sweatshirt' },
  jacket:    { name:'Куртка', type:'clothing', slot:'torso', armor:3, warmth:20, weight:0.8, biteDefense:8, scratchDefense:15, bulletDefense:0, insulation:60, windResist:50, waterResist:15, runSpeed:0.98, meleeSpeed:0.98, repairable:true, desc:'Обычная куртка', descEn:'Regular jacket' },
  jacket_leather:{ name:'Кожаная куртка', type:'clothing', slot:'torso', armor:6, warmth:18, weight:1.2, biteDefense:15, scratchDefense:30, bulletDefense:5, insulation:55, windResist:60, waterResist:30, runSpeed:0.96, meleeSpeed:0.96, repairable:true, desc:'Прочная кожаная куртка. Хорошая защита от царапин', descEn:'Durable leather jacket. Good scratch protection' },
  sweater:   { name:'Свитер', type:'clothing', slot:'torso', armor:1, warmth:22, weight:0.4, biteDefense:3, scratchDefense:8, bulletDefense:0, insulation:70, windResist:30, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Вязаный свитер. Очень тёплый', descEn:'Knit sweater. Very warm' },
  coat_winter:{ name:'Зимнее пальто', type:'clothing', slot:'torso', armor:3, warmth:28, weight:1.5, biteDefense:5, scratchDefense:10, bulletDefense:0, insulation:90, windResist:80, waterResist:30, runSpeed:0.95, meleeSpeed:0.95, repairable:true, desc:'Тёплое зимнее пальто', descEn:'Warm winter coat' },
  raincoat:  { name:'Дождевик', type:'clothing', slot:'torso', armor:1, warmth:8, weight:0.4, biteDefense:0, scratchDefense:5, bulletDefense:0, insulation:20, windResist:70, waterResist:95, runSpeed:0.99, meleeSpeed:0.99, repairable:false, desc:'Защита от дождя. Водонепроницаемый', descEn:'Raincoat. Waterproof' },
  // Спецодежда
  vest_hi:   { name:'Светоотражающий жилет', type:'clothing', slot:'torso', armor:1, warmth:2, weight:0.2, biteDefense:0, scratchDefense:3, bulletDefense:0, insulation:5, windResist:0, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Яркий жилет для видимости', descEn:'High-visibility reflective vest' },
  jacket_fire:{ name:'Куртка пожарного', type:'clothing', slot:'torso', armor:12, warmth:25, weight:2.8, biteDefense:50, scratchDefense:70, bulletDefense:0, insulation:80, windResist:70, waterResist:60, runSpeed:0.87, meleeSpeed:0.90, repairable:false, desc:'Огнеупорная куртка. Тяжёлая но очень прочная', descEn:'Fireproof jacket. Heavy but very durable' },
  jacket_mil:{ name:'Кителъ военный', type:'clothing', slot:'torso', armor:8, warmth:16, weight:1.0, biteDefense:20, scratchDefense:30, bulletDefense:5, insulation:50, windResist:45, waterResist:20, runSpeed:0.95, meleeSpeed:0.96, repairable:true, desc:'Военная форменная куртка', descEn:'Military uniform jacket' },
  scrubs:    { name:'Медицинский халат', type:'clothing', slot:'torso', armor:1, warmth:5, weight:0.2, biteDefense:0, scratchDefense:3, bulletDefense:0, insulation:15, windResist:5, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Медицинский халат', descEn:'Medical scrubs' },
  overalls:  { name:'Комбинезон рабочий', type:'clothing', slot:'torso', armor:5, warmth:14, weight:0.9, biteDefense:10, scratchDefense:20, bulletDefense:0, insulation:45, windResist:35, waterResist:10, runSpeed:0.95, meleeSpeed:0.97, repairable:true, desc:'Рабочий комбинезон. Защищает торс и ноги', descEn:'Work overalls. Protects torso and legs' },
  jacket_police:{ name:'Полицейская форма', type:'clothing', slot:'torso', armor:7, warmth:14, weight:0.9, biteDefense:20, scratchDefense:30, bulletDefense:0, insulation:45, windResist:40, waterResist:15, runSpeed:0.95, meleeSpeed:0.96, repairable:true, desc:'Полицейская форменная куртка', descEn:'Police uniform jacket' },

  // ── Armor (separate slot) ──
  vest_armor:{ name:'Бронежилет', type:'clothing', slot:'armor', armor:20, warmth:10, weight:3.0, biteDefense:30, scratchDefense:50, bulletDefense:100, insulation:30, windResist:20, waterResist:10, runSpeed:0.92, meleeSpeed:0.93, repairable:false, desc:'Бронежилет. Полная защита от пуль. Только торс', descEn:'Body armor. Full bullet protection. Torso only' },
  vest_police:{ name:'Полицейский бронежилет', type:'clothing', slot:'armor', armor:16, warmth:8, weight:2.5, biteDefense:25, scratchDefense:40, bulletDefense:80, insulation:25, windResist:15, waterResist:5, runSpeed:0.93, meleeSpeed:0.94, repairable:false, desc:'Полицейский бронежилет. Хорошая баллистика', descEn:'Police body armor. Good ballistic protection' },
  armor_plate:{ name:'Плитоноска', type:'clothing', slot:'armor', armor:25, warmth:5, weight:4.0, biteDefense:40, scratchDefense:60, bulletDefense:100, insulation:15, windResist:10, waterResist:5, runSpeed:0.88, meleeSpeed:0.90, repairable:false, desc:'Плитоноска с керамическими плитами. Максимальная защита', descEn:'Plate carrier with ceramic plates. Maximum protection' },
  armor_press:{ name:'Пресс-жилет', type:'clothing', slot:'armor', armor:12, warmth:4, weight:2.0, biteDefense:15, scratchDefense:25, bulletDefense:50, insulation:15, windResist:10, waterResist:5, runSpeed:0.94, meleeSpeed:0.95, repairable:false, desc:'Лёгкий прессованный жилет', descEn:'Light pressed armor vest' },
  armor_stab: { name:'Антиколющий жилет', type:'clothing', slot:'armor', armor:14, warmth:6, weight:1.8, biteDefense:20, scratchDefense:45, bulletDefense:20, insulation:20, windResist:10, waterResist:5, runSpeed:0.94, meleeSpeed:0.95, repairable:false, desc:'Защита от колющих ударов', descEn:'Stab-proof vest' },

  // ── Chest rigs (separate slot, adds capacity) ──
  rig_basic:  { name:'Разгрузка лёгкая', type:'clothing', slot:'rig', armor:2, warmth:2, weight:0.5, capacity:3, biteDefense:3, scratchDefense:5, bulletDefense:0, insulation:5, windResist:0, waterResist:0, runSpeed:0.99, meleeSpeed:0.99, repairable:true, desc:'Лёгкая тактическая разгрузка. +3 вместимость', descEn:'Light tactical rig. +3 capacity' },
  rig_police: { name:'Разгрузка полицейская', type:'clothing', slot:'rig', armor:4, warmth:3, weight:0.8, capacity:4, biteDefense:5, scratchDefense:10, bulletDefense:0, insulation:10, windResist:5, waterResist:0, runSpeed:0.98, meleeSpeed:0.98, repairable:true, desc:'Полицейская разгрузка. +4 вместимость', descEn:'Police chest rig. +4 capacity' },
  rig_mil:    { name:'Разгрузка военная', type:'clothing', slot:'rig', armor:5, warmth:4, weight:1.0, capacity:6, biteDefense:8, scratchDefense:15, bulletDefense:5, insulation:12, windResist:8, waterResist:5, runSpeed:0.97, meleeSpeed:0.97, repairable:true, desc:'Военная разгрузка MOLLE. +6 вместимость', descEn:'Military MOLLE chest rig. +6 capacity' },
  rig_hunter: { name:'Разгрузка охотничья', type:'clothing', slot:'rig', armor:3, warmth:3, weight:0.6, capacity:4, biteDefense:5, scratchDefense:8, bulletDefense:0, insulation:10, windResist:5, waterResist:5, runSpeed:0.98, meleeSpeed:0.99, repairable:true, desc:'Охотничья разгрузка. +4 вместимость', descEn:'Hunting chest rig. +4 capacity' },
  rig_heavy:  { name:'Штурмовая разгрузка', type:'clothing', slot:'rig', armor:6, warmth:5, weight:1.4, capacity:8, biteDefense:10, scratchDefense:20, bulletDefense:5, insulation:15, windResist:10, waterResist:5, runSpeed:0.94, meleeSpeed:0.95, repairable:false, desc:'Тяжёлая штурмовая разгрузка. +8 вместимость', descEn:'Heavy assault rig. +8 capacity' },

  // ── Gloves ──
  gloves_work:  { name:'Рабочие перчатки', type:'clothing', slot:'gloves', armor:3, warmth:8, weight:0.15, biteDefense:5, scratchDefense:20, bulletDefense:0, insulation:25, windResist:20, waterResist:5, runSpeed:1.0, meleeSpeed:0.98, repairable:true, desc:'Рабочие перчатки. Защита рук от порезов', descEn:'Work gloves. Hand protection from cuts' },
  gloves_leather:{ name:'Кожаные перчатки', type:'clothing', slot:'gloves', armor:4, warmth:10, weight:0.2, biteDefense:10, scratchDefense:30, bulletDefense:0, insulation:35, windResist:30, waterResist:10, runSpeed:1.0, meleeSpeed:0.97, repairable:true, desc:'Кожаные перчатки. Хорошая защита', descEn:'Leather gloves. Good protection' },
  gloves_tactical:{ name:'Тактические перчатки', type:'clothing', slot:'gloves', armor:6, warmth:6, weight:0.2, biteDefense:15, scratchDefense:35, bulletDefense:5, insulation:20, windResist:15, waterResist:5, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Тактические перчатки. Не мешают стрельбе', descEn:'Tactical gloves. No penalty to shooting' },
  gloves_winter:{ name:'Зимние перчатки', type:'clothing', slot:'gloves', armor:2, warmth:20, weight:0.15, biteDefense:3, scratchDefense:10, bulletDefense:0, insulation:80, windResist:70, waterResist:15, runSpeed:1.0, meleeSpeed:0.95, repairable:true, desc:'Очень тёплые зимние перчатки', descEn:'Very warm winter gloves' },
  gloves_medical:{ name:'Медицинские перчатки', type:'clothing', slot:'gloves', armor:0, warmth:1, weight:0.02, biteDefense:0, scratchDefense:2, bulletDefense:0, insulation:2, windResist:0, waterResist:5, runSpeed:1.0, meleeSpeed:1.0, repairable:false, desc:'Латексные перчатки. Одноразовые', descEn:'Latex gloves. Disposable' },
  gloves_fire:  { name:'Перчатки пожарного', type:'clothing', slot:'gloves', armor:8, warmth:15, weight:0.3, biteDefense:20, scratchDefense:50, bulletDefense:0, insulation:60, windResist:50, waterResist:40, runSpeed:1.0, meleeSpeed:0.93, repairable:false, desc:'Жаропрочные перчатки пожарного', descEn:'Heat-resistant firefighter gloves' },

  // ── Balaclava / face cover ──
  balaclava_black:{ name:'Балаклава чёрная', type:'clothing', slot:'face', armor:2, warmth:12, weight:0.1, biteDefense:5, scratchDefense:10, bulletDefense:0, insulation:50, windResist:55, waterResist:5, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Чёрная балаклава. Скрывает лицо', descEn:'Black balaclava. Conceals face' },
  balaclava_camo: { name:'Балаклава камуфляж', type:'clothing', slot:'face', armor:2, warmth:12, weight:0.1, biteDefense:5, scratchDefense:10, bulletDefense:0, insulation:50, windResist:55, waterResist:5, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Камуфляжная балаклава', descEn:'Camouflage balaclava' },
  balaclava_skull:{ name:'Балаклава с черепом', type:'clothing', slot:'face', armor:2, warmth:12, weight:0.1, biteDefense:5, scratchDefense:10, bulletDefense:0, insulation:50, windResist:55, waterResist:5, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Балаклава с рисунком черепа', descEn:'Skull pattern balaclava' },
  scarf:     { name:'Шарф', type:'clothing', slot:'face', armor:0, warmth:10, weight:0.1, biteDefense:0, scratchDefense:10, bulletDefense:0, insulation:75, windResist:75, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Тёплый шарф', descEn:'Warm scarf' },
  mask_surgical:{ name:'Медицинская маска', type:'clothing', slot:'face', armor:0, warmth:2, weight:0.02, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:5, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:false, desc:'Медицинская маска. Одноразовая', descEn:'Surgical mask. Disposable' },

  // ── Clothing — legs ──
  // Гражданская
  pants_jeans:{ name:'Джинсы', type:'clothing', slot:'legs', armor:2, warmth:10, weight:0.5, biteDefense:5, scratchDefense:15, bulletDefense:0, insulation:35, windResist:25, waterResist:5, runSpeed:0.99, meleeSpeed:1.0, repairable:true, desc:'Прочные джинсы', descEn:'Sturdy jeans' },
  pants_cargo:{ name:'Карго-штаны', type:'clothing', slot:'legs', armor:3, warmth:12, weight:0.6, pockets:2, biteDefense:8, scratchDefense:18, bulletDefense:0, insulation:40, windResist:30, waterResist:5, runSpeed:0.98, meleeSpeed:1.0, repairable:true, desc:'Карго-штаны с карманами', descEn:'Cargo pants with pockets' },
  pants_sport:{ name:'Спортивные штаны', type:'clothing', slot:'legs', armor:1, warmth:8, weight:0.3, biteDefense:2, scratchDefense:8, bulletDefense:0, insulation:25, windResist:10, waterResist:0, runSpeed:1.02, meleeSpeed:1.0, repairable:true, desc:'Спортивные штаны. Лёгкие, не мешают бегу', descEn:'Sport pants. Light, no running penalty' },
  shorts:    { name:'Шорты', type:'clothing', slot:'legs', armor:0, warmth:3, weight:0.2, biteDefense:0, scratchDefense:3, bulletDefense:0, insulation:5, windResist:0, waterResist:0, runSpeed:1.03, meleeSpeed:1.0, repairable:true, desc:'Шорты. Ноги открыты', descEn:'Shorts. Legs exposed' },
  skirt:     { name:'Юбка', type:'clothing', slot:'legs', armor:0, warmth:4, weight:0.2, biteDefense:0, scratchDefense:2, bulletDefense:0, insulation:8, windResist:0, waterResist:0, runSpeed:1.01, meleeSpeed:1.0, repairable:true, desc:'Юбка', descEn:'Skirt' },
  // Спецодежда
  pants_mil: { name:'Штаны военные', type:'clothing', slot:'legs', armor:5, warmth:12, weight:0.7, pockets:3, biteDefense:15, scratchDefense:25, bulletDefense:5, insulation:40, windResist:35, waterResist:15, runSpeed:0.97, meleeSpeed:1.0, repairable:true, desc:'Военные штаны с усиленными коленями', descEn:'Military pants with reinforced knees' },
  pants_fire:{ name:'Штаны пожарного', type:'clothing', slot:'legs', armor:8, warmth:20, weight:1.2, biteDefense:20, scratchDefense:30, bulletDefense:0, insulation:65, windResist:55, waterResist:40, runSpeed:0.82, meleeSpeed:1.0, repairable:false, desc:'Огнеупорные штаны. Очень тяжёлые', descEn:'Fireproof pants. Very heavy' },
  pants_police:{ name:'Полицейские брюки', type:'clothing', slot:'legs', armor:4, warmth:10, weight:0.6, pockets:2, biteDefense:10, scratchDefense:20, bulletDefense:0, insulation:35, windResist:25, waterResist:10, runSpeed:0.97, meleeSpeed:1.0, repairable:true, desc:'Полицейские форменные брюки', descEn:'Police uniform trousers' },
  pants_medic:{ name:'Медицинские брюки', type:'clothing', slot:'legs', armor:1, warmth:6, weight:0.3, biteDefense:0, scratchDefense:5, bulletDefense:0, insulation:20, windResist:5, waterResist:0, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Медицинские брюки', descEn:'Medical pants' },

  // ── Clothing — feet ──
  sneakers:  { name:'Кроссовки', type:'clothing', slot:'feet', armor:2, warmth:5, weight:0.4, speedBonus:0.1, biteDefense:2, scratchDefense:10, bulletDefense:0, insulation:15, windResist:10, waterResist:0, runSpeed:1.05, meleeSpeed:1.0, repairable:true, desc:'Кроссовки. Бонус к скорости бега', descEn:'Sneakers. Running speed bonus' },
  shoes:     { name:'Туфли', type:'clothing', slot:'feet', armor:1, warmth:4, weight:0.3, biteDefense:2, scratchDefense:8, bulletDefense:0, insulation:12, windResist:10, waterResist:5, runSpeed:1.0, meleeSpeed:1.0, repairable:true, desc:'Обычные туфли', descEn:'Regular shoes' },
  sandals:   { name:'Сандалии', type:'clothing', slot:'feet', armor:0, warmth:1, weight:0.15, biteDefense:0, scratchDefense:2, bulletDefense:0, insulation:2, windResist:0, waterResist:0, runSpeed:1.02, meleeSpeed:1.0, repairable:false, desc:'Открытые сандалии. Почти нет защиты', descEn:'Open sandals. Almost no protection' },
  boots:     { name:'Ботинки', type:'clothing', slot:'feet', armor:5, warmth:12, weight:0.8, biteDefense:10, scratchDefense:25, bulletDefense:0, insulation:40, windResist:35, waterResist:20, runSpeed:0.98, meleeSpeed:1.0, repairable:true, desc:'Кожаные ботинки', descEn:'Leather boots' },
  boots_mil: { name:'Берцы', type:'clothing', slot:'feet', armor:8, warmth:15, weight:1.0, biteDefense:15, scratchDefense:35, bulletDefense:5, insulation:50, windResist:45, waterResist:30, runSpeed:0.97, meleeSpeed:1.0, repairable:true, desc:'Военные берцы. Надёжная обувь', descEn:'Military boots. Reliable footwear' },
  boots_fire:{ name:'Сапоги пожарного', type:'clothing', slot:'feet', armor:10, warmth:18, weight:1.3, biteDefense:20, scratchDefense:40, bulletDefense:0, insulation:60, windResist:50, waterResist:70, runSpeed:0.93, meleeSpeed:1.0, repairable:false, desc:'Огнеупорные сапоги пожарного', descEn:'Fireproof firefighter boots' },
  boots_rubber:{ name:'Резиновые сапоги', type:'clothing', slot:'feet', armor:3, warmth:8, weight:0.7, biteDefense:5, scratchDefense:15, bulletDefense:0, insulation:25, windResist:20, waterResist:100, runSpeed:0.96, meleeSpeed:1.0, repairable:false, desc:'Резиновые сапоги. Полная водозащита', descEn:'Rubber boots. Full water protection' },
  valenki:   { name:'Валенки', type:'clothing', slot:'feet', armor:2, warmth:25, weight:0.9, biteDefense:3, scratchDefense:10, bulletDefense:0, insulation:95, windResist:85, waterResist:0, runSpeed:0.94, meleeSpeed:1.0, repairable:false, desc:'Валенки. Максимальная теплоизоляция', descEn:'Valenki felt boots. Maximum insulation' },

  // ── Containers / Back ──
  backpack:  { name:'Рюкзак', type:'clothing', slot:'back', capacity:8, weight:0.5, armor:1, warmth:2, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:0, waterResist:5, runSpeed:0.95, meleeSpeed:0.97, repairable:true, desc:'Обычный рюкзак. 8 слотов', descEn:'Regular backpack. 8 slots' },
  bag:       { name:'Сумка', type:'clothing', slot:'back', capacity:4, weight:0.3, armor:0, warmth:0, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:0, waterResist:5, runSpeed:0.95, meleeSpeed:0.97, repairable:true, desc:'Лёгкая сумка. 4 слота', descEn:'Light bag. 4 slots' },
  bag_duffel:{ name:'Баул', type:'clothing', slot:'back', capacity:12, weight:0.8, armor:0, warmth:0, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:0, waterResist:5, runSpeed:0.95, meleeSpeed:0.97, repairable:true, desc:'Большой баул. 12 слотов', descEn:'Large duffel bag. 12 slots' },
  bag_mil:   { name:'Военный рюкзак', type:'clothing', slot:'back', capacity:15, weight:1.2, armor:2, warmth:3, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:0, waterResist:5, runSpeed:0.95, meleeSpeed:0.97, repairable:true, desc:'Военный рюкзак. 15 слотов', descEn:'Military backpack. 15 slots' },
  bag_medic: { name:'Медицинская сумка', type:'clothing', slot:'back', capacity:6, weight:0.4, armor:0, warmth:0, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:0, waterResist:5, runSpeed:0.95, meleeSpeed:0.97, repairable:true, desc:'Медицинская сумка. 6 слотов', descEn:'Medical bag. 6 slots' },
  bag_fire:  { name:'Рюкзак пожарного', type:'clothing', slot:'back', capacity:10, weight:0.9, armor:3, warmth:2, biteDefense:0, scratchDefense:0, bulletDefense:0, insulation:5, windResist:0, waterResist:5, runSpeed:0.95, meleeSpeed:0.97, repairable:true, desc:'Рюкзак пожарного. 10 слотов', descEn:'Firefighter backpack. 10 slots' },

  // ── Materials ──
  stick:     { name:'Палка', type:'material', weight:0.3, desc:'Деревянная палка. Материал для крафта', descEn:'Wooden stick. Crafting material' },
  tape:      { name:'Скотч', type:'material', weight:0.1, desc:'Клейкая лента. Для ремонта и крафта', descEn:'Adhesive tape. For repairs and crafting' },
  nails:     { name:'Гвозди', type:'material', weight:0.2, desc:'Гвозди. Нужны для строительства', descEn:'Nails. Needed for construction' },
  planks:    { name:'Доски', type:'material', weight:1.0, desc:'Деревянные доски. Баррикады и строительство', descEn:'Wooden planks. Barricades and construction' },
  hammer:    { name:'Молоток', type:'material', weight:0.8, desc:'Молоток. Инструмент для строительства', descEn:'Hammer. Construction tool' },
  rope:      { name:'Верёвка', type:'material', weight:0.3, desc:'Прочная верёвка. Для крафта и ловушек', descEn:'Strong rope. For crafting and traps' },
  can_empty: { name:'Пустая банка', type:'material', weight:0.1, desc:'Пустая жестяная банка', descEn:'Empty tin can' },
  bottle:    { name:'Бутылка', type:'material', weight:0.2, desc:'Стеклянная бутылка. Для коктейля Молотова', descEn:'Glass bottle. For Molotov cocktail' },
  fuel:      { name:'Бензин', type:'material', weight:0.5, desc:'Канистра бензина. Топливо и крафт', descEn:'Fuel canister. Fuel and crafting' },
  cloth:     { name:'Ткань', type:'material', weight:0.1, desc:'Кусок ткани. Для повязок и крафта', descEn:'Piece of cloth. For bandages and crafting' },
  duct_tape: { name:'Армированный скотч', type:'material', weight:0.15, desc:'Армированный скотч. Прочнее обычного', descEn:'Duct tape. Stronger than regular tape' },
  wire:      { name:'Проволока', type:'material', weight:0.15, desc:'Проволока. Для ловушек и ремонта', descEn:'Wire. For traps and repairs' },
  scrap_metal:{ name:'Металлолом', type:'material', weight:0.8, desc:'Металлолом. Материал для крафта', descEn:'Scrap metal. Crafting material' },

  // ── Special ──
  molotov:   { name:'Коктейль Молотова', type:'weapon', subtype:'thrown', dmg:50, dur:1, noise:60, weight:0.5, accuracy:20, crafted:true, desc:'Зажигательная бомба. Одноразовая', descEn:'Incendiary bomb. Single use' },
  rock:      { name:'Камень', type:'throwable', weight:0.2, noise:15, desc:'Камень. Можно бросить для отвлечения', descEn:'Rock. Can be thrown as a distraction' },

  // ── Craftable food ──
  stew:      { name:'Рагу', type:'food', hunger:-40, weight:0.4, noise:0, freshness:2, painRelief:5, crafted:true, desc:'Рагу. Очень питательное', descEn:'Stew. Very nutritious' },
  smoked_meat:{ name:'Вяленое мясо', type:'food', hunger:-20, weight:0.2, noise:0, freshness:14, crafted:true, desc:'Вяленое мясо. Долго хранится', descEn:'Smoked meat. Long shelf life' },

  // ── Tools ──
  lockpick:  { name:'Отмычка', type:'material', weight:0.05, desc:'Отмычка для замков', descEn:'Lockpick for locks' },
  torch:     { name:'Факел', type:'material', weight:0.4, desc:'Освещает путь, отпугивает зомби', descEn:'Lights the way, scares zombies' },
  _key:      { name:'Ключ', type:'material', weight:0.02, desc:'Ключ от замка', descEn:'Key for a lock' },

  // ── Containers ──
  key_holder: { name:'Ключница', type:'container', subtype:'key_holder', weight:0.2, capacity:10, desc:'Компактная ключница. Вмещает до 10 ключей', descEn:'Compact key holder. Holds up to 10 keys' },

  // ── Electronics ──
  radio:     { name:'Рация', type:'radio', weight:0.5, desc:'Портативная рация. Требует батарейки для работы', descEn:'Portable radio. Requires batteries to operate' },
  battery:   { name:'Батарейки', type:'material', weight:0.1, desc:'Батарейки для электроники', descEn:'Batteries for electronics' },

  // ── Lore ──
  note:      { name:'Записка', type:'lore', weight:0, desc:'Записка. Содержит историю выжившего', descEn:'Note. Contains a survivor story' },
};

const GRID_SIZES = {
  // All items are 1×1
};

// ── ICON SPRITE MAP ── exact pixel coords from analyzed 12×12 grid
const ICON_X = [7,92,178,264,348,434,519,605,690,776,861,945];
const ICON_Y = [8,98,178,264,349,433,519,606,689,774,859,946];
const ICON_W = [71,72,70,69,72,71,72,71,71,70,71,73];
const ICON_H = [71,64,71,68,71,73,71,68,74,74,74,72];
const ICON_MAP = {
  // Row 0 — Melee & thrown
  knife:[0,0], bat:[1,0], axe:[2,0], machete:[3,0], crowbar:[4,0], spear:[5,0], pipe:[6,0], pan:[7,0], molotov:[8,0], rock:[9,0], stick:[10,0],
  // Row 1 — Pistols, revolvers, shotguns, SMG
  pm:[0,1], glock17:[1,1], beretta:[2,1], tt:[3,1], revolver_nagant:[4,1], revolver_357:[5,1], mp133:[6,1], remington:[7,1], toz34:[8,1], pp19:[9,1],
  // Row 2 — Rifles & magazines
  sks:[0,2], ak74:[1,2], akm:[2,2], mosin:[3,2], svd:[4,2], ar15:[5,2], mag_pm:[6,2], mag_glock:[7,2], mag_beretta:[8,2], mag_tt:[9,2], mag_ak74:[10,2], mag_akm:[11,2],
  // Row 3 — Magazines & ammo
  mag_sks:[0,3], mag_svd:[1,3], mag_pp19:[2,3], mag_ar15:[3,3], ammo_9x18:[4,3], ammo_9x19:[5,3], ammo_762x25:[6,3], ammo_762x38R:[7,3], ammo_357:[8,3], ammo_12ga:[9,3], ammo_762x39:[10,3], ammo_545x39:[11,3],
  // Row 4 — Ammo & medicine
  ammo_762x54R:[0,4], ammo_556x45:[1,4], bandage:[2,4], antibiotics:[3,4], painkillers:[4,4], splint:[5,4], disinfectant:[6,4], vitamins:[7,4], antidepressants:[8,4],
  // Row 5 — Food
  canned_food:[0,5], water:[1,5], bread:[2,5], chips:[3,5], meat_raw:[4,5], soup:[5,5], energy_bar:[6,5], chocolate:[7,5], coffee:[8,5], whiskey:[9,5], soda:[10,5], stew:[11,5],
  // Row 6 — Food, comfort, books
  smoked_meat:[0,6], cigarettes:[1,6], magazine:[2,6], comics:[3,6], cards:[4,6], photo:[5,6], mp3player:[6,6], book_strength:[7,6], book_stealth:[8,6], book_scouting:[9,6], book_firstaid:[10,6], book_mechanics:[11,6],
  // Row 7 — Books, head clothing
  book_cooking:[0,7], book_firearms:[1,7], hat_cap:[2,7], hat_winter:[3,7], bandana:[4,7], hat_ushanka:[5,7], helmet:[6,7], helmet_mil:[7,7], helmet_riot:[8,7], helmet_fire:[9,7], mask_gas:[10,7], hat_medic:[11,7],
  // Row 8 — Torso clothing
  tshirt:[0,8], shirt:[1,8], hoodie:[2,8], jacket:[3,8], jacket_leather:[4,8], sweater:[5,8], coat_winter:[6,8], raincoat:[7,8], vest_hi:[8,8], vest_armor:[9,8], vest_police:[10,8], jacket_fire:[11,8],
  // Row 9 — Torso & legs
  jacket_mil:[0,9], scrubs:[1,9], overalls:[2,9], jacket_police:[3,9], pants_jeans:[4,9], pants_cargo:[5,9], pants_sport:[6,9], shorts:[7,9], skirt:[8,9], pants_mil:[9,9], pants_fire:[10,9], pants_police:[11,9],
  // Row 10 — Legs, feet, bags
  pants_medic:[0,10], sneakers:[1,10], shoes:[2,10], sandals:[3,10], boots:[4,10], boots_mil:[5,10], boots_fire:[6,10], boots_rubber:[7,10], valenki:[8,10], backpack:[9,10], bag:[10,10], bag_duffel:[11,10],
  // Row 11 — Bags & materials
  bag_mil:[0,11], bag_medic:[1,11], bag_fire:[2,11], tape:[3,11], nails:[4,11], planks:[5,11], hammer:[6,11], rope:[7,11], can_empty:[8,11], bottle:[9,11], fuel:[10,11], cloth:[11,11],
  // Row 12 — no row 12 in 12×12 grid, remap to closest
  duct_tape:[3,11], wire:[4,11], scrap_metal:[5,11], lockpick:[6,11], torch:[7,11], note:[8,11],
  // Legacy aliases
  pistol:[0,1], shotgun:[6,1], rifle:[0,2], revolver:[4,1],
  ammo_9mm:[5,3], ammo_shells:[9,3], ammo_rifle:[10,3],
  // New armor (→ vest_armor / vest_police icons)
  armor_plate:[9,8], armor_press:[10,8], armor_stab:[9,8],
  // New chest rigs (→ vest_hi icon)
  rig_basic:[8,8], rig_police:[8,8], rig_mil:[8,8], rig_hunter:[8,8], rig_heavy:[8,8],
  // New gloves (→ bandana icon as closest small clothing)
  gloves_work:[4,7], gloves_leather:[4,7], gloves_tactical:[4,7], gloves_winter:[4,7], gloves_medical:[4,7], gloves_fire:[4,7],
  // New face items (→ mask_gas / bandana / hat_medic)
  balaclava_black:[10,7], balaclava_camo:[10,7], balaclava_skull:[10,7], scarf:[4,7], mask_surgical:[11,7],
  _key:[6,11],
};
function itemIconStyle(id) {
  const pos = ICON_MAP[id];
  if (!pos) return '';
  const sz = 32;
  const [c,r] = pos;
  const x = ICON_X[c], y = ICON_Y[r];
  const w = ICON_W[c], h = ICON_H[r];
  const cx = x + w/2, cy = y + h/2;
  const scale = sz / Math.max(w, h);
  const bgW = Math.round(1024 * scale);
  const bgH = Math.round(1024 * scale);
  const bgX = Math.round(cx * scale - sz/2);
  const bgY = Math.round(cy * scale - sz/2);
  return `background-position:-${bgX}px -${bgY}px;background-size:${bgW}px ${bgH}px`;
}
function itemIconHtml(id, size) {
  const pos = ICON_MAP[id];
  if (!pos) return '';
  const sz = size || 32;
  const [c,r] = pos;
  const x = ICON_X[c], y = ICON_Y[r];
  const w = ICON_W[c], h = ICON_H[r];
  // Center the sprite cell content within the display box
  const cx = x + w/2, cy = y + h/2; // center of sprite cell in source
  const scale = sz / Math.max(w, h);
  const bgW = Math.round(1024 * scale);
  const bgH = Math.round(1024 * scale);
  const bgX = Math.round(cx * scale - sz/2);
  const bgY = Math.round(cy * scale - sz/2);
  return `<div class="item-icon" style="width:${sz}px;height:${sz}px;background-position:-${bgX}px -${bgY}px;background-size:${bgW}px ${bgH}px"></div>`;
}

// ── UI ICON SPRITE MAP ── menu.png 8×8 grid, 1024×1024
const UI_X = [10,139,267,395,523,650,779,908];
const UI_Y = [14,138,268,394,523,651,779,906];
const UI_W = [108,106,106,107,107,107,106,104];
const UI_H = [100,109,105,108,107,107,107,108];
const UI_MAP = {
  // Row 0 — Main menu
  menu_continue:[0,0], menu_new:[1,0], menu_load:[2,0], menu_settings:[3,0], menu_info:[4,0], menu_exit:[5,0],
  // Row 1 — HUD
  hud_search:[0,1], hud_rooms:[1,1], hud_travel:[2,1], hud_scout:[3,1], hud_stealth:[4,1], hud_rest:[5,1], hud_inventory:[6,1], hud_health:[7,1],
  // Row 2 — HUD + combat
  hud_craft:[0,2], hud_base:[1,2], hud_map:[2,2], hud_save:[3,2], combat_attack:[4,2], combat_switch:[5,2], combat_flee:[6,2], combat_stealth:[7,2],
  // Row 3 — Interaction
  combat_distract:[0,3], interact_take:[1,3], interact_takeall:[2,3], interact_back:[3,3], pause_resume:[4,3], pause_save:[5,3], pause_settings:[6,3], pause_quit:[7,3],
  // Row 4 — Moodles
  moodle_hunger:[0,4], moodle_thirst:[1,4], moodle_fatigue:[2,4], moodle_depression:[3,4], moodle_noise:[4,4], moodle_infection:[5,4], moodle_pain:[6,4], moodle_panic:[7,4],
  // Row 4 col missing — bleeding is 9th, but only 8 cols. Put in row 5 start? Let me check image...
  // Actually row 5 starts professions. Bleeding icon might be the person silhouette at [7,4]?
  // Looking at image: row4 = plate, droplet, ZzZ, sad face, speaker, biohazard, lightning-person, ?
  // The 8th icon in row 4 looks like panic. Bleeding not separate - we'll use moodle_pain for bleeding too or skip
  // Row 5 — Professions
  prof_unemployed:[0,5], prof_firefighter:[1,5], prof_police:[2,5], prof_engineer:[3,5], prof_nurse:[4,5], prof_chef:[5,5], prof_burglar:[6,5], prof_carpenter:[7,5],
  // Row 6 — Professions continued + misc
  prof_veteran:[0,6], prof_ranger:[1,6], prof_mechanic:[2,6], prof_homeless:[3,6], ui_death:[4,6], ui_danger:[5,6], ui_help:[6,6], ui_defense:[7,6],
  // Row 7 — Misc UI
  ui_lockpick:[0,7], ui_levelup:[1,7], ui_trait:[2,7], ui_reading:[3,7], ui_fire:[4,7], ui_cold:[5,7], ui_timer:[6,7], ui_accuracy:[7,7],
};
function uiIconHtml(id, size) {
  const pos = UI_MAP[id];
  if (!pos) return '';
  const sz = size || 20;
  const [c,r] = pos;
  const x = UI_X[c], y = UI_Y[r];
  const w = UI_W[c], h = UI_H[r];
  const scale = sz / Math.max(w, h);
  const bgW = Math.round(1024 * scale);
  const bgH = Math.round(1024 * scale);
  const bgX = Math.round(x * scale);
  const bgY = Math.round(y * scale);
  return `<div class="ui-icon" style="width:${sz}px;height:${sz}px;background-position:-${bgX}px -${bgY}px;background-size:${bgW}px ${bgH}px"></div>`;
}

// ── MAP ICON SPRITE MAP ── Map.png 6×6 grid, 2048×2048
const MAP_ICON_SIZE = 341; // ~2048/6
const MAP_ICONS = {
  // Row 0 — Controls
  zoom_in:[0,0], zoom_out:[1,0], center:[2,0], xray:[3,0], scout:[4,0], go:[5,0],
  // Row 1 — Controls + POI
  pause:[0,1], resume:[1,1], car_wreck:[2,1], bus_stop:[3,1], parking:[4,1], park:[5,1],
  // Row 2 — POI
  barricade:[0,2], barricade2:[1,2], forest_trail:[2,2], forest:[3,2], forest_clearing:[4,2], intersection:[5,2],
  // Row 3 — Markers
  player:[0,3], home_base:[1,3], danger:[2,3], warning:[3,3], unknown:[4,3], campfire:[5,3],
  // Row 4 — Status
  footprints:[0,4], trail:[1,4], eye:[2,4], compass:[3,4], clock:[4,4], empty1:[5,4],
  // Row 5 — Weather + Misc
  rain:[0,5], sun:[1,5], moon:[2,5], snow:[3,5], radio:[4,5], waypoint:[5,5],
};
const mapIconImg = new Image();
mapIconImg.src = 'Map.png';
function mapIconHtml(id, size) {
  const pos = MAP_ICONS[id];
  if (!pos) return '';
  const sz = size || 20;
  const [c,r] = pos;
  const scale = sz / MAP_ICON_SIZE;
  const bgW = Math.round(2048 * scale);
  const bgX = Math.round(c * MAP_ICON_SIZE * scale);
  const bgY = Math.round(r * MAP_ICON_SIZE * scale);
  return `<div style="display:inline-block;width:${sz}px;height:${sz}px;background:url('Map.png') -${bgX}px -${bgY}px/${bgW}px ${bgW}px;image-rendering:auto;vertical-align:middle;mix-blend-mode:screen"></div>`;
}

// ── LOOT TABLES ──
const LOOT_TABLES = {
  supermarket: { common:['canned_food','water','chips','bread','energy_bar','can_empty','bottle','soda','chocolate'], uncommon:['bandage','tape','bag','rope','cloth','magazine','cigarettes','coffee','tshirt','shorts','battery'], rare:['backpack','antibiotics','knife','whiskey','sweater','raincoat'] },
  pharmacy:    { common:['bandage','disinfectant','painkillers','vitamins'], uncommon:['antibiotics','splint','antidepressants','scrubs','hat_medic'], rare:['backpack','note','book_firstaid','bag_medic','pants_medic'] },
  house:       { common:['water','bread','canned_food','cloth','can_empty','magazine','comics','cigarettes'], uncommon:['knife','bandage','tape','chips','hoodie','pants_jeans','sneakers','hat_cap','coffee','photo','tshirt','shirt','pants_sport','bandana','battery'], rare:['bat','painkillers','backpack','note','book_cooking','whiskey','mp3player','cards','jacket_leather','jacket','coat_winter','hat_ushanka','boots','valenki','key_holder'] },
  warehouse:   { common:['planks','nails','rope','tape','can_empty','scrap_metal','wire','cloth'], uncommon:['hammer','pipe','fuel','duct_tape','vest_hi','boots','crowbar','overalls','helmet','boots_rubber'], rare:['axe','backpack','note','book_mechanics','mask_gas'] },
  garage:      { common:['pipe','nails','fuel','bottle','scrap_metal','wire'], uncommon:['hammer','tape','rope','stick','crowbar','duct_tape','overalls','boots'], rare:['axe','knife','machete','jacket_leather'] },
  office:      { common:['water','chips','energy_bar','can_empty','magazine','comics'], uncommon:['bandage','painkillers','bag','cigarettes','coffee','shirt','shoes','pants_jeans','battery'], rare:['note','backpack','book_scouting','antidepressants','jacket'] },
  military:    { common:['canned_food','water','bandage','rope','ammo_545x39','ammo_762x39','ammo_9x18','battery'], uncommon:['knife','antibiotics','splint','disinfectant','helmet_mil','pants_mil','boots_mil','vest_armor','jacket_mil','mask_gas','mag_ak74','mag_akm','mag_pm'], rare:['pm','ak74','akm','sks','svd','bag_mil','book_firearms','book_strength','mag_svd','ammo_762x54R','radio'] },
  street:      { common:['rock','stick','can_empty','bottle','cloth','cigarettes'], uncommon:['pipe','rope','sneakers','hat_cap','bandana','sandals'], rare:['knife','bag','note','crowbar','hoodie'] },
  fire_station:{ common:['canned_food','water','bandage','rope','cloth'], uncommon:['axe','helmet_fire','jacket_fire','pants_fire','boots_fire','splint','disinfectant'], rare:['bag_fire','mask_gas','book_strength','crowbar'] },
  police:      { common:['canned_food','water','bandage','ammo_9x19','ammo_9x18'], uncommon:['pm','glock17','jacket_police','pants_police','helmet_riot','vest_police','knife','splint','mag_pm','mag_glock'], rare:['mp133','remington','revolver_357','book_firearms','bag_mil','ammo_12ga','ammo_357','radio'] },
  car_glove:   { common:['cigarettes','magazine','bandana','can_empty'], uncommon:['knife','bandage','water','sunglasses'], rare:['ammo_9x19','painkillers','pm'] },
  car_trunk:   { common:['rope','tape','bottle','can_empty','cloth'], uncommon:['fuel','pipe','planks','crowbar','jacket'], rare:['axe','backpack','bag','ammo_12ga'] },
  gas_station: { common:['chips','soda','water','cigarettes','energy_bar','chocolate'], uncommon:['fuel','tape','knife','magazine','coffee','battery'], rare:['backpack','crowbar','whiskey'] },
};

// ── WORLD MAP CONFIG ──
const WORLD_CONFIG = {
  gridW: 40, gridH: 40,
  cellPx: 14, // pixels per cell on map canvas
  regions: [
    { id:'suburbs',    name:'Пригород',  gx:0,  gy:0,  w:20, h:20, scoutReq:0, riskBase:15 },
    { id:'city',       name:'Сити-центр',gx:0,  gy:20, w:20, h:20, scoutReq:2, riskBase:30 },
    { id:'industrial', name:'Промзона',  gx:20, gy:20, w:20, h:20, scoutReq:3, riskBase:40 },
    { id:'forest',     name:'Лес',       gx:20, gy:0,  w:20, h:20, scoutReq:1, riskBase:20 },
  ]
};

const NODE_TYPES = {
  road:            { name:'Дорога',           time:4,  danger:0.08, lootTable:'street',  color:'#1a3a1a', shape:'line' },
  intersection:    { name:'Перекрёсток',      time:3,  danger:0.12, lootTable:'street',  color:'#2a4a2a', shape:'circle' },
  car_wreck:       { name:'Разбитая машина',  time:5,  danger:0.10, lootTable:null,      color:'#661122', shape:'x',       lootable:true },
  parking:         { name:'Парковка',         time:3,  danger:0.06, lootTable:null,      color:'#1a2a1a', shape:'rect',    lootable:true },
  park:            { name:'Сквер',            time:5,  danger:0.05, lootTable:null,      color:'#0a2a0a', shape:'rect_lg' },
  alley:           { name:'Переулок',         time:2,  danger:0.20, lootTable:'street',  color:'#0d1a0d', shape:'line_thin' },
  barricade:       { name:'Баррикада',        time:20, danger:0.15, lootTable:null,      color:'#aa8800', shape:'block',   blocked:true, toolReq:'crowbar' },
  bus_stop:        { name:'Остановка',        time:3,  danger:0.10, lootTable:null,      color:'#1a2a3a', shape:'rect_sm', lootable:true },
  gas_station:     { name:'АЗС',             time:5,  danger:0.12, lootTable:null,      color:'#3a3a1a', shape:'rect',    lootable:true },
  building:        { name:null,               time:5,  danger:null, lootTable:null,      color:'#00a82b', shape:'rect' },
  forest_trail:    { name:'Лесная тропа',     time:8,  danger:0.10, lootTable:null,      color:'#0a1a0a', shape:'line_thin' },
  forest_clearing: { name:'Поляна',           time:4,  danger:0.06, lootTable:null,      color:'#0a2a0a', shape:'circle_lg' },
  water: { name:'Водоём', time:99, danger:0, lootTable:null, color:'#1a3366', shape:'water', blocked:true },
  npc_wall: { name:'Стена поселения', time:99, danger:0, lootTable:null, color:'#887744', shape:'wall', blocked:true },
  npc_gate: { name:'Ворота поселения', time:2, danger:0, lootTable:null, color:'#aaaa44', shape:'gate' },
  ground:   { name:'Пустырь', time:6, danger:0.03, lootTable:null, color:'#0a1a0a', shape:'ground' },
};

// ═══════════════════════════════════════════
// NPC TRADER DATA
// ═══════════════════════════════════════════
const NPC_TRADERS = [
  {
    id: 'trader_weapons', name: 'Сергей "Арсенал"', nameEn: 'Sergei "Arsenal"', type: 'weapons',
    buildingType: 'warehouse', buildingName: 'Оружейная лавка',
    pool: [
      { sell:{id:'ak74',qty:1}, price:[{id:'ammo_545x39',qty:30},{id:'bandage',qty:3}] },
      { sell:{id:'glock17',qty:1}, price:[{id:'ammo_9x19',qty:20},{id:'knife',qty:1}] },
      { sell:{id:'mp133',qty:1}, price:[{id:'ammo_12ga',qty:15},{id:'canned_food',qty:3}] },
      { sell:{id:'sks',qty:1}, price:[{id:'ammo_762x39',qty:25},{id:'scrap_metal',qty:5}] },
      { sell:{id:'pp19',qty:1}, price:[{id:'ammo_9x19',qty:40},{id:'tape',qty:3}] },
      { sell:{id:'mag_ak74',qty:1}, price:[{id:'ammo_545x39',qty:10}] },
      { sell:{id:'mag_glock',qty:1}, price:[{id:'ammo_9x19',qty:10}] },
      { sell:{id:'ammo_545x39',qty:30}, price:[{id:'scrap_metal',qty:3},{id:'fuel',qty:1}] },
      { sell:{id:'ammo_9x19',qty:30}, price:[{id:'scrap_metal',qty:2},{id:'fuel',qty:1}] },
      { sell:{id:'ammo_12ga',qty:15}, price:[{id:'scrap_metal',qty:2}] },
      { sell:{id:'knife',qty:1}, price:[{id:'scrap_metal',qty:2},{id:'tape',qty:1}] },
      { sell:{id:'crowbar',qty:1}, price:[{id:'scrap_metal',qty:3}] },
      { sell:{id:'axe',qty:1}, price:[{id:'planks',qty:2},{id:'scrap_metal',qty:2}] },
    ],
  },
  {
    id: 'trader_medic', name: 'Доктор Лена', nameEn: 'Dr. Lena', type: 'medic',
    buildingType: 'clinic', buildingName: 'Медпункт поселения',
    pool: [
      { sell:{id:'antibiotics',qty:1}, price:[{id:'canned_food',qty:3},{id:'water',qty:2}] },
      { sell:{id:'bandage',qty:5}, price:[{id:'cloth',qty:3}] },
      { sell:{id:'splint',qty:1}, price:[{id:'bandage',qty:2},{id:'tape',qty:1}] },
      { sell:{id:'painkillers',qty:3}, price:[{id:'water',qty:2},{id:'canned_food',qty:1}] },
      { sell:{id:'disinfectant',qty:1}, price:[{id:'water',qty:3}] },
      { sell:{id:'vitamins',qty:3}, price:[{id:'bread',qty:2},{id:'water',qty:1}] },
      { sell:{id:'antidepressants',qty:2}, price:[{id:'cigarettes',qty:1},{id:'water',qty:1}] },
      { sell:{id:'book_firstaid',qty:1}, price:[{id:'canned_food',qty:5}] },
      { sell:{id:'book_cooking',qty:1}, price:[{id:'canned_food',qty:4},{id:'water',qty:2}] },
      { sell:{id:'water',qty:5}, price:[{id:'bottle',qty:2}] },
      { sell:{id:'canned_food',qty:3}, price:[{id:'scrap_metal',qty:2}] },
    ],
  },
  {
    id: 'trader_gear', name: 'Макс "Барахолка"', nameEn: 'Max "Flea Market"', type: 'gear',
    buildingType: 'shop', buildingName: 'Лавка снаряжения',
    pool: [
      { sell:{id:'backpack',qty:1}, price:[{id:'cloth',qty:5},{id:'rope',qty:2}] },
      { sell:{id:'vest_armor',qty:1}, price:[{id:'scrap_metal',qty:8},{id:'nails',qty:5}] },
      { sell:{id:'rig_mil',qty:1}, price:[{id:'scrap_metal',qty:5},{id:'rope',qty:2}] },
      { sell:{id:'boots_mil',qty:1}, price:[{id:'cloth',qty:3},{id:'tape',qty:2}] },
      { sell:{id:'helmet_mil',qty:1}, price:[{id:'scrap_metal',qty:5},{id:'tape',qty:2}] },
      { sell:{id:'jacket_mil',qty:1}, price:[{id:'cloth',qty:4},{id:'tape',qty:1}] },
      { sell:{id:'pants_mil',qty:1}, price:[{id:'cloth',qty:3},{id:'tape',qty:1}] },
      { sell:{id:'gloves_tactical',qty:1}, price:[{id:'cloth',qty:2}] },
      { sell:{id:'lockpick',qty:3}, price:[{id:'wire',qty:3},{id:'scrap_metal',qty:1}] },
      { sell:{id:'torch',qty:2}, price:[{id:'fuel',qty:1},{id:'cloth',qty:1}] },
      { sell:{id:'rope',qty:3}, price:[{id:'cloth',qty:2}] },
      { sell:{id:'tape',qty:5}, price:[{id:'scrap_metal',qty:2}] },
    ],
  },
];

// NPC base boundaries in world grid (city region center)
const NPC_BASE = { gx:7, gy:27, w:6, h:6 };

function isInNPCBase(gx, gy) {
  return gx >= NPC_BASE.gx && gx < NPC_BASE.gx + NPC_BASE.w &&
         gy >= NPC_BASE.gy && gy < NPC_BASE.gy + NPC_BASE.h;
}

function generateTraderStock(trader) {
  const pool = trader.pool;
  const count = 4 + Math.floor(Math.random() * 3); // 4-6 offers
  const stock = [];
  const used = new Set();
  for (let i = 0; i < count && stock.length < pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    if (used.has(idx)) continue;
    used.add(idx);
    stock.push({ ...pool[idx] });
  }
  return stock;
}

// Ruined building restoration data
const RUIN_UPGRADES = [
  { id:'storage_1', name:'Ящик хранения (малый)', nameEn:'Storage Crate (small)', icon:'📦', slots:6, cost:{planks:3,nails:2}, desc:'6 слотов хранения' },
  { id:'storage_2', name:'Ящик хранения (средний)', nameEn:'Storage Crate (medium)', icon:'📦', slots:12, cost:{planks:5,nails:4,tape:2}, desc:'12 слотов хранения', requires:'storage_1' },
  { id:'storage_3', name:'Ящик хранения (большой)', nameEn:'Storage Crate (large)', icon:'📦', slots:24, cost:{planks:8,nails:6,scrap_metal:3}, desc:'24 слота хранения', requires:'storage_2' },
  { id:'workbench', name:'Верстак', nameEn:'Workbench', icon:'🔨', cost:{planks:5,nails:4,scrap_metal:3,hammer:1}, desc:'Крафт без ограничения "нужна база"' },
  { id:'bed', name:'Кровать', nameEn:'Bed', icon:'🛏️', cost:{planks:4,cloth:5,rope:2}, desc:'Отдых в 2 раза быстрее' },
  { id:'generator', name:'Генератор', nameEn:'Generator', icon:'⚡', cost:{scrap_metal:5,wire:3,fuel:2}, desc:'Свет ночью (+видимость)' },
  { id:'water_collector', name:'Водосборник', nameEn:'Water Collector', icon:'💧', cost:{bottle:3,rope:2,tape:2}, desc:'Бесконечная вода' },
  { id:'garden', name:'Огород', nameEn:'Garden', icon:'🌱', cost:{rope:2,planks:2,water:3}, desc:'Еда каждые 3 дня' },
];

const RUIN_RESTORE_COST = {
  floor1: { planks:10, nails:8, tape:3, scrap_metal:2 },
  floor2: { planks:15, nails:12, tape:5, scrap_metal:5, rope:3 },
};

const RUIN_BUILDINGS = [
  { id:'ruin_1', name:'Разрушенное строение #1', nameEn:'Ruined Building #1' },
  { id:'ruin_2', name:'Разрушенное строение #2', nameEn:'Ruined Building #2' },
  { id:'ruin_3', name:'Разрушенное строение #3', nameEn:'Ruined Building #3' },
];

// Building sizes (cells on map) and map colors per type
const BUILDING_META = {
  // Large buildings (2x2)
  supermarket:   { w:2, h:2, color:'#2266aa', icon:'S', category:'commercial' },
  warehouse:     { w:2, h:2, color:'#665533', icon:'W', category:'industrial' },
  military:      { w:2, h:2, color:'#556633', icon:'M', category:'government' },
  factory:       { w:2, h:2, color:'#887733', icon:'F', category:'industrial' },
  school:        { w:2, h:2, color:'#5577aa', icon:'Ш', category:'civic' },
  hotel:         { w:2, h:2, color:'#886644', icon:'H', category:'commercial' },
  // Medium buildings (2x1)
  office:        { w:2, h:1, color:'#4477aa', icon:'O', category:'commercial' },
  fire_station:  { w:2, h:1, color:'#aa3322', icon:'П', category:'government' },
  police:        { w:2, h:1, color:'#3355aa', icon:'П', category:'government' },
  bank:          { w:2, h:1, color:'#998844', icon:'Б', category:'commercial' },
  church:        { w:1, h:2, color:'#8866aa', icon:'Ц', category:'civic' },
  clinic:        { w:2, h:1, color:'#449966', icon:'+', category:'civic' },
  // Small buildings (1x1)
  house:         { w:1, h:1, color:'#337744', icon:null, category:'residential' },
  pharmacy:      { w:1, h:1, color:'#339966', icon:'+', category:'commercial' },
  garage:        { w:1, h:1, color:'#555544', icon:null, category:'residential' },
  cafe:          { w:1, h:1, color:'#aa7733', icon:null, category:'commercial' },
  laundromat:    { w:1, h:1, color:'#446688', icon:null, category:'commercial' },
  bar:           { w:1, h:1, color:'#885533', icon:null, category:'commercial' },
  shop:          { w:1, h:1, color:'#338855', icon:null, category:'commercial' },
  cabin:         { w:1, h:1, color:'#554422', icon:null, category:'residential' },
  ranger_station:{ w:1, h:1, color:'#446633', icon:'R', category:'government' },
  gas_station:   { w:1, h:1, color:'#aaaa33', icon:'G', category:'commercial' },
};

// Darken a hex color by factor — global for map renderer + editor
function scaleColor(hex, f) {
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex;
  const r = Math.min(255, Math.round(parseInt(hex.slice(1,3),16) * f));
  const g = Math.min(255, Math.round(parseInt(hex.slice(3,5),16) * f));
  const b = Math.min(255, Math.round(parseInt(hex.slice(5,7),16) * f));
  return `rgb(${r},${g},${b})`;
}

// Building height multipliers (in halfTH units) — used by map renderer and editor
const BLD_H = {
  house:3, cabin:2, pharmacy:2.2, garage:1.8, cafe:2, bar:2.2, shop:2,
  laundromat:1.6, ranger_station:2.5, gas_station:1.4,
  office:4, police:3.5, fire_station:3, bank:3.8, clinic:2.8, church:6,
  supermarket:2.2, warehouse:3, military:3.5, factory:4.5, school:4.2, hotel:7,
};

// Building distribution per region type
const REGION_BUILDINGS = {
  suburbs:    { house:10, supermarket:2, pharmacy:2, garage:3, office:2, gas_station:2, cafe:3, school:1, clinic:1, church:1, laundromat:1 },
  city:       { house:5, supermarket:3, pharmacy:3, office:5, warehouse:2, police:1, gas_station:2, fire_station:1, cafe:4, hotel:2, bank:1, clinic:2, bar:2, shop:3 },
  industrial: { warehouse:6, garage:4, military:1, fire_station:1, office:2, house:2, gas_station:2, factory:3 },
  forest:     { house:5, garage:3, warehouse:1, cabin:3, ranger_station:1 },
};

// ── RECIPES ──
const RECIPES = [
  { id:'spear', name:'Копьё', components:{stick:1,tape:1,knife:1}, skill:'mechanics', skillReq:1, result:'spear', returnKnife:true },
  { id:'molotov', name:'Коктейль Молотова', components:{bottle:1,fuel:1,cloth:1}, skill:null, skillReq:0, result:'molotov' },
  { id:'barricade', name:'Баррикада', components:{planks:3,nails:1,hammer:1}, skill:'mechanics', skillReq:2, result:'_barricade', keepHammer:true },
  { id:'trap', name:'Растяжка-ловушка', components:{rope:1,can_empty:1}, skill:'mechanics', skillReq:1, result:'_trap' },
  { id:'soup', name:'Бульон', components:{canned_food:1,water:1}, skill:'cooking', skillReq:1, result:'soup', needsBase:true },
  { id:'bandage_craft', name:'Самодельный бинт', components:{cloth:2}, skill:'firstAid', skillReq:1, result:'bandage' },
  { id:'splint_craft', name:'Самодельная шина', components:{stick:2,cloth:1,tape:1}, skill:'firstAid', skillReq:2, result:'splint' },
  { id:'repair_melee', name:'Починка оружия', components:{scrap_metal:1,tape:1}, skill:'mechanics', skillReq:2, result:'_repair_melee', keepAll:true, desc:'Восстановить прочность оружия ближнего боя' },
  { id:'repair_firearm', name:'Починка огнестрельного', components:{scrap_metal:1,duct_tape:1}, skill:'mechanics', skillReq:3, result:'_repair_firearm', keepAll:true, desc:'Восстановить прочность огнестрельного оружия' },
  { id:'alarm_trap', name:'Сигнализация', components:{wire:1,can_empty:2}, skill:'mechanics', skillReq:1, result:'_alarm', needsBase:true, desc:'+2 к безопасности убежища' },
  { id:'stew', name:'Рагу', components:{canned_food:1,water:1,meat_raw:1}, skill:'cooking', skillReq:2, result:'_stew', needsBase:true },
  { id:'smoked_meat', name:'Вяленое мясо', components:{meat_raw:2,rope:1}, skill:'cooking', skillReq:3, result:'_smoked_meat' },
  { id:'lockpick', name:'Отмычка', components:{wire:2,scrap_metal:1}, skill:'mechanics', skillReq:2, result:'_lockpick' },
  { id:'torch', name:'Факел', components:{stick:1,cloth:1,fuel:1}, skill:null, skillReq:0, result:'_torch' },
];

// ── ZOMBIE TYPES ──
const ZOMBIE_TYPES = {
  shambler:  { name:'Шаркун', hp:35, dmg:8, speed:1, bonus:0, fleeChance:0, deathNoise:5, xp:10,
    loot:{ pool:['cloth','bandage','cigarettes','can_empty','bottle','rock'], chance:40, count:[0,1] } },
  runner:    { name:'Бегун', hp:30, dmg:12, speed:3, bonus:10, fleeChance:-30, deathNoise:8, xp:20,
    loot:{ pool:['sneakers','hat_cap','knife','bandana','energy_bar','bandage'], chance:50, count:[0,2] } },
  fat:       { name:'Толстяк', hp:110, dmg:15, speed:0, bonus:5, fleeChance:10, deathNoise:25, xp:30,
    loot:{ pool:['canned_food','chips','soda','bottle','cloth','jacket'], chance:60, count:[1,3] } },
  soldier:   { name:'Зомби-солдат', hp:60, dmg:18, speed:1, bonus:15, armor:0.5, fleeChance:-10, deathNoise:10, xp:35,
    loot:{ pool:['ammo_9x18','ammo_12ga','bandage','disinfectant','knife','vest_armor','helmet','pistol'], chance:70, count:[1,2] } },
};

// ── FURNITURE DEFINITIONS PER ROOM TYPE ──
const ROOM_FURNITURE = {
  'Прихожая':    [{name:'Вешалка',icon:'▐',shape:'line'},{name:'Обувница',icon:'▬',shape:'box'},{name:'Тумба',icon:'□',shape:'box'}],
  'Гостиная':    [{name:'Диван',icon:'▬',shape:'wide'},{name:'Шкаф',icon:'▊',shape:'tall'},{name:'Тумба TV',icon:'□',shape:'box'},{name:'Полка',icon:'▬',shape:'line'},{name:'Журн. столик',icon:'○',shape:'box'}],
  'Кухня':       [{name:'Холодильник',icon:'▊',shape:'tall'},{name:'Шкаф кухонный',icon:'▬',shape:'wide'},{name:'Плита',icon:'□',shape:'box'},{name:'Ящик с приборами',icon:'□',shape:'box'},{name:'Стол',icon:'○',shape:'wide'}],
  'Ванная':      [{name:'Аптечка',icon:'□',shape:'box'},{name:'Шкафчик',icon:'□',shape:'box'},{name:'Стир. машина',icon:'□',shape:'box'}],
  'Кладовка':    [{name:'Полка',icon:'▬',shape:'line'},{name:'Ящик',icon:'□',shape:'box'}],
  'Спальня':     [{name:'Кровать',icon:'▬',shape:'wide'},{name:'Шкаф',icon:'▊',shape:'tall'},{name:'Тумбочка',icon:'□',shape:'box'},{name:'Комод',icon:'▬',shape:'box'}],
  'Детская':     [{name:'Кровать детская',icon:'▬',shape:'wide'},{name:'Шкаф',icon:'▊',shape:'tall'},{name:'Ящик с игрушками',icon:'□',shape:'box'}],
  'Балкон':      [{name:'Ящик',icon:'□',shape:'box'}],
  'Торговый зал':[{name:'Стеллаж 1',icon:'▬',shape:'line'},{name:'Стеллаж 2',icon:'▬',shape:'line'},{name:'Стеллаж 3',icon:'▬',shape:'line'},{name:'Витрина',icon:'□',shape:'wide'},{name:'Корзина',icon:'○',shape:'box'}],
  'Касса':       [{name:'Касс. аппарат',icon:'□',shape:'box'},{name:'Полка за кассой',icon:'▬',shape:'line'}],
  'Склад':       [{name:'Стеллаж',icon:'▬',shape:'line'},{name:'Ящик',icon:'□',shape:'box'},{name:'Ящик инструм.',icon:'□',shape:'box'},{name:'Паллет',icon:'▬',shape:'wide'}],
  'Подсобка':    [{name:'Полка',icon:'▬',shape:'line'},{name:'Ящик',icon:'□',shape:'box'}],
  'Витрина':     [{name:'Витрина 1',icon:'□',shape:'wide'},{name:'Витрина 2',icon:'□',shape:'wide'},{name:'Полка',icon:'▬',shape:'line'}],
  'Кабинет':     [{name:'Стол',icon:'▬',shape:'wide'},{name:'Шкаф',icon:'▊',shape:'tall'},{name:'Тумба',icon:'□',shape:'box'}],
  'Ангар':       [{name:'Контейнер 1',icon:'▊',shape:'tall'},{name:'Контейнер 2',icon:'▊',shape:'tall'},{name:'Стеллаж',icon:'▬',shape:'line'},{name:'Ящик',icon:'□',shape:'box'}],
  'Загрузочная': [{name:'Паллет',icon:'▬',shape:'wide'},{name:'Ящик',icon:'□',shape:'box'}],
  'Мастерская':  [{name:'Верстак',icon:'▬',shape:'wide'},{name:'Стеллаж',icon:'▬',shape:'line'},{name:'Ящик инструм.',icon:'□',shape:'box'},{name:'Бочка',icon:'○',shape:'box'}],
  'Хранилище':   [{name:'Полка',icon:'▬',shape:'line'},{name:'Ящик',icon:'□',shape:'box'},{name:'Канистра',icon:'○',shape:'box'}],
  'Холл':        [{name:'Стойка ресепшн',icon:'▬',shape:'wide'},{name:'Тумба',icon:'□',shape:'box'}],
  'Приёмная':    [{name:'Стол',icon:'▬',shape:'wide'},{name:'Шкаф',icon:'▊',shape:'tall'},{name:'Полка',icon:'▬',shape:'line'}],
  'Серверная':   [{name:'Стойка серверов',icon:'▊',shape:'tall'},{name:'Шкаф',icon:'▊',shape:'tall'}],
  'Переговорная':[{name:'Стол',icon:'▬',shape:'wide'},{name:'Шкаф',icon:'▊',shape:'tall'}],
  'КПП':         [{name:'Стойка',icon:'□',shape:'box'}],
  'Пост охраны': [{name:'Стол',icon:'▬',shape:'wide'},{name:'Шкаф оружейный',icon:'▊',shape:'tall'},{name:'Ящик',icon:'□',shape:'box'}],
  'Арсенал':     [{name:'Оруж. шкаф 1',icon:'▊',shape:'tall'},{name:'Оруж. шкаф 2',icon:'▊',shape:'tall'},{name:'Ящик боеприпасов',icon:'□',shape:'box'}],
  'Казарма':     [{name:'Шкафчик',icon:'□',shape:'box'},{name:'Шкаф',icon:'▊',shape:'tall'},{name:'Тумбочка',icon:'□',shape:'box'},{name:'Кровать',icon:'▬',shape:'wide'}],
  // Пожарная станция
  'Гараж депо':  [{name:'Стойка снаряжения',icon:'▬',shape:'wide'},{name:'Ящик инструм.',icon:'□',shape:'box'},{name:'Стеллаж',icon:'▬',shape:'line'},{name:'Бочка',icon:'○',shape:'box'}],
  'Раздевалка':  [{name:'Шкафчик пожарного',icon:'▊',shape:'tall'},{name:'Шкафчик пожарного',icon:'▊',shape:'tall'},{name:'Полка',icon:'▬',shape:'line'}],
  'Комната отдыха':[{name:'Диван',icon:'▬',shape:'wide'},{name:'Стол',icon:'○',shape:'wide'},{name:'Холодильник',icon:'▊',shape:'tall'},{name:'Тумбочка',icon:'□',shape:'box'}],
  'Диспетчерская':[{name:'Стол',icon:'▬',shape:'wide'},{name:'Полка',icon:'▬',shape:'line'},{name:'Аварийный шкаф',icon:'▊',shape:'tall'}],
  // Полицейский участок
  'Дежурная часть':[{name:'Стол дежурного',icon:'▬',shape:'wide'},{name:'Шкаф',icon:'▊',shape:'tall'},{name:'Полка',icon:'▬',shape:'line'}],
  'Оружейная':   [{name:'Оруж. комната',icon:'▊',shape:'tall'},{name:'Оруж. шкаф 1',icon:'▊',shape:'tall'},{name:'Ящик боеприпасов',icon:'□',shape:'box'}],
  'Камеры':      [{name:'Кровать',icon:'▬',shape:'wide'}],
  'Раздевалка полиции':[{name:'Шкафчик полицейского',icon:'▊',shape:'tall'},{name:'Шкафчик полицейского',icon:'▊',shape:'tall'},{name:'Полка',icon:'▬',shape:'line'}],
  // Медицинские учреждения
  'Регистратура':   [{name:'Стойка ресепшн',icon:'▬',shape:'wide'},{name:'Шкаф картотеки',icon:'▊',shape:'tall'}],
  'Процедурная':    [{name:'Мед. шкаф',icon:'▊',shape:'tall'},{name:'Мед. столик',icon:'□',shape:'box'},{name:'Тумба с препаратами',icon:'□',shape:'box'}],
  'Кабинет врача':  [{name:'Стол врача',icon:'▬',shape:'wide'},{name:'Мед. шкаф',icon:'▊',shape:'tall'},{name:'Аптечка',icon:'□',shape:'box'}],
  'Аптечный склад': [{name:'Стеллаж медикаментов',icon:'▬',shape:'line'},{name:'Стеллаж медикаментов',icon:'▬',shape:'line'},{name:'Ящик перевязочных',icon:'□',shape:'box'}],
};

// Loot pools per furniture name (logical loot)
const FURNITURE_LOOT = {
  'Холодильник':  { pool:['canned_food','water','bread','soda','chocolate','chips'], count:[1,3] },
  'Шкаф кухонный':{ pool:['canned_food','bread','coffee','chips','bottle','can_empty'], count:[1,2] },
  'Плита':        { pool:['can_empty'], count:[0,1] },
  'Ящик с приборами':{ pool:['knife','can_empty'], count:[0,1] },
  'Стол':         { pool:['water','magazine','cigarettes','coffee','comics'], count:[0,2] },
  'Аптечка':      { pool:['bandage','disinfectant','painkillers','vitamins','antibiotics'], count:[1,3] },
  'Шкафчик':      { pool:['bandage','cloth','magazine','cigarettes','water'], count:[0,2] },
  'Стир. машина': { pool:['cloth'], count:[0,1] },
  'Шкаф':         { pool:['cloth','hoodie','pants_jeans','bag','magazine','book_cooking','book_scouting','jacket','sweater','coat_winter','shirt','jacket_leather','raincoat','pants_cargo','pants_sport'], count:[1,3] },
  'Тумбочка':     { pool:['painkillers','magazine','comics','cigarettes','mp3player','photo','cards'], count:[0,2] },
  'Кровать':      { pool:['cloth','magazine','comics'], count:[0,1] },
  'Кровать детская':{ pool:['comics','cloth'], count:[0,1] },
  'Комод':        { pool:['cloth','hoodie','pants_jeans','hat_cap','tshirt','shirt','bandana','shorts','pants_sport','sweater','hat_ushanka'], count:[1,2] },
  'Вешалка':      { pool:['hoodie','hat_cap','bag','jacket','coat_winter','raincoat','jacket_leather','hat_ushanka'], count:[0,2] },
  'Обувница':     { pool:['sneakers','boots','shoes','sandals','boots_rubber','valenki'], count:[0,1] },
  'Тумба':        { pool:['magazine','cigarettes','tape'], count:[0,1] },
  'Тумба TV':     { pool:['magazine','comics','mp3player'], count:[0,1] },
  'Диван':        { pool:['magazine','comics','cigarettes','cloth'], count:[0,1] },
  'Полка':        { pool:['magazine','book_cooking','book_scouting','can_empty','tape'], count:[0,2] },
  'Полка за кассой':{ pool:['cigarettes','chocolate','energy_bar','magazine'], count:[1,2] },
  'Журн. столик': { pool:['magazine','comics'], count:[0,1] },
  'Ящик':         { pool:['nails','tape','rope','cloth','can_empty','scrap_metal'], count:[0,2] },
  'Ящик с игрушками':{ pool:['comics'], count:[0,1] },
  'Стеллаж':      { pool:['canned_food','water','chips','bread','can_empty','bottle','rope','nails'], count:[1,3] },
  'Стеллаж 1':    { pool:['canned_food','water','chips','bread','soda','energy_bar'], count:[1,3] },
  'Стеллаж 2':    { pool:['chocolate','coffee','bottle','can_empty','soda'], count:[1,3] },
  'Стеллаж 3':    { pool:['bandage','vitamins','cloth','rope','tape'], count:[0,2] },
  'Витрина':      { pool:['bandage','disinfectant','painkillers','vitamins','antidepressants'], count:[1,2] },
  'Витрина 1':    { pool:['bandage','disinfectant','painkillers','vitamins'], count:[1,3] },
  'Витрина 2':    { pool:['antibiotics','splint','antidepressants'], count:[0,2] },
  'Корзина':      { pool:['chips','bread','soda','chocolate'], count:[0,2] },
  'Касс. аппарат':{ pool:[], count:[0,0] },
  'Паллет':       { pool:['planks','nails','scrap_metal','can_empty'], count:[1,2] },
  'Контейнер 1':  { pool:['planks','nails','rope','scrap_metal','wire'], count:[1,3] },
  'Контейнер 2':  { pool:['pipe','hammer','tape','duct_tape','cloth'], count:[1,2] },
  'Верстак':      { pool:['hammer','nails','tape','pipe','scrap_metal','wire','crowbar'], count:[1,3] },
  'Ящик инструм.':{ pool:['hammer','nails','tape','duct_tape','knife'], count:[1,2] },
  'Бочка':        { pool:['fuel','bottle'], count:[0,1] },
  'Канистра':     { pool:['fuel'], count:[0,1] },
  'Стойка ресепшн':{ pool:['magazine','water','cigarettes'], count:[0,1] },
  'Стойка серверов':{ pool:['wire','scrap_metal'], count:[0,1] },
  'Стойка':       { pool:['magazine','water'], count:[0,1] },
  'Оруж. шкаф 1': { pool:['pm','glock17','tt','revolver_nagant','ammo_9x18','ammo_9x19','ammo_762x25','mag_pm','mag_glock','mag_tt'], count:[1,3] },
  'Оруж. шкаф 2': { pool:['sks','akm','mosin','mp133','ammo_762x39','ammo_762x54R','ammo_12ga','mag_sks','mag_akm'], count:[1,3] },
  'Ящик боеприпасов':{ pool:['ammo_9x18','ammo_9x19','ammo_12ga','ammo_762x39','ammo_545x39','ammo_762x54R','ammo_556x45','ammo_762x25'], count:[2,5] },
  'Шкаф оружейный':{ pool:['knife','pm','tt','ammo_9x18','ammo_762x25','mag_pm','bandage'], count:[1,2] },
  // Пожарная станция
  'Стойка снаряжения':{ pool:['helmet_fire','jacket_fire','pants_fire','boots_fire','mask_gas','axe'], count:[1,3] },
  'Аварийный шкаф':{ pool:['bandage','splint','disinfectant','rope','cloth'], count:[1,2] },
  'Шкафчик пожарного':{ pool:['jacket_fire','pants_fire','boots_fire','bag_fire'], count:[0,2] },
  // Полицейский участок
  'Оруж. комната': { pool:['pm','glock17','beretta','mp133','remington','ammo_9x18','ammo_9x19','ammo_12ga','mag_pm','mag_glock','mag_beretta','vest_police'], count:[1,3] },
  'Шкафчик полицейского':{ pool:['jacket_police','pants_police','helmet_riot','vest_police','bandage'], count:[1,2] },
  'Сейф':          { pool:['pm','glock17','revolver_357','ammo_9x19','ammo_357','mag_glock'], count:[1,2] },
  'Стол дежурного':{ pool:['magazine','water','cigarettes','bandage','ammo_9x19'], count:[0,2] },
  // Медицинские
  'Мед. шкаф':     { pool:['bandage','antibiotics','disinfectant','painkillers','splint','vitamins','antidepressants'], count:[2,4] },
  'Мед. столик':   { pool:['bandage','disinfectant','splint','painkillers'], count:[1,3] },
  'Тумба с препаратами':{ pool:['antibiotics','painkillers','antidepressants','vitamins','disinfectant'], count:[1,3] },
  'Шкаф картотеки':{ pool:['magazine','book_firstaid'], count:[0,1] },
  'Стол врача':    { pool:['bandage','painkillers','disinfectant','antibiotics'], count:[1,2] },
  'Стеллаж медикаментов':{ pool:['bandage','antibiotics','disinfectant','painkillers','splint','vitamins','scrubs','hat_medic','bag_medic'], count:[2,5] },
  'Ящик перевязочных':{ pool:['bandage','bandage','splint','cloth','disinfectant'], count:[2,4] },
};

// ── LOCATION TEMPLATES ──
const LOCATION_TEMPLATES = {
  // ── ЖИЛЫЕ ──
  house: {
    name:'Жилой дом', lootType:'house', baseInfest:[1,3],
    floors: {
      0: [ // Типичная квартира: прихожая→гостиная(большая), кухня(средняя), ванная+кладовка(крошечные)
        { name:'Прихожая', type:'corridor', weight:2 },
        { name:'Гостиная', type:'room', weight:8 },
        { name:'Кухня', type:'room', weight:4 },
        { name:'Лестница (1й)', type:'stairs', weight:1 },
        { name:'Ванная', type:'closet', weight:1 },
        { name:'Кладовка', type:'closet', weight:1 },
      ],
      1: [ // 2й этаж: спальня(большая), детская(средняя), балкон(узкий)
        { name:'Лестница (2й)', type:'stairs', weight:1 },
        { name:'Спальня', type:'room', weight:6 },
        { name:'Детская', type:'room', weight:4 },
        { name:'Балкон', type:'closet', weight:1 },
      ],
    },
    hasSecondFloor: true, buildingRelW:.75, buildingRelH:.6,
  },
  cabin: {
    name:'Хижина', lootType:'house', baseInfest:[1,2],
    floors: { 0: [
      { name:'Комната', type:'room', weight:6 },
      { name:'Кладовка', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.45, buildingRelH:.4,
  },
  // ── ТОРГОВЛЯ ──
  supermarket: {
    name:'Супермаркет', lootType:'supermarket', baseInfest:[2,4],
    floors: { 0: [ // Торговый зал = 70%, остальное мелочь
      { name:'Вход', type:'corridor', weight:2 },
      { name:'Торговый зал', type:'room', weight:12 },
      { name:'Касса', type:'closet', weight:1 },
      { name:'Склад', type:'room', weight:3 },
      { name:'Подсобка', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.8, buildingRelH:.6,
  },
  pharmacy: {
    name:'Аптека', lootType:'pharmacy', baseInfest:[1,3],
    floors: { 0: [ // Витрина большая, кабинет и склад поменьше
      { name:'Тамбур', type:'corridor', weight:1 },
      { name:'Витрина', type:'room', weight:6 },
      { name:'Склад', type:'room', weight:2 },
      { name:'Кабинет', type:'room', weight:2 },
    ]},
    hasSecondFloor: false, buildingRelW:.6, buildingRelH:.5,
  },
  shop: {
    name:'Магазин', lootType:'supermarket', baseInfest:[1,2],
    floors: { 0: [
      { name:'Торговый зал', type:'room', weight:6 },
      { name:'Подсобка', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.5, buildingRelH:.45,
  },
  // ── ПРОМЫШЛЕННЫЕ ──
  warehouse: {
    name:'Склад', lootType:'warehouse', baseInfest:[2,4],
    floors: { 0: [ // Ангар = основная площадь
      { name:'Ворота', type:'corridor', weight:1 },
      { name:'Ангар', type:'room', weight:10 },
      { name:'Подсобка', type:'closet', weight:1 },
      { name:'Загрузочная', type:'room', weight:3 },
    ]},
    hasSecondFloor: false, buildingRelW:.8, buildingRelH:.6,
  },
  garage: {
    name:'Гараж', lootType:'garage', baseInfest:[1,2],
    floors: { 0: [
      { name:'Вход', type:'corridor', weight:1 },
      { name:'Мастерская', type:'room', weight:8 },
      { name:'Хранилище', type:'room', weight:3 },
    ]},
    hasSecondFloor: false, buildingRelW:.55, buildingRelH:.5,
  },
  factory: {
    name:'Завод', lootType:'warehouse', baseInfest:[3,5],
    floors: { 0: [
      { name:'Проходная', type:'corridor', weight:1 },
      { name:'Цех', type:'room', weight:10 },
      { name:'Склад', type:'room', weight:4 },
      { name:'Подсобка', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.85, buildingRelH:.6,
  },
  // ── ОФИСНЫЕ / ГОСУДАРСТВЕННЫЕ ──
  office: {
    name:'Офисное здание', lootType:'office', baseInfest:[1,3],
    floors: {
      0: [
        { name:'Холл', type:'corridor', weight:3 },
        { name:'Приёмная', type:'room', weight:5 },
        { name:'Кухня', type:'room', weight:2 },
        { name:'Лестница (1й)', type:'stairs', weight:1 },
      ],
      1: [
        { name:'Лестница (2й)', type:'stairs', weight:1 },
        { name:'Кабинет', type:'room', weight:5 },
        { name:'Серверная', type:'closet', weight:1 },
        { name:'Переговорная', type:'room', weight:3 },
      ],
    },
    hasSecondFloor: true, buildingRelW:.65, buildingRelH:.55,
  },
  bank: {
    name:'Банк', lootType:'office', baseInfest:[2,4],
    floors: { 0: [
      { name:'Операционный зал', type:'corridor', weight:6 },
      { name:'Кабинет', type:'room', weight:3 },
      { name:'Хранилище', type:'room', weight:3 },
      { name:'Серверная', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.65, buildingRelH:.5,
  },
  // ── СИЛОВЫЕ СТРУКТУРЫ ──
  military: {
    name:'Военный пост', lootType:'military', baseInfest:[3,5],
    floors: { 0: [
      { name:'КПП', type:'corridor', weight:1 },
      { name:'Казарма', type:'room', weight:6 },
      { name:'Арсенал', type:'room', weight:3 },
      { name:'Пост охраны', type:'room', weight:2 },
    ]},
    hasSecondFloor: false, buildingRelW:.7, buildingRelH:.55,
  },
  police: {
    name:'Полицейский участок', lootType:'police', baseInfest:[2,5],
    floors: { 0: [
      { name:'Дежурная часть', type:'corridor', weight:3 },
      { name:'Оружейная', type:'room', weight:3 },
      { name:'Камеры', type:'room', weight:3 },
      { name:'Раздевалка полиции', type:'room', weight:2 },
    ]},
    hasSecondFloor: false, buildingRelW:.7, buildingRelH:.55,
  },
  fire_station: {
    name:'Пожарная станция', lootType:'fire_station', baseInfest:[2,4],
    floors: {
      0: [ // Гараж = огромный, остальное маленькое
        { name:'Гараж депо', type:'room', weight:10 },
        { name:'Раздевалка', type:'room', weight:2 },
        { name:'Диспетчерская', type:'room', weight:2 },
        { name:'Лестница (1й)', type:'stairs', weight:1 },
      ],
      1: [
        { name:'Лестница (2й)', type:'stairs', weight:1 },
        { name:'Комната отдыха', type:'room', weight:5 },
        { name:'Кухня', type:'room', weight:3 },
        { name:'Ванная', type:'closet', weight:1 },
      ],
    },
    hasSecondFloor: true, buildingRelW:.75, buildingRelH:.6,
  },
  // ── ОБЩЕСТВЕННЫЕ ──
  cafe: {
    name:'Кафе', lootType:'house', baseInfest:[1,3],
    floors: { 0: [ // Зал = основное помещение
      { name:'Вход', type:'corridor', weight:1 },
      { name:'Зал', type:'room', weight:7 },
      { name:'Кухня', type:'room', weight:3 },
      { name:'Подсобка', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.6, buildingRelH:.5,
  },
  bar: {
    name:'Бар', lootType:'house', baseInfest:[1,3],
    floors: { 0: [
      { name:'Зал', type:'room', weight:7 },
      { name:'Барная стойка', type:'room', weight:2 },
      { name:'Подсобка', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.55, buildingRelH:.45,
  },
  school: {
    name:'Школа', lootType:'office', baseInfest:[2,4],
    floors: {
      0: [ // Фойе узкое, классы большие
        { name:'Фойе', type:'corridor', weight:3 },
        { name:'Класс', type:'room', weight:5 },
        { name:'Столовая', type:'room', weight:4 },
        { name:'Медпункт', type:'closet', weight:1 },
        { name:'Лестница (1й)', type:'stairs', weight:1 },
      ],
      1: [
        { name:'Лестница (2й)', type:'stairs', weight:1 },
        { name:'Класс', type:'room', weight:5 },
        { name:'Учительская', type:'room', weight:3 },
        { name:'Библиотека', type:'room', weight:4 },
      ],
    },
    hasSecondFloor: true, buildingRelW:.75, buildingRelH:.6,
  },
  clinic: {
    name:'Клиника', lootType:'pharmacy', baseInfest:[2,4],
    floors: { 0: [ // Процедурная большая, аптечный склад маленький
      { name:'Регистратура', type:'corridor', weight:2 },
      { name:'Процедурная', type:'room', weight:5 },
      { name:'Кабинет врача', type:'room', weight:3 },
      { name:'Аптечный склад', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.65, buildingRelH:.5,
  },
  church: {
    name:'Церковь', lootType:'house', baseInfest:[1,2],
    floors: { 0: [ // Неф = почти всё здание
      { name:'Притвор', type:'corridor', weight:1 },
      { name:'Неф', type:'room', weight:10 },
      { name:'Ризница', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.6, buildingRelH:.65,
  },
  laundromat: {
    name:'Прачечная', lootType:'house', baseInfest:[1,2],
    floors: { 0: [
      { name:'Зал', type:'room', weight:6 },
      { name:'Подсобка', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.5, buildingRelH:.4,
  },
  hotel: {
    name:'Гостиница', lootType:'house', baseInfest:[2,4],
    floors: {
      0: [ // Лобби большое, номер средний
        { name:'Лобби', type:'corridor', weight:4 },
        { name:'Ресепшн', type:'room', weight:2 },
        { name:'Номер', type:'room', weight:4 },
        { name:'Кухня', type:'room', weight:2 },
        { name:'Лестница (1й)', type:'stairs', weight:1 },
      ],
      1: [
        { name:'Лестница (2й)', type:'stairs', weight:1 },
        { name:'Номер', type:'room', weight:4 },
        { name:'Номер', type:'room', weight:4 },
        { name:'Ванная', type:'closet', weight:1 },
      ],
    },
    hasSecondFloor: true, buildingRelW:.7, buildingRelH:.6,
  },
  ranger_station: {
    name:'Станция лесника', lootType:'garage', baseInfest:[1,3],
    floors: { 0: [
      { name:'Приёмная', type:'corridor', weight:1 },
      { name:'Кабинет', type:'room', weight:3 },
      { name:'Оружейная', type:'room', weight:3 },
      { name:'Склад', type:'closet', weight:1 },
    ]},
    hasSecondFloor: false, buildingRelW:.6, buildingRelH:.5,
  },
};

// ── REGIONS ──
const REGION_TEMPLATES = [
  { id:'suburbs', name:'Пригород', scoutReq:0, locations:['house','house','house','garage','supermarket'], riskBase:15 },
  { id:'city', name:'Сити-центр', scoutReq:2, locations:['office','supermarket','pharmacy','house','warehouse','police'], riskBase:30 },
  { id:'industrial', name:'Промзона', scoutReq:3, locations:['warehouse','warehouse','garage','military','fire_station'], riskBase:40 },
  { id:'forest', name:'Лес', scoutReq:1, locations:['house','garage'], riskBase:20 },
];

// ── OCCUPATIONS (PZ-inspired) ──
const SKILL_NAMES = { strength:'Сила', stealth:'Скрытность', scouting:'Разведка', firstAid:'Первая помощь', mechanics:'Механика', cooking:'Кулинария', lockpicking:'Взлом', firearms:'Огнестрел' };

const OCCUPATIONS = [
  { id:'unemployed', name:'Безработный', desc:'Никаких бонусов, но и без ограничений. +2 свободных очка.', cost:0,
    skills:{}, items:['water'], bonusPoints:2 },
  { id:'firefighter', name:'Пожарный', desc:'Отличная физическая форма и базовые навыки оказания помощи.', cost:0,
    skills:{strength:2, firstAid:1}, items:['axe','bandage','water','canned_food'], bonusPoints:0 },
  { id:'police', name:'Полицейский', desc:'Тренированный стрелок с навыками патрулирования.', cost:0,
    skills:{strength:1, scouting:2}, items:['bat','bandage','water','canned_food'], bonusPoints:0 },
  { id:'engineer', name:'Инженер', desc:'Может создавать и чинить сложные конструкции.', cost:0,
    skills:{mechanics:3}, items:['hammer','nails','tape','water'], bonusPoints:-2 },
  { id:'nurse', name:'Медсестра', desc:'Глубокие знания в области медицины и лечения.', cost:0,
    skills:{firstAid:3}, items:['bandage','bandage','antibiotics','disinfectant','painkillers','water'], bonusPoints:-2 },
  { id:'chef', name:'Повар', desc:'Знает, как приготовить еду из чего угодно.', cost:0,
    skills:{cooking:3, firstAid:1}, items:['knife','canned_food','canned_food','water','bread'], bonusPoints:-2 },
  { id:'burglar', name:'Взломщик', desc:'Мастер бесшумного проникновения и кражи.', cost:0,
    skills:{stealth:3, scouting:1}, items:['knife','bag','water'], bonusPoints:-2 },
  { id:'carpenter', name:'Плотник', desc:'Строит укрепления быстрее и прочнее.', cost:0,
    skills:{mechanics:2, strength:1}, items:['hammer','nails','planks','water'], bonusPoints:-1 },
  { id:'veteran', name:'Ветеран', desc:'Прошёл войну. Закалён в бою, но несёт свои шрамы.', cost:0,
    skills:{strength:2, scouting:1, stealth:1}, items:['axe','knife','canned_food','canned_food','water','bandage'], bonusPoints:-4 },
  { id:'ranger', name:'Егерь', desc:'Знает дикую природу. Отличный разведчик.', cost:0,
    skills:{scouting:3, stealth:1, cooking:1}, items:['knife','rope','water','meat_raw'], bonusPoints:-3 },
  { id:'mechanic', name:'Автомеханик', desc:'Разбирается в механизмах и инструментах.', cost:0,
    skills:{mechanics:2, strength:1}, items:['pipe','fuel','tape','water'], bonusPoints:-1 },
  { id:'homeless', name:'Бродяга', desc:'Привык к лишениям. Начинает без ничего, но крайне вынослив.', cost:0,
    skills:{stealth:1, scouting:1}, items:[], bonusPoints:4 },
];

// ── TRAITS (PZ-inspired, point-buy system) ──
const TRAITS = [
  // ── Positive traits (cost points) ──
  { id:'fast_learner', name:'Быстрый ученик', desc:'Опыт навыков +30%', cost:6, type:'pos',
    effect:{ xpMult:1.3 }, exclusive:['slow_learner'] },
  { id:'strong', name:'Силач', desc:'Сила +2, переносимый вес +4 кг', cost:6, type:'pos',
    effect:{ skills:{strength:2}, weightBonus:4 }, exclusive:['weak'] },
  { id:'nimble', name:'Проворный', desc:'Скрытность +2', cost:4, type:'pos',
    effect:{ skills:{stealth:2} }, exclusive:['clumsy'] },
  { id:'eagle_eye', name:'Орлиный глаз', desc:'Разведка +2, дальность сканирования +20%', cost:4, type:'pos',
    effect:{ skills:{scouting:2}, scanBonus:0.2 }, exclusive:['short_sighted'] },
  { id:'thick_skin', name:'Толстокожий', desc:'Получаемый урон −20%', cost:5, type:'pos',
    effect:{ dmgReduction:0.2 }, exclusive:['thin_skin'] },
  { id:'resilient', name:'Выносливый', desc:'Скорость заражения −50%', cost:5, type:'pos',
    effect:{ infectionMult:0.5 }, exclusive:['prone_infection'] },
  { id:'brave', name:'Хладнокровный', desc:'Паника растёт на 50% медленнее', cost:3, type:'pos',
    effect:{ panicMult:0.5 }, exclusive:['cowardly'] },
  { id:'organized', name:'Организованный', desc:'Вес переносимого +6 кг', cost:3, type:'pos',
    effect:{ weightBonus:6 }, exclusive:[] },
  { id:'wakeful', name:'Бессонница', desc:'Усталость накапливается на 30% медленнее', cost:3, type:'pos',
    effect:{ fatigueMult:0.7 }, exclusive:['sleepyhead'] },
  { id:'iron_gut', name:'Железный желудок', desc:'Голод и жажда растут на 25% медленнее', cost:3, type:'pos',
    effect:{ hungerMult:0.75, thirstMult:0.75 }, exclusive:['hearty_appetite'] },
  { id:'first_aider', name:'Бывший санитар', desc:'Первая помощь +1', cost:2, type:'pos',
    effect:{ skills:{firstAid:1} }, exclusive:[] },
  { id:'handy', name:'Мастер на все руки', desc:'Механика +1', cost:2, type:'pos',
    effect:{ skills:{mechanics:1} }, exclusive:[] },
  // Оружейные черты
  { id:'marksman', name:'Меткий стрелок', desc:'Огнестрел +2, точность +15%', cost:6, type:'pos',
    effect:{ skills:{firearms:2}, accuracyBonus:15 }, exclusive:['butterfingers'] },
  { id:'quick_draw', name:'Быстрые руки', desc:'Перезарядка на 50% быстрее', cost:4, type:'pos',
    effect:{ reloadMult:0.5 }, exclusive:['slow_hands'] },
  { id:'brawler', name:'Боец', desc:'Урон в ближнем бою +25%', cost:4, type:'pos',
    effect:{ meleeDmgMult:1.25 }, exclusive:['pacifist'] },
  { id:'lucky', name:'Везунчик', desc:'Шанс найти редкий лут +20%', cost:3, type:'pos',
    effect:{ luckBonus:0.2 }, exclusive:['unlucky'] },
  { id:'light_footed', name:'Лёгкая поступь', desc:'Шум от передвижения −40%', cost:3, type:'pos',
    effect:{ movementNoiseMult:0.6 }, exclusive:['heavy_footed'] },
  { id:'fast_reader', name:'Скорочтение', desc:'Книги читаются на 50% быстрее', cost:2, type:'pos',
    effect:{ readMult:0.5 }, exclusive:[] },
  { id:'cook', name:'Повар', desc:'Кулинария +2', cost:3, type:'pos',
    effect:{ skills:{cooking:2} }, exclusive:[] },
  { id:'night_owl', name:'Сова', desc:'Ночной штраф уменьшен на 50%', cost:3, type:'pos',
    effect:{ nightPenaltyMult:0.5 }, exclusive:['early_bird'] },
  { id:'early_bird', name:'Жаворонок', desc:'Бонус к действиям утром и днём +10%', cost:2, type:'pos',
    effect:{ dayBonus:0.1 }, exclusive:['night_owl'] },

  // ── Negative traits (give points) ──
  { id:'slow_learner', name:'Тугодум', desc:'Опыт навыков −30%', cost:-4, type:'neg',
    effect:{ xpMult:0.7 }, exclusive:['fast_learner'] },
  { id:'weak', name:'Слабак', desc:'Сила −1, переносимый вес −4 кг', cost:-6, type:'neg',
    effect:{ skills:{strength:-1}, weightBonus:-4 }, exclusive:['strong'] },
  { id:'clumsy', name:'Неуклюжий', desc:'Скрытность −1, шум от действий +50%', cost:-4, type:'neg',
    effect:{ skills:{stealth:-1}, noiseMult:1.5 }, exclusive:['nimble'] },
  { id:'short_sighted', name:'Близорукий', desc:'Разведка −1, дальность сканирования −20%', cost:-2, type:'neg',
    effect:{ skills:{scouting:-1}, scanBonus:-0.2 }, exclusive:['eagle_eye'] },
  { id:'thin_skin', name:'Хрупкий', desc:'Получаемый урон +25%', cost:-5, type:'neg',
    effect:{ dmgReduction:-0.25 }, exclusive:['thick_skin'] },
  { id:'prone_infection', name:'Слабый иммунитет', desc:'Скорость заражения +50%', cost:-4, type:'neg',
    effect:{ infectionMult:1.5 }, exclusive:['resilient'] },
  { id:'cowardly', name:'Трус', desc:'Паника растёт на 100% быстрее', cost:-2, type:'neg',
    effect:{ panicMult:2.0 }, exclusive:['brave'] },
  { id:'hearty_appetite', name:'Обжора', desc:'Голод и жажда растут на 50% быстрее', cost:-4, type:'neg',
    effect:{ hungerMult:1.5, thirstMult:1.5 }, exclusive:['iron_gut'] },
  { id:'sleepyhead', name:'Соня', desc:'Усталость накапливается на 50% быстрее', cost:-2, type:'neg',
    effect:{ fatigueMult:1.5 }, exclusive:['wakeful'] },
  { id:'smoker', name:'Курильщик', desc:'Без сигарет — паника и стресс', cost:-2, type:'neg',
    effect:{ smoker:true }, exclusive:[] },
  { id:'asthmatic', name:'Астматик', desc:'Усталость от бега и боя +40%', cost:-3, type:'neg',
    effect:{ combatFatigueMult:1.4 }, exclusive:[] },
  { id:'hemophobic', name:'Гемофобик', desc:'Вид крови вызывает панику (+10 за бой)', cost:-2, type:'neg',
    effect:{ combatPanic:10 }, exclusive:[] },
  { id:'conspicuous', name:'Заметный', desc:'Зомби обнаруживают тебя на +30% дальше', cost:-3, type:'neg',
    effect:{ detectionMult:1.3 }, exclusive:[] },
  // Оружейные негативные
  { id:'butterfingers', name:'Криворукий', desc:'Точность огнестрела −15%', cost:-4, type:'neg',
    effect:{ accuracyBonus:-15 }, exclusive:['marksman'] },
  { id:'slow_hands', name:'Медлительный', desc:'Перезарядка на 50% дольше', cost:-3, type:'neg',
    effect:{ reloadMult:1.5 }, exclusive:['quick_draw'] },
  { id:'pacifist', name:'Пацифист', desc:'Урон в ближнем бою −25%', cost:-3, type:'neg',
    effect:{ meleeDmgMult:0.75 }, exclusive:['brawler'] },
  { id:'unlucky', name:'Невезучий', desc:'Шанс найти редкий лут −20%', cost:-3, type:'neg',
    effect:{ luckBonus:-0.2 }, exclusive:['lucky'] },
  { id:'heavy_footed', name:'Тяжёлая поступь', desc:'Шум от передвижения +50%', cost:-2, type:'neg',
    effect:{ movementNoiseMult:1.5 }, exclusive:['light_footed'] },
  { id:'deaf', name:'Тугоухий', desc:'Не слышишь зомби заранее, внезапные атаки чаще', cost:-4, type:'neg',
    effect:{ surpriseAttackMult:1.5 }, exclusive:[] },
  { id:'claustrophobic', name:'Клаустрофоб', desc:'Паника +15 в маленьких помещениях', cost:-2, type:'neg',
    effect:{ claustrophobia:true }, exclusive:[] },
];

// ── DIFFICULTY PRESETS ──
const DIFFICULTIES = [
  { id:'easy', name:'Легко', zombieSpeed:'slow', permadeath:false, lootMult:1.5, infectionCure:true, nightPenalty:0.1, zombieHp:0.7, zombieDmg:0.7, zombieHearing:0.7, zombieSight:0.7, population:0.6, foodSpoilMult:0.5, respawnLoot:true, infectionChance:0.3 },
  { id:'normal', name:'Нормально', zombieSpeed:'mixed', permadeath:true, lootMult:1.0, infectionCure:true, nightPenalty:0.2, zombieHp:1.0, zombieDmg:1.0, zombieHearing:1.0, zombieSight:1.0, population:1.0, foodSpoilMult:1.0, respawnLoot:false, infectionChance:0.5 },
  { id:'hardcore', name:'Хардкор', zombieSpeed:'fast', permadeath:true, lootMult:0.5, infectionCure:false, nightPenalty:0.4, zombieHp:1.5, zombieDmg:1.5, zombieHearing:1.5, zombieSight:1.5, population:1.5, foodSpoilMult:2.0, respawnLoot:false, infectionChance:0.8 },
];

// Keep SCENARIOS for backward-compatible save loading
const SCENARIOS = OCCUPATIONS.map(o => ({ id:o.id, name:o.name, desc:o.desc }));

// ── LORE: STRUCTURED NOTES ──
const LORE_NOTES = [
  { id:'note_renkov', title:'Дневник д-ра Ренкова', text:'18 марта. Штамм Э-7.4 показал невероятные результаты на приматах. Регенерация тканей в 40 раз быстрее нормы. Побочные эффекты: гиперагрессия, потеря речевых функций через 48ч. Руководство настаивает на переходе к следующей фазе. Я не уверен, что мы готовы. Но кто меня спрашивает.', region:'city', buildingType:'office' },
  { id:'note_lina', title:'Записка Лины Чен', text:'Виктор сошёл с ума. Он хочет перейти к аэрозольной фазе. Я видела что произошло с субъектом Ноль — Артём Волков, камера -5. Семь лет под НП-7. Он больше не человек. Но он и не как другие. Он СМОТРИТ. Он ПОНИМАЕТ. Это хуже всего.', region:'city', buildingType:'hospital' },
  { id:'note_korin', title:'Приказ майора Корина', text:'СЕКРЕТНО. Директива "Стеклянный купол". При утечке биоматериала: 1) Оцепить периметр. 2) Пресечь попытки прорыва — огонь на поражение. 3) Ожидать дальнейших инструкций. НЕ входить в город. НЕ вступать в контакт с населением.', region:'industrial', buildingType:'military' },
  { id:'note_anya1', title:'Дневник Ани, стр. 1', text:'Папа ушёл на работу утром и не вернулся. Мама говорит не волноваться. Но по телевизору ничего не показывают, только помехи. Соседка тётя Валя кричала за стеной, потом замолчала. Мама закрыла все двери на замок.', region:'suburbs', buildingType:'house' },
  { id:'note_anya2', title:'Дневник Ани, стр. 2', text:'Мама заперлась в ванной. Она стучит в дверь, но не говорит слова. Просто стучит и стучит. Я забралась на чердак с Барсиком и ем его корм. Не знаю сколько дней прошло. Может три. Может больше.', region:'suburbs', buildingType:'house' },
  { id:'note_guard', title:'Последняя запись охранника', text:'Смена 14:00-22:00. 18:30 — вызов с уровня -3: "разгерметизация, нужна эвакуация". 18:45 — связь с -3 потеряна. 19:10 — вентиляция отключилась, потом включилась снова. 19:30 — на камерах видно людей в вестибюле, они ведут себя странно. 20:15 — один из них подошёл к стеклу и', region:'industrial', buildingType:'warehouse' },
  { id:'note_doctor', title:'Записка из больницы', text:'Пациентов слишком много. Скорые перестали приезжать. Симптомы: высокая температура, дезориентация, агрессия. Ничего не помогает. К утру — полная потеря контакта. Медсёстры разбежались. Я остался один на 3 этаже с 47 пациентами. Двери уже не держат.', region:'city', buildingType:'hospital' },
  { id:'note_scientist', title:'Лабораторный отчёт НГ-12', text:'КОНФИДЕНЦИАЛЬНО. Маркер НГ-12 успешно введён через программу вакцинации. 4200 субъектов получили нейропротектор. Контрольная группа сформирована. При активации Э-7.4 субъекты с НГ-12 сохранят когнитивные функции. Приложение: список контрольных субъектов (см. сервер уровня -5).', region:'industrial', buildingType:'office' },
  { id:'note_radio_op', title:'Бортовой журнал рации', text:'День 8. Перехват на частоте 148.625: "Борт-17, подтвердите готовность к зачистке сектора Н-47. Срок — 30 суток от момента изоляции." Ответ: "Борт-17, принято. Боеприпас: 4 термобарических." Они собираются нас бомбить. У нас 30 дней.', region:'suburbs', buildingType:'fire_station' },
  { id:'note_survivor', title:'Записка на стене', text:'ЕСЛИ ТЫ ЭТО ЧИТАЕШЬ — ТЫ ЕЩЁ ЖИВ. Не ходи на юг — там промзона, их тысячи. В лесу безопаснее, но холодно. Группа выживших на западе, в городе. Ищи стены. Удачи, брат.', region:'forest', buildingType:'house' },
];

// ── LORE: RADIO TRANSMISSIONS ──
const RADIO_TRANSMISSIONS = [
  { id:0, freq:'148.200', speaker:'Автомат. сигнал', speakerEn:'Auto signal', text:'[ШИПЕНИЕ]... координаты сброса гуманитарной помощи... повторяю... ящик с припасами... [ПОМЕХИ]', textEn:'[STATIC]... humanitarian supply drop coordinates... repeat... supply crate... [INTERFERENCE]', special:'airdrop' },
  { id:1, freq:'151.800', speaker:'Мужской голос', speakerEn:'Male voice', text:'Всем кто слышит — мы организовали поселение. Есть стены, есть торговля. Если найдёте — стучите в ворота три раза. Не стреляйте, мы свои.', textEn:'Anyone hearing this — we set up a settlement. We have walls, we have trade. If you find us — knock three times. Don\'t shoot, we\'re friendly.', special:'npc_camp' },
  { id:2, freq:'144.500', speaker:'Женский голос', speakerEn:'Female voice', text:'Если кто-то из персонала Вектор-7 слышит... уровень минус пять заблокирован автоматикой. Код доступа изменён. Ренков... Ренков не тот за кого себя выдаёт. Не верьте ему.', textEn:'If anyone from Vector-7 staff can hear... sublevel minus five is auto-locked. Access code changed. Renkov... Renkov is not who he claims to be. Don\'t trust him.', special:null },
  { id:3, freq:'156.300', speaker:'Военная частота', speakerEn:'Military freq', text:'Всем постам периметра: протокол "Стеклянный купол" продлён на неопределённый срок. Снабжение прекращено. Приказ штаба: ожидать. Конец связи.', textEn:'All perimeter posts: "Glass Dome" protocol extended indefinitely. Supply runs ceased. HQ order: hold position. Over and out.', special:null },
  { id:4, freq:'148.625', speaker:'Борт-17', speakerEn:'Aircraft-17', text:'Центр, Борт-17. Облёт завершён. Подтверждаю: инфицированных — тысячи. Выживших замечено около двадцати единиц в разных точках. Ожидаю приказ на зачистку.', textEn:'Center, Aircraft-17. Flyover complete. Confirm: infected — thousands. Survivors spotted: approximately twenty units at various points. Awaiting clearance order.', special:null },
  { id:5, freq:'151.200', speaker:'Шёпот', speakerEn:'Whisper', text:'Они не мертвы. Они слышат. Тот, в подвале НИИ... семь лет... он эволюционировал. Он не нападает. Он ждёт. Субъект Ноль — ключ ко всему. Или конец всему.', textEn:'They are not dead. They can hear. The one in the institute basement... seven years... he evolved. He doesn\'t attack. He waits. Subject Zero — the key to everything. Or the end of everything.', special:null },
  { id:6, freq:'144.800', speaker:'Детский голос', speakerEn:'Child voice', text:'[ПЛАЧ]... мама... мама не отвечает... она стучит в дверь но не говорит... пожалуйста кто-нибудь... я на чердаке... на Берёзовой...', textEn:'[CRYING]... mom... mom won\'t answer... she bangs on the door but won\'t speak... please someone... I\'m in the attic... on Birch street...', special:null },
  { id:7, freq:'155.000', speaker:'Хриплый голос', speakerEn:'Hoarse voice', text:'Олег Дым на связи. Склады под нашим контролем. Хочешь жрать — неси что-нибудь полезное. Патроны, лекарства, инструмент. Халявщиков и героев — к стенке. Без обид.', textEn:'Oleg Dym here. Warehouses under our control. Want food — bring something useful. Ammo, meds, tools. Freeloaders and heroes — against the wall. No hard feelings.', special:null },
  { id:8, freq:'148.900', speaker:'Отец Даниил', speakerEn:'Father Daniil', text:'Братья и сёстры. Это не конец — это очищение. Те кто обратились — освобождены от греха мирского. Мы, оставшиеся — избранные. Приходите в храм. Здесь безопасно. Здесь — истина.', textEn:'Brothers and sisters. This is not the end — it is purification. Those who turned — are freed from worldly sin. We who remain — are chosen. Come to the church. It is safe here. Here — is truth.', special:null },
  { id:9, freq:'152.400', speaker:'НейроГен (перехват)', speakerEn:'NeuroGen (intercept)', text:'[ЗАШИФРОВАННЫЙ КАНАЛ]... эвакуация группы мониторинга завершена через 6 часов после активации... серверы на -5 содержат полные данные... рекомендуем дистанционную ликвидацию объекта до публичной огласки...', textEn:'[ENCRYPTED CHANNEL]... monitoring team evacuation completed 6 hours after activation... servers on -5 contain full data... recommend remote facility elimination before public disclosure...', special:null },
  { id:10, freq:'144.100', speaker:'Тишина', speakerEn:'Silence', text:'[5 секунд статики, затем тихий голос] ...они знали. Всё было спланировано. Вакцинация... маркер НГ-12... мы — контрольная группа. Подопытные. Весь город — полигон. Найди серверы на минус пятом. Мир должен узнать.', textEn:'[5 seconds of static, then a quiet voice] ...they knew. It was all planned. The vaccination... marker NG-12... we are the control group. Test subjects. The whole city — a testing ground. Find the servers on sublevel minus five. The world must know.', special:null },
  { id:11, freq:'148.625', speaker:'Борт-17', speakerEn:'Aircraft-17', text:'Центр, Борт-17. Подтвердите приказ на термобарическую зачистку сектора Н-47. Обратный отсчёт: 14 суток. Прошу подтверждения. [ПОМЕХИ] ...повторяю... 14 суток...', textEn:'Center, Aircraft-17. Confirm order for thermobaric clearance of sector N-47. Countdown: 14 days. Request confirmation. [INTERFERENCE] ...repeat... 14 days...', special:null },
];

// ── LORE: TRIGGER EVENTS ──
const TRIGGER_EVENTS = [
  { id:'trig_graffiti_warning', type:'graffiti', title:'Надпись на стене', titleEn:'Wall Graffiti', text:'На стене красной краской выведено огромными буквами:\n\n"НЕ ВЫХОДИТЬ ПОСЛЕ ТЕМНОТЫ"\n\nПод надписью — отпечатки ладоней. Бурые, засохшие.', textEn:'On the wall, in huge red paint letters:\n\n"DO NOT GO OUT AFTER DARK"\n\nBelow — handprints. Brown, dried.', region:'suburbs', buildingTypes:['house'], depressionAdd:3, loot:null },
  { id:'trig_barricade_apt', type:'barricade', title:'Забаррикадированная квартира', titleEn:'Barricaded Apartment', text:'Дверь заколочена изнутри. Мебель сдвинута к окнам. На полу — консервные банки, пустые бутылки. В углу — спальный мешок и фотография семьи. Кто-то продержался здесь долго. Но в стене — пролом. Они всё-таки прорвались.', textEn:'Door nailed shut from inside. Furniture pushed to windows. On the floor — cans, empty bottles. In the corner — a sleeping bag and a family photo. Someone held out here for a long time. But there\'s a breach in the wall. They got through anyway.', region:'suburbs', buildingTypes:['house'], depressionAdd:5, loot:[{id:'canned_food',qty:1},{id:'bandage',qty:1}] },
  { id:'trig_hospital_blood', type:'blood', title:'Кровавый коридор', titleEn:'Bloody Corridor', text:'Пол залит кровью. Каталки перевёрнуты. На стенах — следы когтей и пулевые отверстия. Кто-то пытался остановить их здесь. Гильзы 9мм рассыпаны повсюду. Не помогло. На стойке регистрации — журнал дежурств, последняя запись: "47 пациентов. 0 персонала. Двери не дер"', textEn:'Floor covered in blood. Gurneys overturned. On walls — claw marks and bullet holes. Someone tried to stop them here. 9mm casings scattered everywhere. Didn\'t help. At reception — duty log, last entry: "47 patients. 0 staff. Doors won\'t ho"', region:'city', buildingTypes:['hospital'], depressionAdd:8, loot:[{id:'ammo_9x19',qty:5}] },
  { id:'trig_church_candles', type:'warning', title:'Храм "очищенных"', titleEn:'Temple of the "Purified"', text:'Свечи горят. Десятки свечей — на полу, на подоконниках, на алтаре. На стенах — списки имён, подписанные "ОЧИЩЕННЫЕ". Рядом с каждым именем — крест. На полу перед алтарём — свежие следы. Кто-то приходит сюда. Регулярно.', textEn:'Candles burning. Dozens of candles — on the floor, windowsills, altar. On walls — lists of names labeled "PURIFIED". A cross by each name. On the floor before the altar — fresh footprints. Someone comes here. Regularly.', region:'city', buildingTypes:['church'], depressionAdd:5, loot:null },
  { id:'trig_lab_wreck', type:'blood', title:'Разгромленная лаборатория', titleEn:'Wrecked Laboratory', text:'Оборудование разбито. Пробирки на полу. На экране компьютера (чудом работает) — последняя строка лога: "УТЕЧКА ПОДТВЕРЖДЕНА. ВЕНТИЛЯЦИЯ СКОМПРОМЕТИРОВАНА. УРОВНИ -3, -4 — ПОЛНАЯ ПОТЕРЯ." Кто-то приписал маркером на мониторе: "Ренков знал."', textEn:'Equipment smashed. Test tubes on the floor. On a computer screen (somehow still on) — last log line: "LEAK CONFIRMED. VENTILATION COMPROMISED. LEVELS -3, -4 — TOTAL LOSS." Someone wrote on the monitor in marker: "Renkov knew."', region:'industrial', buildingTypes:['office','warehouse'], depressionAdd:5, loot:[{id:'battery',qty:2}] },
  { id:'trig_school_refuge', type:'barricade', title:'Школьное убежище', titleEn:'School Refuge', text:'Спортзал превращён в лагерь. Матрасы на полу, детские рисунки на стенах — солнце, дома, мама и папа. Но рядом — другие рисунки: чёрные фигуры с красными ртами. Подпись детским почерком: "плохие дяди". Лагерь пуст. Одеяла сброшены. Уходили спешно.', textEn:'Gymnasium turned into a camp. Mattresses on the floor, children\'s drawings on walls — sun, houses, mom and dad. But nearby — other drawings: black figures with red mouths. Caption in child\'s handwriting: "bad men". Camp is empty. Blankets thrown aside. Left in a hurry.', region:'suburbs', buildingTypes:['school'], depressionAdd:10, loot:[{id:'water',qty:1},{id:'canned_food',qty:1}] },
  { id:'trig_military_post', type:'corpse', title:'Брошенный пост', titleEn:'Abandoned Checkpoint', text:'Армейский блокпост. Мешки с песком, колючая проволока. Два тела в форме — застрелены. Не заражёнными — пулевые в спину. Рядом — раскрытый сейф. Пустой. На земле — клочок бумаги: "Приказ отменён. Каждый сам за себя. — С.К."', textEn:'Army checkpoint. Sandbags, barbed wire. Two bodies in uniform — shot. Not by infected — bullets in the back. Nearby — an open safe. Empty. On the ground — a scrap of paper: "Order cancelled. Every man for himself. — S.K."', region:'industrial', buildingTypes:['military'], depressionAdd:7, loot:[{id:'ammo_545x39',qty:10},{id:'bandage',qty:2}] },
  { id:'trig_forest_camp', type:'corpse', title:'Лесной лагерь', titleEn:'Forest Camp', text:'Палатка, потушенный костёр, верёвка между деревьями с сушащейся одеждой. Мирная картина — если не считать тело у костра. Без видимых ран. Рядом — пустой пузырёк с этикеткой "Снотворное". Записка в кармане: "Устал бояться. Простите."', textEn:'Tent, extinguished campfire, rope between trees with drying clothes. A peaceful scene — if not for the body by the fire. No visible wounds. Nearby — an empty pill bottle labeled "Sleeping pills". A note in the pocket: "Tired of being afraid. Forgive me."', region:'forest', buildingTypes:['house'], depressionAdd:12, loot:[{id:'rope',qty:1},{id:'knife',qty:1}] },
];

// ── STREET NAME POOLS ──
const STREET_NAMES = {
  suburbs:    ['Берёзовая','Кленовая','Школьная','Садовая','Тихая','Вишнёвая','Речная','Полевая','Луговая','Дубовая'],
  city:       ['Ленина','Мира','Победы','Центральная','Советская','Пушкина','Горького','Маяковского','Красная','Октябрьская'],
  industrial: ['Заводская','Монтажная','Трубная','Складская','Литейная','Промышленная','Станционная','Тракторная','Железнодорожная','Кирпичная'],
  forest:     ['Лесная','Охотничья','Грибная','Еловая','Сосновая','Озёрная','Болотная','Таёжная','Медвежья','Волчья'],
};

// ═══════════════════════════════════════════
