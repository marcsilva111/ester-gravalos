'use strict';
/* =====================================================
   AVISOS AL MÓVIL (Web Push)
   =====================================================
   Envía notificaciones al teléfono y al escritorio sin depender de ningún
   paquete: todo lo que hace falta —firmar el permiso VAPID y cifrar el
   mensaje— está en el módulo «crypto» de Node.

   Dos normas de la especificación, por si hay que revisarlo:
     · RFC 8292 — VAPID: un JWT firmado con ES256 que identifica al servidor
       ante el servicio de notificaciones (Google, Apple, Mozilla).
     · RFC 8291 y RFC 8188 — el mensaje viaja cifrado de extremo a extremo con
       AES-128-GCM. Ni Google ni Apple pueden leer lo que se manda.
   ===================================================== */
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const buf = (x) => Buffer.isBuffer(x) ? x : Buffer.from(x);

/* Par de claves del servidor. La pública viaja al navegador; la privada
   firma cada envío y no sale de aquí. */
function generarClaves(){
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const cruda = Buffer.concat([Buffer.from([4]), deB64u(jwk.x), deB64u(jwk.y)]);
  return { publica: b64u(cruda), privada: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}

/* El permiso: un JWT que dice «este servidor puede escribirle a este
   navegador», firmado con la clave privada y válido doce horas. */
function permisoVapid(destino, privada, contacto){
  const origen = new URL(destino).origin;
  const cabecera = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const cuerpo = b64u(JSON.stringify({
    aud: origen,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: contacto || 'mailto:agenda@barcelonaglobal.org',
  }));
  const firma = crypto.sign('sha256', Buffer.from(cabecera + '.' + cuerpo),
    { key: privada, dsaEncoding: 'ieee-p1363' });   // r‖s en crudo, no DER
  return cabecera + '.' + cuerpo + '.' + b64u(firma);
}

/* El mensaje cifrado. Solo el navegador que se dio de alta puede abrirlo:
   la clave sale de combinar su clave pública con una efímera del servidor. */
function cifrar(texto, p256dh, auth){
  const clienteCruda = deB64u(p256dh);          // 65 bytes, punto sin comprimir
  const secreto = deB64u(auth);                 // 16 bytes
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const servidorCruda = ecdh.getPublicKey();
  const compartido = ecdh.computeSecret(clienteCruda);

  const infoClave = Buffer.concat([Buffer.from('WebPush: info\0'), clienteCruda, servidorCruda]);
  const ikm = buf(crypto.hkdfSync('sha256', compartido, secreto, infoClave, 32));

  const sal = crypto.randomBytes(16);
  const clave = buf(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = buf(crypto.hkdfSync('sha256', ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cifrador = crypto.createCipheriv('aes-128-gcm', clave, nonce);
  const contenido = Buffer.concat([
    cifrador.update(Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])])),  // 0x02 = último bloque
    cifrador.final(),
    cifrador.getAuthTag(),
  ]);

  const cabecera = Buffer.alloc(21 + servidorCruda.length);
  sal.copy(cabecera, 0);
  cabecera.writeUInt32BE(4096, 16);                 // tamaño de bloque
  cabecera.writeUInt8(servidorCruda.length, 20);
  servidorCruda.copy(cabecera, 21);
  return Buffer.concat([cabecera, contenido]);
}

/* Envía un aviso. Devuelve el código del servicio de notificaciones:
   404 y 410 significan que ese navegador ya no existe y hay que darlo de baja. */
function enviar(suscripcion, mensaje, claves, opciones){
  const o = opciones || {};
  return new Promise((resolve) => {
    let cuerpo, permiso, destino;
    try {
      destino = new URL(suscripcion.endpoint);
      cuerpo = cifrar(typeof mensaje === 'string' ? mensaje : JSON.stringify(mensaje),
        suscripcion.keys.p256dh, suscripcion.keys.auth);
      permiso = permisoVapid(suscripcion.endpoint, claves.privada, o.contacto);
    } catch (e) { return resolve({ ok: false, status: 0, error: e.message }); }

    // Los servicios reales son siempre https; se admite http para poder
    // probar el circuito completo contra un servicio simulado.
    const transporte = destino.protocol === 'http:' ? http : https;
    const req = transporte.request({
      protocol: destino.protocol,
      hostname: destino.hostname,
      port: destino.port || (destino.protocol === 'http:' ? 80 : 443),
      path: destino.pathname + destino.search,
      method: 'POST',
      headers: {
        'Authorization': 'vapid t=' + permiso + ', k=' + claves.publica,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'Content-Length': cuerpo.length,
        'TTL': String(o.ttl || 86400),
        'Urgency': o.urgencia || 'normal',
      },
      timeout: 12000,
    }, (res) => {
      res.resume();
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
    });
    req.on('timeout', () => { req.destroy(new Error('tiempo agotado')); });
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.end(cuerpo);
  });
}

module.exports = { generarClaves, enviar, cifrar, permisoVapid, b64u, deB64u };
