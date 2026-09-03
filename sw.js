/* Service worker.
   Dos cometidos, y ninguno es guardar copias: la agenda cambia sola con el
   calendario de Outlook y una copia antigua enseñaría compromisos que ya no
   son. Aquí solo se atienden los avisos y se deja que el navegador ofrezca
   instalar la aplicación. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { cuerpo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Agenda Barcelona Global', {
    body: d.cuerpo || '',
    icon: '/iconos/icono-192.png',
    badge: '/iconos/icono-192.png',
    lang: 'es',
    tag: 'agenda-nuevos',            // los avisos seguidos se agrupan en uno
    renotify: true,
    data: { url: d.url || '/' },
  }));
});

/* Al tocar el aviso se abre la agenda; si ya estaba abierta, se trae al frente. */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abiertas) => {
    for (const c of abiertas){
      if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(destino) : null;
  }));
});
