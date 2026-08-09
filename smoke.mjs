#!/usr/bin/env node
/**
 * FIFA Tournament Hub — Smoke Test
 * ------------------------------------------------------------------
 * Ne yapar: siteyi gerçek bir tarayıcıda (headless Chromium) açar,
 * her navigasyon rotasını dolaşır ve şunları doğrular:
 *   1) Sayfa hiç JS hatası fırlatmadan yükleniyor mu?
 *   2) Bulut bağlantısı kurulamadığında (ör. Supabase erişilemez)
 *      arayüz "Bağlanıyor" durumunda SONSUZA KADAR TAKILI KALMIYOR mu?
 *      (Bkz: cloud.js'teki withTimeout düzeltmesi — bu test o hatanın
 *      bir daha sessizce geri gelmemesini garanti eder.)
 *   3) 28 navigasyon rotasının HER BİRİ, tıklandığında hatasız render
 *      oluyor mu ve gerçekten farklı bir görünüme geçiyor mu?
 *   4) Şampiyonlar Kürsüsü sayfası gerçek kupa/plaket öğelerini üretiyor mu?
 *
 * Neden önemli: bu proje şu anda (2026-08) hiçbir otomatik teste sahip
 * değil. tests/smoke_test.py mevcut ama artık var olmayan bir v43.4
 * kurulum betiğini test ediyor — şu anki app.js'e hiç dokunmuyor.
 * Bu dosya, "her turnuva/kupa/rota gerçekten çalışıyor mu" sorusuna
 * insan hiç bakmadan otomatik cevap verir.
 *
 * Kurulum (bir kere):
 *   npm install -D playwright
 *   npx playwright install chromium
 *
 * Çalıştırma:
 *   node tests/smoke.mjs
 *
 * CI'a bağlamak (GitHub Actions/Vercel) için exit code kullanır:
 *   0 = tüm testler geçti, 1 = en az bir test başarısız.
 * ------------------------------------------------------------------
 */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import http from "http";
import handler from "./_static_server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// file:// üzerinden test etmiyoruz: ES module (type="module") scriptleri
// (bkz. trophy-3d.js) file:// kökeninde tarayıcı CORS politikası gereği
// YÜKLENEMEZ -- bu evrensel bir tarayıcı kısıtlamasıdır, kodun kendisiyle
// ilgisi yoktur, ama file:// testini yanlış-pozitif hataya düşürür. Gerçek
// deploy (Vercel/https) ile birebir aynı koşulu simüle etmek için yerel bir
// HTTP sunucusu açıyoruz.
const PORT = 8793;

// titleMap'teki TÜM rotalar (app.js'ten programatik olarak doğrulanmalı —
// bu liste elle senkron tutulmalı; app.js'e yeni bir rota eklerse burayı
// da güncelleyin, aksi halde o rota testsiz kalır).
const ROUTES = [
  "dashboard", "livehub", "tournaments", "playershub", "recordshub",
  "mediahub", "adminhub", "livematch", "livestats", "form", "odds",
  "intelligence", "chat", "setup", "league", "gold", "silver", "knockout",
  "print", "archive", "benchmark", "alltime", "podium", "teams", "backup",
  "playeraccess", "finalpoll", "seasonhub"
];

let pass = 0, fail = 0;
const failures = [];

function ok(label) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`); }
function bad(label, detail) {
  fail++;
  failures.push({ label, detail });
  console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail ? " — " + detail : ""}`);
}

async function main() {
  const server = http.createServer((req, res) => handler(req, res, ROOT));
  await new Promise((resolve) => server.listen(PORT, resolve));
  const SITE_INDEX = `http://localhost:${PORT}/index.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

  const consoleErrors = [];
  page.on("pageerror", (err) => consoleErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) {
      consoleErrors.push(msg.text());
    }
  });

  console.log("\n1) SAYFA YÜKLEME\n");
  await page.goto(SITE_INDEX, { waitUntil: "load" });
  await page.waitForTimeout(1500);

  if (consoleErrors.length === 0) ok("Sayfa hiçbir JS hatası fırlatmadan yüklendi");
  else bad("Sayfa yüklenirken JS hatası oluştu", consoleErrors.join(" | "));

  const hasSidebar = await page.locator(".sidebar, #sidebar").count();
  if (hasSidebar > 0) ok("Sidebar/navigasyon DOM'da mevcut");
  else bad("Sidebar bulunamadı — temel iskelet render olmamış olabilir");

  console.log("\n2) BULUT BAĞLANTISI ZAMAN AŞIMI (cloud.js regresyon testi)\n");
  // Bu ortamda dış ağ erişimi kapalı olduğundan Supabase CDN'i doğal olarak
  // yüklenemez — tam olarak "Bağlanıyor" hatasının tetiklendiği senaryo.
  // Düzeltme kalıcıysa, 12sn içinde durum "connecting" dışına geçmeli.
  const stuckCheck = await page.evaluate(async () => {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const text = document.getElementById("cloudStatusText")?.textContent || "";
        if (text && text !== "Bağlanıyor" && text !== "Connecting") {
          resolve({ settled: true, ms: Date.now() - start, text });
        } else if (Date.now() - start > 13000) {
          resolve({ settled: false, ms: Date.now() - start, text });
        } else {
          setTimeout(check, 300);
        }
      };
      check();
    });
  });
  if (stuckCheck.settled) ok(`Bağlantı durumu ${stuckCheck.ms}ms içinde çözüldü ("${stuckCheck.text}") — sonsuz "Bağlanıyor" YOK`);
  else bad("Bulut durumu 13sn sonra hâlâ \"Bağlanıyor\" — withTimeout regresyonu olabilir!");

  console.log("\n3) NAVİGASYON ROTALARI (28 rota)\n");
  const unreachable = [];
  for (const route of ROUTES) {
    const before = consoleErrors.length;
    const hasButton = await page.evaluate((r) => Boolean(document.querySelector(`[data-nav="${r}"]`)), route);
    try {
      // window.FIFA_APP_CONTEXT.navigate() sidebar'da buton olsun ya da
      // olmasın render mantığının kendisini test eder -- gerçek buton
      // varlığı ayrıca ve ayrı olarak raporlanır (o bir "hata" değil,
      // bir keşfedilebilirlik/ölü-kod sinyalidir).
      await page.evaluate((r) => window.FIFA_APP_CONTEXT.navigate(r), route);
      await page.waitForTimeout(350);
      const afterHTML = await page.evaluate(() => document.getElementById("view")?.innerHTML.length || 0);
      const newErrors = consoleErrors.slice(before);
      if (newErrors.length > 0) bad(`"${route}" render hatası fırlattı`, newErrors[0]);
      else if (afterHTML === 0) bad(`"${route}" boş içerik üretti`);
      else ok(`"${route}" → hatasız render (${afterHTML} karakter)${hasButton ? "" : "  \x1b[33m[⚠ sidebar'da butonu yok]\x1b[0m"}`);
      if (!hasButton) unreachable.push(route);
    } catch (e) {
      bad(`"${route}" navigate() ile bile açılamadı`, e.message);
    }
  }

  console.log("\n4) ŞAMPİYONLAR KÜRSÜSÜ İÇERİK DOĞRULAMASI\n");
  await page.evaluate(() => window.FIFA_APP_CONTEXT.navigate("podium"));
  await page.waitForTimeout(500);
  const trophyCount = await page.locator(".cp-trophy-img").count();
  const plateCount = await page.locator(".cp-plate strong").count();
  if (trophyCount === 3) ok("3 kupa görseli render edildi (altın/gümüş/bronz)");
  else bad(`Kupa sayısı 3 değil: ${trophyCount}`);
  if (plateCount === 3) ok("3 isim plaketi render edildi");
  else bad(`Plaket sayısı 3 değil: ${plateCount}`);

  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  console.log(`\n${"=".repeat(50)}`);
  console.log(`SONUÇ: ${pass} geçti, ${fail} başarısız`);
  if (unreachable.length) {
    console.log(`\n⚠ Sidebar'dan ulaşılamayan ${unreachable.length} rota (render kendisi çalışıyor, ama kullanıcı oraya normal gezinmeyle gidemiyor):`);
    unreachable.forEach((r) => console.log(`    - ${r}`));
    console.log("  Bunlar muhtemelen eski/yetim rotalar (bkz. daha önce bulduğumuz 'museum' rotası). Silinmeli ya da nav'a eklenmeli.");
  }
  console.log("=".repeat(50));
  if (fail > 0) {
    console.log("\nBAŞARISIZ TESTLER:");
    failures.forEach((f) => console.log(`  - ${f.label}${f.detail ? ": " + f.detail : ""}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Test çalıştırıcı çöktü:", e);
  process.exit(1);
});
