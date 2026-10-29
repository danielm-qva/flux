import { execFileSync } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(root, "public/flux-icon.svg");
execFileSync(process.execPath, [resolve(root, "node_modules/@tauri-apps/cli/tauri.js"), "icon", source, "--output", resolve(root, "src-tauri/icons"), "--ios-color", "#0f1110"], { cwd: root, stdio: "inherit" });
await Promise.all([
  sharp(source).resize(512, 512).png().toFile(resolve(root, "public/flux-icon.png")),
  sharp(source).resize(512, 512).png().toFile(resolve(root, "app/icon.png")),
  sharp(source).resize(180, 180).flatten({ background: "#0f1110" }).png().toFile(resolve(root, "app/apple-icon.png")),
  copyFile(resolve(root, "src-tauri/icons/icon.ico"), resolve(root, "app/favicon.ico")),
]);
console.log("Iconos de Flux generados para escritorio, web y móvil.");
