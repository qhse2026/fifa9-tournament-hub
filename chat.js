(() => {
  "use strict";

  const TOURNAMENT_ID = "fifa-9";
  const TOKEN_KEY = "fifa9-chat-session-token-v12";
  const READ_KEY = "fifa9-chat-last-read-v12";
  const CHANNEL_KEY = "fifa9-chat-channel";
  const MAX_MESSAGES = 150;
  const POLL_INTERVAL = 3500;

  let profile = null;
  let messages = [];
  let rosterProfiles = [];
  let activeChannel = localStorage.getItem(CHANNEL_KEY) || "general";
  let loading = false;
  let initialized = false;
  let pollTimer = null;
  let unreadCount = 0;
  let lastError = "";
  let lastMessageStamp = "";

  const escapeHTML = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const context = () => window.FIFA_APP_CONTEXT || null;
  const cloud = () => window.FIFA_CLOUD || null;
  const client = () => cloud()?.getClient?.() || null;
  const isAdmin = () => Boolean(context()?.isAdmin?.());
  const currentLanguage = () => document.documentElement.lang === "en" ? "en" : "tr";
  const tournamentId = () => window.FIFA_CLOUD_CONFIG?.tournamentRowId || TOURNAMENT_ID;
  const t = (tr, en) => currentLanguage() === "en" ? en : tr;
  const sessionToken = () => localStorage.getItem(TOKEN_KEY) || "";

  function participants() {
    return (context()?.getParticipants?.() || [])
      .filter(player => player?.id && String(player.name || "").trim())
      .map(player => ({ id: player.id, name: String(player.name).trim() }));
  }

  function toast(message, type = "") {
    context()?.toast?.(message, type);
  }

  function refreshView() {
    if (context()?.getActiveView?.() === "chat") context()?.refreshView?.();
    updateUnreadBadge();
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    return new Intl.DateTimeFormat(currentLanguage() === "en" ? "en-GB" : "tr-TR", {
      hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function formatDay(value) {
    if (!value) return "";
    const date = new Date(value);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t("Bugün", "Today");
    if (date.toDateString() === yesterday.toDateString()) return t("Dün", "Yesterday");
    return new Intl.DateTimeFormat(currentLanguage() === "en" ? "en-GB" : "tr-TR", {
      day: "2-digit", month: "short", year: "numeric"
    }).format(date);
  }

  function normalizeError(error) {
    const raw = String(error?.message || error || "");
    if (raw.includes("Could not find the function") || raw.includes("claim_chat_profile_v12")) {
      return t(
        "Chat v12 SQL kurulumu bulunamadı. Supabase SQL Editor’da chat_feature_v12.sql dosyasını çalıştır.",
        "Chat v12 SQL setup was not found. Run chat_feature_v12.sql in Supabase SQL Editor."
      );
    }
    if (raw.includes("Incorrect player PIN")) return t("Bu oyuncu daha önce kaydedilmiş. Doğru PIN kodunu gir.", "This player is already registered. Enter the correct PIN.");
    if (raw.includes("PIN must contain")) return t("PIN kodu 4–8 rakam olmalıdır.", "The PIN must contain 4–8 digits.");
    if (raw.includes("Selected player")) return t("Seçilen oyuncu kayıtlı kadroda bulunamadı.", "The selected player is not available in the registered roster.");
    if (raw.includes("Chat session is invalid") || raw.includes("Chat membership required")) return t("Sohbet oturumu geçersiz veya süresi dolmuş. Oyuncu adını ve PIN’ini yeniden gir.", "The chat session is invalid or expired. Re-enter the player name and PIN.");
    if (raw.includes("Please wait before")) return t("Yeni mesaj göndermeden önce birkaç saniye bekle.", "Wait a few seconds before sending another message.");
    return raw || t("Bilinmeyen sohbet hatası.", "Unknown chat error.");
  }

  async function checkHealth() {
    const c = client();
    if (!c) return false;
    const { data, error } = await c.rpc("chat_health_v12");
    if (error) {
      lastError = normalizeError(error);
      return false;
    }
    return data?.status === "ok" || data?.version === 12;
  }

  async function loadMyProfile() {
    const c = client();
    const token = sessionToken();
    if (!c || !token) {
      profile = null;
      return null;
    }
    const { data, error } = await c.rpc("get_chat_session_v12", {
      p_tournament_id: tournamentId(),
      p_token: token
    });
    if (error) {
      lastError = normalizeError(error);
      profile = null;
      return null;
    }
    profile = Array.isArray(data) ? data[0] || null : data || null;
    if (!profile) localStorage.removeItem(TOKEN_KEY);
    return profile;
  }

  async function loadRosterProfiles() {
    const c = client();
    if (!c || (!sessionToken() && !isAdmin())) {
      rosterProfiles = [];
      return [];
    }
    const { data, error } = await c.rpc("list_chat_profiles_v12", {
      p_tournament_id: tournamentId(),
      p_token: sessionToken() || null
    });
    if (error) {
      lastError = normalizeError(error);
      rosterProfiles = [];
      return [];
    }
    rosterProfiles = Array.isArray(data) ? data : [];
    return rosterProfiles;
  }

  async function loadMessages({ silent = false } = {}) {
    const c = client();
    if (!c || (!sessionToken() && !isAdmin())) {
      messages = [];
      return [];
    }
    if (!silent) loading = true;
    const { data, error } = await c.rpc("list_chat_messages_v12", {
      p_tournament_id: tournamentId(),
      p_token: sessionToken() || null,
      p_channel: activeChannel,
      p_limit: MAX_MESSAGES
    });
    if (!silent) loading = false;
    if (error) {
      lastError = normalizeError(error);
      messages = [];
      return [];
    }

    lastError = "";
    const next = Array.isArray(data) ? data : [];
    const nextStamp = next[next.length - 1]?.created_at || "";
    if (silent && nextStamp && nextStamp !== lastMessageStamp && context()?.getActiveView?.() !== "chat") {
      const newest = next[next.length - 1];
      if (newest?.profile_id !== profile?.profile_id) unreadCount += 1;
    }
    messages = next;
    lastMessageStamp = nextStamp;
    if (context()?.getActiveView?.() === "chat") markRead();
    return messages;
  }

  function markRead() {
    const newest = messages[messages.length - 1]?.created_at || new Date().toISOString();
    localStorage.setItem(READ_KEY, newest);
    unreadCount = 0;
    updateUnreadBadge();
  }

  function updateUnreadBadge() {
    const nav = document.querySelector('[data-nav="chat"]');
    if (!nav) return;
    let badge = nav.querySelector(".chat-unread-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "chat-unread-badge";
      nav.appendChild(badge);
    }
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.classList.toggle("hidden", unreadCount <= 0);
  }

  async function claimProfile(playerId, pin) {
    loading = true;
    lastError = "";
    try {
      const c = client();
      if (!c) throw new Error(t("Canlı bağlantı hazır değil.", "Live connection is not ready."));
      const { data, error } = await c.rpc("claim_chat_profile_v12", {
        p_tournament_id: tournamentId(),
        p_player_id: playerId,
        p_pin: pin
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] || null : data || null;
      if (!row?.session_token) throw new Error(t("Sohbet oturumu oluşturulamadı.", "Chat session could not be created."));
      localStorage.setItem(TOKEN_KEY, row.session_token);
      profile = {
        profile_id: row.profile_id,
        tournament_id: row.tournament_id,
        player_id: row.player_id,
        display_name: row.display_name,
        created_at: row.created_at,
        last_seen_at: row.last_seen_at
      };
      await Promise.all([loadMessages(), loadRosterProfiles()]);
      startPolling();
      toast(t("Sohbet hesabın hazır.", "Your chat account is ready."), "success");
    } catch (error) {
      lastError = normalizeError(error);
      toast(lastError, "error");
    } finally {
      loading = false;
      refreshView();
    }
  }

  async function sendMessage(body) {
    const clean = String(body || "").trim();
    if (!profile || !sessionToken() || !clean) return;
    if (clean.length > 500) {
      toast(t("Mesaj en fazla 500 karakter olabilir.", "Messages can contain up to 500 characters."), "error");
      return;
    }
    const c = client();
    const { error } = await c.rpc("send_chat_message_v12", {
      p_tournament_id: tournamentId(),
      p_token: sessionToken(),
      p_channel: activeChannel,
      p_body: clean
    });
    if (error) {
      const message = normalizeError(error);
      toast(message, "error");
      return;
    }
    const input = document.querySelector("#chatMessageInput");
    if (input) input.value = "";
    await Promise.all([loadMessages(), loadRosterProfiles()]);
    refreshView();
  }

  async function deleteMessage(messageId) {
    const c = client();
    if (!c) return;
    const { error } = await c.rpc("delete_chat_message_v12", {
      p_tournament_id: tournamentId(),
      p_token: sessionToken() || null,
      p_message_id: messageId
    });
    if (error) toast(normalizeError(error), "error");
    else {
      await loadMessages();
      refreshView();
    }
  }

  async function releaseProfile(playerId) {
    const c = client();
    const { error } = await c.rpc("admin_release_chat_profile_v12", {
      p_tournament_id: tournamentId(),
      p_player_id: playerId
    });
    if (error) {
      toast(normalizeError(error), "error");
      return;
    }
    await loadRosterProfiles();
    toast(t("Oyuncunun sohbet hesabı sıfırlandı.", "The player's chat account was reset."), "success");
    refreshView();
  }

  function signOutChat() {
    localStorage.removeItem(TOKEN_KEY);
    profile = null;
    messages = [];
    rosterProfiles = [];
    lastError = "";
    toast(t("Sohbet oturumu kapatıldı.", "Chat session signed out."));
    refreshView();
  }

  async function poll() {
    if (document.hidden || !client()) return;
    if (!sessionToken() && !isAdmin()) return;
    await Promise.all([loadMessages({ silent: true }), loadRosterProfiles()]);
    if (context()?.getActiveView?.() === "chat") refreshView();
    else updateUnreadBadge();
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => poll().catch(() => {}), POLL_INTERVAL);
  }

  async function init() {
    if (initialized || !client()) return;
    initialized = true;
    loading = true;
    try {
      const healthy = await checkHealth();
      if (!healthy) return;
      await loadMyProfile();
      if (profile || isAdmin()) await Promise.all([loadMessages(), loadRosterProfiles()]);
      startPolling();
    } catch (error) {
      lastError = normalizeError(error);
      console.warn("Chat initialization failed", error);
    } finally {
      loading = false;
      refreshView();
    }
  }

  function renderRegistration() {
    const roster = participants();
    const claimed = new Set(rosterProfiles.map(item => item.player_id));
    return `
      <div class="chat-onboarding-grid">
        <section class="panel chat-register-card">
          <div class="chat-register-icon">◆</div>
          <div class="eyebrow">PLAYER ACCESS</div>
          <h3>${t("Sohbet Hesabını Oluştur", "Create Your Chat Account")}</h3>
          <p>${t("İsmini yazmana gerek yok. Turnuva kadrosundan kendi adını seç ve yalnızca sana ait bir PIN belirle.", "You do not need to type your name. Select your registered name from the tournament roster and create a personal PIN.")}</p>
          ${lastError ? `<div class="info-box warning-box chat-diagnostic">${escapeHTML(lastError)}<button type="button" class="btn btn-ghost btn-small" data-chat-action="retry-chat">${t("Tekrar Dene", "Retry")}</button></div>` : ""}
          ${roster.length ? `
            <form id="chatRegistrationForm" class="chat-register-form">
              <label class="field"><span>${t("Kayıtlı Oyuncu", "Registered Player")}</span>
                <select name="playerId" required>
                  <option value="">${t("Oyuncunu seç", "Select your player")}</option>
                  ${roster.map(player => `<option value="${escapeHTML(player.id)}">${escapeHTML(player.name)}${claimed.has(player.id) ? ` · ${t("kayıtlı", "registered")}` : ""}</option>`).join("")}
                </select>
              </label>
              <label class="field"><span>${t("4–8 Haneli PIN", "4–8 Digit PIN")}</span>
                <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="new-password" placeholder="••••••" required>
              </label>
              <button class="btn btn-gold btn-wide" type="submit" ${loading ? "disabled" : ""}>${loading ? t("Hazırlanıyor...", "Preparing...") : t("Sohbete Katıl", "Join Chat")}</button>
            </form>` : `<div class="info-box warning-box">${t("Önce turnuva oyuncuları kaydedilmelidir.", "Tournament players must be registered first.")}</div>`}
        </section>
        <section class="panel chat-access-explainer">
          <div class="panel-header"><div><h3 class="panel-title">${t("Nasıl Çalışır?", "How Does It Work?")}</h3><div class="panel-subtitle">${t("E-posta hesabı ve Supabase anonim giriş ayarı gerekmez.", "No email account or Supabase anonymous sign-in setting is required.")}</div></div></div>
          <div class="chat-step-list">
            <div><span>1</span><p>${t("Kayıtlı oyuncu adını listeden seç.", "Select your registered player name from the list.")}</p></div>
            <div><span>2</span><p>${t("Kişisel PIN kodunu oluştur. Aynı adı başka cihazda açmak için bu PIN kullanılır.", "Create a personal PIN. Use it to recover the same name on another device.")}</p></div>
            <div><span>3</span><p>${t("Genel sohbeti ve canlı maç sohbetini birkaç saniye içinde güncel takip et.", "Follow the general and live-match chat with updates every few seconds.")}</p></div>
          </div>
          <div class="info-box mt-16">${t("PIN kodunu unutursan turnuva yöneticisi hesabını sıfırlayabilir.", "If you forget your PIN, the tournament administrator can reset your account.")}</div>
        </section>
      </div>`;
  }

  function renderMessages() {
    if (loading && !messages.length) return `<div class="chat-loading">${t("Mesajlar yükleniyor...", "Loading messages...")}</div>`;
    if (lastError) return `<div class="info-box warning-box">${escapeHTML(lastError)}</div>`;
    if (!messages.length) return `<div class="chat-empty"><div>✦</div><h3>${t("İlk mesajı sen gönder", "Send the first message")}</h3><p>${t("Turnuva sohbeti burada başlayacak.", "The tournament conversation starts here.")}</p></div>`;

    let currentDay = "";
    return messages.map(message => {
      const day = formatDay(message.created_at);
      const dayDivider = day !== currentDay ? `<div class="chat-day-divider"><span>${escapeHTML(day)}</span></div>` : "";
      currentDay = day;
      const mine = Boolean(profile?.profile_id && message.profile_id === profile.profile_id);
      const canDelete = mine || isAdmin();
      return `${dayDivider}<article class="chat-message ${mine ? "mine" : ""}">
        <div class="chat-avatar">${escapeHTML(String(message.display_name || "?").charAt(0).toUpperCase())}</div>
        <div class="chat-bubble">
          <div class="chat-message-head"><strong>${escapeHTML(message.display_name)}</strong><span>${formatTime(message.created_at)}</span>${canDelete ? `<button data-chat-action="delete-message" data-message-id="${escapeHTML(message.id)}" title="${t("Mesajı sil", "Delete message")}">×</button>` : ""}</div>
          <div class="chat-message-body">${escapeHTML(message.body).replaceAll("\n", "<br>")}</div>
        </div>
      </article>`;
    }).join("");
  }

  function renderAdminProfiles() {
    if (!isAdmin()) return "";
    const claimedMap = new Map(rosterProfiles.map(item => [item.player_id, item]));
    return `<section class="panel mt-24 chat-admin-panel">
      <div class="panel-header"><div><h3 class="panel-title">${t("Sohbet Hesap Yönetimi", "Chat Account Management")}</h3><div class="panel-subtitle">${t("PIN unutulan veya yanlış seçilen oyuncu hesaplarını sıfırla.", "Reset accounts with forgotten PINs or incorrect player selection.")}</div></div><span class="badge badge-gold">${rosterProfiles.length} ${t("KAYITLI", "REGISTERED")}</span></div>
      <div class="chat-profile-admin-grid">${participants().map(player => {
        const claimedProfile = claimedMap.get(player.id);
        return `<div class="chat-profile-admin-row"><div><strong>${escapeHTML(player.name)}</strong><span>${claimedProfile ? `${t("Son görülme", "Last seen")}: ${formatTime(claimedProfile.last_seen_at)}` : t("Henüz kayıt olmadı", "Not registered yet")}</span></div>${claimedProfile ? `<button class="btn btn-danger btn-small" data-chat-action="release-profile" data-player-id="${escapeHTML(player.id)}">${t("Sıfırla", "Reset")}</button>` : `<span class="chat-profile-open">${t("Açık", "Available")}</span>`}</div>`;
      }).join("")}</div>
    </section>`;
  }

  function render(root) {
    if (!root) return;
    const configured = Boolean(cloud()?.isConfigured?.());
    if (!configured) {
      root.innerHTML = `<div class="group-banner silver"><div><div class="eyebrow">COMMUNITY</div><h2>${t("Turnuva Sohbeti", "Tournament Chat")}</h2><p>${t("Sohbet özelliği için canlı Supabase bağlantısı gereklidir.", "A live Supabase connection is required for chat.")}</p></div><div class="group-emblem">✦</div></div>`;
      return;
    }

    if (!initialized) setTimeout(init, 0);
    if (profile) setTimeout(markRead, 0);
    const onlineMembers = rosterProfiles.filter(item => item.is_online);

    root.innerHTML = `
      <div class="group-banner chat-banner">
        <div><div class="eyebrow">FIFA 9 COMMUNITY</div><h2>${t("Turnuva Sohbeti", "Tournament Chat")}</h2><p>${t("Kayıtlı oyuncular için PIN tabanlı genel sohbet ve canlı maç odası.", "PIN-based general chat and live-match room for registered players.")}</p></div>
        <div class="group-emblem">✦</div>
      </div>
      ${!profile ? `${renderRegistration()}${renderAdminProfiles()}` : `
        <div class="chat-layout">
          <section class="panel chat-main-panel">
            <div class="chat-topline">
              <div class="chat-channel-tabs">
                <button class="chat-channel-tab ${activeChannel === "general" ? "active" : ""}" data-chat-action="switch-channel" data-channel="general">${t("Genel Sohbet", "General Chat")}</button>
                <button class="chat-channel-tab ${activeChannel === "live-match" ? "active" : ""}" data-chat-action="switch-channel" data-channel="live-match"><span class="live-dot"></span>${t("Canlı Maç", "Live Match")}</button>
              </div>
              <div class="chat-online-summary"><span class="status-dot"></span>${onlineMembers.length} ${t("çevrimiçi", "online")}</div>
            </div>
            <div class="chat-online-list">${onlineMembers.length ? onlineMembers.map(member => `<span>${escapeHTML(member.display_name)}</span>`).join("") : `<span>${t("Çevrimiçi oyuncular burada görünür.", "Online players appear here.")}</span>`}</div>
            <div class="chat-message-list" id="chatMessageList">${renderMessages()}</div>
            <form id="chatMessageForm" class="chat-composer">
              <div class="chat-emoji-row">${["⚽", "🔥", "👏", "😂", "🏆", "🤝"].map(emoji => `<button type="button" data-chat-action="add-emoji" data-emoji="${emoji}">${emoji}</button>`).join("")}</div>
              <div class="chat-compose-row"><textarea id="chatMessageInput" name="message" maxlength="500" rows="2" placeholder="${t("Mesajını yaz...", "Write a message...")}" required></textarea><button class="btn btn-gold" type="submit">${t("Gönder", "Send")}</button></div>
              <div class="chat-compose-meta"><span>${escapeHTML(profile.display_name)}</span><span>${t("Enter: gönder · Shift+Enter: yeni satır", "Enter: send · Shift+Enter: new line")}</span></div>
            </form>
          </section>
          <aside class="panel chat-account-panel">
            <div class="chat-account-avatar">${escapeHTML(profile.display_name.charAt(0).toUpperCase())}</div>
            <div class="eyebrow">CHAT IDENTITY</div>
            <h3>${escapeHTML(profile.display_name)}</h3>
            <p>${t("Turnuva kadrosuna doğrulanmış sohbet hesabı", "Chat account verified against the tournament roster")}</p>
            <div class="chat-account-facts"><div><span>${t("Kanal", "Channel")}</span><strong>${activeChannel === "general" ? t("Genel", "General") : t("Canlı Maç", "Live Match")}</strong></div><div><span>${t("Durum", "Status")}</span><strong>${t("Çevrimiçi", "Online")}</strong></div></div>
            <button class="btn btn-ghost btn-wide mt-16" data-chat-action="signout-chat">${t("Sohbet Oturumunu Kapat", "Sign Out of Chat")}</button>
          </aside>
        </div>
        ${renderAdminProfiles()}`}
    `;

    setTimeout(() => {
      const list = document.querySelector("#chatMessageList");
      if (list) list.scrollTop = list.scrollHeight;
    }, 30);
  }

  function handleClick(event) {
    const target = event.target.closest("[data-chat-action]");
    if (!target) return false;
    const action = target.dataset.chatAction;
    if (action === "switch-channel") {
      activeChannel = target.dataset.channel || "general";
      localStorage.setItem(CHANNEL_KEY, activeChannel);
      loadMessages().then(refreshView);
    }
    if (action === "add-emoji") {
      const input = document.querySelector("#chatMessageInput");
      if (input) {
        input.value = `${input.value}${input.value ? " " : ""}${target.dataset.emoji || ""}`;
        input.focus();
      }
    }
    if (action === "delete-message") deleteMessage(target.dataset.messageId);
    if (action === "release-profile") releaseProfile(target.dataset.playerId);
    if (action === "signout-chat") signOutChat();
    if (action === "retry-chat") {
      initialized = false;
      lastError = "";
      init();
    }
    return true;
  }

  function handleSubmit(event) {
    if (event.target.id === "chatRegistrationForm") {
      event.preventDefault();
      const data = new FormData(event.target);
      claimProfile(String(data.get("playerId") || ""), String(data.get("pin") || ""));
      return true;
    }
    if (event.target.id === "chatMessageForm") {
      event.preventDefault();
      const data = new FormData(event.target);
      sendMessage(data.get("message"));
      return true;
    }
    return false;
  }

  document.addEventListener("keydown", event => {
    const input = event.target.closest("#chatMessageInput");
    if (!input || event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    const form = input.closest("form");
    if (form?.requestSubmit) form.requestSubmit();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll().catch(() => {});
  });

  window.FIFA_CHAT_UI = {
    render,
    init,
    handleClick,
    handleSubmit,
    onCloudReady: () => { initialized = false; init(); }
  };
})();
