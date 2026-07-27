
(()=>{
  "use strict";
  const STORAGE_KEY="fifa9-final-night-v478-dismissed";
  const DELAY=5000;
  const boot=()=>{
    const shell=document.getElementById("grandFinalAnnouncement");
    const close=document.getElementById("grandFinalClose");
    const enter=document.getElementById("grandFinalEnter");
    const backdrop=document.getElementById("grandFinalBackdrop");
    const label=document.getElementById("grandFinalCountdown");
    if(!shell||!close||!enter||!label)return;
    if(sessionStorage.getItem(STORAGE_KEY)==="1")return;
    let ready=false,remaining=5,ticker;
    const paint=()=>{label.textContent=ready?"Duyuruyu kapatabilir ve siteyi gezebilirsiniz.":`Çıkış işareti ${remaining} saniye içinde aktif olacak`;};
    const unlock=()=>{if(ready)return;ready=true;remaining=0;close.disabled=false;close.classList.add("is-ready");paint();clearInterval(ticker);};
    const dismiss=()=>{if(!ready)return;sessionStorage.setItem(STORAGE_KEY,"1");shell.classList.add("closing");document.body.classList.remove("grand-final-open");setTimeout(()=>{shell.classList.add("hidden");shell.classList.remove("is-open","closing");shell.setAttribute("aria-hidden","true");},520);};
    close.addEventListener("click",dismiss);enter.addEventListener("click",dismiss);backdrop?.addEventListener("click",dismiss);document.addEventListener("keydown",e=>{if(e.key==="Escape")dismiss();});
    paint();ticker=setInterval(()=>{remaining=Math.max(0,remaining-1);paint();if(remaining===0)unlock();},1000);setTimeout(unlock,DELAY);
    requestAnimationFrame(()=>{shell.classList.remove("hidden");shell.classList.add("is-open");shell.setAttribute("aria-hidden","false");document.body.classList.add("grand-final-open");});
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
