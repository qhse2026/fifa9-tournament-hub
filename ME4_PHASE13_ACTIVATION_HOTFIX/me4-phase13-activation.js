(() => {
  "use strict";

  const VERSION = "4.0.0-phase13-activation-hotfix.1";
  const BUNDLE_CANDIDATES = [
    "./manager-match-engine-v4-phase13.bundle.js?v=4.0.0-phase13.2",
    "./FIFA_MATCH_ENGINE_V4_PHASE13_GRAND_CALIBRATION_BALANCE_ENGINE/manager-match-engine-v4-phase13.bundle.js?v=4.0.0-phase13.2"
  ];

  const state = {
    version: VERSION,
    status: "BOOTING",
    bundleUrl: null,
    attempts: [],
    error: null,
    startedAt: Date.now(),
    lastCheckAt: null,
    globals: {},
    duplicatePhaseScripts: []
  };

  const log = (...args) => console.info("[ME4 ACTIVATION]", ...args);
  const warn = (...args) => console.warn("[ME4 ACTIVATION]", ...args);

  function detectDuplicatePhaseScripts() {
    if (typeof document === "undefined") return [];
    const items = [...document.scripts]
      .map(script => script.src || "")
      .filter(src => /manager-match-engine-v4-phase\d+/i.test(src));
    state.duplicatePhaseScripts = items;
    return items;
  }

  function globalsStatus() {
    const result = {
      managerRoom: Boolean(globalThis.FIFA_MANAGER_ROOM),
      core: Boolean(globalThis.FIFA_MATCH_ENGINE_V4?.createEngine),
      authority: Boolean(globalThis.FIFA_MATCH_ENGINE_V4_PHASE10?.enable),
      visual: Boolean(globalThis.FIFA_MATCH_ENGINE_V4_PHASE11_LIVE?.enable),
      analytics: Boolean(globalThis.FIFA_MATCH_ENGINE_V4_PHASE12?.enable),
      balance: Boolean(globalThis.FIFA_MATCH_ENGINE_V4_PHASE13?.enable)
    };
    state.globals = result;
    state.lastCheckAt = Date.now();
    return result;
  }

  function isReady() {
    const g = globalsStatus();
    return g.core && g.authority && g.visual && g.analytics && g.balance;
  }

  function ensureBadge() {
    if (typeof document === "undefined") return null;
    let badge = document.getElementById("me4ActivationBadge");
    if (badge) return badge;

    badge = document.createElement("button");
    badge.id = "me4ActivationBadge";
    badge.type = "button";
    badge.setAttribute("aria-label", "Match Engine V4 activation status");
    badge.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:2147483647",
      "border:1px solid rgba(255,255,255,.22)",
      "border-radius:10px",
      "padding:8px 11px",
      "background:#6d3b18",
      "color:#fff",
      "font:900 11px/1.2 Inter,system-ui,sans-serif",
      "box-shadow:0 8px 28px rgba(0,0,0,.38)",
      "cursor:pointer"
    ].join(";");
    badge.textContent = "ME4 · BAŞLATILIYOR";
    badge.title = "Durum detaylarını konsolda görmek için tıklayın.";
    badge.addEventListener("click", () => {
      console.table(state.globals);
      console.info("[ME4 ACTIVATION] Full state:", JSON.parse(JSON.stringify(state)));
      alert(statusText(true));
    });
    document.body.appendChild(badge);
    return badge;
  }

  function statusText(long = false) {
    const g = globalsStatus();
    const loaded = Object.entries(g).filter(([, value]) => value).map(([key]) => key);
    const missing = Object.entries(g).filter(([, value]) => !value).map(([key]) => key);
    const first = state.status === "ACTIVE"
      ? "ME4 PHASE 13 AKTİF"
      : state.status === "ERROR"
        ? "ME4 YÜKLEME HATASI"
        : "ME4 BAŞLATILIYOR";
    if (!long) return first;
    return [
      first,
      `Bundle: ${state.bundleUrl || "henüz bulunmadı"}`,
      `Yüklü: ${loaded.join(", ") || "yok"}`,
      `Eksik: ${missing.join(", ") || "yok"}`,
      state.error ? `Hata: ${state.error}` : "",
      state.duplicatePhaseScripts.length > 1
        ? `UYARI: Aynı anda ${state.duplicatePhaseScripts.length} eski Phase scripti çağrılıyor.`
        : ""
    ].filter(Boolean).join("\n");
  }

  function updateBadge() {
    const badge = ensureBadge();
    if (!badge) return;
    if (state.status === "ACTIVE") {
      badge.style.background = "#17633c";
      badge.textContent = "ME4 · PHASE 13 AKTİF";
    } else if (state.status === "ERROR") {
      badge.style.background = "#8b2323";
      badge.textContent = "ME4 · YÜKLEME HATASI";
    } else {
      badge.style.background = "#6d3b18";
      badge.textContent = "ME4 · BAŞLATILIYOR";
    }
    badge.title = statusText(true);
  }

  function activateAPIs() {
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE10?.enable?.(); } catch (error) { warn("Authority enable failed", error); }
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE11_LIVE?.enable?.(); } catch (error) { warn("Visual enable failed", error); }
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE12?.enable?.(); } catch (error) { warn("Analytics enable failed", error); }
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE13?.enable?.(); } catch (error) { warn("Balance enable failed", error); }

    if (isReady()) {
      state.status = "ACTIVE";
      state.error = null;
      updateBadge();
      log("Phase 13 is active.", globalsStatus());
      globalThis.dispatchEvent?.(new CustomEvent("me4:activated", {
        detail: { version: VERSION, bundleUrl: state.bundleUrl }
      }));
      return true;
    }
    return false;
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      if (typeof document === "undefined") {
        reject(new Error("Document is unavailable."));
        return;
      }

      const existing = [...document.scripts].find(script => {
        const src = script.getAttribute("src") || "";
        return src && new URL(src, location.href).pathname === new URL(url, location.href).pathname;
      });
      if (existing) {
        state.attempts.push({ url, result: "already-present" });
        resolve(url);
        return;
      }

      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.dataset.me4ActivationLoader = VERSION;
      script.onload = () => {
        state.attempts.push({ url, result: "loaded" });
        resolve(url);
      };
      script.onerror = () => {
        state.attempts.push({ url, result: "failed" });
        script.remove();
        reject(new Error(`Bundle could not be loaded: ${url}`));
      };
      document.head.appendChild(script);
    });
  }

  async function loadBundle() {
    if (isReady()) {
      state.status = "ACTIVE";
      updateBadge();
      return true;
    }

    for (const url of BUNDLE_CANDIDATES) {
      try {
        await loadScript(url);
        state.bundleUrl = url;
        await new Promise(resolve => setTimeout(resolve, 250));
        if (activateAPIs()) return true;
      } catch (error) {
        warn(error.message);
      }
    }

    throw new Error(
      "Phase 13 bundle bulunamadı. Bundle root dizinde veya " +
      "FIFA_MATCH_ENGINE_V4_PHASE13_GRAND_CALIBRATION_BALANCE_ENGINE klasöründe olmalıdır."
    );
  }

  async function boot() {
    ensureBadge();
    detectDuplicatePhaseScripts();
    updateBadge();

    try {
      await loadBundle();

      // Manager Room can initialize after the bundle. Keep activation alive.
      let checks = 0;
      const timer = setInterval(() => {
        checks += 1;
        activateAPIs();
        updateBadge();
        if (state.status === "ACTIVE" && globalThis.FIFA_MANAGER_ROOM) {
          clearInterval(timer);
        } else if (checks >= 120) {
          clearInterval(timer);
          if (state.status !== "ACTIVE") {
            state.status = "ERROR";
            state.error = "Motor global API'leri zamanında oluşmadı.";
            updateBadge();
          }
        }
      }, 500);
    } catch (error) {
      state.status = "ERROR";
      state.error = error?.message || String(error);
      updateBadge();
      console.error("[ME4 ACTIVATION]", error);
    }
  }

  globalThis.ME4Activation = Object.freeze({
    VERSION,
    getStatus: () => JSON.parse(JSON.stringify(state)),
    retry: boot,
    activateAPIs
  });

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }
})();
