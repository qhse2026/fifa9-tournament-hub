// Bağımlılıksız minimal statik dosya sunucusu -- sadece smoke.mjs'in yerel
// olarak (Vercel'e deploy etmeden) gerçek HTTP koşullarında test yapabilmesi
// için. Üretimde kullanılmaz, sadece test altyapısı.
import fs from "fs";
import path from "path";

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg"
};

export default function handler(req, res, root) {
  let reqPath = decodeURIComponent(req.url.split("?")[0]);
  if (reqPath === "/") reqPath = "/index.html";
  const filePath = path.join(root, reqPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not found: " + reqPath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}
