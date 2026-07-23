(() => {
  "use strict";

  const VERSION = "4.0.0-lazy-career-fix.1";
  const BUNDLE_URL = "./manager-match-engine-v4-phase13-safe.bundle.js?v=4.0.0-phase13-safe.1";

  const state = {
    version: VERSION,
    status: "IDLE",
    loaded: false,
    loading: false,
    error: null,
    requestedBy: null,
    bundleUrl: BUNDLE_URL,
    duplicateScripts: []
  };

  let loadPromise = null;
  let replayingSubmit = false;

  function findDuplicateScripts() {
    state.duplicateScripts = [...document.scripts]
      .map(script => script.src || "")
      .filter(src => /phase(?:2|3|4|5|6|7|8|9|10|11|12|13)/i.test(src))
      .filter(src => !src.includes("me4-phase13-lazy-loader"));
    return state.duplicateScripts;
  }

  function engineReady() {
    return Boolean(
      globalThis.FIFA_MATCH_ENGINE_V4?.createEngine &&
      globalThis.FIFA_MATCH_ENGINE_V4_PHASE10?.enable &&
      globalThis.FIFA_MATCH_ENGINE_V4_PHASE11_LIVE?.enable &&
      globalThis.FIFA_MATCH_ENGINE_V4_PHASE12?.enable &&
      globalThis.FIFA_MATCH_ENGINE_V4_PHASE13?.enable
    );
  }

  function activate() {
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE10?.enable?.(); } catch (_) {}
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE11_LIVE?.enable?.(); } catch (_) {}
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE12?.enable?.(); } catch (_) {}
    try { globalThis.FIFA_MATCH_ENGINE_V4_PHASE13?.enable?.(); } catch (_) {}

    state.loaded = engineReady();
    state.status = state.loaded ? "ACTIVE" : "LOADED_INCOMPLETE";
    return state.loaded;
  }

  function addStatusBadge() {
    let badge = document.getElementById("me4LazyStatus");
    if (badge) return badge;

    badge = document.createElement("button");
    badge.id = "me4LazyStatus";
    badge.type = "button";
    badge.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:2147483647",
      "border:1px solid rgba(255,255,255,.2)",
      "border-radius:9px",
      "padding:7px 10px",
      "background:#143342",
      "color:#eaf7fa",
      "font:900 10px/1.2 Inter,system-ui,sans-serif",
      "box-shadow:0 8px 28px rgba(0,0,0,.36)",
      "cursor:pointer"
    ].join(";");
    badge.addEventListener("click", () => {
      findDuplicateScripts();
      console.info("[ME4 LAZY]", JSON.parse(JSON.stringify(state)));
      alert([
        `Durum: ${state.status}`,
        `Yüklendi: ${state.loaded ? "EVET" : "HAYIR"}`,
        `Tetikleyen: ${state.requestedBy || "henüz yok"}`,
        state.error ? `Hata: ${state.error}` : "",
        state.duplicateScripts.length
          ? `UYARI: ${state.duplicateScripts.length} eski Phase scripti hâlâ index.html içinde.`
          : ""
      ].filter(Boolean).join("\n"));
    });
    document.body.appendChild(badge);
    return badge;
  }

  function updateBadge() {
    const badge = addStatusBadge();
    if (state.status === "ACTIVE") {
      badge.textContent = "ME4 · MAÇ MOTORU AKTİF";
      badge.style.background = "#17633c";
    } else if (state.status === "LOADING") {
      badge.textContent = "ME4 · MAÇ MOTORU YÜKLENİYOR";
      badge.style.background = "#755718";
    } else if (state.status === "ERROR") {
      badge.textContent = "ME4 · YÜKLEME HATASI";
      badge.style.background = "#872828";
    } else {
      badge.textContent = "ME4 · KARİYER MODU HAFİF";
      badge.style.background = "#143342";
    }
  }

  function loadEngine(reason = "MATCH_SCREEN") {
    state.requestedBy = reason;

    if (engineReady()) {
      activate();
      updateBadge();
      return Promise.resolve(true);
    }

    if (loadPromise) return loadPromise;

    state.status = "LOADING";
    state.loading = true;
    updateBadge();

    loadPromise = new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script =>
        (script.src || "").includes("manager-match-engine-v4-phase13-safe.bundle.js")
      );

      if (existing) {
        const started = Date.now();
        const wait = () => {
          if (activate()) {
            state.loading = false;
            updateBadge();
            resolve(true);
            return;
          }
          if (Date.now() - started > 10000) {
            const error = new Error("Safe Phase 13 API'leri 10 saniyede oluşmadı.");
            state.status = "ERROR";
            state.error = error.message;
            state.loading = false;
            updateBadge();
            reject(error);
            return;
          }
          setTimeout(wait, 100);
        };
        wait();
        return;
      }

      const script = document.createElement("script");
      script.src = BUNDLE_URL;
      script.async = false;
      script.dataset.me4LazyLoaded = VERSION;

      script.onload = () => {
        // Let the bundle finish its own auto-enable cycle without blocking the click.
        setTimeout(() => {
          const ok = activate();
          state.loading = false;
          if (!ok) {
            state.status = "ERROR";
            state.error = "Bundle yüklendi fakat motor API'leri tamamlanmadı.";
            updateBadge();
            reject(new Error(state.error));
            return;
          }
          updateBadge();
          resolve(true);
        }, 0);
      };

      script.onerror = () => {
        state.loading = false;
        state.status = "ERROR";
        state.error = `Bundle bulunamadı: ${BUNDLE_URL}`;
        updateBadge();
        reject(new Error(state.error));
      };

      document.head.appendChild(script);
    }).finally(() => {
      if (state.status !== "ACTIVE") loadPromise = null;
    });

    return loadPromise;
  }

  // Critical: keep career PIN login completely free of Phase 13.
  document.addEventListener("submit", event => {
    const form = event.target;

    if (form?.id === "managerUnlockForm" || form?.id === "managerCareerForm") {
      state.status = "CAREER_LOGIN";
      updateBadge();
      return;
    }

    if (form?.id !== "managerMatchPlanForm" || replayingSubmit) return;

    if (engineReady()) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const button = form.querySelector('button[type="submit"]');
    const originalText = button?.textContent || "Maçı Başlat";

    if (button) {
      button.disabled = true;
      button.textContent = "ME4 maç motoru yükleniyor...";
    }

    loadEngine("MATCH_PLAN_SUBMIT")
      .then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      .then(() => {
        replayingSubmit = true;
        if (button) {
          button.disabled = false;
          button.textContent = originalText;
        }
        form.requestSubmit();
      })
      .catch(error => {
        console.error("[ME4 LAZY]", error);
        if (button) {
          button.disabled = false;
          button.textContent = "Maçı Başlat";
        }
        globalThis.FIFA_APP_CONTEXT?.toast?.(
          "Maç motoru yüklenemedi. Sayfayı yenileyip tekrar deneyin.",
          "error"
        );
      })
      .finally(() => {
        setTimeout(() => { replayingSubmit = false; }, 0);
      });
  }, true);

  // Warm-load only after the user explicitly enters the match area.
  document.addEventListener("click", event => {
    const managerAction = event.target.closest?.("[data-manager-action]")?.dataset?.managerAction;
    const matchAction = event.target.closest?.("[data-match-action]")?.dataset?.matchAction;

    if (managerAction === "open-match" || matchAction === "resume") {
      setTimeout(() => loadEngine(`CLICK_${managerAction || matchAction}`).catch(() => {}), 0);
    }
  }, true);

  // Resume an already-open match after refresh, but do not load on landing or career login.
  const observer = new MutationObserver(() => {
    if (!document.getElementById("managerMatchMount")) return;
    const planForm = document.getElementById("managerMatchPlanForm");
    const activeCareer = globalThis.FIFA_MANAGER_ROOM?.getActiveCareer?.();
    const liveFixture = activeCareer?.activeMatchFixtureId;

    if (!planForm && liveFixture && !engineReady() && !state.loading) {
      setTimeout(() => loadEngine("EXISTING_LIVE_MATCH").catch(() => {}), 0);
    }
  });

  function boot() {
    findDuplicateScripts();
    addStatusBadge();
    updateBadge();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  globalThis.ME4LazyLoader = Object.freeze({
    VERSION,
    loadEngine,
    getStatus: () => JSON.parse(JSON.stringify(state))
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
