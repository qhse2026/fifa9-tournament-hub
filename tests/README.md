# Testler

Bu proje daha önce hiçbir otomatik teste sahip değildi. `tests/smoke_test.py`
adında bir dosya vardı ama artık var olmayan bir v43.4 kurulum betiğini test
ediyordu — şu anki siteye hiç dokunmuyordu. **Onu silmenizi öneririm**
(`tests/demo.html` ile birlikte) — yanlış bir güven duygusu veriyor.

## Çalıştırma

```
npm install          # bir kere: playwright'ı kurar
npx playwright install chromium   # bir kere: headless tarayıcıyı indirir
npm test             # her ikisini de çalıştırır
```

Ayrı ayrı:
- `npm run test:syntax` — sıfır bağımlılık, saniyeler sürer, her JS dosyasını
  `node --check` ile tarar. Push öncesi ilk savunma hattı.
- `npm run test:smoke` — gerçek tarayıcıda siteyi açar, 28 navigasyon
  rotasının tamamını dolaşır, bulut bağlantı hatasında arayüzün sonsuza kadar
  takılı kalmadığını doğrular, Şampiyonlar Kürsüsü'nün gerçek içerik ürettiğini
  kontrol eder.

## Ne zaman genişletilmeli

Yeni bir rota/sayfa eklediğinizde `tests/smoke.mjs` içindeki `ROUTES`
listesine ekleyin — yoksa o rota testsiz kalır. Kritik bir akış daha
eklerseniz (skor kaydetme, admin girişi gibi) `smoke.mjs`'e yeni bir bölüm
olarak ekleyin; yeni bir dosya AÇMAYIN. Bu proje zaten çok fazla küçük dosyaya
bölünmüş durumda — testler için aynı hatayı tekrarlamayalım.
