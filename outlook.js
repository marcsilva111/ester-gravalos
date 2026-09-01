'use strict';
/* =====================================================
   Lectura del calendario de Outlook (formato iCalendar)

   No usa la API de Microsoft ni requiere permisos de informática:
   se suscribe al enlace .ics que genera Outlook al publicar un
   calendario. Es de solo lectura.

   Expone:
     fetchICS(url)              descarga el calendario
     parseICS(texto)            lo interpreta
     expandEvents(evs, opts)    despliega las series periódicas
     mergeIntoAgenda(...)       vuelca los eventos en la agenda
   ===================================================== */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

/* ---------- Descarga ---------- */
function fetchICS(url, redirects){
  return new Promise((resolve, reject) => {
    if ((redirects || 0) > 5) return reject(new Error('demasiadas redirecciones'));
    // Outlook ofrece el enlace como webcal://; es https por debajo.
    const clean = url.replace(/^webcal:\/\//i, 'https://');
    let parsed;
    try { parsed = new URL(clean); } catch (e) { return reject(new Error('la dirección del calendario no es válida')); }
    const lib = parsed.protocol === 'http:' ? http : https;
    lib.get(parsed, { headers: { 'User-Agent': 'agenda-barcelona-global', 'Accept': 'text/calendar' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location){
        res.resume();
        return resolve(fetchICS(new URL(res.headers.location, parsed).toString(), (redirects || 0) + 1));
      }
      if (res.statusCode !== 200){
        res.resume();
        return reject(new Error('el calendario respondió ' + res.statusCode));
      }
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { out += c; });
      res.on('end', () => resolve(out));
    }).on('error', (e) => reject(new Error('no se pudo descargar el calendario: ' + e.message)));
  });
}

/* ---------- Interpretación ---------- */
function unfold(text){
  // Las líneas largas se parten y continúan con un espacio o tabulador.
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}
function unescapeText(v){
  return String(v || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
}
// 20260907T140000Z | 20260907T140000 | 20260907
function parseStamp(value){
  const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  return {
    y: +m[1], m: +m[2], d: +m[3],
    hh: m[4] ? +m[4] : 0, mm: m[5] ? +m[5] : 0,
    utc: !!m[7], dateOnly: !m[4],
  };
}
function parseICS(text){
  const lines = unfold(text).split('\n');
  const events = [];
  let cur = null;
  for (const raw of lines){
    const line = raw.trim();
    if (!line) continue;
    if (line === 'BEGIN:VEVENT'){ cur = { exdates: [] }; continue; }
    if (line === 'END:VEVENT'){
      if (cur && cur.start) events.push(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const left = line.slice(0, sep);
    const value = line.slice(sep + 1);
    const [name, ...paramParts] = left.split(';');
    const params = {};
    paramParts.forEach((p) => {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    });
    const key = name.toUpperCase();
    if (key === 'UID') cur.uid = value.trim();
    else if (key === 'SUMMARY') cur.summary = unescapeText(value);
    else if (key === 'LOCATION') cur.location = unescapeText(value);
    else if (key === 'DESCRIPTION') cur.description = unescapeText(value);
    else if (key === 'ORGANIZER') cur.organizer = unescapeText((params.CN || '').trim());
    else if (key === 'STATUS') cur.status = value.trim().toUpperCase();
    else if (key === 'DTSTART'){ cur.start = parseStamp(value); cur.tzid = params.TZID || null; }
    else if (key === 'DTEND') cur.end = parseStamp(value);
    else if (key === 'RRULE') cur.rrule = value.trim();
    else if (key === 'EXDATE') value.split(',').forEach((v) => { const s = parseStamp(v); if (s) cur.exdates.push(s); });
    else if (key === 'RECURRENCE-ID') cur.recurrenceId = parseStamp(value);
  }
  return events;
}

/* ---------- Filtro por marca en el título ----------
   Permite que solo lleguen a la agenda los eventos que alguien haya
   marcado a propósito en Outlook (por ejemplo, con un asterisco). La
   marca es una instrucción, no parte del nombre: se retira del título
   antes de guardar el evento. */
function soloMarcados(events, marca){
  if (!marca) return events;
  const limpia = (t) => String(t || '')
    .split(marca).join(' ')          // quita todas las apariciones
    .replace(/\s+/g, ' ')
    .trim();
  return events
    .filter((ev) => String(ev.summary || '').includes(marca))
    .map((ev) => Object.assign({}, ev, { summary: limpia(ev.summary) || 'Sin título' }));
}

/* ---------- Zona horaria ---------- */
// Convierte un instante UTC al reloj de pared de la zona indicada.
function wallClockIn(dateUTC, tz){
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  f.formatToParts(dateUTC).forEach((x) => { p[x.type] = x.value; });
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}
// Devuelve el reloj de pared del evento en la zona de la agenda.
function toWall(stamp, tz){
  if (!stamp) return null;
  if (stamp.utc){
    const inst = new Date(Date.UTC(stamp.y, stamp.m - 1, stamp.d, stamp.hh, stamp.mm));
    return wallClockIn(inst, tz);
  }
  return { y: stamp.y, m: stamp.m, d: stamp.d, hh: stamp.hh, mm: stamp.mm };
}
// Para calcular repeticiones se usa una fecha en UTC como mero soporte,
// de modo que los cambios de hora no desplacen el reloj de pared.
const toKey = (w) => new Date(Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm));
const fromKey = (dt) => ({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), hh: dt.getUTCHours(), mm: dt.getUTCMinutes() });
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (w) => w.y + '-' + pad(w.m) + '-' + pad(w.d);
const fmtTime = (w) => pad(w.hh) + ':' + pad(w.mm);

/* ---------- Series periódicas ---------- */
const DAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseRRule(rrule){
  const out = {};
  String(rrule).split(';').forEach((part) => {
    const eq = part.indexOf('=');
    if (eq > 0) out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  });
  return out;
}
// Despliega las repeticiones dentro de la ventana pedida.
function expandOne(ev, opts){
  const tz = opts.tz;
  const startW = toWall(ev.start, tz);
  if (!startW) return [];
  const endW = ev.end ? toWall(ev.end, tz) : null;
  const durationMs = endW ? toKey(endW) - toKey(startW) : 0;
  const windowStart = toKey(opts.from);
  const windowEnd = toKey(opts.to);
  const excluded = new Set(ev.exdates.map((s) => fmtDate(toWall(s, tz))));

  const occurrences = [];
  const push = (w) => {
    if (excluded.has(fmtDate(w))) return;
    const k = toKey(w);
    if (k < windowStart || k > windowEnd) return;
    occurrences.push(w);
  };

  if (!ev.rrule){ push(startW); }
  else {
    const r = parseRRule(ev.rrule);
    const freq = (r.FREQ || '').toUpperCase();
    const interval = Math.max(1, parseInt(r.INTERVAL || '1', 10));
    const count = r.COUNT ? parseInt(r.COUNT, 10) : null;
    const until = r.UNTIL ? toKey(toWall(parseStamp(r.UNTIL), tz)) : null;
    const byDay = r.BYDAY ? r.BYDAY.split(',').map((d) => DAYS[d.slice(-2).toUpperCase()]).filter((n) => n !== undefined) : null;

    let cursor = toKey(startW);
    let emitted = 0;
    const limit = 2000;                       // tope de seguridad
    for (let i = 0; i < limit; i++){
      if (cursor > windowEnd) break;
      if (until && cursor > until) break;
      if (count && emitted >= count) break;

      if (freq === 'WEEKLY' && byDay && byDay.length){
        // Cada día señalado de la semana en curso
        const monday = new Date(cursor);
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        for (const dow of byDay.slice().sort()){
          const day = new Date(monday);
          day.setUTCDate(day.getUTCDate() + ((dow + 6) % 7));
          if (day < toKey(startW)) continue;
          if (until && day > until) continue;
          if (count && emitted >= count) break;
          if (day >= windowStart && day <= windowEnd) push(fromKey(day));
          if (day >= toKey(startW)) emitted++;
        }
        cursor = new Date(cursor); cursor.setUTCDate(cursor.getUTCDate() + 7 * interval);
        continue;
      }

      push(fromKey(cursor));
      emitted++;
      const next = new Date(cursor);
      if (freq === 'DAILY') next.setUTCDate(next.getUTCDate() + interval);
      else if (freq === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7 * interval);
      else if (freq === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + interval);
      else if (freq === 'YEARLY') next.setUTCFullYear(next.getUTCFullYear() + interval);
      else break;                              // periodicidad no contemplada: solo la primera
      cursor = next;
    }
  }

  return occurrences.map((w) => {
    const endOcc = durationMs ? fromKey(new Date(toKey(w).getTime() + durationMs)) : null;
    return {
      uid: ev.uid,
      key: ev.uid + (ev.rrule ? '#' + fmtDate(w) : ''),
      title: (ev.summary || 'Sin título').trim(),
      location: (ev.location || '').trim(),
      description: (ev.description || '').trim(),
      organizer: (ev.organizer || '').trim(),
      cancelled: ev.status === 'CANCELLED',
      allDay: !!ev.start.dateOnly,
      date: fmtDate(w),
      start: ev.start.dateOnly ? '' : fmtTime(w),
      end: ev.start.dateOnly || !endOcc ? '' : fmtTime(endOcc),
    };
  });
}
function expandEvents(events, opts){
  const all = [];
  events.forEach((ev) => {
    if (ev.recurrenceId) return;               // excepciones puntuales: no contempladas
    try { all.push(...expandOne(ev, opts)); } catch (e) { /* evento ilegible: se omite */ }
  });
  return all;
}

/* ---------- Volcado en la agenda ----------
   Regla de oro: Outlook manda en los datos del calendario (título,
   fecha, horario, lugar) y la agenda manda en todo lo demás. Lo que
   rellena Comunicación —asistencia, intervención, briefing,
   acompañante, responsable— nunca se sobrescribe. Los eventos creados
   a mano en la agenda no se tocan jamás. */
const idFor = (key) => 'ol-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
const aviso = (ev, mensaje) => {
  ev.changes = ev.changes || [];
  ev.changes.unshift({ ts: new Date().toISOString(), message: mensaje });
  ev.changes = ev.changes.slice(0, 20);
};

function mergeIntoAgenda(agenda, occurrences, opts){
  const interno = !!(opts && opts.interno);
  const resumen = { nuevos: 0, actualizados: 0, desaparecidos: 0, cancelados: 0 };
  // Solo se comparan los eventos del mismo calendario: los del otro no
  // deben darse por desaparecidos.
  const porClave = new Map();
  agenda.forEach((e) => { if (e.sourceKey && !!e.internal === interno) porClave.set(e.sourceKey, e); });
  const vistos = new Set();

  occurrences.forEach((o) => {
    vistos.add(o.key);
    const existente = porClave.get(o.key);

    if (!existente){
      agenda.push({
        id: idFor(o.key),
        sourceKey: o.key, sourceUid: o.uid, origin: 'outlook', internal: interno,
        title: o.title,
        organizer: o.organizer || '',
        date: o.date, start: o.start, end: o.end, arrival: '',
        location: o.location, address: o.location, mapLink: '',
        modality: 'presencial', description: o.description.slice(0, 500), link: '',
        type: 'extern',
        attends: 'si',
        missingFromSource: o.cancelled || false,
        speaks: false, speechType: '', speechDuration: '', speechLang: 'Catalán',
        keyMessage: '', contentOwner: '',
        owner: '', companion: '', orgContact: '', access: '', transport: '', notes: '',
        coverage: [], docs: [], changes: [], archived: false,
      });
      resumen.nuevos++;
      return;
    }

    // Solo se refrescan los datos que vienen del calendario.
    let cambiado = false;
    // Los importados con el flujo antiguo quedaron con la asistencia sin
    // decidir; si siguen llegando del calendario, son actos a los que va.
    if (existente.attends === 'pendent'){ existente.attends = 'si'; cambiado = true; }
    if (existente.title !== o.title){ existente.title = o.title; cambiado = true; }
    if (existente.date !== o.date){
      aviso(existente, 'La fecha ha cambiado en Outlook: ahora es el ' + o.date + '.');
      existente.date = o.date; cambiado = true;
    }
    if (existente.start !== o.start || existente.end !== o.end){
      aviso(existente, 'El horario se ha modificado en Outlook: ' + (o.start || 'sin hora') + (o.end ? ' – ' + o.end : '') + '.');
      if (existente.arrival) aviso(existente, 'Revisa la hora de llegada: seguía fijada a las ' + existente.arrival + '.');
      existente.start = o.start; existente.end = o.end; cambiado = true;
    }
    if (o.location && existente.location !== o.location){
      aviso(existente, 'La ubicación ha cambiado en Outlook: ' + o.location + '.');
      existente.location = o.location;
      existente.address = o.location;
      cambiado = true;
    }
    if (o.cancelled && !existente.missingFromSource){
      // Cancelado en origen: se retira de la agenda del presidente y queda
      // señalado para que Comunicación decida si lo borra.
      aviso(existente, 'El evento se ha cancelado en Outlook.');
      existente.missingFromSource = true; cambiado = true; resumen.cancelados++;
    }
    if (!o.cancelled && existente.missingFromSource){
      // Ha vuelto: se reincorpora a la agenda.
      aviso(existente, 'El evento ha vuelto a aparecer en el calendario de Outlook.');
      existente.missingFromSource = false; cambiado = true;
    }
    if (cambiado) resumen.actualizados++;
  });

  // Lo que ya no está en Outlook se señala, pero no se borra: puede
  // llevar trabajo hecho por Comunicación.
  porClave.forEach((ev, clave) => {
    if (vistos.has(clave) || ev.missingFromSource) return;
    ev.missingFromSource = true;
    aviso(ev, (opts && opts.marca)
      ? 'Este evento ya no lleva la marca «' + opts.marca + '» en Outlook, o se ha eliminado del calendario.'
      : 'Este evento ya no aparece en el calendario de Outlook.');
    resumen.desaparecidos++;
  });

  return resumen;
}

module.exports = { fetchICS, parseICS, soloMarcados, expandEvents, mergeIntoAgenda, wallClockIn };
