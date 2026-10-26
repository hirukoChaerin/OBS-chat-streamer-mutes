'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { hashPassword, verifyPassword } = require('./lib/auth');

// ---------- Versión mínima de Node (parche de seguridad 24.22.1) ----------
{
  const [a, b, c] = process.versions.node.split('.').map(Number);
  if (a < 24 || (a === 24 && (b < 22 || (b === 22 && c < 1)))) {
    console.warn(`\n⚠  Estás usando Node ${process.version}. Actualiza a 24.22.1 o superior (corrige CVE en tls, dns y http).\n`);
  }
}

// ---------- Config ----------
const PORT = Number(process.env.PORT) || 3100;
const OVERLAY_KEY = process.env.OVERLAY_KEY || '';
const USERS_FILE = process.env.USERS_FILE || path.join(__dirname, 'data', 'users.json');
const MAX_LEN = Number(process.env.MAX_MESSAGE_LENGTH) || 200;
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS) || 1500;
const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_HOURS) || 12) * 3600 * 1000;
const HISTORY_SIZE = 50;

// ---------- Estado en memoria ----------
const sessions = new Map(); // token -> { username, expires }
const loginAttempts = new Map(); // "ip:<ip>" | "user:<usuario>" -> { count, reset }
const lastMsgAt = new Map(); // username -> timestamp
const history = [];
let users = {};
let DUMMY_HASH = '';

// ---------- HTTP ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e4,
  // Ping cada 10 s: detecta antes las conexiones caídas y, si algo en el camino bloquea
  // WebSocket y Socket.IO cae a long-polling, ninguna petición queda abierta más de ~10 s.
  pingInterval: 10000,
  pingTimeout: 20000,
});

// ---------- Usuarios ----------
function loadUsers() {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    console.log(`[users] ${Object.keys(users).length} usuario(s) cargado(s)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(`[users] No existe ${USERS_FILE}. Crea uno con: npm run add-user -- <usuario> <password>`);
    } else {
      console.error('[users] Error leyendo users.json (se mantiene la lista anterior):', err.message);
      return;
    }
    users = {};
  }
  // Si borraste a alguien del archivo, se le cierra la sesión al instante
  for (const [token, s] of sessions) {
    if (!users[s.username]) {
      sessions.delete(token);
      io.in(`user:${s.username}`).disconnectSockets(true);
    }
  }
}

function publicUser(username) {
  const u = users[username] || {};
  return {
    username,
    displayName: u.displayName || username,
    color: u.color || '#7c5cff',
  };
}

// ---------- Sesiones ----------
function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  if (typeof token !== 'string') return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now() || !users[s.username]) {
    sessions.delete(token);
    return null;
  }
  return s;
}

setInterval(() => {
  const now = Date.now();
  for (const [t, s] of sessions) if (s.expires < now) sessions.delete(t);
  for (const [ip, a] of loginAttempts) if (a.reset < now) loginAttempts.delete(ip);
}, 10 * 60 * 1000).unref();

// IP del visitante. Cloudflare Tunnel pone cf-connecting-ip (tiene prioridad).
// El login también se limita por usuario (ver tooManyAttempts), así que un atacante
// que reparta intentos entre muchas IP sigue frenado.
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return req.headers['cf-connecting-ip'] || fwd || req.socket.remoteAddress;
}

// ¿La petición viene directo de esta PC (OBS) y no de un túnel?
// El túnel manda el Host público (xxx.trycloudflare.com o tu dominio)
// y/o cabeceras de reenvío. OBS siempre usa http://localhost:3000.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const FORWARD_HEADERS = ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'forwarded'];
function isLocalRequest(headers) {
  if (FORWARD_HEADERS.some((h) => headers[h])) return false;
  const host = String(headers.host || '').toLowerCase();
  const hostname = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : host.split(':')[0];
  return LOCAL_HOSTS.has(hostname);
}

// Límite de intentos: 10 por usuario y 30 por IP cada 15 minutos.
function hit(key, limit) {
  const now = Date.now();
  let a = loginAttempts.get(key);
  if (!a || a.reset < now) {
    a = { count: 0, reset: now + 15 * 60 * 1000 };
    loginAttempts.set(key, a);
  }
  a.count++;
  return a.count > limit;
}
function tooManyAttempts(ip, username) {
  const byIp = hit(`ip:${ip}`, 30);
  const byUser = username ? hit(`user:${username}`, 10) : false;
  return byIp || byUser;
}

// ---------- API ----------
app.post('/api/login', async (req, res) => {
  const ip = clientIp(req);
  const { username, password } = req.body || {};
  const u = typeof username === 'string' ? username.trim().toLowerCase().slice(0, 64) : '';
  if (tooManyAttempts(ip, u)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }
  const user = Object.hasOwn(users, u) ? users[u] : null;
  // Se verifica contra un hash falso si el usuario no existe, para no revelar qué usuarios existen
  const ok = await verifyPassword(String(password ?? ''), user ? user.password : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  loginAttempts.delete(`user:${u}`);
  res.json({ token: createSession(u), user: publicUser(u), maxLength: MAX_LEN });
});

app.post('/api/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const s = sessions.get(token);
  sessions.delete(token);
  if (s) io.in(`token:${token}`).disconnectSockets(true);
  res.json({ ok: true });
});

// Errores (JSON malformado, body muy grande…): respuesta limpia, sin stack trace hacia el túnel
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[http]', err);
  res.status(status).json({ error: status < 500 ? 'Petición inválida' : 'Error interno' });
});

// ---------- Socket.IO ----------
function isExternal(socket) {
  return !isLocalRequest(socket.handshake.headers);
}

function onlineUsers() {
  const set = new Set();
  for (const s of io.sockets.sockets.values()) {
    if (s.data.role === 'chat') set.add(s.data.username);
  }
  return [...set].map(publicUser);
}

function broadcastPresence() {
  io.to('chat').emit('presence', onlineUsers());
}

function toOverlays(username) {
  return io.to(`overlay:${username}`).to('overlay:*');
}

io.use((socket, next) => {
  const auth = socket.handshake.auth || {};

  if (auth.role === 'overlay') {
    // Con OVERLAY_KEY: se exige la clave. Sin ella: solo se permite desde tu PC (no vía túnel).
    const allowed = OVERLAY_KEY ? auth.key === OVERLAY_KEY : !isExternal(socket);
    if (!allowed) return next(new Error('overlay_unauthorized'));
    socket.data.role = 'overlay';
    return next();
  }

  const s = getSession(auth.token);
  if (!s) return next(new Error('unauthorized'));
  socket.data.role = 'chat';
  socket.data.username = s.username;
  socket.data.token = auth.token;
  next();
});

io.on('connection', (socket) => {
  // ----- Overlay de OBS (solo escucha) -----
  if (socket.data.role === 'overlay') {
    const list = String(socket.handshake.auth.users || '*')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0 || list.includes('*')) socket.join('overlay:*');
    else list.forEach((u) => socket.join(`overlay:${u}`));
    return;
  }

  // ----- Usuario del chat -----
  const { username, token } = socket.data;
  socket.join(['chat', `user:${username}`, `token:${token}`]);
  socket.emit('init', {
    me: publicUser(username),
    history,
    online: onlineUsers(),
    maxLength: MAX_LEN,
  });
  broadcastPresence();

  socket.on('message', (text, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    if (!getSession(token)) {
      reply({ error: 'Tu sesión expiró' });
      return socket.disconnect(true);
    }
    if (typeof text !== 'string') return reply({ error: 'Mensaje inválido' });
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) return reply({ error: 'El mensaje está vacío' });
    if (text.length > MAX_LEN) return reply({ error: `Máximo ${MAX_LEN} caracteres` });

    const now = Date.now();
    if (now - (lastMsgAt.get(username) || 0) < COOLDOWN_MS) {
      return reply({ error: 'Vas muy rápido, espera un momento' });
    }
    lastMsgAt.set(username, now);

    const msg = { id: crypto.randomUUID(), ...publicUser(username), text, ts: now };
    history.push(msg);
    if (history.length > HISTORY_SIZE) history.shift();

    io.to('chat').to(`overlay:${username}`).to('overlay:*').emit('message', msg);
    reply({ ok: true });
  });

  let lastTypingAt = 0;
  socket.on('typing', (isTyping) => {
    const now = Date.now();
    if (isTyping && now - lastTypingAt < 500) return;
    lastTypingAt = now;
    toOverlays(username).emit('typing', { ...publicUser(username), typing: Boolean(isTyping) });
  });

  socket.on('disconnect', () => {
    toOverlays(username).emit('typing', { ...publicUser(username), typing: false });
    broadcastPresence();
  });
});

// ---------- Arranque ----------
(async () => {
  DUMMY_HASH = await hashPassword(crypto.randomBytes(8).toString('hex'));
  loadUsers();
  fs.watchFile(USERS_FILE, { interval: 2000 }, loadUsers);

  server.listen(PORT, () => {
    console.log(`\n  Chat:     http://localhost:${PORT}/`);
    console.log(`  Overlay:  http://localhost:${PORT}/overlay?user=<usuario>${OVERLAY_KEY ? '&key=<OVERLAY_KEY>' : ''}`);
    console.log(`  Prueba:   http://localhost:${PORT}/overlay?user=<usuario>&demo=1`);
    if (!OVERLAY_KEY) {
      console.log('  (Sin OVERLAY_KEY: el overlay solo funciona desde esta PC, no a través del túnel)\n');
    }
  });
})();
