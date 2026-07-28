(() => {
  "use strict";

  const GROUPS = {
    tournament: new Set(["livematch","livestats","form","odds","intelligence","chat","setup","league","gold","silver","knockout","finalpoll","print","seasonhub"]),
    records: new Set(["archive","benchmark","alltime","teams","backup"]),
  };

  const BREADCRUMBS = {
    dashboard:["FIFA 9","Ana Merkez"], livematch:["FIFA 9","Turnuva Modu","Canlı Maç"],
    livestats:["FIFA 9","Turnuva Modu","Canlı İstatistikler"], form:["FIFA 9","Turnuva Modu","Form Merkezi"],
    odds:["FIFA 9","Turnuva Modu","Maç Oranları"], intelligence:["FIFA 9","Turnuva Modu","Zekâ Merkezi"],
    chat:["FIFA 9","Turnuva Modu","Turnuva Sohbeti"], setup:["FIFA 9","Turnuva Modu","Kura & Oyuncular"],
    league:["FIFA 9","Turnuva Modu","League Phase"], gold:["FIFA 9","Turnuva Modu","Altın Grup"],
    silver:["FIFA 9","Turnuva Modu","Gümüş Grup"], knockout:["FIFA 9","Turnuva Modu","Final Chapter"],
    finalpoll:["FIFA 9","Turnuva Modu","Final Chapter Kararı"], seasonhub:["FIFA 10","Lig Sistemi","Sezon Hazırlığı"], print:["FIFA 9","Turnuva Modu","Çıktı Merkezi"],
    archive:["FIFA 9","Arşiv & Yönetim","Turnuva Arşivi"], benchmark:["FIFA 9","Arşiv & Yönetim","Turnuva Karnesi"], alltime:["FIFA 9","Arşiv & Yönetim","Tüm Zamanlar"],
    teams:["FIFA 9","Arşiv & Yönetim","Takım İstatistikleri"], backup:["FIFA 9","Arşiv & Yönetim","Veri & Yedek"]
  };

  function clusterForView(view) {
    return Object.entries(GROUPS).find(([, views]) => views.has(view))?.[0] || null;
  }

  function updateHeight(cluster) {
    const body = cluster?.querySelector(".nav-cluster-body");
    if (!body) return;
    body.style.setProperty("--cluster-height", `${body.scrollHeight}px`);
  }

  function setCluster(name, open) {
    const cluster = document.querySelector(`[data-nav-cluster="${name}"]`);
    if (!cluster) return;
    cluster.classList.toggle("is-open", open);
    cluster.querySelector("[data-nav-cluster-toggle]")?.setAttribute("aria-expanded", String(open));
    updateHeight(cluster);
  }

  function openExclusive(name) {
    document.querySelectorAll(".nav-cluster").forEach(cluster => {
      setCluster(cluster.dataset.navCluster, cluster.dataset.navCluster === name);
    });
  }

  function activeView() {
    return document.querySelector(".main-nav .nav-item.active")?.dataset.nav || "dashboard";
  }

  function openActiveGroup() {
    const group = clusterForView(activeView());
    if (group) openExclusive(group);
    else document.querySelectorAll(".nav-cluster").forEach(cluster => setCluster(cluster.dataset.navCluster, false));
    requestAnimationFrame(() => {
      document.querySelector(".main-nav .nav-item.active")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function updateShell() {
    const view = activeView();
    const activeGroup = clusterForView(view);
    if (activeGroup && !document.getElementById("sidebarSearch")?.value) openExclusive(activeGroup);

    document.querySelectorAll(".nav-cluster").forEach(cluster => {
      cluster.classList.toggle("has-active-view", Boolean(cluster.querySelector(".nav-item.active")));
      updateHeight(cluster);
    });

    const crumbs = BREADCRUMBS[view] || ["FIFA 9", document.getElementById("pageTitle")?.textContent || "Merkez"];
    const crumb = document.getElementById("hubBreadcrumb");
    if (crumb) crumb.innerHTML = crumbs.map((item,index) => index === 0 ? `<span>${item}</span>` : index === crumbs.length - 1 ? `<i>›</i><b>${item}</b>` : `<i>›</i><em>${item}</em>`).join("");

    document.querySelectorAll(".mobile-hub-dock [data-nav]").forEach(button => {
      const target = button.dataset.nav;
      const activeMobile = target === view || (target === "league" && GROUPS.tournament.has(view));
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
    openActiveGroup();

    document.addEventListener("click", event => {
      const toggle = event.target.closest("[data-nav-cluster-toggle]");
      if (toggle) {
        event.preventDefault();
        event.stopPropagation();
        const name = toggle.dataset.navClusterToggle;
        const cluster = document.querySelector(`[data-nav-cluster="${name}"]`);
        const willOpen = !cluster?.classList.contains("is-open");
        if (willOpen) openExclusive(name); else setCluster(name, false);
        return;
      }

      if (event.target.closest("#hubLauncherButton") || event.target.closest("#dashboardModeLauncher")) { openLauncher(); return; }
      if (event.target.closest("#hubLauncherClose") || event.target.id === "hubLauncherBackdrop") { closeLauncher(); return; }
      if (event.target.closest("#hubLauncherBackdrop [data-nav]")) closeLauncher();
      if (event.target.closest("[data-nav]")) window.setTimeout(updateShell, 0);
    }, true);

    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openLauncher(); }
      if (event.key === "Escape") closeLauncher();
    });

    const observer = new MutationObserver(updateShell);
    const nav = document.querySelector(".main-nav");
    if (nav) observer.observe(nav, { attributes:true, subtree:true, attributeFilter:["class"] });
    window.addEventListener("resize", () => document.querySelectorAll(".nav-cluster").forEach(updateHeight), { passive:true });
    updateShell();

    window.FIFA9_HUB_NAV = { openActiveGroup, openExclusive, updateHeights: () => document.querySelectorAll(".nav-cluster").forEach(updateHeight) };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true });
  else boot();
})();
