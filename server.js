'use strict';
/* =====================================================
   Barcelona Global · Agenda Institucional — Backend
   Servidor Node.js sin dependencias externas.

   Uso:   node server.js         (http://localhost:3000)
          PORT=8080 node server.js

   API:
     GET /api/events   → { version, events }
     GET /api/version  → { version }
     PUT /api/events   → body { events: [...] } → { version }

   Los datos se guardan en data/events.json. Todos los
   navegadores conectados comparten la misma base y se
   actualizan solos mediante sondeo de versión.
   ===================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'events.json');
const MAX_BODY = 8 * 1024 * 1024; // 8 MB

let store = { version: 0, events: null };

function loadStore(){
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.events)) store = { version: parsed.version || 1, events: parsed.events };
  } catch (e) { /* primera ejecución: sin datos todavía */ }
}
function saveStore(){
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) { console.error('No se pudo guardar data/events.json:', e.message); }
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
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function handleAPI(req, res, pathname){
  if (req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  if (pathname === '/api/version' && req.method === 'GET')
    return sendJSON(res, 200, { version: store.version });

  if (pathname === '/api/events' && req.method === 'GET')
    return sendJSON(res, 200, { version: store.version, events: store.events });

  if (pathname === '/api/events' && req.method === 'PUT'){
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY){ tooBig = true; req.destroy(); }
    });
    req.on('close', () => { if (tooBig) console.warn('PUT rechazado: cuerpo demasiado grande'); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (!parsed || !Array.isArray(parsed.events)) return sendJSON(res, 400, { error: 'Se esperaba { events: [...] }' });
        store.events = parsed.events;
        store.version += 1;
        saveStore();
        sendJSON(res, 200, { version: store.version });
      } catch (e) { sendJSON(res, 400, { error: 'JSON no válido' }); }
    });
    return;
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
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) return handleAPI(req, res, pathname);
  if (req.method !== 'GET'){ res.writeHead(405); return res.end(); }
  serveStatic(req, res, pathname);
}).listen(PORT, () => {
  console.log('Agenda Barcelona Global disponible en http://localhost:' + PORT);
  console.log('Datos compartidos en ' + DATA_FILE);
});
