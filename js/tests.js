// ═══════════════════════════════════════════
// AUTOMATED TESTS
// ═══════════════════════════════════════════

const TestRunner = {
  passed: 0,
  failed: 0,
  errors: [],

  assert(condition, name) {
    if (condition) { this.passed++; }
    else { this.failed++; this.errors.push(name); }
  },

  assertEqual(a, b, name) {
    this.assert(a === b, `${name}: expected ${b}, got ${a}`);
  },

  assertExists(val, name) {
    this.assert(val !== undefined && val !== null, `${name}: is ${val}`);
  },

  reset() { this.passed = 0; this.failed = 0; this.errors = []; },
};

function runAllTests() {
  TestRunner.reset();

  testCoreData();
  testI18n();
  testItemSystem();
  testSkillSystem();
  testArmorCalculation();
  testSaveLoad();
  testKeySystem();
  testAchievements();
  testCraftRecipes();
  testNodeTypes();
  testWorldGeneration();
  testInventoryOperations();

  return TestRunner;
}

// ── Core Data Integrity ──
function testCoreData() {
  const T = TestRunner;

  // RNG
  const r1 = new RNG(42);
  const v1 = r1.next();
  const r2 = new RNG(42);
  const v2 = r2.next();
  T.assertEqual(v1, v2, 'RNG deterministic with same seed');
  T.assert(v1 >= 0 && v1 < 1, 'RNG output in [0,1)');

  // ITEMS exist
  T.assert(Object.keys(ITEMS).length > 100, 'ITEMS has 100+ entries');
  T.assertExists(ITEMS.knife, 'ITEMS.knife exists');
  T.assertExists(ITEMS.ak74, 'ITEMS.ak74 exists');
  T.assertExists(ITEMS.bandage, 'ITEMS.bandage exists');
  T.assertExists(ITEMS._key, 'ITEMS._key exists');
  T.assertExists(ITEMS.vest_armor, 'ITEMS.vest_armor (armor slot)');
  T.assertExists(ITEMS.rig_mil, 'ITEMS.rig_mil (rig slot)');
  T.assertExists(ITEMS.gloves_tactical, 'ITEMS.gloves_tactical');
  T.assertExists(ITEMS.balaclava_black, 'ITEMS.balaclava_black (face slot)');

  // All items have required fields
  let itemsOK = true;
  for (const [id, def] of Object.entries(ITEMS)) {
    if (!def.name) { itemsOK = false; T.assert(false, `ITEMS.${id} missing name`); break; }
    if (!def.type) { itemsOK = false; T.assert(false, `ITEMS.${id} missing type`); break; }
  }
  if (itemsOK) T.assert(true, 'All ITEMS have name and type');

  // BUILDING_META
  T.assert(Object.keys(BUILDING_META).length >= 20, 'BUILDING_META has 20+ types');
  for (const [id, meta] of Object.entries(BUILDING_META)) {
    T.assert(meta.w && meta.h && meta.color, `BUILDING_META.${id} has w/h/color`);
  }

  // BLD_H global
  T.assertExists(BLD_H, 'BLD_H is global');
  T.assertExists(BLD_H.house, 'BLD_H.house exists');
  T.assertExists(BLD_H.hotel, 'BLD_H.hotel exists');

  // scaleColor global
  T.assertEqual(typeof scaleColor, 'function', 'scaleColor is global function');
  const sc = scaleColor('#ff0000', 0.5);
  T.assertEqual(sc, 'rgb(128,0,0)', 'scaleColor works correctly');

  // NODE_TYPES
  T.assertExists(NODE_TYPES.road, 'NODE_TYPES.road');
  T.assertExists(NODE_TYPES.water, 'NODE_TYPES.water (new type)');
  T.assert(NODE_TYPES.water.blocked === true, 'water is blocked');

  // LOCATION_TEMPLATES
  T.assertExists(LOCATION_TEMPLATES.house, 'LOCATION_TEMPLATES.house');
  // All 2-floor buildings have stairs on floor 0
  for (const [id, tmpl] of Object.entries(LOCATION_TEMPLATES)) {
    if (tmpl.hasSecondFloor && tmpl.floors[0]) {
      const hasStairsF0 = tmpl.floors[0].some(r => r.type === 'stairs');
      T.assert(hasStairsF0, `${id}: has stairs on floor 0`);
    }
  }
}

// ── i18n ──
function testI18n() {
  const T = TestRunner;
  T.assertExists(LANG, 'LANG object exists');
  T.assertExists(LANG.strings.ru, 'Russian strings exist');
  T.assertExists(LANG.strings.en, 'English strings exist');
  T.assertEqual(typeof t, 'function', 't() function exists');

  // Check key coverage — every RU key should have EN equivalent
  const ruKeys = Object.keys(LANG.strings.ru);
  const enKeys = Object.keys(LANG.strings.en);
  let missing = 0;
  for (const k of ruKeys) {
    if (!LANG.strings.en[k]) missing++;
  }
  T.assertEqual(missing, 0, `EN has all RU keys (missing: ${missing})`);

  // t() returns correct language
  const origLang = LANG.current;
  LANG.current = 'en';
  T.assertEqual(t('menu.continue'), 'Continue', 't() returns EN');
  LANG.current = 'ru';
  T.assertEqual(t('menu.continue'), 'Продолжить', 't() returns RU');
  LANG.current = origLang;
}

// ── Items ──
function testItemSystem() {
  const T = TestRunner;

  // Clothing slots
  const slots = new Set(['head','face','torso','armor','rig','gloves','legs','feet','back']);
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.type === 'clothing' && def.slot) {
      T.assert(slots.has(def.slot), `${id} slot '${def.slot}' is valid`);
    }
  }

  // Weapons have damage
  for (const [id, def] of Object.entries(ITEMS)) {
    if (def.type === 'weapon' && id !== 'fist') {
      T.assert(def.dmg > 0, `weapon ${id} has damage`);
    }
  }

  // All icon mappings point to valid items
  let iconErrors = 0;
  for (const id of Object.keys(ICON_MAP)) {
    // Skip legacy aliases
    if (['pistol','shotgun','rifle','revolver','ammo_9mm','ammo_shells','ammo_rifle'].includes(id)) continue;
    if (!ITEMS[id]) iconErrors++;
  }
  T.assertEqual(iconErrors, 0, `All ICON_MAP entries are valid items (errors: ${iconErrors})`);
}

// ── Skills ──
function testSkillSystem() {
  const T = TestRunner;
  T.assertExists(SKILL_NAMES.firearms, 'SKILL_NAMES has firearms');

  // Simulate newGame and check skills
  // Can't call newGame without side effects, so check the template
  const expectedSkills = ['strength','stealth','scouting','firstAid','mechanics','cooking','lockpicking','firearms'];
  for (const sk of expectedSkills) {
    T.assertExists(SKILL_NAMES[sk], `SKILL_NAMES.${sk} exists`);
  }
}

// ── Armor ──
function testArmorCalculation() {
  const T = TestRunner;
  // getArmor should give full value for armor slots, 25% for clothing
  // We can't test without G, but we can verify the function exists
  T.assertEqual(typeof getArmor, 'function', 'getArmor exists');
}

// ── Save/Load ──
function testSaveLoad() {
  const T = TestRunner;
  T.assertEqual(typeof saveGame, 'function', 'saveGame exists');
  T.assertEqual(typeof loadGame, 'function', 'loadGame exists');
}

// ── Keys ──
function testKeySystem() {
  const T = TestRunner;
  T.assertExists(ITEMS._key, '_key item defined');
  T.assertEqual(ITEMS._key.type, 'material', '_key is material type');
  // Keys with keyId should NOT stack
  // The addItem function checks !extra.keyId for stacking
  T.assertEqual(typeof addItem, 'function', 'addItem exists');
}

// ── Achievements ──
function testAchievements() {
  const T = TestRunner;
  T.assert(ACHIEVEMENTS.length >= 20, `${ACHIEVEMENTS.length} achievements defined`);

  // Each achievement has required fields
  for (const ach of ACHIEVEMENTS) {
    T.assert(ach.id && ach.name && ach.nameEn && ach.desc && ach.descEn && ach.icon && typeof ach.check === 'function',
      `Achievement ${ach.id} has all fields`);
  }

  // No duplicate IDs
  const ids = ACHIEVEMENTS.map(a => a.id);
  T.assertEqual(ids.length, new Set(ids).size, 'No duplicate achievement IDs');
}

// ── Craft ──
function testCraftRecipes() {
  const T = TestRunner;
  T.assert(RECIPES.length >= 10, `${RECIPES.length} recipes defined`);

  // Each recipe's components reference valid items
  for (const r of RECIPES) {
    for (const compId of Object.keys(r.components)) {
      T.assert(ITEMS[compId], `Recipe ${r.id}: component ${compId} exists in ITEMS`);
    }
  }
}

// ── Node Types ──
function testNodeTypes() {
  const T = TestRunner;
  const required = ['road','intersection','building','car_wreck','park','barricade','water'];
  for (const nt of required) {
    T.assertExists(NODE_TYPES[nt], `NODE_TYPES.${nt} exists`);
  }
}

// ── World Generation ──
function testWorldGeneration() {
  const T = TestRunner;
  T.assertExists(WORLD_CONFIG, 'WORLD_CONFIG exists');
  T.assertEqual(WORLD_CONFIG.gridW, 40, 'Grid width = 40');
  T.assertEqual(WORLD_CONFIG.gridH, 40, 'Grid height = 40');
  T.assertEqual(WORLD_CONFIG.regions.length, 4, '4 regions defined');
}

// ── Inventory ──
function testInventoryOperations() {
  const T = TestRunner;
  T.assertEqual(typeof addItem, 'function', 'addItem exists');
  T.assertEqual(typeof removeItem, 'function', 'removeItem exists');
  T.assertEqual(typeof hasItem, 'function', 'hasItem exists');
  T.assertEqual(typeof countItem, 'function', 'countItem exists');
  T.assertEqual(typeof calcWeight, 'function', 'calcWeight exists');
  T.assertEqual(typeof maxWeight, 'function', 'maxWeight exists');
}

// ── Show test results UI ──
function showTestResults() {
  const results = runAllTests();
  const total = results.passed + results.failed;
  const pct = total > 0 ? Math.round(results.passed / total * 100) : 0;

  let html = `<div style="text-align:center;margin-bottom:12px">
    <div style="font-size:${results.failed === 0 ? '20' : '16'}px;color:${results.failed === 0 ? 'var(--green)' : 'var(--red)'}">
      ${results.failed === 0 ? '✓ ALL TESTS PASSED' : `✗ ${results.failed} FAILED`}
    </div>
    <div style="color:var(--text-dim);font-size:11px;margin-top:4px">${results.passed}/${total} passed (${pct}%)</div>
  </div>`;

  if (results.errors.length > 0) {
    html += '<div style="max-height:40vh;overflow-y:auto;border:1px solid var(--red);border-radius:4px;padding:8px;margin-bottom:8px">';
    html += '<div style="color:var(--red);font-size:9px;letter-spacing:.1em;margin-bottom:4px">FAILURES:</div>';
    for (const err of results.errors) {
      html += `<div style="color:var(--red);font-size:10px;padding:2px 0;border-bottom:1px solid rgba(255,34,68,.1)">✗ ${err}</div>`;
    }
    html += '</div>';
  }

  html += `<div style="color:var(--green);font-size:9px;letter-spacing:.1em;margin-bottom:4px">PASSED (${results.passed}):</div>`;
  html += `<div style="color:var(--text-dim);font-size:10px">Core Data · i18n · Items · Skills · Armor · Save/Load · Keys · Achievements · Craft · Nodes · World · Inventory</div>`;

  openModal('🧪 Тесты', html);
}
