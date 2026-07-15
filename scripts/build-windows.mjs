import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

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

run(["run", "build:web"], "Generando y verificando el frontend estático");

// El frontend ya está validado. Desactivamos beforeBuildCommand en esta
// ejecución para evitar compilar Next dos veces en el build local.
run(
  [
    "run",
    "tauri",
    "--",
    "build",
    "--bundles",
    "nsis",
    "--config",
    JSON.stringify({ build: { beforeBuildCommand: "" } }),
  ],
  "Compilando el instalador NSIS de Windows",
);
