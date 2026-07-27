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
      if(event.key.toLowerCase() === "l") document.querySelector('.os-primary-nav [data-nav="livematch"]')?.click();
      if(event.key.toLowerCase() === "f") document.querySelector('.os-primary-nav [data-nav="formula1"]')?.click();
    });
  }

  function setupPointerGlow(){
    if(reduceMotion) return;
    window.addEventListener("pointermove", event => {
      document.documentElement.style.setProperty("--os-mouse-x", `${event.clientX}px`);
      document.documentElement.style.setProperty("--os-mouse-y", `${event.clientY}px`);
    }, {passive:true});
  }

  function attachTilt(root=document){
    if(reduceMotion || matchMedia("(pointer:coarse)").matches) return;
    $$('[data-os-tilt]',root).forEach(card => {
      if(card.dataset.osTiltReady) return;
      card.dataset.osTiltReady = "1";
      card.addEventListener("pointermove", event => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - .5;
        const y = (event.clientY - rect.top) / rect.height - .5;
        card.style.transform = `perspective(1000px) rotateX(${(-y*4).toFixed(2)}deg) rotateY(${(x*5).toFixed(2)}deg) translateY(-2px)`;
      });
      card.addEventListener("pointerleave", () => card.style.transform = "");
    });
  }

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
    if(!canvas || fieldFrame || reduceMotion) return;
    const ctx = canvas.getContext("2d",{alpha:true}); if(!ctx) return;
    let width=0,height=0,dpr=1,nodes=[];
    const resize=()=>{
      const rect=canvas.getBoundingClientRect();dpr=Math.min(1.5,devicePixelRatio||1);width=rect.width;height=rect.height;canvas.width=Math.max(1,Math.floor(width*dpr));canvas.height=Math.max(1,Math.floor(height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
      const count=Math.max(28,Math.min(78,Math.round(width/22)));nodes=Array.from({length:count},(_,i)=>({x:Math.random()*width,y:Math.random()*height,vx:(Math.random()-.5)*.12,vy:(Math.random()-.5)*.12,r:i%9===0?1.8:1}));
    };
    const draw=()=>{
      ctx.clearRect(0,0,width,height);
      for(const n of nodes){n.x+=n.vx;n.y+=n.vy;if(n.x<0||n.x>width)n.vx*=-1;if(n.y<0||n.y>height)n.vy*=-1;}
      ctx.lineWidth=.6;
      for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d<130){ctx.strokeStyle=`rgba(150,175,190,${(1-d/130)*.13})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
      for(const n of nodes){ctx.fillStyle=n.r>1?"rgba(201,255,66,.72)":"rgba(170,192,207,.32)";ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fill();}
      fieldFrame=requestAnimationFrame(draw);
    };
    resize();window.addEventListener("resize",resize);fieldCleanup=()=>window.removeEventListener("resize",resize);fieldFrame=requestAnimationFrame(draw);
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
    document.documentElement.dataset.horizonOs="47.1.1";
    enhanceCommandPalette();setupKeyboard();setupPointerGlow();enhanceView();
    const view=$("#view");if(view)new MutationObserver(()=>requestAnimationFrame(enhanceView)).observe(view,{childList:true,subtree:true});
    document.addEventListener("click",event=>{if(event.target.closest("[data-nav]")){routeTransition();setTimeout(syncRoute,30);}},true);
    window.addEventListener("scroll",()=>$(".os-topbar")?.classList.toggle("is-scrolled",scrollY>20),{passive:true});
    document.addEventListener("visibilitychange",()=>{if(document.hidden)stopField();else if(currentRoute()==="dashboard")startField();});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
