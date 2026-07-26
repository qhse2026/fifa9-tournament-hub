(() => {
  "use strict";
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  let lastFocus = null;

  function setup() {
    const sidebar = $("#sidebar");
    const backdrop = $("#sidebarBackdrop");
    const closeButton = $("#sidebarClose");
    const search = $("#sidebarSearch");
    const count = $("#sidebarSearchCount");
    if (!sidebar || !backdrop) return;

    function clearSearch() {
      if (!search) return;
      search.value = "";
      sidebar.dataset.searching = "false";
      $$(".nav-search-hidden", sidebar).forEach(node => node.classList.remove("nav-search-hidden"));
      $(".sidebar-search-empty", sidebar)?.remove();
      updateCount();
      window.FIFA9_HUB_NAV?.openActiveGroup?.();
    }

    function updateCount() {
      const visible = $$(".nav-item[data-nav]", sidebar).filter(item => !item.classList.contains("nav-search-hidden")).length;
      if (count) count.textContent = `${visible} seçenek`;
    }

    function filterNavigation() {
      const query = (search?.value || "").trim().toLocaleLowerCase("tr");
      sidebar.dataset.searching = query ? "true" : "false";
      $(".sidebar-search-empty", sidebar)?.remove();
      const home = $(".hub-home-link", sidebar);
      if (home) home.classList.toggle("nav-search-hidden", Boolean(query) && !home.textContent.toLocaleLowerCase("tr").includes(query));

      $$(".nav-cluster", sidebar).forEach(cluster => {
        const items = $$(".nav-item[data-nav]", cluster);
        let matches = 0;
        items.forEach(item => {
          const matched = !query || item.textContent.toLocaleLowerCase("tr").includes(query);
          item.classList.toggle("nav-search-hidden", !matched);
          if (matched) matches += 1;
        });
        const headingMatched = cluster.querySelector(".nav-cluster-toggle")?.textContent.toLocaleLowerCase("tr").includes(query);
        if (query && headingMatched) {
          items.forEach(item => item.classList.remove("nav-search-hidden"));
          matches = items.length;
        }
        cluster.classList.toggle("nav-search-hidden", Boolean(query) && matches === 0);
        if (query && matches > 0) cluster.classList.add("is-open");
      });
      window.FIFA9_HUB_NAV?.updateHeights?.();
      updateCount();

      if (query && $$(".nav-item[data-nav]", sidebar).every(item => item.classList.contains("nav-search-hidden"))) {
        const empty = document.createElement("div");
        empty.className = "sidebar-search-empty";
        empty.textContent = "Bu aramayla eşleşen bir mod veya araç bulunamadı.";
        $(".main-nav", sidebar)?.appendChild(empty);
      }
      if (!query) window.FIFA9_HUB_NAV?.openActiveGroup?.();
    }

    function focusables() {
      return $$("button,[href],input,select,textarea,[tabindex]:not([tabindex='-1'])", sidebar).filter(node => !node.disabled && !node.hidden && node.offsetParent !== null);
    }

    function open() {
      if (sidebar.classList.contains("open")) return;
      lastFocus = document.activeElement;
      sidebar.classList.add("open");
      sidebar.setAttribute("aria-hidden", "false");
      document.body.classList.add("os-drawer-open");
      clearSearch();
      window.FIFA9_HUB_NAV?.openActiveGroup?.();
      requestAnimationFrame(() => {
        search?.focus({ preventScroll:true });
        $(".nav-item.active", sidebar)?.scrollIntoView({ block:"nearest" });
      });
    }

    function close(options={}) {
      if (!sidebar.classList.contains("open")) return;
      sidebar.classList.remove("open");
      sidebar.setAttribute("aria-hidden", "true");
      document.body.classList.remove("os-drawer-open");
      clearSearch();
      if (options.restoreFocus !== false && lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll:true });
    }

    function toggle() { sidebar.classList.contains("open") ? close() : open(); }

    closeButton?.addEventListener("click", () => close());
    backdrop.addEventListener("click", () => close());
    sidebar.addEventListener("click", event => {
      if (event.target.closest("[data-nav]")) close({ restoreFocus:false });
    });
    search?.addEventListener("input", filterNavigation);
    search?.addEventListener("keydown", event => {
      if (event.key === "Escape" && search.value) { event.preventDefault(); clearSearch(); }
    });

    document.addEventListener("keydown", event => {
      if (!sidebar.classList.contains("open")) return;
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    window.addEventListener("resize", () => window.FIFA9_HUB_NAV?.updateHeights?.(), { passive:true });
    window.FIFA9_NAVIGATION = { open, close, toggle, clearSearch };
    updateCount();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup, { once:true });
  else setup();
})();
