# Automatizaciones: peticiones programadas — Design Spec

**Date:** 2026-10-01
**Status:** Draft — pendiente de revisión
**Area:** `src-tauri` (nuevo `automation.rs`, tick en `lib.rs`, tablas en `database.rs`), `features/automations` (nuevo), `features/requests/request-builder.tsx`, `features/workspaces/authenticated-shell.tsx`

## Problema

Hoy una petición solo se ejecuta cuando el usuario pulsa Enviar. Hay trabajo recurrente que
debería hacerse solo. El caso típico: un `POST /login` devuelve un `access_token` que caduca a
los 10 minutos; el usuario quiere repetir el login cada 8 minutos y que `{{TOKEN}}` del
environment se actualice sin intervenir. Otros casos con el mismo mecanismo: monitor de
salud (`/health`), polling hasta que un job termine, refrescar datos en caché, mantener una
sesión viva.

## Alcance de esta versión (MVP)

- Programar **una petición guardada** cada N segundos / minutos / horas.
- **Al responder bien** (HTTP < 400): guardar valores de la respuesta (por ruta, `$.access_token`)
  en variables de un environment concreto.
- **Si falla**: reintentar N veces con espera, avisar, y **pausar** tras X fallos seguidos.
- Registro de ejecuciones y vista de gestión (activar/pausar, próxima ejecución, historial).
- Se ejecuta **mientras Flux está abierto**; al abrirlo recupera lo vencido.

### Fuera de alcance (versiones siguientes)

Programar Flows · intervalo calculado desde `expires_in` · condiciones y polling «hasta que…» ·
barra de menú/segundo plano con la app cerrada · incluir automatizaciones al exportar un workspace.

## Decisiones aprobadas

1. **Reloj en Rust, lógica en TypeScript.** Un bucle `tokio` en el backend emite un evento
   `automation://tick` cada 5 s. Los temporizadores del webview se frenan con la ventana
   oculta; el de Rust no. La preparación de la petición, la resolución de variables y la
   extracción por ruta ya existen en TypeScript (`prepareHttpRequest`, `getByPath`) y se reutilizan,
   sin duplicarlas en Rust.
2. **Solo con la app abierta.** Sin servicio en segundo plano.
3. **Solo peticiones** en esta versión.

## Modelo de datos

```sql
CREATE TABLE IF NOT EXISTS automations (
  id                   TEXT PRIMARY KEY NOT NULL,
  workspace_id         TEXT NOT NULL,
  request_id           TEXT NOT NULL,
  environment_id       TEXT,                     -- environment que se lee y se actualiza
  name                 TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  enabled              INTEGER NOT NULL DEFAULT 1,
  schedule_json        TEXT NOT NULL,            -- {"everySeconds":480,"runOnStart":true}
  actions_json         TEXT NOT NULL,            -- ver «Acciones»
  next_run_at          TEXT,                     -- ISO UTC; NULL = pausada
  last_run_at          TEXT,
  last_status          TEXT,                     -- success | failed | skipped
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(workspace_id)   REFERENCES workspaces(id)     ON DELETE CASCADE,
  FOREIGN KEY(request_id)     REFERENCES saved_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(environment_id) REFERENCES environments(id)   ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id            TEXT PRIMARY KEY NOT NULL,
  automation_id TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  duration_ms   INTEGER,
  status        TEXT NOT NULL,                   -- success | failed | skipped
  http_status   INTEGER,
  error         TEXT,
  saved_vars    TEXT,                            -- solo NOMBRES de variables, nunca valores
  FOREIGN KEY(automation_id) REFERENCES automations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_automation_runs ON automation_runs(automation_id, started_at DESC);
```

- Se conservan las **últimas 100** ejecuciones por automatización (se poda al insertar).
- Si se borra el environment (`SET NULL`), la automatización se **pausa** y lo indica.

### Acciones (`actions_json`)

```ts
type AutomationActions = {
  onSuccess: { saveVariables: { id: string; path: string; variable: string }[] };
  onFailure: {
    retries: number;            // 0–5, por defecto 2
    retryDelaySeconds: number;  // por defecto 10
    pauseAfterFailures: number; // por defecto 5; 0 = nunca pausar
    notify: boolean;            // por defecto true
  };
};
```

«Respuesta correcta» = el mismo criterio que usa Flow: **HTTP < 400** y error de red = fallo.

## Backend (Rust)

`automation.rs`, igual convención que `flow.rs` (`rusqlite`, `camelCase`, comprobación de que
el workspace pertenece al usuario).

| Comando | Notas |
|---|---|
| `list_automations(userId, workspaceId)` | ordenadas por `created_at` |
| `create_automation(...)` | valida: petición y environment del mismo workspace; `everySeconds` ≥ 15 |
| `update_automation(...)` | recalcula `next_run_at` si cambia el horario o se reactiva |
| `set_automation_enabled(userId, id, enabled)` | pausar/reanudar |
| `delete_automation(userId, id)` | |
| `record_automation_run(userId, id, run, nextRunAt, consecutiveFailures)` | inserta la ejecución, actualiza el estado de la automatización y poda |
| `list_automation_runs(userId, id, limit)` | |

**Tick:** en `setup`, `tauri::async_runtime::spawn` con `tokio::time::interval(5s)` que hace
`app.emit("automation://tick", now_iso)`. No ejecuta nada por sí mismo.

## Frontend

Nuevo directorio `features/automations/`:

- `automation-client.ts` — tipos y llamadas `invoke`.
- `automation-runner.ts` — **funciones puras**: `isDue(automation, now)`, `nextRunAfter(...)`,
  `runAutomation(...)` (prepara, ejecuta, extrae, devuelve el resultado) y política de
  reintentos. Puras para poder añadir Vitest más adelante.
- `use-automation-scheduler.ts` — hook montado una sola vez en el shell: escucha el tick, toma las
  automatizaciones vencidas, las ejecuta una a una y aplica las acciones.
- `automation-panel.tsx` — panel «Automatizar» de una petición.
- `automations-view.tsx` — lista, estado, historial.

### Planificador

En cada tick, para cada automatización `enabled` con `next_run_at <= ahora`:

1. **No solapar:** si ya hay una ejecución en curso de esa automatización, se omite el tick.
2. Resolver variables con el environment elegido (+ valores ya actualizados en memoria).
3. Ejecutar con `executeHttpRequest` (timeout de 30 s, como Flow).
4. **Éxito:** para cada `saveVariable` evaluar `getByPath`; si existe, guardar con
   `workspaceApi.saveVariable`. Como `save_environment_variable` sin `variableId` crea una
   variable nueva y choca con la clave única, se **busca antes la variable por clave** en ese
   environment y se pasa su `id` (o se crea si no existe).
5. **Fallo:** reintentar hasta `retries` veces con `retryDelaySeconds`; si se agotan, avisar y
   sumar a `consecutive_failures`; al llegar a `pauseAfterFailures`, pausar y avisar.
6. Calcular `next_run_at = ahora + everySeconds` (no desde el inicio anterior, para que no se
   acumulen) y llamar a `record_automation_run`.

**Al abrir Flux / cambiar de workspace:** las vencidas se ejecutan **una sola vez** (no una por
cada intervalo perdido); las que tengan `runOnStart` se ejecutan siempre.

### Reflejo en vivo

Cuando se guarda una variable del environment **activo**, se llama a `mergeVariable` del shell
para que las peticiones abiertas usen el valor nuevo al instante.

### Interfaz

- **Botón de reloj** en la barra de la petición («Automatizar»). Abre un panel con: *Cada
  [8] [min]* · *Ejecutar al abrir Flux* · *Environment* · *Al responder, guardar* (filas
  `ruta → variable`, con sugerencias a partir de la última respuesta) · *Si falla* (reintentos,
  pausar tras N fallos, avisar). Reutiliza el estilo del panel de Flow.
- **Vista «Automatizaciones»** (acceso desde la paleta `⌘K` y la barra superior): tarjeta por
  automatización con estado (activa/pausada), próxima ejecución en cuenta atrás, últimos
  resultados como puntos verde/rojo, botón pausar/ejecutar ahora, y el historial.
- **Indicador** en la barra superior («⏱ 2 activas») y punto de reloj en la pestaña de una
  petición automatizada.
- **Avisos:** `toast` cuando una automatización falla definitivamente o se pausa. Un texto fijo
  recuerda: *«Se ejecuta solo mientras Flux esté abierto»*.

## Seguridad y límites

- **Los valores de variables y cuerpos de respuesta no se guardan** en `automation_runs` (solo
  estado, duración y nombres de variables), porque suelen ser tokens. Las ejecuciones
  automáticas **no** se registran en el historial normal.
- Intervalo mínimo 15 s, máximo 7 días; máximo 20 automatizaciones activas por workspace.
- Sin solapamiento, reintentos acotados y pausa automática por fallos repetidos.
- Sin automatizar peticiones con body de archivo (binary / form-data con archivos): se rechaza
  al crear, porque los archivos elegidos pueden no existir cuando corre solo.

## Casos límite

- La petición automatizada se edita: usa siempre la versión **guardada** más reciente.
- La petición o el workspace se borra: la automatización desaparece (cascade).
- El ordenador se suspende: al despertar se ejecuta una vez lo vencido.
- Varias automatizaciones que dependen unas de otras (login → refresh): se ejecutan en
  secuencia dentro del mismo tick, ordenadas por `created_at`; «ejecutar al abrir» garantiza
  que el login corre antes que las peticiones del usuario.
- El valor extraído no existe en la respuesta: la ejecución cuenta como **fallo** con el mensaje
  «Sin coincidencia para `$.x`» (no se sobrescribe la variable con vacío).

## Verificación

El repositorio no tiene test runner. Se escribe la lógica de `automation-runner.ts` como
funciones puras y se verifica manualmente:

1. Servidor de prueba con `/login` que devuelve un token distinto cada vez.
2. Automatización cada 15 s que guarda `$.token` en `{{TOKEN}}`; comprobar que cambia en el
   environment y en una petición abierta que lo usa.
3. Apagar el servidor: reintentos, aviso y pausa tras los fallos configurados.
4. Cerrar y abrir Flux con la automatización vencida: se ejecuta una vez.
5. `npx tsc --noEmit`, `npx eslint`, `cargo check`.
