#!/usr/bin/env node
'use strict';
/**
 * Gestión de usuarios (el servidor recarga users.json solo, sin reiniciar):
 *   npm run add-user -- <usuario> <password> ["Nombre visible"] ["#color"]
 *   npm run add-user -- --list
 *   npm run add-user -- --remove <usuario>
 */
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('../lib/auth');

const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, '..', 'data', 'users.json');
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
  npm run add-user -- --remove <usuario>`);
  process.exit(1);
}

(async () => {
  const args = process.argv.slice(2);
  const users = load();

  if (args[0] === '--list') {
    const names = Object.keys(users);
    if (!names.length) return console.log('No hay usuarios.');
    for (const u of names) console.log(`- ${u}  (${users[u].displayName}, ${users[u].color})`);
    return;
  }

  if (args[0] === '--remove') {
    const u = (args[1] || '').toLowerCase();
    if (!users[u]) return console.error(`No existe el usuario "${u}"`), process.exit(1);
    delete users[u];
    save(users);
    return console.log(`Usuario "${u}" eliminado (su sesión se cierra al instante).`);
  }

  const [rawName, password, displayName, color] = args;
  if (!rawName || !password) usage();

  const username = rawName.trim().toLowerCase();
  if (!/^[a-z0-9_.-]{2,32}$/.test(username)) {
    console.error('El usuario solo puede tener letras, números, "_", "." o "-" (2 a 32 caracteres).');
    process.exit(1);
  }
  if (password.length < 4) {
    console.error('La contraseña debe tener al menos 4 caracteres.');
    process.exit(1);
  }
  if (color && !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color)) {
    console.error('El color debe ser hexadecimal, por ejemplo "#ff4d6d".');
    process.exit(1);
  }

  const existing = users[username];
  users[username] = {
    displayName: displayName || existing?.displayName || rawName,
    color: color || existing?.color || PALETTE[Object.keys(users).length % PALETTE.length],
    password: await hashPassword(password),
  };
  save(users);
  console.log(`${existing ? 'Actualizado' : 'Creado'}: ${username} → "${users[username].displayName}" ${users[username].color}`);
})();
