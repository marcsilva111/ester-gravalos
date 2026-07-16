# Barcelona Global · Agenda Institucional

Prototipo de dashboard para gestionar la agenda institucional del presidente de Barcelona Global.

**Un único archivo (`index.html`), sin instalación:** descárgalo y ábrelo con doble clic en cualquier navegador.

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
