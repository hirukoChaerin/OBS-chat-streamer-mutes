/* Sonidos del chat: sintetizados con Web Audio (no hay que descargar nada) o
 * archivos propios en /sounds/ (mp3, ogg, wav).
 *   ChatSounds.play('ding', 0.6)       sonido sintetizado
 *   ChatSounds.play('ana.mp3', 0.6)    archivo public/sounds/ana.mp3
 * Los nombres deben coincidir con SOUND_PRESETS en lib/sounds.js.
 */
(function () {
  'use strict';

  // [tipo de onda, frecuencia inicial, frecuencia final, inicio (s), duración (s), volumen]
  const PRESETS = {
    pop: [['sine', 900, 380, 0, 0.09, 0.9]],
    ding: [['sine', 1318.5, 1318.5, 0, 0.8, 0.55], ['sine', 2637, 2637, 0, 0.3, 0.12]],
    blip: [['square', 660, 660, 0, 0.06, 0.18], ['square', 990, 990, 0.075, 0.09, 0.18]],
    chime: [['triangle', 784, 784, 0, 0.5, 0.5], ['triangle', 988, 988, 0.09, 0.5, 0.45], ['triangle', 1175, 1175, 0.18, 0.6, 0.4]],
    bubble: [['sine', 280, 950, 0, 0.13, 0.8]],
    boop: [['sine', 340, 210, 0, 0.2, 0.9]],
    knock: [['triangle', 190, 140, 0, 0.08, 1], ['triangle', 190, 140, 0.13, 0.08, 1]],
    sparkle: [['sine', 1568, 1568, 0, 0.18, 0.35], ['sine', 2093, 2093, 0.06, 0.18, 0.3], ['sine', 2637, 2637, 0.12, 0.25, 0.25]],
  };
  const FILE_RE = /^[\w-][\w.-]{0,63}\.(mp3|ogg|wav)$/i;

  let ctx = null;
  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // Los navegadores normales bloquean el audio hasta el primer clic o tecla.
  // OBS no tiene esa restricción, así que allí suena desde el primer mensaje.
  function unlock() { getCtx(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, unlock, { capture: true, passive: true })
  );

  function playPreset(name, volume) {
    const c = getCtx();
    if (!c) return;
    const notes = PRESETS[name] || PRESETS.pop;
    const t0 = c.currentTime + 0.01;
    const master = c.createGain();
    master.gain.value = volume;
    master.connect(c.destination);

    let last = null;
    let lastEnd = 0;
    for (const [type, f1, f2, at, dur, gain] of notes) {
      const osc = c.createOscillator();
      const env = c.createGain();
      const start = t0 + at;
      const end = start + dur;
      osc.type = type;
      osc.frequency.setValueAtTime(f1, start);
      if (f2 !== f1) osc.frequency.exponentialRampToValueAtTime(f2, end);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env).connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
      if (end > lastEnd) { lastEnd = end; last = osc; }
    }
    if (last) last.onended = () => master.disconnect();
  }

  const files = new Map();
  function playFile(name, volume) {
    let base = files.get(name);
    if (!base) {
      base = new Audio('/sounds/' + encodeURIComponent(name));
      base.preload = 'auto';
      files.set(name, base);
    }
    const a = base.cloneNode(); // permite que se solapen dos mensajes seguidos
    a.volume = volume;
    a.play().catch((err) => {
      // Archivo inexistente o formato no soportado: suena el sonido por defecto
      if (err && err.name !== 'NotAllowedError') playPreset('pop', volume);
    });
  }

  function play(sound, volume) {
    const v = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0.6));
    if (v === 0) return;
    if (typeof sound === 'string' && FILE_RE.test(sound)) playFile(sound, v);
    else playPreset(sound, v);
  }

  window.ChatSounds = { presets: Object.keys(PRESETS), play, unlock };
})();
