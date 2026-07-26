(() => {
  "use strict";
  const SELECTORS = [
    ".f9-command-hero", ".v46-signal-strip", ".f9-mode-card", ".panel", ".kpi-grid",
    ".group-banner", ".museum-hero", ".member-hero", ".poll-hero", ".table-wrap"
  ].join(",");
  let observer;
  function attachReveal(root=document){
    const nodes=[...root.querySelectorAll(SELECTORS)].filter(node=>!node.classList.contains("v46-reveal"));
    nodes.forEach(node=>{node.classList.add("v46-reveal"); observer?.observe(node);});
  }
  function boot(){
    document.documentElement.dataset.visualRebirth="46.0.0";
    const wipe=document.createElement("div"); wipe.className="v46-route-wipe"; document.body.appendChild(wipe);
    observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target);}}),{threshold:.08,rootMargin:"0px 0px -5%"});
    attachReveal();
    const view=document.getElementById("view");
    if(view){new MutationObserver(()=>requestAnimationFrame(()=>attachReveal(view))).observe(view,{childList:true,subtree:true});}
    document.addEventListener("click",event=>{if(event.target.closest("[data-nav]")){wipe.classList.remove("run");void wipe.offsetWidth;wipe.classList.add("run");}},true);
    window.addEventListener("pointermove",event=>{document.documentElement.style.setProperty("--v46-x",`${event.clientX}px`);document.documentElement.style.setProperty("--v46-y",`${event.clientY}px`);},{passive:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
