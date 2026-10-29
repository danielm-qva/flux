# Referencia de rediseño

`reference/flux-vistas/` conserva el HTML y las 24 capturas proporcionadas por el usuario: 12 estados en modo día y 12 en modo noche.

La implementación está en los componentes reales de `features/` y en `app/redesign.css`. El HTML es una referencia visual, no una sustitución de la aplicación mediante iframe.

## Validación

- TypeScript, ESLint y compilación estática de producción verificados para v3.7.0.
- Bienvenida, acceso a la cuenta y notificaciones comprobados visualmente en Día y Noche.
- Selectores y menús comprobados con ratón y teclado en el navegador, incluidos formularios y contenedores con scroll.
- Iconos PNG, ICO e ICNS regenerados y verificados.

Queda pendiente el recorrido completo en Tauri con datos reales y la comparación final de todas las pantallas en Windows, macOS y móvil.

La vista Tiempos muestra la duración real total. El backend actual no devuelve el desglose DNS/TCP/TLS del prototipo. Las opciones de proxy, SSL y redirecciones requieren trabajo adicional en el cliente Rust antes de ofrecer controles funcionales.
