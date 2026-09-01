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

Las sesiones van firmadas, no se guardan en ningún archivo y siguen siendo válidas 30 días aunque el servidor se reinicie.

Si no defines las claves, el servidor **genera dos al azar y las muestra en el registro de arranque** (cambian en cada reinicio): así el servicio nunca queda accesible con una contraseña conocida, pero tampoco es utilizable de verdad hasta que las definas.

### Conectar el calendario de Outlook (opcional)

La agenda puede leer sola un calendario de Outlook y volcar en ella los eventos, sin pedir nada a informática: se suscribe al enlace que genera Outlook al **publicar** un calendario. Es de solo lectura, no escribe nada en Outlook.

**En Outlook (web):** *Configuración → Calendario → Calendarios compartidos → Publicar un calendario*. Elige el calendario, permiso **Puede ver todos los detalles**, y **Publicar**. Copia el enlace **ICS** (no el HTML).

**En Render:** añade la variable `OUTLOOK_ICS_URL` con ese enlace. Opcionalmente `OUTLOOK_MARCA` (ver más abajo), `OUTLOOK_SYNC_MINUTES` (cada cuánto se lee, por defecto 15, mínimo 5), `AGENDA_TZ` (por defecto `Europe/Madrid`) y `OUTLOOK_MONTHS` (meses que se importan, por defecto 12).

**Importar solo lo marcado (recomendado)**

Define la variable `OUTLOOK_MARCA` con un símbolo, por ejemplo `*`. A partir de ahí **solo entran en la agenda los eventos cuyo título lleve esa marca**; todo lo demás —reuniones internas, asuntos personales, bloqueos de tiempo— se ignora por completo.

La directora escribe en Outlook `* Recepció al Consolat` y ese acto llega; escribe `Reunió d'equip` y no llega. **La marca se retira del título** al guardarlo: en la agenda aparece «Recepció al Consolat», limpio. Da igual dónde se ponga el asterisco: al principio, al final o pegado al texto.

Si más adelante quita la marca a un evento ya importado, este **no se borra**: se señala con el aviso «ya no lleva la marca «*» en Outlook», conservando el briefing y las decisiones que llevara. Sin esta variable se importa todo, como antes.

**Cómo se comporta**

- Outlook manda en el **título, la fecha, el horario y el lugar**: se actualizan solos.
- La agenda manda en **todo lo demás**. La asistencia, la intervención, el briefing, el acompañante y el responsable que rellene Comunicación no se sobrescriben nunca.
- Los eventos nuevos entran como **Por valorar** y con la asistencia **Pendiente**, para que Comunicación los triage; aparecen en «Pendientes de decisión».
- Los cambios de fecha, hora o lugar generan un **aviso** en la ficha y en la agenda del presidente.
- Si un evento desaparece de Outlook **no se borra**: se marca con un aviso, porque puede llevar trabajo hecho.
- Los eventos creados a mano en la agenda no se tocan jamás.
- Con `OUTLOOK_MARCA` definida, solo llegan los eventos marcados y el panel de Comunicación indica cuántos se han importado del total.
- Se admiten series periódicas (diarias, semanales con días concretos, mensuales y anuales, con `COUNT`, `UNTIL`, `INTERVAL` y excepciones). Las modificaciones sueltas de una repetición concreta no se importan.

**El retardo, que conviene conocer.** El servidor relee el calendario cada 15 minutos, y Comunicación puede forzarlo con el botón **Sincronizar Outlook**. Pero el propio enlace publicado por Microsoft se actualiza con su propio retraso —de unos minutos a algunas horas— y eso no depende de esta herramienta. Para reflejo inmediato haría falta la API de Microsoft Graph, que exige registrar una aplicación en Azure y permisos del administrador.

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
- **Código de vestimenta** por evento, visible en el próximo compromiso del presidente.
- **Archivos adjuntos** que sube Comunicación y abre el presidente.
- Exportación a **ICS** (agenda completa o evento individual).
- Persistencia automática según la modalidad: GitHub en el despliegue gratuito, `data/events.json` en un servidor propio o el navegador en el archivo suelto.

## Archivos adjuntos

Comunicación puede adjuntar archivos reales a cada evento (PDF, Word, PowerPoint, Excel, imágenes o texto, hasta 4 MB cada uno) desde el formulario del evento. El presidente los abre desde su ficha o directamente desde el recuadro del próximo compromiso, también en el móvil.

Los archivos **no** se guardan dentro de la agenda, sino como archivos sueltos junto a ella (`data/adjuntos/` en GitHub, una tabla `adjuntos` en Supabase o una carpeta en el disco), de modo que el JSON de eventos no engorda. Para servirlos hace falta sesión iniciada, con cualquiera de los dos roles; adjuntar y retirar es solo de Comunicación.

Si usas Supabase, crea también esta tabla:

```sql
create table if not exists adjuntos (
  id text primary key,
  contenido text not null
);
alter table adjuntos enable row level security;
```

En la versión suelta (archivo sin servidor) no se pueden subir archivos; ahí solo se anotan nombres o enlaces.

## Datos de demostración

Incluye los eventos del calendario de comunicación de septiembre–diciembre de 2026 (Dinar G8, Hola Barcelona! Cocktail, COMEX, Kickoff Barcelona 2047, Barcelona on the Global Map…), enriquecidos con horarios, ubicaciones y documentación de ejemplo, más algunos eventos de julio para que el «próximo compromiso» quede cerca de la fecha actual.
