#!/usr/bin/env node
/**
 * Sıfır bağımlılıklı, saniyeler içinde çalışan ilk savunma hattı.
 * src/, styles/, tests/ ve kök dizindeki HER .js dosyasını `node --check` ile
 * tarar (recursive) — playwright kurulu olmasa da, hatta internet olmasa da
 * çalışır. smoke.mjs'ten önce, her commit/push öncesi çalıştırılabilir
 * (pre-commit hook adayı).
 *
 * Çalıştırma: node tests/syntax-check.mjs
 */
import { execFileSync } from "child_process";
import { readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel"]);

function findJsFiles(dir) {
  let results = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) results = results.concat(findJsFiles(full));
    else if (entry.endsWith(".js")) results.push(full);
  }
  return results;
}

const files = findJsFiles(ROOT);
let fail = 0;

console.log(`${files.length} JS dosyası taranıyor (src/, styles/, tests/, kök dahil)...\n`);
for (const file of files) {
  const rel = path.relative(ROOT, file);
  try {
    execFileSync("node", ["--check", file], { stdio: "pipe" });
    console.log(`  \x1b[32m✓\x1b[0m ${rel}`);
  } catch (e) {
    fail++;
    console.log(`  \x1b[31m✗ ${rel}\x1b[0m`);
    console.log(`    ${e.stderr?.toString().split("\n").slice(0, 3).join("\n    ")}`);
  }
}

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${files.length - fail}/${files.length} dosya temiz.\x1b[0m`);
process.exit(fail > 0 ? 1 : 0);
