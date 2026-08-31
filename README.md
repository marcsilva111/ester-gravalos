# Barcelona Global · Agenda Institucional

Prototipo de dashboard para gestionar la agenda institucional del presidente de Barcelona Global.

## Puesta en marcha

### Opción recomendada: desplegar en Render (funciona para cualquier persona, con o sin cuenta de Claude)

El repositorio incluye `render.yaml`, que deja el servicio configurado. Pasos:

1. Entra en <https://render.com> y crea una cuenta.
2. **New → Blueprint** y conecta este repositorio. Render lee `render.yaml` y prepara el servicio solo.
3. Cuando pida las variables, escribe las dos claves de acceso:
   - `COMMS_PASSWORD` → la clave de la Dirección de Comunicación.
   - `PRESIDENT_PASSWORD` → la clave de Presidencia.
4. **Apply**. En un par de minutos tendrás una dirección del tipo `https://agenda-barcelona-global.onrender.com`.

Esa dirección es la que se pasa a la directora y al presidente: se abre en el navegador del ordenador o del móvil, cada uno entra con su clave y ve lo que le corresponde. En el móvil se puede añadir a la pantalla de inicio y queda como una app.

**Sobre el plan:** el `render.yaml` pide el plan *Starter* (unos 7 USD al mes) porque el **disco persistente** solo está disponible en los planes de pago. Es lo que hace que la agenda no se borre. En el plan gratuito el disco se vacía en cada reinicio (se perderían los eventos) y el servicio se duerme tras un rato de inactividad, de modo que la primera carga tarda casi un minuto: no es adecuado para una agenda real.

**Dominio propio:** si queréis `agenda.barcelonaglobal.org` en lugar de la dirección de Render, se añade desde *Settings → Custom Domain* del servicio.

### Alternativa: en un ordenador o servidor vuestro

```bash
COMMS_PASSWORD='clave-comunicacion' PRESIDENT_PASSWORD='clave-presidencia' node server.js
```

Abre `http://localhost:3000`. No requiere `npm install`: el servidor no tiene dependencias. Los datos se guardan en `data/events.json` y las sesiones en `data/sessions.json`, de modo que sobreviven a los reinicios; con la variable `DATA_DIR` se puede apuntar a otra carpeta o a un disco montado. Para que la usen desde fuera de la oficina, el servidor debe ser accesible desde internet.

### Claves y roles

| Rol | Variable | Permisos |
|---|---|---|
| Comunicación | `COMMS_PASSWORD` | Gestión completa: crear, editar, sincronizar, eliminar |
| Presidencia | `PRESIDENT_PASSWORD` | Solo consulta de su agenda; el servidor rechaza cualquier escritura |

Si no se definen, se usan unas claves por defecto y el servidor lo avisa al arrancar. **Defínelas siempre antes de desplegar.**

### Otras formas de abrirlo

- **Como archivo suelto:** `index.html` con doble clic en cualquier navegador, sin instalación. Los cambios se guardan solo en ese navegador (`localStorage`). Útil para enseñarlo o probarlo.
- **Publicada en claude.ai:** <https://claude.ai/code/artifact/f8acea68-e7c9-4fd9-b1a4-84c392256191> — base compartida en tiempo real, sin claves, pero **solo para miembros de la organización de Claude del propietario**. Se regenera con `node build-artifact.js` tras editar `index.html`.

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
