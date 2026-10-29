import { readFile, appendFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const heading = `## [${version}]`;
const start = changelog.indexOf(heading);
if (start === -1) throw new Error(`Falta la entrada ${heading} en CHANGELOG.md.`);
const contentStart = changelog.indexOf("\n", start) + 1;
const next = changelog.indexOf("\n## [", contentStart);
const body = changelog.slice(contentStart, next === -1 ? undefined : next).trim();
if (!body) throw new Error(`El changelog de ${version} está vacío.`);
if (process.argv.includes("--github-output")) {
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT no está definido.");
  await appendFile(process.env.GITHUB_OUTPUT, `body<<FLUX_CHANGELOG_BODY\n${body}\nFLUX_CHANGELOG_BODY\n`);
} else {
  console.log(body);
}
