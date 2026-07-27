
(() => {
  "use strict";

  const STORAGE_KEY = "fifa9-grand-final-announcement-v47-6-0-dismissed";
  const OPEN_DELAY = 160;
  const CLOSE_DELAY = 5000;

  function ready(fn){
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once:true });
    else fn();
  }

  ready(() => {
    const shell = document.getElementById("grandFinalAnnouncement");
    const closeBtn = document.getElementById("grandFinalClose");
    const enterBtn = document.getElementById("grandFinalEnter");
    const backdrop = document.getElementById("grandFinalBackdrop");
    const countdown = document.getElementById("grandFinalCountdown");
    if (!shell || !closeBtn || !enterBtn || !countdown) return;

    if (sessionStorage.getItem(STORAGE_KEY) === "1") return;

    let closable = false;
    let ticker = null;
    let remaining = Math.ceil(CLOSE_DELAY / 1000);

    function updateCountdown(){
      if (closable) {
        countdown.textContent = "Duyuruyu kapatabilir ve siteyi gezebilirsiniz.";
      } else {
        countdown.textContent = `Çıkış işareti ${remaining} saniye içinde aktif olacak`;
      }
    }

    function releaseClose(){
      closable = true;
      closeBtn.disabled = false;
      closeBtn.classList.add("is-ready");
      closeBtn.setAttribute("aria-hidden", "false");
      updateCountdown();
      if (ticker) window.clearInterval(ticker);
    }

    function closeAnnouncement(){
      sessionStorage.setItem(STORAGE_KEY, "1");
      shell.classList.add("closing");
      document.body.classList.remove("grand-final-open");
      window.setTimeout(() => {
        shell.classList.add("hidden");
        shell.classList.remove("is-open", "closing");
        shell.setAttribute("aria-hidden", "true");
      }, 420);
    }

    function handleDismiss(){
      if (!closable) return;
      closeAnnouncement();
    }

    closeBtn.addEventListener("click", handleDismiss);
    enterBtn.addEventListener("click", handleDismiss);
    backdrop?.addEventListener("click", handleDismiss);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") handleDismiss();
    });

    updateCountdown();
    ticker = window.setInterval(() => {
      if (closable) return;
      remaining -= 1;
      if (remaining <= 0) {
        remaining = 0;
        releaseClose();
      }
      updateCountdown();
    }, 1000);

    window.setTimeout(() => {
      shell.classList.remove("hidden");
      shell.classList.add("is-open");
      shell.setAttribute("aria-hidden", "false");
      document.body.classList.add("grand-final-open");
    }, OPEN_DELAY);

    window.setTimeout(releaseClose, CLOSE_DELAY);
  });
})();
