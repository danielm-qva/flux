# Changelog

Todos los cambios relevantes de Flux se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto utiliza [versionado semántico](https://semver.org/lang/es/).

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

[1.0.0]: https://github.com/danielm-qva/flux/releases/tag/v1.0.0
