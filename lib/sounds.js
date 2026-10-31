'use strict';
// Nombres de los sonidos sintetizados (definidos en public/sounds.js) y validación
// de archivos propios en public/sounds/. Lo usan server.js y scripts/add-user.js.

const SOUND_PRESETS = ['pop', 'ding', 'blip', 'chime', 'bubble', 'boop', 'knock', 'sparkle'];

// Solo un nombre de archivo, sin carpetas: "ana.mp3", "risa-luis.ogg"
const SOUND_FILE_RE = /^[\w-][\w.-]{0,63}\.(mp3|ogg|wav)$/i;

function isValidSound(s) {
  return typeof s === 'string' && (SOUND_PRESETS.includes(s) || SOUND_FILE_RE.test(s));
}

// Para usuarios creados antes de que existieran los sonidos: uno fijo según el nombre
function defaultSound(username) {
  let h = 0;
  for (const ch of String(username)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return SOUND_PRESETS[h % SOUND_PRESETS.length];
}

module.exports = { SOUND_PRESETS, isValidSound, defaultSound };
