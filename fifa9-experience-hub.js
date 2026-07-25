(() => {
  "use strict";

  const GROUPS = {
    tournament: new Set(["livematch","livestats","form","odds","intelligence","chat","setup","league","gold","silver","knockout","finalpoll","print"]),
    "league-system": new Set(["seasonhub","managerroom","managerhall","museum"]),
    records: new Set(["archive","alltime","teams","backup"]),
    "formula-racing": new Set(["formula1"])
  };

  const BREADCRUMBS = {
    dashboard:["FIFA 9","Ana Merkez"],
    livematch:["FIFA 9","Turnuva Modu","Canlı Maç"],
    livestats:["FIFA 9","Turnuva Modu","Canlı İstatistikler"],
    form:["FIFA 9","Turnuva Modu","Form Merkezi"],
    odds:["FIFA 9","Turnuva Modu","Maç Oranları"],
    intelligence:["FIFA 9","Turnuva Modu","Zekâ Merkezi"],
    chat:["FIFA 9","Turnuva Modu","Turnuva Sohbeti"],
    setup:["FIFA 9","Turnuva Modu","Kura & Oyuncular"],
    league:["FIFA 9","Turnuva Modu","League Phase"],
    gold:["FIFA 9","Turnuva Modu","Altın Grup"],
    silver:["FIFA 9","Turnuva Modu","Gümüş Grup"],
    knockout:["FIFA 9","Turnuva Modu","Final Chapter"],
    finalpoll:["FIFA 9","Turnuva Modu","Final Chapter Kararı"],
    print:["FIFA 9","Turnuva Modu","Çıktı Merkezi"],
    seasonhub:["FIFA 9","FIFA Lig Sistemi","Lig Merkezi"],
    managerroom:["FIFA 9","FIFA Lig Sistemi","Manager's Room"],
    managerhall:["FIFA 9","FIFA Lig Sistemi","Manager Hall"],
    museum:["FIFA 9","FIFA Lig Sistemi","Kupa Müzesi"],
    archive:["FIFA 9","Arşiv & Yönetim","Turnuva Arşivi"],
    alltime:["FIFA 9","Arşiv & Yönetim","Tüm Zamanlar"],
    teams:["FIFA 9","Arşiv & Yönetim","Takım İstatistikleri"],
    backup:["FIFA 9","Arşiv & Yönetim","Veri & Yedek"],
    formula1:["Tournament Universe","Formula Horizon Reborn","PC + Mobile"]
  };

  function setCluster(name, open, remember = true) {
    const cluster = document.querySelector(`[data-nav-cluster="${name}"]`);
    if (!cluster) return;
    cluster.classList.toggle("is-open", open);
    cluster.querySelector("[data-nav-cluster-toggle]")?.setAttribute("aria-expanded", String(open));
    if (remember) {
      const saved = JSON.parse(localStorage.getItem("fifa9-hub-nav-clusters") || "{}");
      saved[name] = open;
      localStorage.setItem("fifa9-hub-nav-clusters", JSON.stringify(saved));
    }
  }

  function openForView(view) {
    Object.entries(GROUPS).forEach(([name, views]) => {
      if (views.has(view)) setCluster(name, true, false);
    });
  }

  function updateShell() {
    const active = document.querySelector(".main-nav .nav-item.active");
    const view = active?.dataset.nav || "dashboard";
    openForView(view);

    document.querySelectorAll(".nav-cluster").forEach(cluster => {
      const activeInside = Boolean(cluster.querySelector(".nav-item.active"));
      cluster.classList.toggle("has-active-view", activeInside);
    });

    const crumbs = BREADCRUMBS[view] || ["FIFA 9", document.getElementById("pageTitle")?.textContent || "Merkez"];
    const crumb = document.getElementById("hubBreadcrumb");
    if (crumb) {
      crumb.innerHTML = crumbs.map((item, index) => {
        if (index === 0) return `<span>${item}</span>`;
        if (index === crumbs.length - 1) return `<i>›</i><b>${item}</b>`;
        return `<i>›</i><em>${item}</em>`;
      }).join("");
    }

    document.querySelectorAll(".mobile-hub-dock [data-nav]").forEach(button => {
      const target = button.dataset.nav;
      const activeMobile = target === view
        || (target === "league" && GROUPS.tournament.has(view))
        || (target === "seasonhub" && GROUPS["league-system"].has(view))
        || (target === "formula1" && view === "formula1");
      button.classList.toggle("active", activeMobile);
    });
  }

  function openLauncher() {
    document.getElementById("hubLauncherBackdrop")?.classList.remove("hidden");
    document.body.classList.add("hub-launcher-open");
  }

  function closeLauncher() {
    document.getElementById("hubLauncherBackdrop")?.classList.add("hidden");
    document.body.classList.remove("hub-launcher-open");
  }

  function boot() {
    const saved = JSON.parse(localStorage.getItem("fifa9-hub-nav-clusters") || "{}");
    Object.keys(GROUPS).forEach(name => setCluster(name, saved[name] ?? (name === "tournament"), false));

    document.addEventListener("click", event => {
      const toggle = event.target.closest("[data-nav-cluster-toggle]");
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        const name = toggle.dataset.navClusterToggle;
        const cluster = document.querySelector(`[data-nav-cluster="${name}"]`);
        setCluster(name, !cluster?.classList.contains("is-open"));
        return;
      }

      if (event.target.closest("#hubLauncherButton") || event.target.closest("#dashboardModeLauncher")) {
        openLauncher();
        return;
      }
      if (event.target.closest("#hubLauncherClose") || event.target.id === "hubLauncherBackdrop") {
        closeLauncher();
        return;
      }
      if (event.target.closest("#hubLauncherBackdrop [data-nav]")) {
        closeLauncher();
      }

      if (event.target.closest("[data-nav]")) {
        window.setTimeout(updateShell, 0);
      }
    }, true);

    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openLauncher();
      }
      if (event.key === "Escape") closeLauncher();
    });

    const observer = new MutationObserver(updateShell);
    document.querySelector(".main-nav") && observer.observe(document.querySelector(".main-nav"), {attributes:true,subtree:true,attributeFilter:["class"]});
    updateShell();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
  else boot();
})();