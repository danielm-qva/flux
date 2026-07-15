import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const outputDirectory = resolve("out");
const entryFile = resolve(outputDirectory, "index.html");

try {
  await access(entryFile, constants.R_OK);
  const output = await stat(outputDirectory);
  if (!output.isDirectory()) throw new Error("out no es un directorio");
} catch {
  console.error("\nNo se generaron los assets estáticos de Flux.");
  console.error("Comprueba que next.config.ts mantiene `output: \"export\"`.");
  console.error(`Tauri esperaba encontrar: ${entryFile}\n`);
  process.exit(1);
}

console.log(`Assets web verificados: ${entryFile}`);
