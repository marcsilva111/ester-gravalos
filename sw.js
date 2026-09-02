/* Service worker mínimo.
   No guarda nada en caché a propósito: la agenda cambia sola con el
   calendario de Outlook y una copia antigua enseñaría compromisos que ya no
   son. Existe solo para que el navegador ofrezca instalar la aplicación. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
