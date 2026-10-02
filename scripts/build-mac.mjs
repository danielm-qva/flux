import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (process.platform !== "darwin") {
  console.error("\nEl bundle de macOS solo puede generarse desde macOS.");
  process.exit(1);
}

function run(args, label) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(npm, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// `universal` genera un binario para Intel y Apple Silicon; por defecto se
// compila solo para la arquitectura de esta máquina, que es mucho más rápido.
// Sin --universal compilamos para el host: así no hace falta que rustup tenga
// instalado un target extra.
const universal = process.argv.includes("--universal");
const targetArgs = universal ? ["--target", "universal-apple-darwin"] : [];

// Los artefactos del updater exigen la clave privada de firma, que vive en los
// secrets de CI. En local los desactivamos para que el build no falle.
const signed = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY);
if (!signed) {
  console.log(
    "TAURI_SIGNING_PRIVATE_KEY no está definida: se omiten los artefactos del updater.",
  );
}

run(["run", "build:web"], "Generando y verificando el frontend estático");

// El frontend ya está validado. Desactivamos beforeBuildCommand en esta
// ejecución para evitar compilar Next dos veces en el build local.
run(
  [
    "run",
    "tauri",
    "--",
    "build",
    ...targetArgs,
    "--bundles",
    "app,dmg",
    "--config",
    JSON.stringify({
      build: { beforeBuildCommand: "" },
      bundle: { createUpdaterArtifacts: signed },
    }),
  ],
  `Compilando la app y el DMG de macOS (${universal ? "universal" : "nativo"})`,
);
