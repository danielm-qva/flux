import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error("Uso: npm run release:version -- 0.2.0");
  process.exit(1);
}

const jsonFiles = ["package.json", "src-tauri/tauri.conf.json"];
for (const file of jsonFiles) {
  const content = JSON.parse(await readFile(file, "utf8"));
  content.version = version;
  await writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
}

const lockPath = "package-lock.json";
const lock = JSON.parse(await readFile(lockPath, "utf8"));
lock.version = version;
if (lock.packages?.[""]) lock.packages[""].version = version;
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const cargoPath = "src-tauri/Cargo.toml";
const cargo = await readFile(cargoPath, "utf8");
await writeFile(
  cargoPath,
  cargo.replace(
    /^(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
    `$1"${version}"`,
  ),
);

console.log(
  `Flux actualizado a v${version} en package.json, package-lock.json, tauri.conf.json y Cargo.toml.`,
);
