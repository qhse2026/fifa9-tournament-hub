(() => {
  "use strict";
  const VERSION = "1.0.0";
  const BUILD = "579000";
  const rowId = () => window.FIFA_CLOUD_CONFIG?.tournamentRowId || "fifa-9";
  const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const ui = (tr,en) => window.FIFA_I18N?.language === "en" ? en : tr;
  let mount = null;
  let data = null;
  let busy = false;
  let notice = { type:"", text:"" };
  let timer = null;
  let listeners = false;

  const cloud = () => window.FIFA_CLOUD || null;
  const client = () => cloud()?.getClient?.() || null;
  const user = () => cloud()?.getUser?.() || null;
  const profile = () => cloud()?.getPlayerProfile?.() || null;

  async function ensureCloud() {
    if (client()) return true;
    if (!cloud()?.init) return false;
    try {
      await cloud().init({
        onAuth: () => setTimeout(refresh, 0),
        onState: () => setTimeout(refresh, 0),
        onStatus: () => {}
      });
      return Boolean(client());
    } catch (error) {
      console.warn("Player Result Desk cloud init failed", error);
      return false;
    }
  }

  async function fetchDesk() {
    if (!await ensureCloud()) throw new Error(ui("Bulut bağlantısı yapılandırılmamış.","Cloud connection is not configured."));
    if (!user()) return null;
    const { data: result, error } = await client().rpc("get_my_fifa10_result_desk", { p_tournament_id: rowId() });
    if (error) {
      if (/function .* does not exist|Could not find the function|42883/i.test(String(error.message || error))) {
        throw new Error(ui("Player Result Desk veritabanı kurulumu eksik. SUPABASE_V5_7_2_PLAYER_RESULT_DESK.sql dosyasını Supabase SQL Editor'da bir kez çalıştırın.","Player Result Desk database setup is missing. Run SUPABASE_V5_7_2_PLAYER_RESULT_DESK.sql once in Supabase SQL Editor."));
      }
      throw error;
    }
    return result || null;
  }

  function statusLabel(match) {
    if (match.completed) return ui("RESMÎ SONUÇ","OFFICIAL RESULT");
    if (match.submission_status === "confirmed") return ui("RESMÎLEŞTİRİLİYOR","PUBLISHING");
    if (match.submission_status === "pending") return ui("RAKİP TEYİDİ BEKLENİYOR","OPPONENT CONFIRMATION PENDING");
    if (match.status === "waiting") return ui("ÖNCEKİ TUR BEKLENİYOR","WAITING FOR PRIOR ROUND");
    return ui("SONUÇ GİRİŞİ AÇIK","RESULT ENTRY OPEN");
  }

  function matchCard(match) {
    const mine = String(data?.player_name || "");
    const isHome = mine && mine === match.home_name;
    const confirmedMine = isHome ? match.confirmed_home : match.confirmed_away;
    const confirmedOther = isHome ? match.confirmed_away : match.confirmed_home;
    const proposal = match.proposal || {};
    const homeScore = proposal.home_score ?? (match.completed ? match.home_score : "");
    const awayScore = proposal.away_score ?? (match.completed ? match.away_score : "");
    const homeTeam = proposal.home_team ?? match.home_team ?? "";
    const awayTeam = proposal.away_team ?? match.away_team ?? "";
    const canSubmit = Boolean(match.can_submit && !match.completed && match.home_name && match.away_name);
    const buttonLabel = match.submission_status === "pending" && !confirmedMine ? ui("AYNI SONUCU TEYİT ET","CONFIRM THIS RESULT") : match.submission_status === "pending" && confirmedMine && !confirmedOther ? ui("KAYDI GÜNCELLE","UPDATE SUBMISSION") : match.submission_status === "pending" && confirmedMine ? ui("TEYİDİNİZ ALINDI","YOUR CONFIRMATION IS RECORDED") : ui("SONUCU GÖNDER","SUBMIT RESULT");
    return `<article class="f10-prd-card ${match.completed ? "official" : ""}" data-series-id="${esc(match.series_id)}" data-match-id="${esc(match.match_id)}">
      <header><span>${esc(match.round_label || match.round || "CHAMPIONSHIP")} · ${Number(match.stars)}★ · M${match.match_number}</span><b>${statusLabel(match)}</b></header>
      <div class="f10-prd-versus"><strong>${esc(match.home_name || ui("Bekleniyor","TBD"))}</strong><i>VS</i><strong>${esc(match.away_name || ui("Bekleniyor","TBD"))}</strong></div>
      <div class="f10-prd-score">
        <input name="homeTeam" type="text" list="f10Teams${String(match.stars).replace('.','_')}" value="${esc(homeTeam)}" placeholder="${esc(match.home_name || "Home")} ${ui("takımı","team")}" ${canSubmit ? "" : "disabled"}>
        <input name="homeScore" type="number" min="0" inputmode="numeric" value="${esc(homeScore)}" ${canSubmit ? "" : "disabled"} aria-label="${esc(match.home_name)} score">
        <b>–</b>
        <input name="awayScore" type="number" min="0" inputmode="numeric" value="${esc(awayScore)}" ${canSubmit ? "" : "disabled"} aria-label="${esc(match.away_name)} score">
        <input name="awayTeam" type="text" list="f10Teams${String(match.stars).replace('.','_')}" value="${esc(awayTeam)}" placeholder="${esc(match.away_name || "Away")} ${ui("takımı","team")}" ${canSubmit ? "" : "disabled"}>
      </div>
      <div class="f10-prd-confirmations"><span class="${match.confirmed_home ? "ok" : ""}">✓ ${esc(match.home_name || "Home")}</span><span class="${match.confirmed_away ? "ok" : ""}">✓ ${esc(match.away_name || "Away")}</span>${match.submitted_at ? `<span>${new Date(match.submitted_at).toLocaleString()}</span>` : ""}</div>
      <div class="f10-prd-actions"><small>${match.completed ? ui("Sonuç resmî eleme ağacına işlendi.","The result is published to the official bracket.") : confirmedMine && !confirmedOther ? ui("Rakibiniz aynı sonucu teyit ettiğinde otomatik resmîleşir.","It becomes official automatically when your opponent confirms the same result.") : ui("Skor eşit olamaz; iki takım da zorunludur.","The score cannot be tied; both teams are required.")}</small><button type="button" class="primary" data-prd-action="submit" ${!canSubmit || (confirmedMine && confirmedOther) || busy ? "disabled" : ""}>${buttonLabel}</button></div>
    </article>`;
  }

  function teamLists() {
    const pools = window.FIFA10_TEAM_POOLS || {};
    return [4,4.5,5].map(stars => `<datalist id="f10Teams${String(stars).replace('.','_')}">${(pools[String(stars)] || []).map(team => `<option value="${esc(team)}"></option>`).join("")}</datalist>`).join("");
  }

  function loginView() {
    return `<div class="f10-prd-login"><h3>${ui("Oyuncu hesabınızla giriş yapın","Sign in with your player account")}</h3><form data-prd-login><input name="email" type="email" autocomplete="username" placeholder="E-posta" required><input name="password" type="password" autocomplete="current-password" placeholder="Şifre" required><button class="primary" type="submit">${ui("OYUNCU GİRİŞİ","PLAYER SIGN IN")}</button></form><small>${ui("Hesabınız turnuva yöneticisi tarafından oyuncu adınızla eşleştirilmiş olmalıdır.","Your account must be linked to your player identity by the tournament administrator.")}</small></div>`;
  }

  function render(target = mount) {
    if (target) mount = target;
    if (!mount) return;
    const signed = Boolean(user());
    const cards = Array.isArray(data?.matches) ? data.matches : [];
    mount.innerHTML = `<section class="f10-prd"><header><div><span>FIFA 10 · PLAYER RESULT SUBMISSION</span><h2>${ui("Oyuncu Sonuç Masası","Player Result Desk")}</h2><p>${ui("Yönetici gemide/çevrimiçi değilken eleme sonucunu girin. İki rakip aynı skor ve takımları teyit ettiğinde sonuç otomatik olarak resmî turnuva ağacına işlenir.","Enter knockout results while the administrator is away. When both opponents confirm the same score and teams, the result is published automatically to the official bracket.")}</p></div><div class="f10-prd-status"><b>${signed ? esc(data?.player_name || profile()?.player_name || ui("Bağlı oyuncu","Linked player")) : ui("GİRİŞ GEREKLİ","SIGN IN REQUIRED")}</b><small>V${VERSION} · BUILD ${BUILD}</small></div></header><div class="f10-prd-body">${notice.text ? `<div class="f10-prd-message ${notice.type}">${esc(notice.text)}</div>` : ""}${!signed ? loginView() : `<div class="f10-prd-toolbar"><strong>${data?.role === "admin" ? ui("Yönetici görünümü · bütün aktif maçlar","Administrator view · all active matches") : ui("Size ait aktif eleme maçları","Your active knockout matches")}</strong><div><button type="button" data-prd-action="refresh">↻ ${ui("YENİLE","REFRESH")}</button>${window.FIFA_APP_CONTEXT?.navigate ? `<button type="button" data-prd-action="championship">${ui("ELEME MERKEZİ","KNOCKOUT CENTRE")} ↗</button>` : ""}</div></div>${cards.length ? `<div class="f10-prd-grid">${cards.map(matchCard).join("")}</div>` : `<div class="f10-prd-empty">${data?.journey_status === "preview" ? ui("Resmî eleme ağacı henüz mühürlenmedi. Yönetici Eleme Merkezi'ni bir kez açmalıdır.","The official bracket has not been sealed yet. The administrator must open the Knockout Centre once.") : ui("Şu anda size atanmış oynanabilir bir eleme maçı yok.","There is currently no playable knockout match assigned to you.")}</div>`}<div class="f10-prd-system-note">${ui("Güvenlik: Bir oyuncu yalnızca kendi maçını gönderebilir. Çelişen ikinci skor otomatik reddedilir; resmîleşme için iki rakibin birebir aynı sonucu teyit etmesi gerekir.","Security: A player can submit only their own match. A conflicting second result is rejected; both opponents must confirm the exact same result before publication.")}</div>`}</div>${teamLists()}</section>`;
  }

  async function refresh() {
    if (!mount || busy) return;
    busy = true;
    try {
      notice = {type:"",text:""};
      data = await fetchDesk();
    } catch (error) {
      notice = { type:"error", text:String(error?.message || error) };
      data = null;
    } finally {
      busy = false;
      render();
    }
  }

  async function submit(card) {
    if (busy) return;
    const value = name => card.querySelector(`[name="${name}"]`)?.value?.trim?.() ?? "";
    const homeScore = Number(value("homeScore"));
    const awayScore = Number(value("awayScore"));
    const homeTeam = value("homeTeam");
    const awayTeam = value("awayTeam");
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore === awayScore) {
      notice = {type:"error",text:ui("Geçerli ve eşit olmayan bir skor girin.","Enter a valid non-tied score.")}; render(); return;
    }
    if (!homeTeam || !awayTeam) { notice={type:"error",text:ui("Her iki takım adı zorunludur.","Both team names are required.")}; render(); return; }
    busy = true; render();
    try {
      const { data: result, error } = await client().rpc("submit_fifa10_championship_result", {
        p_tournament_id: rowId(), p_series_id: card.dataset.seriesId, p_match_id: card.dataset.matchId,
        p_home_score: homeScore, p_away_score: awayScore, p_home_team: homeTeam, p_away_team: awayTeam
      });
      if (error) throw error;
      notice = {type:"success",text:result?.official ? ui("İki oyuncu teyidi tamamlandı; sonuç resmî ağaca işlendi.","Both confirmations are complete; the result is now official.") : ui("Sonuç kaydedildi. Rakip teyidi bekleniyor.","Result saved. Waiting for opponent confirmation.")};
      window.dispatchEvent(new CustomEvent("fifa10-player-result-updated", { detail: result || {} }));
      data = await fetchDesk();
    } catch (error) { notice={type:"error",text:String(error?.message || error)}; }
    finally { busy=false; render(); }
  }

  async function signIn(form) {
    if (busy) return;
    busy=true; render();
    try {
      const fd=new FormData(form);
      await cloud().signIn(fd.get("email"),fd.get("password"));
      notice={type:"success",text:ui("Oyuncu girişi tamamlandı.","Player sign-in complete.")};
      data=await fetchDesk();
    } catch(error){notice={type:"error",text:String(error?.message||error)}}
    finally{busy=false;render()}
  }

  function installListeners() {
    if (listeners) return; listeners=true;
    document.addEventListener("click", event => {
      const button=event.target.closest("[data-prd-action]"); if(!button) return;
      if(button.dataset.prdAction==="refresh") refresh();
      if(button.dataset.prdAction==="submit") submit(button.closest(".f10-prd-card"));
      if(button.dataset.prdAction==="championship") window.FIFA_APP_CONTEXT?.navigate?.("seasonhub");
    });
    document.addEventListener("submit", event => { const form=event.target.closest("[data-prd-login]"); if(!form)return; event.preventDefault(); signIn(form); });
    window.addEventListener("fifa10-player-result-updated", () => setTimeout(refresh,250));
    document.addEventListener("visibilitychange", () => { if(!document.hidden) refresh(); });
  }

  function startPolling(){ clearInterval(timer); timer=setInterval(()=>{ if(!document.hidden && mount) refresh(); },20000); }
  async function init(target){ mount=target||mount||document.getElementById("fifa10PlayerResultDeskMount")||document.getElementById("printPlayerResultDesk"); if(!mount)return; installListeners(); render(); await refresh(); startPolling(); }

  window.FIFA10_PLAYER_RESULT_DESK={version:VERSION,build:BUILD,render:init,refresh};
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>init()); else setTimeout(()=>init(),0);
})();
