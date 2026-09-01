'use strict';
/* =====================================================
   Barcelona Global · Agenda Institucional — Servidor
   Node.js sin dependencias externas.

   Uso:   node server.js                  (http://localhost:3000)

   Claves de acceso (defínelas siempre en producción):
     COMMS_PASSWORD      → rol "comms" (gestión completa)
     PRESIDENT_PASSWORD  → rol "president" (solo consulta)

   Dónde se guardan los eventos (se elige con variables de entorno):
     · Supabase, si se definen SUPABASE_URL y SUPABASE_KEY. Es una base
       de datos de verdad; la clave debe ser la de servicio y no sale
       nunca del servidor.
         SUPABASE_TABLE  tabla (por defecto agenda)
         SUPABASE_ROW    fila  (por defecto principal)
     · Por defecto, en disco: data/events.json (o DATA_DIR).
     · Si se definen GITHUB_TOKEN y GITHUB_REPO, en un archivo de ese
       repositorio. Así la agenda sobrevive aunque el servidor se
       reinicie y borre su disco, que es lo que hacen los alojamientos
       gratuitos. Cada cambio queda además como una versión más en el
       historial del repositorio.
         GITHUB_REPO    propietario/repositorio
         GITHUB_BRANCH  rama de datos (por defecto agenda-datos)
         GITHUB_PATH    archivo (por defecto data/events.json)

   Calendario de Outlook (opcional, solo lectura):
     OUTLOOK_ICS_URL        enlace .ics del calendario publicado
     OUTLOOK_SYNC_MINUTES   cada cuánto se lee (por defecto 15)
     AGENDA_TZ              zona horaria (por defecto Europe/Madrid)
     OUTLOOK_MONTHS         meses hacia delante que se importan (12)
     OUTLOOK_MARCA          si se define (p. ej. *), solo se importan los
                            eventos cuyo título la lleve; la marca se
                            retira del título al guardarlos

   API:
     POST /api/login    { password }              → { token, role }
     POST /api/logout   { token }                 → { ok }
     GET  /api/events   (Authorization: Bearer)   → { version, events, role }
     GET  /api/version  (Authorization: Bearer)   → { version }
     GET  /api/ping     (sin autenticación)        → { ok }
     PUT  /api/events   (solo rol comms)          → { version }
     POST /api/import   (solo rol comms)          → { version, ... }
     POST /api/files    (solo rol comms)          → { id, name, size }
     GET  /api/files/:id                          → el archivo
     DELETE /api/files/:id (solo rol comms)       → { ok }
   ===================================================== */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const outlook = require('./outlook');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'events.json');
const MAX_BODY = 8 * 1024 * 1024;
const SESSION_DAYS = 30;

// Si no se definen las claves, se generan al azar y se muestran al
// arrancar. Nunca se usan claves por defecto conocidas: el servicio no
// puede quedar accesible con una contraseña que esté escrita en el
// repositorio.
const AVISOS = [];
function claveDe(nombre, variable){
  const v = process.env[variable];
  if (v) return v;
  const generada = crypto.randomBytes(9).toString('base64url');
  AVISOS.push('  ' + variable + ' no definida → clave temporal de ' + nombre + ': ' + generada);
  return generada;
}
const PASSWORDS = {
  comms: claveDe('Comunicación', 'COMMS_PASSWORD'),
  president: claveDe('Presidencia', 'PRESIDENT_PASSWORD'),
};
// Firma las sesiones. Si no se define, se deriva de las claves: así las
// sesiones siguen siendo válidas tras reiniciar, sin guardar nada.
const SECRET = process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(PASSWORDS.comms + '|' + PASSWORDS.president).digest('hex');

const GH = {
  token: process.env.GITHUB_TOKEN || '',
  repo: process.env.GITHUB_REPO || '',
  branch: process.env.GITHUB_BRANCH || 'agenda-datos',
  file: process.env.GITHUB_PATH || 'data/events.json',
  api: process.env.GITHUB_API || 'https://api.github.com',
  sha: null,
};
const usingGitHub = () => !!(GH.token && GH.repo);

const SB = {
  url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  key: process.env.SUPABASE_KEY || '',
  table: process.env.SUPABASE_TABLE || 'agenda',
  row: process.env.SUPABASE_ROW || 'principal',
};
const usingSupabase = () => !!(SB.url && SB.key);

// Lectura automática del calendario de Outlook (enlace .ics publicado)
const ICS = {
  url: process.env.OUTLOOK_ICS_URL || '',
  minutes: Math.max(5, Number(process.env.OUTLOOK_SYNC_MINUTES || 15)),
  tz: process.env.AGENDA_TZ || 'Europe/Madrid',
  months: Math.max(1, Number(process.env.OUTLOOK_MONTHS || 12)),
  // Se admite el valor tal cual se pegue: con espacios o entrecomillado.
  marca: String(process.env.OUTLOOK_MARCA || '').trim().replace(/^["']|["']$/g, ''),   // vacío = se importa todo
  last: null,        // { ts, ok, resumen | error }
  running: false,
};
const usingOutlook = () => !!ICS.url;

async function importarDeOutlook(){
  if (!usingOutlook() || ICS.running) return ICS.last;
  ICS.running = true;
  try {
    const texto = await outlook.fetchICS(ICS.url);
    const hoy = new Date();
    const desde = new Date(hoy.getTime() - 30 * 864e5);      // un mes atrás, por si se retocan eventos pasados
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + ICS.months, hoy.getDate());
    const partes = (d) => ({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), hh: 0, mm: 0 });
    const todos = outlook.parseICS(texto);
    // Si se ha fijado una marca, solo entran los eventos que la llevan.
    const elegidos = outlook.soloMarcados(todos, ICS.marca);
    const ocurrencias = outlook.expandEvents(elegidos,
      { tz: ICS.tz, from: partes(desde), to: partes(hasta) });
    if (!Array.isArray(store.events)) store.events = [];
    const resumen = outlook.mergeIntoAgenda(store.events, ocurrencias, { marca: ICS.marca });
    const huboCambios = resumen.nuevos || resumen.actualizados || resumen.desaparecidos || resumen.cancelados;
    if (huboCambios){ store.version += 1; scheduleSave(); }
    ICS.last = { ts: new Date().toISOString(), ok: true, resumen, leidos: ocurrencias.length, enCalendario: todos.length, marca: ICS.marca };
    console.log('Outlook: ' + ocurrencias.length + ' eventos importados' +
      (ICS.marca ? ' de ' + todos.length + ' (solo los marcados con «' + ICS.marca + '»)' : '') + ' · ' +
      resumen.nuevos + ' nuevos, ' + resumen.actualizados + ' actualizados, ' +
      resumen.desaparecidos + ' ya no están.');
  } catch (e) {
    ICS.last = { ts: new Date().toISOString(), ok: false, error: e.message };
    console.error('Outlook: no se pudo leer el calendario:', e.message);
  }
  ICS.running = false;
  return ICS.last;
}

let store = { version: 0, events: null };
let flushTimer = null;
let flushing = false;
let pendingFlush = false;

/* ---------- Sesiones firmadas (sin almacenamiento) ---------- */
function signToken(role){
  const exp = Date.now() + SESSION_DAYS * 864e5;
  const body = role + '.' + exp;
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return body + '.' + mac;
}
function roleOf(req){
  const m = (req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const [role, exp, mac] = parts;
  if (!(role === 'comms' || role === 'president')) return null;
  if (!(Number(exp) > Date.now())) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(role + '.' + exp).digest('hex');
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return role;
}
function samePassword(a, b){
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/* ---------- Almacenamiento en GitHub ---------- */
function ghRequest(method, urlPath, body){
  return new Promise((resolve, reject) => {
    const url = new URL(GH.api + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const req = (url.protocol === 'http:' ? http : https).request({
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      headers: Object.assign({
        'Authorization': 'Bearer ' + GH.token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'agenda-barcelona-global',
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = out ? JSON.parse(out) : null; } catch (e) { /* respuesta no JSON */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
// La rama de datos debe existir; si no, se crea a partir de la rama principal.
async function ghEnsureBranch(){
  const ref = await ghRequest('GET', '/repos/' + GH.repo + '/git/ref/heads/' + GH.branch);
  if (ref.status === 200) return true;
  const repo = await ghRequest('GET', '/repos/' + GH.repo);
  if (repo.status !== 200) return false;
  const base = await ghRequest('GET', '/repos/' + GH.repo + '/git/ref/heads/' + repo.body.default_branch);
  if (base.status !== 200) return false;
  const made = await ghRequest('POST', '/repos/' + GH.repo + '/git/refs',
    { ref: 'refs/heads/' + GH.branch, sha: base.body.object.sha });
  return made.status === 201;
}
async function ghLoad(){
  const r = await ghRequest('GET', '/repos/' + GH.repo + '/contents/' + GH.file + '?ref=' + GH.branch);
  if (r.status === 404) return null;                    // todavía no hay agenda guardada
  if (r.status !== 200 || !r.body || !r.body.content) throw new Error('GitHub respondió ' + r.status);
  GH.sha = r.body.sha;
  return JSON.parse(Buffer.from(r.body.content, 'base64').toString('utf8'));
}
async function ghSave(){
  const payload = {
    message: 'Actualizar la agenda (' + (store.events || []).length + ' eventos)',
    content: Buffer.from(JSON.stringify(store, null, 2), 'utf8').toString('base64'),
    branch: GH.branch,
  };
  if (GH.sha) payload.sha = GH.sha;
  let r = await ghRequest('PUT', '/repos/' + GH.repo + '/contents/' + GH.file, payload);
  if (r.status === 409 || r.status === 422){
    // Otro proceso escribió antes: se relee la versión actual y se reintenta una vez.
    const cur = await ghRequest('GET', '/repos/' + GH.repo + '/contents/' + GH.file + '?ref=' + GH.branch);
    if (cur.status === 200 && cur.body){ payload.sha = cur.body.sha; }
    else { delete payload.sha; }
    r = await ghRequest('PUT', '/repos/' + GH.repo + '/contents/' + GH.file, payload);
  }
  if (r.status !== 200 && r.status !== 201) throw new Error('GitHub respondió ' + r.status);
  GH.sha = r.body && r.body.content ? r.body.content.sha : GH.sha;
}

/* ---------- Almacenamiento en Supabase ---------- */
function sbRequest(method, urlPath, body, extraHeaders){
  return new Promise((resolve, reject) => {
    const url = new URL(SB.url + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const req = (url.protocol === 'http:' ? http : https).request({
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'http:' ? 80 : 443),
      path: url.pathname + url.search,
      headers: Object.assign({
        'apikey': SB.key,
        'Authorization': 'Bearer ' + SB.key,
        'Accept': 'application/json',
      }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, extraHeaders || {}),
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = out ? JSON.parse(out) : null; } catch (e) { /* respuesta no JSON */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
async function sbLoad(){
  const r = await sbRequest('GET', '/rest/v1/' + SB.table + '?id=eq.' + encodeURIComponent(SB.row) + '&select=version,events');
  if (r.status !== 200) throw new Error('Supabase respondió ' + r.status + (r.body && r.body.message ? ': ' + r.body.message : ''));
  const row = Array.isArray(r.body) ? r.body[0] : null;
  if (!row) return null;                                  // todavía no hay agenda guardada
  return { version: row.version || 0, events: row.events || [] };
}
async function sbSave(){
  const r = await sbRequest('POST', '/rest/v1/' + SB.table,
    [{ id: SB.row, version: store.version, events: store.events || [] }],
    { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  if (r.status !== 200 && r.status !== 201 && r.status !== 204)
    throw new Error('Supabase respondió ' + r.status + (r.body && r.body.message ? ': ' + r.body.message : ''));
}

/* ---------- Archivos adjuntos ----------
   Los adjuntos se guardan como archivos sueltos junto a la agenda, no
   dentro de ella: así el JSON de eventos no engorda y cada documento
   se puede servir por separado. */
const ADJ_DIR = 'data/adjuntos/';
const MAX_ADJUNTO = 4 * 1024 * 1024;   // 4 MB por archivo
const TIPOS = {
  pdf:'application/pdf', doc:'application/msword',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt:'application/vnd.ms-powerpoint',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls:'application/vnd.ms-excel',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
  webp:'image/webp', txt:'text/plain; charset=utf-8', md:'text/markdown; charset=utf-8',
  csv:'text/csv; charset=utf-8', ics:'text/calendar; charset=utf-8',
};
const extDe = (nombre) => String(nombre || '').toLowerCase().split('.').pop();
const tipoDe = (id) => TIPOS[extDe(id)] || 'application/octet-stream';

async function adjuntoGuardar(id, buffer){
  if (usingSupabase()){
    const r = await sbRequest('POST', '/rest/v1/adjuntos',
      [{ id, contenido: buffer.toString('base64') }],
      { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
    if (![200,201,204].includes(r.status)) throw new Error('Supabase respondió ' + r.status);
    return;
  }
  if (usingGitHub()){
    const r = await ghRequest('PUT', '/repos/' + GH.repo + '/contents/' + ADJ_DIR + id,
      { message: 'Adjuntar ' + id, content: buffer.toString('base64'), branch: GH.branch });
    if (![200,201].includes(r.status)) throw new Error('GitHub respondió ' + r.status);
    return;
  }
  const dir = path.join(DATA_DIR, 'adjuntos');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id), buffer);
}
async function adjuntoLeer(id){
  if (usingSupabase()){
    const r = await sbRequest('GET', '/rest/v1/adjuntos?id=eq.' + encodeURIComponent(id) + '&select=contenido');
    const fila = Array.isArray(r.body) ? r.body[0] : null;
    if (!fila) return null;
    return Buffer.from(fila.contenido, 'base64');
  }
  if (usingGitHub()){
    const r = await ghRequest('GET', '/repos/' + GH.repo + '/contents/' + ADJ_DIR + id + '?ref=' + GH.branch);
    if (r.status !== 200 || !r.body || !r.body.content) return null;
    return Buffer.from(r.body.content, 'base64');
  }
  const f = path.join(DATA_DIR, 'adjuntos', id);
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
}
async function adjuntoBorrar(id){
  try {
    if (usingSupabase()){ await sbRequest('DELETE', '/rest/v1/adjuntos?id=eq.' + encodeURIComponent(id)); return; }
    if (usingGitHub()){
      const cur = await ghRequest('GET', '/repos/' + GH.repo + '/contents/' + ADJ_DIR + id + '?ref=' + GH.branch);
      if (cur.status === 200 && cur.body)
        await ghRequest('DELETE', '/repos/' + GH.repo + '/contents/' + ADJ_DIR + id,
          { message: 'Retirar ' + id, sha: cur.body.sha, branch: GH.branch });
      return;
    }
    const f = path.join(DATA_DIR, 'adjuntos', id);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  } catch (e) { console.error('No se pudo borrar el adjunto:', e.message); }
}

/* ---------- Almacenamiento en disco ---------- */
function diskLoad(){
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (parsed && Array.isArray(parsed.events)) return parsed;
  } catch (e) { /* primera ejecución */ }
  return null;
}
function diskSave(){
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, DATA_FILE);
}

/* ---------- Carga y guardado ---------- */
async function loadStore(){
  let loaded = null;
  if (usingSupabase()){
    try {
      loaded = await sbLoad();
      console.log(loaded ? 'Agenda cargada desde Supabase (' + loaded.events.length + ' eventos).'
                         : 'Sin agenda previa en Supabase: se creará con el primer cambio.');
    } catch (e) {
      console.error('No se pudo leer la agenda de Supabase:', e.message);
    }
  } else if (usingGitHub()){
    try {
      await ghEnsureBranch();
      loaded = await ghLoad();
      console.log(loaded ? 'Agenda cargada desde GitHub (' + loaded.events.length + ' eventos).'
                         : 'Sin agenda previa en GitHub: se creará con el primer cambio.');
    } catch (e) {
      console.error('No se pudo leer la agenda de GitHub:', e.message);
    }
  } else {
    loaded = diskLoad();
  }
  if (loaded && Array.isArray(loaded.events)) store = { version: loaded.version || 1, events: loaded.events };
}
// Se agrupan los cambios seguidos en un solo guardado.
function scheduleSave(){
  if (!usingGitHub() && !usingSupabase()){ try { diskSave(); } catch (e) { console.error('No se pudo guardar:', e.message); } return; }
  pendingFlush = true;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 2000);
}
async function flush(){
  if (flushing || !pendingFlush) return;
  flushing = true; pendingFlush = false;
  try { await (usingSupabase() ? sbSave() : ghSave()); }
  catch (e) {
    console.error('No se pudo guardar la agenda:', e.message);
    pendingFlush = true;
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 10000);   // reintento
  }
  flushing = false;
  if (pendingFlush){ clearTimeout(flushTimer); flushTimer = setTimeout(flush, 2000); }
}

function outlookEstado(){
  if (!usingOutlook()) return { configurado: false };
  return { configurado: true, minutos: ICS.minutes, marca: ICS.marca, ultima: ICS.last };
}

/* ---------- HTTP ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ics': 'text/calendar; charset=utf-8',
};
function sendJSON(res, code, obj){
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, res, cb){
  let body = '', tooBig = false;
  req.on('data', (chunk) => { body += chunk; if (body.length > MAX_BODY){ tooBig = true; req.destroy(); } });
  req.on('end', () => {
    if (tooBig) return;
    try { cb(JSON.parse(body || '{}')); }
    catch (e) { sendJSON(res, 400, { error: 'JSON no válido' }); }
  });
}
function handleAPI(req, res, pathname){
  if (pathname === '/api/login' && req.method === 'POST'){
    return readBody(req, res, (data) => {
      const pass = data.password || '';
      let role = null;
      if (samePassword(pass, PASSWORDS.comms)) role = 'comms';
      else if (samePassword(pass, PASSWORDS.president)) role = 'president';
      if (!role) return sendJSON(res, 401, { error: 'Clave incorrecta' });
      sendJSON(res, 200, { token: signToken(role), role });
    });
  }
  if (pathname === '/api/logout' && req.method === 'POST')
    return readBody(req, res, () => sendJSON(res, 200, { ok: true }));

  // Punto de control para servicios de monitorización: mantiene el
  // servicio despierto y, con Supabase, evita que el proyecto se pause
  // por inactividad. No devuelve ningún dato.
  if (pathname === '/api/ping' && req.method === 'GET'){
    if (usingSupabase()) sbLoad().catch(() => {});
    return sendJSON(res, 200, { ok: true });
  }

  const role = roleOf(req);
  if (!role) return sendJSON(res, 401, { error: 'No autorizado' });

  if (pathname === '/api/version' && req.method === 'GET')
    return sendJSON(res, 200, { version: store.version });

  if (pathname === '/api/events' && req.method === 'GET')
    return sendJSON(res, 200, { version: store.version, events: store.events, role, outlook: outlookEstado() });

  // Descarga de un adjunto: cualquiera de los dos roles puede abrirlo.
  const mAdj = pathname.match(/^\/api\/files\/([A-Za-z0-9._-]{1,80})$/);
  if (mAdj && req.method === 'GET'){
    return adjuntoLeer(mAdj[1]).then((buf) => {
      if (!buf) return sendJSON(res, 404, { error: 'El archivo ya no está disponible' });
      res.writeHead(200, { 'Content-Type': tipoDe(mAdj[1]), 'Cache-Control': 'private, max-age=300' });
      res.end(buf);
    }).catch(() => sendJSON(res, 500, { error: 'No se pudo recuperar el archivo' }));
  }
  if (mAdj && req.method === 'DELETE'){
    if (role !== 'comms') return sendJSON(res, 403, { error: 'Solo Comunicación puede retirar archivos' });
    return adjuntoBorrar(mAdj[1]).then(() => sendJSON(res, 200, { ok: true }));
  }
  if (pathname === '/api/files' && req.method === 'POST'){
    if (role !== 'comms') return sendJSON(res, 403, { error: 'Solo Comunicación puede adjuntar archivos' });
    return readBody(req, res, (data) => {
      const nombre = String(data.name || '').trim();
      const ext = extDe(nombre);
      if (!nombre || !TIPOS[ext])
        return sendJSON(res, 400, { error: 'Formato no admitido. Usa PDF, Word, PowerPoint, Excel, imagen o texto.' });
      let buf;
      try { buf = Buffer.from(String(data.data || ''), 'base64'); } catch (e) { buf = null; }
      if (!buf || !buf.length) return sendJSON(res, 400, { error: 'El archivo llegó vacío' });
      if (buf.length > MAX_ADJUNTO)
        return sendJSON(res, 413, { error: 'El archivo pesa demasiado. El máximo es 4 MB.' });
      const id = crypto.randomBytes(8).toString('hex') + '.' + ext;
      adjuntoGuardar(id, buf)
        .then(() => sendJSON(res, 200, { id, name: nombre, size: buf.length }))
        .catch((e) => sendJSON(res, 500, { error: 'No se pudo guardar el archivo: ' + e.message }));
    });
  }

  if (pathname === '/api/import' && req.method === 'POST'){
    if (role !== 'comms') return sendJSON(res, 403, { error: 'Solo Comunicación puede sincronizar' });
    if (!usingOutlook()) return sendJSON(res, 400, { error: 'No hay ningún calendario de Outlook configurado' });
    return importarDeOutlook().then(() => sendJSON(res, 200, Object.assign({ version: store.version }, outlookEstado())));
  }

  if (pathname === '/api/events' && req.method === 'PUT'){
    if (role !== 'comms') return sendJSON(res, 403, { error: 'El acceso de Presidencia es solo de consulta' });
    return readBody(req, res, (data) => {
      if (!data || !Array.isArray(data.events)) return sendJSON(res, 400, { error: 'Se esperaba { events: [...] }' });
      store.events = data.events;
      store.version += 1;
      scheduleSave();
      sendJSON(res, 200, { version: store.version });
    });
  }
  sendJSON(res, 404, { error: 'Ruta no encontrada' });
}
function serveStatic(req, res, pathname){
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT) || file.startsWith(DATA_DIR)){ res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

loadStore().then(() => {
  http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.startsWith('/api/')) return handleAPI(req, res, pathname);
    if (req.method !== 'GET'){ res.writeHead(405); return res.end(); }
    serveStatic(req, res, pathname);
  }).listen(PORT, () => {
    console.log('Agenda Barcelona Global en http://localhost:' + PORT);
    console.log('Datos: ' + (usingSupabase() ? 'Supabase (tabla ' + SB.table + ')'
      : usingGitHub() ? 'GitHub ' + GH.repo + ' (rama ' + GH.branch + ')' : DATA_FILE));
    if (AVISOS.length){
      console.log('');
      console.log('ATENCIÓN: faltan claves de acceso en las variables de entorno.');
      AVISOS.forEach((a) => console.log(a));
      console.log('  Estas claves cambian en cada reinicio. Defínelas en el panel del servicio.');
      console.log('');
    }
    if (usingOutlook()){
      console.log('Calendario de Outlook: se leerá cada ' + ICS.minutes + ' minutos (zona ' + ICS.tz + ').');
      importarDeOutlook();
      setInterval(importarDeOutlook, ICS.minutes * 60000);
    }
    if (!usingGitHub() && !usingSupabase())
      console.log('ATENCIÓN: la agenda se guarda en el disco del servidor. En un alojamiento\n' +
                  '  gratuito ese disco se borra al reiniciar. Define GITHUB_TOKEN y GITHUB_REPO.');
  });
});
// Último intento de guardado si la plataforma detiene el servicio.
process.on('SIGTERM', () => { flush().finally(() => process.exit(0)); });
