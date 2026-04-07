// ═══════════════════════════════════════════
// SETTINGS SYSTEM
// ═══════════════════════════════════════════
const DEFAULT_SETTINGS = { masterVol:80, sfxVol:100, musicVol:60, scanlines:true, particles:true, screenShake:true, showFps:false, logSize:100, logOpacity:85, logMode:'normal', soundVis:true, autoSave:true, brightness:100, uiScale:100, btnSize:44, bloodEffects:true, nightFilter:true, tooltips:true, confirmDrop:true, autoLoot:false, combatPause:true, colorTheme:'green', invSort:'none', devMode:false, language:'ru' };
let settings = { ...DEFAULT_SETTINGS };

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('echo7_settings'));
    if (s) settings = { ...DEFAULT_SETTINGS, ...s };
  } catch(e) {}
}

function saveSettings() {
  localStorage.setItem('echo7_settings', JSON.stringify(settings));
  applySettings();
}

function applySettings() {
  // Scanlines
  document.body.style.setProperty('--scanline-opacity', settings.scanlines ? '1' : '0');
  document.body.classList.toggle('no-scanlines', !settings.scanlines);
  // Volume
  if (audioCtx && audioCtx._masterGain) {
    audioCtx._masterGain.gain.value = settings.masterVol / 100;
  }
  // Log overlay
  const log = document.getElementById('log');
  if (log) {
    log.style.setProperty('--log-opacity', (settings.logOpacity || 85) / 100);
    const maxH = settings.logMode === 'compact' ? '80px' : settings.logMode === 'minimal' ? '50px' : '120px';
    log.style.setProperty('--log-max-h', maxH);
    log.className = settings.logMode === 'compact' ? 'log-compact' : settings.logMode === 'minimal' ? 'log-minimal' : '';
  }
}

