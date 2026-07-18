(() => {
  "use strict";

  const config = window.FIFA_CLOUD_CONFIG || {};
  const tournamentId = String(config.tournamentRowId || "fifa-9");
  const DEVICE_KEY = "fifa9-community-voter-key-v22";
  const cache = new Map();
  let channel = null;
  let hydrateTimer = null;
  let lastRoot = document;

  function deviceKey() {
    let value = localStorage.getItem(DEVICE_KEY);
    if (value) return value;
    value = window.crypto?.randomUUID?.() || `v23-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, value);
    return value;
  }

  function client() {
    return window.FIFA_CLOUD?.getClient?.() || null;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch]));
  }

  function pct(count, total) {
    return total ? Math.round(count / total * 100) : 0;
  }

  function intendedOpen(poll) {
    if (!poll) return false;
    const explicit = poll.getAttribute("data-community-open");
    if (explicit === "true") return true;
    if (explicit === "false") return false;
    // Backward compatibility for v22 markup already cached on a device.
    const legacy = poll.getAttribute("data-open");
    if (legacy === "true") return true;
    if (legacy === "false") return false;
    return Boolean(poll.querySelector("[data-community-vote]:not([disabled])"));
  }

  function emptySummary(matchId) {
    return { matchId, home:0, draw:0, away:0, total:0, myVote:"", top:"", topPct:0, serverOpen:null };
  }

  function aggregateRows(matchIds, rows, pollRows) {
    const map = new Map(matchIds.map(id => [id, emptySummary(id)]));
    const pollMap = new Map((pollRows || []).map(row => [String(row.match_id), Boolean(row.is_open)]));
    for (const row of rows || []) {
      const summary = map.get(String(row.match_id));
      if (!summary || !["home","draw","away"].includes(row.selection)) continue;
      summary[row.selection] += 1;
      summary.total += 1;
      if (row.voter_key === deviceKey()) summary.myVote = row.selection;
    }
    for (const summary of map.values()) {
      const ranked = ["home","draw","away"].sort((a,b)=>summary[b]-summary[a]);
      summary.top = summary.total ? ranked[0] : "";
      summary.topPct = summary.total ? pct(summary[summary.top], summary.total) : 0;
      summary.serverOpen = pollMap.has(summary.matchId) ? pollMap.get(summary.matchId) : null;
      cache.set(summary.matchId, summary);
    }
    return map;
  }

  async function fetchSummaries(matchIds) {
    const ids = [...new Set((matchIds || []).filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const sb = client();
    if (!sb) throw new Error("Canlı veritabanı bağlantısı henüz hazır değil.");
    const [votesResult, pollsResult] = await Promise.all([
      sb.from("fifa9_community_votes")
        .select("match_id, voter_key, selection")
        .eq("tournament_id", tournamentId)
        .in("match_id", ids),
      sb.from("fifa9_match_polls")
        .select("match_id, is_open")
        .eq("tournament_id", tournamentId)
        .in("match_id", ids)
    ]);
    if (votesResult.error) throw votesResult.error;
    if (pollsResult.error) throw pollsResult.error;
    return aggregateRows(ids, votesResult.data || [], pollsResult.data || []);
  }

  function setPollStatus(poll, message, isError = false) {
    const status = poll?.querySelector("[data-community-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function setButtonsState(poll, { disabled = false, selected = "", pending = false } = {}) {
    const buttons = [...(poll?.querySelectorAll("[data-community-vote]") || [])];
    buttons.forEach(button => {
      button.disabled = disabled;
      button.classList.toggle("selected", selected === button.dataset.communityVote);
      button.classList.toggle("vote-pending", pending && selected === button.dataset.communityVote);
    });
  }

  function isOpenNow(poll, summary) {
    const localOpen = intendedOpen(poll);
    const serverOpen = summary?.serverOpen;
    return localOpen && serverOpen !== false;
  }

  function applySummary(poll, summary) {
    if (!poll || !summary) return;
    const total = summary.total || 0;
    const open = isOpenNow(poll, summary);
    const names = {
      home: poll.dataset.homeName || "1",
      draw: "Beraberlik",
      away: poll.dataset.awayName || "2"
    };
    poll.dataset.serverOpen = summary.serverOpen === null ? "unknown" : String(summary.serverOpen);
    poll.querySelector("[data-vote-total]")?.replaceChildren(document.createTextNode(`${total} OY`));
    for (const key of ["home","draw","away"]) {
      const percentage = pct(summary[key], total);
      const pctNode = poll.querySelector(`[data-vote-pct="${key}"]`);
      if (pctNode) pctNode.textContent = `${percentage}%`;
      const bar = poll.querySelector(`[data-vote-bar="${key}"]`);
      if (bar) bar.style.width = `${percentage}%`;
    }
    setButtonsState(poll, { disabled: !open, selected: summary.myVote });
    const verdict = poll.querySelector("[data-community-verdict]");
    if (verdict) {
      if (total) {
        const modelFavorite = poll.dataset.modelFavorite || "";
        const comparison = modelFavorite
          ? (modelFavorite === summary.top ? " · Model ile aynı fikirde" : " · Topluluk modele karşı çıkıyor")
          : "";
        verdict.textContent = `Topluluk favorisi: ${names[summary.top]} · ${summary.topPct}%${comparison}`;
      } else {
        verdict.textContent = open ? "İlk oyu sen kullan." : "Bu maç için kayıtlı topluluk oyu yok.";
      }
    }
    if (open) {
      setPollStatus(poll, summary.myVote ? `Oyun: ${names[summary.myVote]}. Maç başlayana kadar değiştirebilirsin.` : "Oy vermek için 1, X veya 2 seçeneğine dokun.");
    } else if (intendedOpen(poll) && summary.serverOpen === false) {
      setPollStatus(poll, "Bu oylama sunucuda kapalı görünüyor. Maç başlamadıysa yönetici oylamayı yeniden açmalıdır.", true);
    } else {
      setPollStatus(poll, "Oylama maç başladığında kapandı.");
    }
  }

  function applyError(poll, error) {
    const message = String(error?.message || error || "Topluluk oylaması yüklenemedi.");
    let friendly = message;
    if (/relation .*fifa9_community_votes.*does not exist|Could not find the table/i.test(message)) friendly = "v22 Supabase SQL kurulumu bekleniyor.";
    else if (/Voting is closed/i.test(message)) friendly = "Bu maçın oylaması sunucuda kapalı. Maç başlamadıysa yönetici yeniden açabilir.";
    else if (/function .*submit_fifa9_community_vote.* does not exist|Could not find the function/i.test(message)) friendly = "Oy gönderme fonksiyonu bulunamadı. v22 SQL dosyasını yeniden kontrol et.";
    setPollStatus(poll, friendly, true);
  }

  function updateGlobalSummary(root = document) {
    const box = root.querySelector?.("[data-v22-global-summary]") || document.querySelector("[data-v22-global-summary]");
    if (!box) return;
    const cards = [...document.querySelectorAll("[data-archive-match]")];
    const summaries = cards.map(card => ({ card, summary: cache.get(card.dataset.matchId) || emptySummary(card.dataset.matchId) }));
    const totalVotes = summaries.reduce((sum, item) => sum + item.summary.total, 0);
    const modelEligible = cards.filter(card => card.dataset.modelOutcome);
    const modelCorrect = modelEligible.filter(card => card.dataset.modelOutcome === card.dataset.actualOutcome).length;
    const communityEligible = summaries.filter(item => item.summary.total > 0 && item.summary.top);
    const communityCorrect = communityEligible.filter(item => item.summary.top === item.card.dataset.actualOutcome).length;
    const mostVoted = [...summaries].sort((a,b)=>b.summary.total-a.summary.total)[0];
    const articles = [...box.querySelectorAll("article")];
    if (articles[0]) articles[0].innerHTML = `<span>Toplam Topluluk Oyu</span><strong>${totalVotes}</strong><small>Tüm kapanmış maçlar</small>`;
    if (articles[1]) articles[1].innerHTML = `<span>Model Doğruluğu</span><strong>${modelEligible.length ? Math.round(modelCorrect/modelEligible.length*100) : 0}%</strong><small>${modelCorrect}/${modelEligible.length} snapshot</small>`;
    if (articles[2]) articles[2].innerHTML = `<span>Topluluk Doğruluğu</span><strong>${communityEligible.length ? Math.round(communityCorrect/communityEligible.length*100) : 0}%</strong><small>${communityCorrect}/${communityEligible.length} kapanış oylaması</small>`;
    if (articles[3]) articles[3].innerHTML = `<span>En Çok Oy Alan Maç</span><strong>${esc(mostVoted?.card?.dataset?.matchLabel || "—")}</strong><small>${mostVoted?.summary?.total || 0} oy</small>`;
  }

  async function hydrate(root = document) {
    lastRoot = root || document;
    const polls = [...(lastRoot.querySelectorAll?.("[data-community-poll]") || [])];
    if (!polls.length) return;
    const ids = polls.map(poll => poll.dataset.matchId).filter(Boolean);
    try {
      const summaries = await fetchSummaries(ids);
      polls.forEach(poll => applySummary(poll, summaries.get(poll.dataset.matchId) || emptySummary(poll.dataset.matchId)));
      updateGlobalSummary(lastRoot);
      ensureRealtime();
    } catch (error) {
      polls.forEach(poll => applyError(poll, error));
    }
  }

  async function vote(poll, selection) {
    if (!poll || !["home","draw","away"].includes(selection)) return;
    const summaryBefore = cache.get(poll.dataset.matchId) || emptySummary(poll.dataset.matchId);
    if (!intendedOpen(poll)) {
      setPollStatus(poll, "Bu maç için oylama kapalı.", true);
      return;
    }
    if (summaryBefore.serverOpen === false) {
      setPollStatus(poll, "Bu oylama sunucuda kapalı. Maç başlamadıysa yönetici yeniden açmalıdır.", true);
      return;
    }
    const matchId = poll.dataset.matchId;
    if (!matchId) return;
    setButtonsState(poll, { disabled:true, selected:selection, pending:true });
    setPollStatus(poll, "Oyun kaydediliyor...");
    try {
      const sb = client();
      if (!sb) throw new Error("Canlı veritabanı bağlantısı henüz hazır değil.");
      const { error } = await sb.rpc("submit_fifa9_community_vote", {
        p_tournament_id: tournamentId,
        p_match_id: matchId,
        p_voter_key: deviceKey(),
        p_selection: selection
      });
      if (error) throw error;
      setPollStatus(poll, "Oyun kaydedildi. Sonuçlar güncelleniyor...");
      poll.classList.add("vote-success");
      setTimeout(() => poll.classList.remove("vote-success"), 850);
      await hydrate(document);
    } catch (error) {
      applyError(poll, error);
      setButtonsState(poll, { disabled:false, selected:summaryBefore.myVote });
    }
  }

  function adminPayload(snapshot) {
    return {
      tournament_id: tournamentId,
      match_id: String(snapshot?.matchId || ""),
      edition: Number(snapshot?.edition || 9),
      phase: String(snapshot?.phase || ""),
      home_name: String(snapshot?.homeName || ""),
      away_name: String(snapshot?.awayName || ""),
      payload: snapshot || {},
      updated_at: new Date().toISOString()
    };
  }

  async function syncSnapshot(snapshot) {
    if (!snapshot?.matchId) return;
    const sb = client();
    if (!sb || !window.FIFA_CLOUD?.isAdmin?.()) return;
    const { error } = await sb.from("fifa9_match_snapshots").upsert(adminPayload(snapshot), { onConflict:"tournament_id,match_id" });
    if (error) throw error;
  }

  async function setPollOpen(matchId, isOpen) {
    const sb = client();
    if (!sb || !window.FIFA_CLOUD?.isAdmin?.()) return;
    const fn = isOpen ? "unlock_fifa9_community_poll" : "lock_fifa9_community_poll";
    const { error } = await sb.rpc(fn, { p_tournament_id:tournamentId, p_match_id:String(matchId) });
    if (error) throw error;
  }

  async function lockPoll(matchId) { return setPollOpen(matchId, false); }
  async function unlockPoll(matchId) { return setPollOpen(matchId, true); }

  async function getVoteSummary(matchId) {
    const map = await fetchSummaries([String(matchId)]);
    return map.get(String(matchId)) || emptySummary(String(matchId));
  }

  function ensureRealtime() {
    const sb = client();
    if (!sb || channel) return;
    channel = sb.channel("fifa9-community-votes-v23")
      .on("postgres_changes", { event:"*", schema:"public", table:"fifa9_community_votes", filter:`tournament_id=eq.${tournamentId}` }, () => {
        clearTimeout(hydrateTimer);
        hydrateTimer = setTimeout(() => hydrate(document), 180);
      })
      .on("postgres_changes", { event:"*", schema:"public", table:"fifa9_match_polls", filter:`tournament_id=eq.${tournamentId}` }, () => {
        clearTimeout(hydrateTimer);
        hydrateTimer = setTimeout(() => hydrate(document), 180);
      })
      .subscribe();
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.("[data-community-vote]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const poll = button.closest("[data-community-poll]");
    vote(poll, button.dataset.communityVote);
  }, true);

  window.addEventListener("fifa-cloud-ready", () => hydrate(document));
  setTimeout(() => hydrate(document), 500);
  setTimeout(() => hydrate(document), 1500);

  window.FIFA_V22 = {
    hydrate,
    vote,
    lockPoll,
    unlockPoll,
    getVoteSummary,
    syncSnapshot,
    getDeviceKey: deviceKey,
    version: "v23-community-click-hotfix"
  };
})();
