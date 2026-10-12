import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(path));
    else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

const files = [
  ...await collect(fileURLToPath(new URL("../src", import.meta.url))),
  ...await collect(fileURLToPath(new URL("../public", import.meta.url))),
  ...await collect(fileURLToPath(new URL("../test", import.meta.url))),
];
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
