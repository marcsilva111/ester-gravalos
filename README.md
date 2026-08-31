# Barcelona Global · Agenda Institucional

Prototipo de dashboard para gestionar la agenda institucional del presidente de Barcelona Global.

## Puesta en marcha (gratis)

Desplegado en Render con el plan gratuito. Los eventos **no** se guardan en el disco del servidor —que los alojamientos gratuitos borran en cada reinicio— sino en una rama del propio repositorio de GitHub. Así la agenda sobrevive a los reinicios sin pagar nada, y además cada cambio queda registrado en el historial del repositorio.

### 1. Crear el token de GitHub

En GitHub: *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.

- Repositorio: solo `ester-gravalos`.
- Permiso: **Contents → Read and write**.
- Copia el token; solo se muestra una vez.

### 2. Desplegar

1. Entra en <https://render.com> y crea una cuenta (no pide tarjeta para el plan gratuito).
2. **New → Blueprint** y conecta este repositorio. Render lee `render.yaml` y lo configura solo.
3. Escribe las tres variables que pedirá:
   - `COMMS_PASSWORD` → clave de la Dirección de Comunicación.
   - `PRESIDENT_PASSWORD` → clave de Presidencia.
   - `GITHUB_TOKEN` → el token del paso anterior.
4. **Apply**. En un par de minutos tendrás una dirección tipo `https://agenda-barcelona-global.onrender.com`.

Esa dirección es la que se pasa a la directora y al presidente. Cada uno entra con su clave, desde el ordenador o el móvil, y ve lo que le corresponde. En el móvil se puede añadir a la pantalla de inicio y queda como una app.

La rama de datos (`agenda-datos`) se crea sola en el primer guardado. Al ser una rama distinta de la del código, guardar la agenda **no** dispara despliegues.

### Dónde se guarda la agenda: dos opciones gratuitas

El servidor no depende de ninguna en concreto; se elige con variables de entorno. Ambas están probadas.

**Opción A · GitHub** (la que trae `render.yaml` por defecto)

Guarda la agenda en la rama `agenda-datos` de este mismo repositorio.

- No se pausa nunca y no hay nada más que dar de alta.
- Cada cambio queda como una versión en el historial: se ve qué cambió y cuándo, y se puede recuperar una versión anterior.
- Variables: `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_BRANCH`.

**Opción B · Supabase**

Una base de datos PostgreSQL de verdad, con plan gratuito de 500 MB.

1. Crea un proyecto en <https://supabase.com> (no pide tarjeta).
2. En el *SQL Editor*, ejecuta:

   ```sql
   create table if not exists agenda (
     id text primary key,
     version bigint not null default 0,
     events jsonb not null default '[]'::jsonb,
     updated_at timestamptz not null default now()
   );
   alter table agenda enable row level security;
   ```

3. En *Project Settings → API*, copia la URL del proyecto y la clave **service_role**.
4. En Render, define `SUPABASE_URL` y `SUPABASE_KEY` (y borra las variables de GitHub, o deja las dos: Supabase tiene prioridad).

> La clave *service_role* da acceso completo a la base de datos. Va únicamente en las variables del servidor y **nunca** en el navegador ni en el código del repositorio.

**Cuál elegir.** Para vuestro volumen —una agenda institucional que mantiene una persona— las dos van sobradas. GitHub es más sencilla (un token y nada más) y regala el historial de cambios, que en una agenda institucional viene muy bien. Supabase es la opción más sólida si algún día crecéis: varias personas editando a la vez, miles de eventos o consultas. Su pega es que **los proyectos gratuitos se pausan tras una semana sin actividad** y hay que reactivarlos a mano desde el panel, algo que en agosto puede pasar perfectamente.

### Lo que hay que saber del plan gratuito

El servicio de Render **se duerme tras unos 15 minutos sin visitas**, así que la primera carga después de un rato tarda cerca de un minuto; las siguientes son inmediatas. Los datos no se pierden nunca: están fuera del servidor.

Para evitar tanto esa espera como la pausa de Supabase, da de alta la dirección `https://…/api/ping` en un servicio gratuito de monitorización (UptimeRobot, cron-job.org) con una visita cada 10 minutos. Ese punto de control mantiene despierto el servidor y, si usas Supabase, también activa la base de datos. No requiere clave y no expone ningún dato.

### Claves y roles

| Rol | Variable | Permisos |
|---|---|---|
| Comunicación | `COMMS_PASSWORD` | Gestión completa: crear, editar y eliminar |
| Presidencia | `PRESIDENT_PASSWORD` | Solo consulta de su agenda; el servidor rechaza cualquier escritura |

Las sesiones van firmadas, no se guardan en ningún archivo y siguen siendo válidas 30 días aunque el servidor se reinicie. Si no defines las claves, se usan unas por defecto y el servidor lo avisa al arrancar: **defínelas siempre**.

### Otras formas de abrirlo

- **En un ordenador vuestro:** `COMMS_PASSWORD='...' PRESIDENT_PASSWORD='...' node server.js` y abrir `http://localhost:3000`. Sin las variables de GitHub, los datos se guardan en `data/events.json` (o donde indique `DATA_DIR`).
- **Como archivo suelto:** `index.html` con doble clic, sin instalación. Los cambios se guardan solo en ese navegador. Útil para enseñarlo.
- **Publicada en claude.ai:** <https://claude.ai/code/artifact/f8acea68-e7c9-4fd9-b1a4-84c392256191> — solo para miembros de la organización de Claude del propietario. Se regenera con `node build-artifact.js`.

## Dos experiencias sobre una misma base de eventos

- **Agenda del Presidente** — vista de consulta: próximo compromiso con cuenta atrás, próximos 7 días, próximos eventos confirmados y pendientes de decisión. Optimizada para móvil.
- **Dashboard de Comunicación** — vista de gestión completa: tabla con edición rápida, tarjetas, calendario (mes / semana / agenda), buscador, filtros, creación y edición de eventos, e incidencias.

## Funcionalidades

- Control **«Presidente asiste»**: al activarlo el evento aparece en la agenda del presidente y se habilitan los campos de su participación (intervención, tipo, duración, idioma, mensaje principal).
- Estados de evento: por valorar, pendiente de confirmación, confirmado, rechazado, delegado, cancelado, finalizado.
- Avisos de cambios recientes (ubicación, horario, intervención, briefing, acompañante, cancelación).
- Detección de incidencias: solapamientos, intervenciones sin briefing, eventos sin ubicación y cambios importantes cerca de la fecha.
- Acciones con confirmación para operaciones delicadas (cancelar, delegar, archivar, eliminar).
- Exportación a **ICS** (agenda completa o evento individual).
- Persistencia automática según la modalidad: GitHub en el despliegue gratuito, `data/events.json` en un servidor propio o el navegador en el archivo suelto.

## Datos de demostración

Incluye los eventos del calendario de comunicación de septiembre–diciembre de 2026 (Dinar G8, Hola Barcelona! Cocktail, COMEX, Kickoff Barcelona 2047, Barcelona on the Global Map…), enriquecidos con horarios, ubicaciones y documentación de ejemplo, más algunos eventos de julio para que el «próximo compromiso» quede cerca de la fecha actual.
