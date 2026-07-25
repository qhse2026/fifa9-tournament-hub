(() => {
  "use strict";

  const VERSION = "45.0.4";
  const LOADER_SCRIPT_URL = document.currentScript?.src
    || new URL("formula-reborn/formula-reborn-loader.js", window.location.href).href;
  const LOADER_BASE_URL = new URL(".", LOADER_SCRIPT_URL);
  let modulePromise = null;
  let mountedTarget = null;

  function loadModule() {
    if (!modulePromise) {
      const moduleUrl = new URL("app/formula-reborn-app.js", LOADER_BASE_URL);
      moduleUrl.searchParams.set("v", VERSION);
      modulePromise = import(moduleUrl.href);
    }
    return modulePromise;
  }

  function loadingMarkup() {
    return `<section class="fr45-loader-card" data-no-translate>
      <span>FORMULA HORIZON REBORN</span>
      <h2>Loading V45.0.4</h2>
      <p>Preparing the WebGL renderer, official vehicle physics and Phase 1 circuits…</p>
    </section>`;
  }

  function errorMarkup(error) {
    return `<section class="fr45-loader-card error" data-no-translate>
      <span>FORMULA HORIZON REBORN</span>
      <h2>V45 could not load</h2>
      <p>${String(error?.message || error || "Unknown module error")}</p>
      <small>Expected module: /formula-reborn/app/formula-reborn-app.js</small>
      <small>Check GitHub deployment files, Vercel deployment and browser cache.</small>
    </section>`;
  }

  async function render(target) {
    mountedTarget = target;
    if (!target) return;
    target.innerHTML = loadingMarkup();

    if (!("WebGLRenderingContext" in window)) {
      target.innerHTML = errorMarkup(new Error("WebGL is not available in this browser."));
      return;
    }

    try {
      const module = await loadModule();
      await module.mount(target);
    } catch (error) {
      console.error("Formula Horizon Reborn module load failed", error);
      target.innerHTML = errorMarkup(error);
    }
  }

  async function stopRace() {
    try {
      const module = await modulePromise;
      module?.stop?.();
    } catch {}
    mountedTarget = null;
  }

  function dashboardCard() {
    return `<article class="experience-mode-card formula-mode-card" data-nav="formula1">
      <div class="experience-mode-icon">FR</div>
      <div>
        <span>FORMULA HORIZON REBORN</span>
        <h3>V45.0.4 · Track Visibility Hotfix</h3>
        <p>Real WebGL tracks, braking-dependent physics and global five-lap records.</p>
      </div>
      <footer><b>3 CIRCUITS</b><small>MASTERPIECE FOUNDATION</small></footer>
    </article>`;
  }

  window.F1_RACING = Object.freeze({
    render,
    stopRace,
    dashboardCard,
    getState: async () => {
      try {
        const module = await loadModule();
        return module.getState?.() || null;
      } catch {
        return null;
      }
    }
  });
})();
