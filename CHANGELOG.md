# Changelog

Todos los cambios relevantes de Flux se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto utiliza [versionado semántico](https://semver.org/lang/es/).

## [Unreleased]

## [3.1.0] - 2026-07-16

### Añadido

- Nuevos tipos de body: `form-data`, `x-www-form-urlencoded`, `raw`, `binary` y `GraphQL`.
- Selección de archivos nativa para campos multipart y bodies binarios, con límite de 25 MB.
- Subtipos `JSON`, `Text`, `XML` y `HTML` para bodies raw con `Content-Type` automático.
- Editor GraphQL separado para query y variables JSON.

### Cambiado

- El editor del body ya no muestra autocompletado y mantiene la sustitución de variables al enviar.
- Los bodies `form` guardados por versiones anteriores se convierten automáticamente al nuevo formato.
- La importación cURL adapta los formularios URL encoded al editor estructurado.

## [3.0.0] - 2026-07-15

Tercera versión mayor de Flux, centrada en personalización, portabilidad y una gestión más clara del workspace.

### Añadido

- Vista de Settings con administración de apariencia y actualizaciones.
- Temas completos Ultravioleta, Cian Ártico y Ámbar Carbono con primary, fondos, superficies, bordes y glow propios.
- Persistencia local y migración automática de la preferencia de tema.
- Exportación de workspaces completos al formato versionado `.flux.json`.
- Importación validada como workspace nuevo mediante una transacción SQLite.
- Previsualización del contenido antes de importar con conteos de carpetas, peticiones, environments y variables.
- Opción explícita para incluir secretos durante la exportación.

### Cambiado

- Todas las carpetas y subcarpetas pueden contraerse o expandirse independientemente.
- Icono de creación de carpetas y menús contextuales rediseñados.
- Acciones de carpetas y peticiones alineadas con iconos, filas flex y hover temático.
- El actualizador automático permanece activo en segundo plano y también está disponible dentro de Settings.
- Tokens, passwords, API keys y headers de autorización se omiten por defecto al exportar.

### Corregido

- Los nombres duplicados de peticiones se validan antes de guardar y ya no generan un error global similar a un crash.
- Los scripts de Tauri conservan comandos separados para desarrollo y compilación.

### Seguridad

- Los archivos importados tienen un límite de 25 MB y límites internos de recursos.
- Las referencias de carpetas, versiones del formato y ciclos jerárquicos se validan antes de escribir datos.
- Una importación fallida revierte completamente la transacción SQLite.

## [2.0.0] - 2026-07-15

Segunda versión mayor de Flux, centrada en la organización y trazabilidad de las peticiones.

### Añadido

- Carpetas y subcarpetas persistentes para organizar peticiones por workspace.
- Creación directa de peticiones dentro de una carpeta.
- Movimiento de peticiones entre carpetas o hacia la sección `Sin carpeta`.
- Historial persistente de hasta 200 ejecuciones recientes por workspace.
- Detalle histórico de método, URL resuelta, status, duración, tamaño, respuesta y errores.
- Bandeja inferior de historial que conserva visible el editor actual.
- Modal de novedades mostrado una vez después de instalar cada nueva versión.
- Botón de guardado junto a la importación de cURL.

### Cambiado

- Los environments ahora son opcionales y ya no bloquean el editor de peticiones.
- Sidebar ampliado y controles para crear carpetas y peticiones alineados.
- Las carpetas que contienen la petición activa permanecen expandidas.
- Las respuestas guardadas en el historial se limitan a 1 MB por ejecución.
- El build de Windows genera y verifica `out/` antes de iniciar la compilación de Tauri.

### Seguridad

- Validación en Rust de que las carpetas y peticiones pertenecen al workspace del usuario.
- Eliminación en cascada de carpetas sin eliminar las peticiones que contenían.

## [1.0.0] - 2026-07-15

Primera release estable de Flux para Windows.

### Añadido

- Aplicación de escritorio construida con Tauri v2, Rust, Next.js 16 y React 19.
- Identidad visual de Flux, iconos nativos y experiencia de primer inicio.
- Registro, login y sesión local persistente.
- Protección de contraseñas mediante Argon2 y salt aleatorio.
- Persistencia local con SQLite en modo WAL y claves foráneas.
- Creación, selección, renombrado y eliminación de workspaces.
- Creación, selección, renombrado y eliminación de environments.
- Variables de environment en formato clave/valor.
- Sustitución, resaltado y autocompletado de expresiones `{{VARIABLE}}`.
- Creación, edición, guardado, duplicación y eliminación de peticiones HTTP.
- Métodos `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD` y `OPTIONS` con identificación por colores.
- Configuración de query params y headers habilitables individualmente.
- Autenticación Bearer, Basic Auth y API Key.
- Sincronización automática de Bearer token con el header `Authorization`.
- Bodies JSON, texto y form URL encoded.
- Ejecución HTTP nativa mediante Rust, Reqwest y Rustls.
- Respuesta con status, headers, duración, tamaño y body.
- Visor JSON interactivo con búsqueda, colapsado, expansión y copia de rutas o valores.
- Vista raw para respuestas JSON, texto y otros formatos.
- Importación de comandos cURL con URL, método, params, headers, auth y body.
- Confirmaciones antes de eliminar recursos y notificaciones de resultado.
- Layout adaptable para ventanas de Windows de diferentes tamaños.
- Actualizador firmado con comprobación automática, progreso, instalación y reinicio.
- Workflow de GitHub Actions para compilar y publicar releases NSIS de Windows.
- Migración automática de datos creados con el identificador provisional `com.tauri.dev`.
- Documentación de arquitectura, funcionalidades, desarrollo y publicación en `README.md`.

### Seguridad

- Validación en Rust de la propiedad de workspaces y recursos asociados.
- Límite máximo de 10 MB para respuestas HTTP.
- Verificación criptográfica obligatoria de los paquetes de actualización.
- Clave privada de actualizaciones excluida del repositorio.

[3.0.0]: https://github.com/danielm-qva/flux/releases/tag/v3.0.0
[2.0.0]: https://github.com/danielm-qva/flux/releases/tag/v2.0.0
[1.0.0]: https://github.com/danielm-qva/flux/releases/tag/v1.0.0
