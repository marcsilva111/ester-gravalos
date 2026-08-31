# Barcelona Global · Agenda Institucional

Prototipo de dashboard para gestionar la agenda institucional del presidente de Barcelona Global.

## Cómo ejecutarlo

La misma página funciona de tres formas, y se adapta sola a cada una.

### 1. Online, sin instalar nada (versión publicada)

Publicada en claude.ai: <https://claude.ai/code/artifact/f8acea68-e7c9-4fd9-b1a4-84c392256191>

Los eventos viven en una base compartida en tiempo real: lo que guarda Comunicación aparece al instante en la pantalla del presidente. Los permisos los da el propio enlace al compartirlo:

| Se comparte como | Quién | Qué puede hacer |
|---|---|---|
| Puede editar | Dirección de Comunicación | Gestión completa de la agenda |
| Puede ver | Presidencia | Consulta de su agenda; la aplicación oculta la gestión y el servidor rechaza cualquier cambio |

Funciona en el móvil desde el navegador y se puede añadir a la pantalla de inicio como una app. Para regenerar esta versión tras editar `index.html`: `node build-artifact.js`.

### 2. En vuestro propio servidor

Los datos viven en una base común y todos los usuarios (directora de Comunicación, presidente…) ven lo mismo y se actualizan solos:

```bash
node server.js
```

Abre `http://localhost:3000` (o la dirección del servidor donde lo despliegues: Render, Railway, un VPS…). No requiere `npm install`: el servidor no tiene dependencias. Los datos se guardan en `data/events.json`. La cabecera muestra el estado de conexión («Base compartida» / «Sin conexión»); si el servidor no responde, los cambios se conservan localmente y se reenvían al recuperar la conexión.

#### Acceso con clave (solo en esta modalidad)

En modo compartido la aplicación pide una clave de acceso. Hay dos, cada una con su rol:

| Rol | Clave por defecto | Permisos |
|---|---|---|
| Comunicación | `comunicacio2026` | Gestión completa: crear, editar, sincronizar, eliminar |
| Presidencia | `presidencia2026` | Solo consulta de su agenda (el servidor rechaza cualquier escritura) |

**Cambia las claves antes de desplegar**, definiendo las variables de entorno:

```bash
COMMS_PASSWORD='clave-comunicacion' PRESIDENT_PASSWORD='clave-presidencia' node server.js
```

Las sesiones se guardan en `data/sessions.json` y sobreviven a reinicios del servidor. El botón «Salir» de la cabecera cierra la sesión.

### 3. Como archivo suelto

Abre `index.html` con doble clic en cualquier navegador, sin instalación. Los cambios se guardan solo en ese navegador (`localStorage`).

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
- Persistencia automática según la modalidad: base compartida en la versión online, `data/events.json` en el servidor propio o `localStorage` en el archivo suelto.

## Datos de demostración

Incluye los eventos del calendario de comunicación de septiembre–diciembre de 2026 (Dinar G8, Hola Barcelona! Cocktail, COMEX, Kickoff Barcelona 2047, Barcelona on the Global Map…), enriquecidos con horarios, ubicaciones y documentación de ejemplo, más algunos eventos de julio para que el «próximo compromiso» quede cerca de la fecha actual.
