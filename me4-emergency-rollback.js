(() => {
  "use strict";

  const STATUS = Object.freeze({
    version: "me4-emergency-rollback.1",
    enabled: false,
    mode: "LEGACY_STABLE",
    reason: "Phase 13 main-thread bundle disabled to prevent UI freezes."
  });

  // Deliberately does not intercept clicks, forms, career login or match start.
  globalThis.ME4Rollback = Object.freeze({
    getStatus: () => ({ ...STATUS })
  });

  console.warn(
    "[ME4 ROLLBACK] Phase 13 is disabled. Stable legacy match engine remains active."
  );

  function addBadge() {
    if (!document.body || document.getElementById("me4RollbackBadge")) return;
    const badge = document.createElement("button");
    badge.id = "me4RollbackBadge";
    badge.type = "button";
    badge.textContent = "ME4 · GÜVENLİ GERİ ALMA";
    badge.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:2147483647",
      "border:1px solid rgba(255,255,255,.18)",
      "border-radius:9px",
      "padding:7px 10px",
      "background:#6c3a18",
      "color:#fff",
      "font:900 10px/1.2 Inter,system-ui,sans-serif",
      "box-shadow:0 8px 28px rgba(0,0,0,.35)",
      "cursor:pointer"
    ].join(";");
    badge.title = "Phase 13 devre dışı. Legacy maç motoru kullanılıyor.";
    badge.onclick = () => alert(
      "ME4 Phase 13 devre dışı.\n" +
      "Kariyer ve maç başlangıcı için mevcut stabil motor kullanılıyor."
    );
    document.body.appendChild(badge);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addBadge, { once: true });
  } else {
    addBadge();
  }
})();
