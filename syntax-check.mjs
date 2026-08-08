#!/usr/bin/env node
/**
 * Sıfır bağımlılıklı, saniyeler içinde çalışan ilk savunma hattı.
 * Kök dizindeki HER .js dosyasını `node --check` ile tarar — playwright
 * kurulu olmasa da, hatta internet olmasa da çalışır. smoke.mjs'ten önce,
 * her commit/push öncesi çalıştırılabilir (pre-commit hook adayı).
 *
 * Çalıştırma: node tests/syntax-check.mjs
 */
import { execFileSync } from "child_process";
import { readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const files = readdirSync(ROOT).filter((f) => f.endsWith(".js"));
let fail = 0;

console.log(`${files.length} JS dosyası taranıyor...\n`);
for (const file of files) {
  try {
    execFileSync("node", ["--check", path.join(ROOT, file)], { stdio: "pipe" });
    console.log(`  \x1b[32m✓\x1b[0m ${file}`);
  } catch (e) {
    fail++;
    console.log(`  \x1b[31m✗ ${file}\x1b[0m`);
    console.log(`    ${e.stderr?.toString().split("\n").slice(0, 3).join("\n    ")}`);
  }
}

console.log(`\n${fail === 0 ? "\x1b[32m" : "\x1b[31m"}${files.length - fail}/${files.length} dosya temiz.\x1b[0m`);
process.exit(fail > 0 ? 1 : 0);
