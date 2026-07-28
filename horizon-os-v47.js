(() => {
  "use strict";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (selector, root=document) => root.querySelector(selector);
  const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
  let fieldFrame = 0;
  let fieldCleanup = null;

  function currentRoute(){
    return $(".nav-item.active")?.dataset.nav || $(".os-primary-nav button.active")?.dataset.nav || "dashboard";
  }

  function syncRoute(){
    const route = currentRoute();
    document.body.dataset.osRoute = route;
    $$(".os-primary-nav [data-nav]").forEach(button => button.classList.toggle("active", button.dataset.nav === route || (route === "league" && button.dataset.nav === "knockout")));
    $$(".mobile-hub-dock [data-nav]").forEach(button => button.classList.toggle("active", button.dataset.nav === route));
    if(route !== "dashboard") stopField();
    else requestAnimationFrame(startField);
  }

  function setupSidebar(){
    const sidebar = $("#sidebar");
    const backdrop = $("#sidebarBackdrop");
    if(!sidebar || !backdrop) return;
    const close = () => sidebar.classList.remove("open");
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", event => { if(event.key === "Escape") close(); });
    sidebar.addEventListener("click", event => { if(event.target.closest("[data-nav]")) close(); });
  }

  function enhanceCommandPalette(){
    const launcher = $(".hub-launcher");
    const grid = $(".hub-launcher-grid");
    if(!launcher || !grid || $(".os-command-search", launcher)) return;
    const search = document.createElement("label");
    search.className = "os-command-search";
    search.innerHTML = `<span>⌕</span><input type="search" placeholder="Search modes, tools and records…" aria-label="Komuta paletinde ara"><kbd>ESC</kbd>`;
    grid.parentNode.insertBefore(search, grid);
    const input = $("input", search);
    input.addEventListener("input", () => {
      const value = input.value.trim().toLocaleLowerCase("tr");
      $$("button", grid).forEach(button => button.hidden = value && !button.textContent.toLocaleLowerCase("tr").includes(value));
    });
    const backdrop = $("#hubLauncherBackdrop");
    new MutationObserver(() => { if(!backdrop.classList.contains("hidden")) setTimeout(() => input.focus(), 50); }).observe(backdrop,{attributes:true,attributeFilter:["class"]});
  }

  function setupKeyboard(){
    document.addEventListener("keydown", event => {
      if((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"){
        event.preventDefault();
        $("#hubLauncherButton")?.click();
      }
      if(event.target.matches("input,textarea,select,[contenteditable='true']")) return;
      if(event.key.toLowerCase() === "h") document.querySelector('[data-nav="dashboard"]')?.click();
      if(event.key.toLowerCase() === "l") document.querySelector('.os-primary-nav [data-nav="seasonhub"]')?.click();
    });
  }

  function setupPointerGlow(){
    if(reduceMotion) return;
    window.addEventListener("pointermove", event => {
      document.documentElement.style.setProperty("--os-mouse-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--os-mouse-y", `${event.clientY}px`);
    }, {passive:true});
  }

  function attachTilt(root=document){ /* Performance Lite: pointer-tilt disabled. */ }

  function attachReveal(root=document){
    const selectors = ".os-section-heading,.os-arena-card,.os-operation-rail button,.os-system-story,.os-system-data,.panel,.kpi-grid,.table-wrap,.group-banner,.museum-hero,.member-hero,.poll-hero";
    const nodes = $$(selectors,root).filter(node => !node.dataset.osRevealReady);
    if(reduceMotion){nodes.forEach(node=>node.classList.add("is-visible"));return;}
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if(entry.isIntersecting){entry.target.classList.add("is-visible");observer.unobserve(entry.target);}
    }),{threshold:.08,rootMargin:"0px 0px -4%"});
    nodes.forEach((node,index)=>{node.dataset.osRevealReady="1";node.classList.add("os-reveal");node.style.transitionDelay=`${Math.min(index%5,4)*55}ms`;observer.observe(node);});
  }

  function animateCounts(root=document){
    if(reduceMotion) return;
    $$('[data-os-count]',root).forEach(node => {
      if(node.dataset.osCountReady) return;
      node.dataset.osCountReady="1";
      const target=Number(node.dataset.osCount)||0; const start=performance.now();
      const tick=now=>{const p=Math.min(1,(now-start)/900);node.textContent=Math.round(target*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(tick);};
      requestAnimationFrame(tick);
    });
  }

  function stopField(){
    cancelAnimationFrame(fieldFrame); fieldFrame=0;
    fieldCleanup?.(); fieldCleanup=null;
  }

  function startField(){
    const canvas = $('[data-os-field]');
    if(!canvas || reduceMotion || canvas.dataset.osStaticReady) return;
    canvas.dataset.osStaticReady="1";
    const ctx = canvas.getContext("2d",{alpha:true}); if(!ctx) return;
    const draw=()=>{
      const rect=canvas.getBoundingClientRect();
      const dpr=Math.min(1.25,devicePixelRatio||1);
      const width=rect.width, height=rect.height;
      canvas.width=Math.max(1,Math.floor(width*dpr));
      canvas.height=Math.max(1,Math.floor(height*dpr));
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,width,height);
      const cols=Math.max(8,Math.min(18,Math.round(width/90)));
      const rows=Math.max(5,Math.min(10,Math.round(height/80)));
      const nodes=[];
      for(let y=1;y<rows;y++) for(let x=1;x<cols;x++) {
        const px=(x/cols)*width + ((y%2)*18);
        const py=(y/rows)*height;
        nodes.push({x:px,y:py});
      }
      ctx.lineWidth=.55;
      for(let i=0;i<nodes.length;i++){
        const a=nodes[i];
        for(let j=i+1;j<nodes.length;j++){
          const b=nodes[j],d=Math.hypot(a.x-b.x,a.y-b.y);
          if(d<115){ctx.strokeStyle=`rgba(92,157,235,${(1-d/115)*.095})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
        }
      }
      nodes.forEach((n,i)=>{ctx.fillStyle=i%13===0?(i%26===0?"rgba(74,196,255,.62)":"rgba(195,75,220,.55)"):"rgba(132,176,228,.22)";ctx.beginPath();ctx.arc(n.x,n.y,i%13===0?1.5:.8,0,Math.PI*2);ctx.fill();});
    };
    draw();
    let timer=0;
    const onResize=()=>{clearTimeout(timer);timer=setTimeout(draw,120);};
    window.addEventListener("resize",onResize,{passive:true});
    fieldCleanup=()=>window.removeEventListener("resize",onResize);
  }

  function routeTransition(){
    let layer=$(".os-route-transition");if(!layer){layer=document.createElement("div");layer.className="os-route-transition";document.body.appendChild(layer);}
    layer.classList.remove("run");void layer.offsetWidth;layer.classList.add("run");
  }

  function enhanceView(){
    const view=$("#view"); if(!view) return;
    attachTilt(view);attachReveal(view);animateCounts(view);syncRoute();
    if(currentRoute()==="dashboard") startField();
  }

  function boot(){
    document.documentElement.dataset.horizonOs="47.11.0-fifa10-era";
    enhanceCommandPalette();setupKeyboard();enhanceView();
    const view=$("#view");if(view)new MutationObserver(()=>requestAnimationFrame(enhanceView)).observe(view,{childList:true});
    document.addEventListener("click",event=>{if(event.target.closest("[data-nav]")){routeTransition();setTimeout(syncRoute,30);}},true);
    window.addEventListener("scroll",()=>$(".os-topbar")?.classList.toggle("is-scrolled",scrollY>20),{passive:true});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)stopField();else if(currentRoute()==="dashboard")startField();});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
