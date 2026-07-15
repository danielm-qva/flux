# Publicar actualizaciones de Flux

Flux usa el updater firmado de Tauri v2 y GitHub Releases. La aplicación instalada consulta automáticamente el archivo `latest.json` de la última release pública y también permite comprobarlo desde el botón de configuración.

## Configuración única de GitHub

La clave privada fue creada localmente en `C:\Users\jmast\.tauri\flux.key`. No debe subirse al repositorio ni compartirse. Guarda además una copia segura: si se pierde, las instalaciones existentes no podrán aceptar futuras actualizaciones.

1. Abre el repositorio `danielm-qva/flux` en GitHub.
2. Ve a **Settings → Secrets and variables → Actions → New repository secret**.
3. Crea `TAURI_SIGNING_PRIVATE_KEY` con el contenido completo de `C:\Users\jmast\.tauri\flux.key`.
4. Crea `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` vacío si GitHub lo permite. Esta clave se generó sin contraseña, por lo que también puedes omitir ese secret; el workflow acepta que no exista.
5. En **Settings → Actions → General → Workflow permissions**, habilita **Read and write permissions**.

## Publicar una versión

1. Actualiza el número en todos los manifests:

   ```powershell
   npm run release:version -- 0.2.0
   ```

2. Revisa, confirma y sube los cambios al repositorio.
3. En GitHub abre **Actions → Publish Flux for Windows → Run workflow**.
4. Escribe las notas en **Notas que verá el usuario en Flux** y ejecuta el workflow.
5. El workflow valida el frontend, compila el instalador NSIS, firma el artefacto, genera `latest.json` y publica la release.

Una instalación anterior detectará la nueva versión al abrir Flux. El usuario puede instalarla inmediatamente o dejarla para después. Durante la instalación en Windows se muestra el progreso del instalador y Flux se reinicia al terminar.

## Probar antes de publicar

`npm run dev` ejecuta Flux en el navegador y no intenta usar el updater. Para probar el binario de escritorio usa `npm run tauri dev`. El updater solo encontrará versiones con un número mayor al instalado y que estén publicadas (no en borrador) en GitHub Releases.

## Seguridad y datos locales

- Cada paquete se valida con la clave pública incluida en `tauri.conf.json`; una descarga modificada es rechazada.
- La base SQLite vive en AppData y no forma parte del instalador, por lo que workspaces, environments y peticiones sobreviven a la actualización.
- La primera ejecución con el identificador definitivo migra automáticamente la base creada anteriormente bajo `com.tauri.dev`.
- Cuando cambie el esquema de SQLite, añade una migración compatible antes de publicar la versión.
- La firma del updater no reemplaza la firma Authenticode de Windows. Para reducir avisos de SmartScreen en distribución pública, configura además un certificado de firma de código.
