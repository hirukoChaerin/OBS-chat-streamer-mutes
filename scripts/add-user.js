#!/usr/bin/env node
'use strict';
/**
 * Gestión de usuarios (el servidor recarga users.json solo, sin reiniciar):
 *   npm run add-user -- <usuario> <password> ["Nombre visible"] ["#color"]
 *   npm run add-user -- --list
 *   npm run add-user -- --remove <usuario>
 *   npm run add-user -- --sound <usuario> <sonido>
 */
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../lib/auth');
const { SOUND_PRESETS, isValidSound, defaultSound } = require('../lib/sounds');

const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, '..', 'data', 'users.json');
const SOUNDS_DIR = path.join(__dirname, '..', 'public', 'sounds');
const PALETTE = ['#ff4d6d', '#4dabff', '#3ddc84', '#ffb020', '#b46bff', '#00d1c1', '#ff7a3d', '#f15bb5'];

function load() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
  fs.renameSync(tmp, USERS_FILE);
}

function usage() {
  console.log(`Uso:
  npm run add-user -- <usuario> <password> ["Nombre visible"] ["#color"]
  npm run add-user -- --list
  npm run add-user -- --remove <usuario>
  npm run add-user -- --sound <usuario> <sonido>

Sonidos: ${SOUND_PRESETS.join(', ')}
o un archivo propio dentro de public/sounds/ (ej. ana.mp3). Escúchalos en /sonidos`);
  process.exit(1);
}

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

// El primer sonido / color que nadie más usa, para que cada persona sea distinta.
// Cuenta también el sonido automático de los usuarios creados antes de existir los sonidos.
function nextFree(list, used, count) {
  return list.find((x) => !used.has(x)) || list[count % list.length];
}
function nextFreeSound(users) {
  const used = new Set(Object.entries(users).map(([name, u]) => (isValidSound(u.sound) ? u.sound : defaultSound(name))));
  return nextFree(SOUND_PRESETS, used, Object.keys(users).length);
}
function nextFreeColor(users) {
  const used = new Set(Object.values(users).map((u) => String(u.color).toLowerCase()));
  return nextFree(PALETTE, used, Object.keys(users).length);
}

(async () => {
  const args = process.argv.slice(2);
  const users = load();

  if (args[0] === '--list') {
    const names = Object.keys(users);
    if (!names.length) return console.log('No hay usuarios.');
    for (const u of names) {
      const sound = isValidSound(users[u].sound) ? users[u].sound : `${defaultSound(u)} (automático)`;
      console.log(`- ${u}  (${users[u].displayName}, ${users[u].color}, sonido: ${sound})`);
    }
    return;
  }

  if (args[0] === '--remove') {
    const u = (args[1] || '').toLowerCase();
    if (!Object.hasOwn(users, u)) fail(`No existe el usuario "${u}"`);
    delete users[u];
    save(users);
    return console.log(`Usuario "${u}" eliminado (su sesión se cierra al instante).`);
  }

  if (args[0] === '--sound') {
    const u = (args[1] || '').toLowerCase();
    const sound = args[2] || '';
    if (!u || !sound) usage();
    if (!Object.hasOwn(users, u)) fail(`No existe el usuario "${u}"`);
    if (!isValidSound(sound)) {
      fail(`Sonido no válido: "${sound}". Usa uno de: ${SOUND_PRESETS.join(', ')}, o un archivo .mp3/.ogg/.wav de public/sounds/`);
    }
    if (!SOUND_PRESETS.includes(sound) && !fs.existsSync(path.join(SOUNDS_DIR, sound))) {
      console.warn(`Aviso: no existe public/sounds/${sound}. Hasta que lo copies ahí, sonará "pop".`);
    }
    users[u].sound = sound;
    save(users);
    return console.log(`Sonido de "${u}": ${sound} (se aplica al siguiente mensaje, sin reiniciar).`);
  }

  const [rawName, password, displayName, color] = args;
  if (!rawName || !password || rawName.startsWith('--')) usage();

  const username = rawName.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,32}$/.test(username)) {
    fail('El usuario solo puede tener letras, números, "_", "." o "-" (2 a 32 caracteres).');
  }
  if (password.length < 4) fail('La contraseña debe tener al menos 4 caracteres.');
  if (color && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color)) {
    fail('El color debe ser hexadecimal, por ejemplo "#ff4d6d".');
  }

  const existing = Object.hasOwn(users, username) ? users[username] : null;
  const others = { ...users };
  delete others[username];
  users[username] = {
    displayName: displayName || existing?.displayName || rawName,
    color: color || existing?.color || nextFreeColor(others),
    sound: existing?.sound || nextFreeSound(others),
    password: await hashPassword(password),
  };
  save(users);
  const n = users[username];
  console.log(`${existing ? 'Actualizado' : 'Creado'}: ${username} → "${n.displayName}" ${n.color}, sonido: ${n.sound}`);
})();
