'use strict';
/* =====================================================
   Barcelona Global · Agenda Institucional — Backend
   Servidor Node.js sin dependencias externas.

   Uso:   node server.js         (http://localhost:3000)
          PORT=8080 node server.js

   Claves de acceso (cámbialas con variables de entorno):
     COMMS_PASSWORD      → rol "comms" (edición completa)
     PRESIDENT_PASSWORD  → rol "president" (solo consulta)

   API:
     POST /api/login    body { password }        → { token, role }
     POST /api/logout   body { token }           → { ok }
     GET  /api/events   (Authorization: Bearer)  → { version, events }
     GET  /api/version  (Authorization: Bearer)  → { version }
     PUT  /api/events   (solo rol comms)         → { version }

   Los datos se guardan en data/events.json y las sesiones
   en data/sessions.json (sobreviven a reinicios).
   ===================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'events.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const MAX_BODY = 8 * 1024 * 1024; // 8 MB

const PASSWORDS = {
  comms: process.env.COMMS_PASSWORD || 'comunicacio2026',
  president: process.env.PRESIDENT_PASSWORD || 'presidencia2026',
};

let store = { version: 0, events: null };
let sessions = {}; // token → role

function ensureDataDir(){
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function loadStore(){
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (parsed && Array.isArray(parsed.events)) store = { version: parsed.version || 1, events: parsed.events };
  } catch (e) { /* primera ejecución */ }
}
function saveStore(){
  try {
    ensureDataDir();
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) { console.error('No se pudo guardar data/events.json:', e.message); }
}
function loadSessions(){
  try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8')) || {}; } catch (e) { sessions = {}; }
}
function saveSessions(){
  try { ensureDataDir(); fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions)); } catch (e) { /* sin persistencia de sesiones */ }
}
function roleOf(req){
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  return m ? sessions[m[1]] || null : null;
}
function safeEqual(a, b){
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ics': 'text/calendar; charset=utf-8',
};

function sendJSON(res, code, obj){
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}
function readBody(req, res, cb){
  let body = '';
  let tooBig = false;
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY){ tooBig = true; req.destroy(); }
  });
  req.on('end', () => {
    if (tooBig) return;
    try { cb(JSON.parse(body || '{}')); }
    catch (e) { sendJSON(res, 400, { error: 'JSON no válido' }); }
  });
}

function handleAPI(req, res, pathname){
  if (req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  if (pathname === '/api/login' && req.method === 'POST'){
    return readBody(req, res, (data) => {
      const pass = data.password || '';
      let role = null;
      if (safeEqual(pass, PASSWORDS.comms)) role = 'comms';
      else if (safeEqual(pass, PASSWORDS.president)) role = 'president';
      if (!role) return sendJSON(res, 401, { error: 'Clave incorrecta' });
      const token = crypto.randomBytes(24).toString('hex');
      sessions[token] = role;
      saveSessions();
      sendJSON(res, 200, { token, role });
    });
  }
  if (pathname === '/api/logout' && req.method === 'POST'){
    return readBody(req, res, (data) => {
      if (data.token && sessions[data.token]){ delete sessions[data.token]; saveSessions(); }
      sendJSON(res, 200, { ok: true });
    });
  }

  const role = roleOf(req);
  if (!role) return sendJSON(res, 401, { error: 'No autorizado' });

  if (pathname === '/api/version' && req.method === 'GET')
    return sendJSON(res, 200, { version: store.version });

  if (pathname === '/api/events' && req.method === 'GET')
    return sendJSON(res, 200, { version: store.version, events: store.events, role });

  if (pathname === '/api/events' && req.method === 'PUT'){
    if (role !== 'comms') return sendJSON(res, 403, { error: 'El acceso de Presidencia es solo de consulta' });
    return readBody(req, res, (data) => {
      if (!data || !Array.isArray(data.events)) return sendJSON(res, 400, { error: 'Se esperaba { events: [...] }' });
      store.events = data.events;
      store.version += 1;
      saveStore();
      sendJSON(res, 200, { version: store.version });
    });
  }
  sendJSON(res, 404, { error: 'Ruta no encontrada' });
}

function serveStatic(req, res, pathname){
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT) || file.startsWith(DATA_DIR)){
    res.writeHead(403); return res.end('Prohibido');
  }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

loadStore();
loadSessions();
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) return handleAPI(req, res, pathname);
  if (req.method !== 'GET'){ res.writeHead(405); return res.end(); }
  serveStatic(req, res, pathname);
}).listen(PORT, () => {
  console.log('Agenda Barcelona Global disponible en http://localhost:' + PORT);
  const custom = process.env.COMMS_PASSWORD && process.env.PRESIDENT_PASSWORD;
  if (!custom) console.log('AVISO: usando claves por defecto. Cámbialas con COMMS_PASSWORD y PRESIDENT_PASSWORD.');
});
