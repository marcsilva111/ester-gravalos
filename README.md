# Barcelona Global · Agenda Institucional

Prototipo de dashboard para gestionar la agenda institucional del presidente de Barcelona Global.

## Cómo ejecutarlo

**Modo compartido (recomendado)** — los datos viven en una base común y todos los usuarios (directora de Comunicación, presidente…) ven lo mismo y se actualizan solos:

```bash
node server.js
```

Abre `http://localhost:3000` (o la dirección del servidor donde lo despliegues: Render, Railway, un VPS…). No requiere `npm install`: el servidor no tiene dependencias. Los datos se guardan en `data/events.json`. La cabecera muestra el estado de conexión («Base compartida» / «Sin conexión»); si el servidor no responde, los cambios se conservan localmente y se reenvían al recuperar la conexión.

**Modo local** — abre `index.html` con doble clic en cualquier navegador, sin instalación. Los cambios se guardan solo en ese navegador (`localStorage`).

## Dos experiencias sobre una misma base de eventos

- **Agenda del Presidente** — vista de consulta: próximo compromiso con cuenta atrás, próximos 7 días, próximos eventos confirmados y pendientes de decisión. Optimizada para móvil.
- **Dashboard de Comunicación** — vista de gestión completa: tabla con edición rápida, tarjetas, calendario (mes / semana / agenda), buscador, filtros, creación y edición de eventos, e incidencias.

## Funcionalidades

- Control **«Presidente asiste»**: al activarlo el evento aparece en la agenda del presidente y se habilita el botón **«Añadir al calendario del presidente»** (sincronización con Outlook simulada, con estados: no sincronizado, sincronizando, sincronizado, actualización pendiente, error, retirado). Nunca se crean duplicados: se reutiliza el identificador del evento.
- Estados de evento: por valorar, pendiente de confirmación, confirmado, rechazado, delegado, cancelado, finalizado.
- Avisos de cambios recientes (ubicación, horario, intervención, briefing, acompañante, cancelación).
- Detección de incidencias: solapamientos, confirmados sin sincronizar, intervenciones sin briefing, eventos sin ubicación y cambios cerca de la fecha.
- Acciones con confirmación para operaciones delicadas (cancelar, delegar, retirar del calendario, archivar).
- Exportación a **ICS** (agenda completa o evento individual).
- Persistencia en `localStorage` (botón «Datos demo» para restaurar los datos de ejemplo).

## Datos de demostración

Incluye los eventos del calendario de comunicación de septiembre–diciembre de 2026 (Dinar G8, Hola Barcelona! Cocktail, COMEX, Kickoff Barcelona 2047, Barcelona on the Global Map…), enriquecidos con horarios, ubicaciones y documentación de ejemplo, más algunos eventos de julio para que el «próximo compromiso» quede cerca de la fecha actual.
