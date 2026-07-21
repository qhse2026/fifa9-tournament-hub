(() => {
  "use strict";

  const config = window.FIFA_CLOUD_CONFIG || {};
  let client = null;
  let session = null;
  let admin = false;
  let playerProfile = null;
  let channel = null;
  let callbacks = { onState: () => {}, onAuth: () => {}, onStatus: () => {} };
  let lastRemoteUpdatedAt = null;

  function isConfigured() {
    return Boolean(
      config.supabaseUrl &&
      config.supabaseAnonKey &&
      !String(config.supabaseUrl).includes("PASTE_") &&
      !String(config.supabaseAnonKey).includes("PASTE_")
    );
  }

  function emitStatus(status, detail = "") {
    callbacks.onStatus({ status, detail, configured: isConfigured(), admin, playerProfile, user: session?.user || null });
  }

  async function checkAdmin(user) {
    if (!client || !user) return false;
    const { data, error } = await client
      .from("tournament_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.warn("Admin role check failed", error);
      return false;
    }
    return Boolean(data?.user_id);
  }

  async function checkPlayerProfile(user) {
    if (!client || !user) return null;
    const { data, error } = await client
      .from("player_profiles")
      .select("user_id, player_name, active")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      if (error.code !== "42P01") console.warn("Player profile check failed", error);
      return null;
    }
    return data?.active === false ? null : (data || null);
  }

  async function applySession(nextSession) {
    session = nextSession || null;
    const user = session?.user || null;
    [admin, playerProfile] = await Promise.all([checkAdmin(user), checkPlayerProfile(user)]);
    callbacks.onAuth({ user, isAdmin: admin, playerProfile });
    emitStatus(admin ? "admin-online" : playerProfile ? "player-online" : "viewer-online");
  }

  async function fetchState() {
    if (!client) return null;
    emitStatus("loading");
    const { data, error } = await client
      .from("tournament_state")
      .select("payload, updated_at, edition")
      .eq("id", config.tournamentRowId || "fifa-9")
      .maybeSingle();
    if (error) {
      emitStatus("error", error.message);
      throw error;
    }
    if (data?.payload && Object.keys(data.payload).length) {
      lastRemoteUpdatedAt = data.updated_at || null;
      callbacks.onState(data.payload, { source: "initial", updatedAt: data.updated_at || null });
    }
    emitStatus(admin ? "admin-online" : playerProfile ? "player-online" : "viewer-online");
    return data;
  }

  function subscribe() {
    if (!client || channel) return;
    channel = client
      .channel("fifa9-live-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_state",
          filter: `id=eq.${config.tournamentRowId || "fifa-9"}`
        },
        payload => {
          const row = payload.new || null;
          if (!row?.payload) return;
          if (row.updated_at && row.updated_at === lastRemoteUpdatedAt) return;
          lastRemoteUpdatedAt = row.updated_at || null;
          callbacks.onState(row.payload, { source: "realtime", updatedAt: row.updated_at || null });
          emitStatus(admin ? "admin-online" : playerProfile ? "player-online" : "viewer-online");
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") emitStatus(admin ? "admin-online" : playerProfile ? "player-online" : "viewer-online");
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) emitStatus("reconnecting", status);
      });
  }

  async function init(nextCallbacks = {}) {
    callbacks = { ...callbacks, ...nextCallbacks };
    if (!isConfigured()) {
      emitStatus("not-configured");
      callbacks.onAuth({ user: null, isAdmin: false, playerProfile: null });
      return { configured: false, isAdmin: false, playerProfile: null, user: null };
    }
    if (!window.supabase?.createClient) {
      emitStatus("error", "Supabase client could not be loaded");
      return { configured: true, isAdmin: false, playerProfile: null, user: null };
    }

    emitStatus("connecting");
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data } = await client.auth.getSession();
    await applySession(data?.session || null);
    await fetchState();
    subscribe();

    client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => applySession(nextSession).catch(error => console.warn("Auth state refresh failed", error)), 0);
    });

    return { configured: true, isAdmin: admin, playerProfile, user: session?.user || null };
  }

  async function save(payload) {
    if (!client || !isConfigured()) throw new Error("Cloud connection is not configured.");
    if (!admin) throw new Error("Only the tournament administrator can save changes.");
    emitStatus("syncing");
    const updatedAt = new Date().toISOString();
    const { data, error } = await client
      .from("tournament_state")
      .update({
        payload,
        edition: Number(config.edition || 9),
        updated_at: updatedAt,
        updated_by: session?.user?.id || null
      })
      .eq("id", config.tournamentRowId || "fifa-9")
      .select("payload, updated_at")
      .single();
    if (error) {
      emitStatus("error", error.message);
      throw error;
    }
    lastRemoteUpdatedAt = data?.updated_at || updatedAt;
    emitStatus("saved", data?.updated_at || updatedAt);
    setTimeout(() => emitStatus("admin-online"), 900);
    return data;
  }

  async function signIn(email, password) {
    if (!client) throw new Error("Cloud connection is not configured.");
    emitStatus("connecting");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      emitStatus("error", error.message);
      throw error;
    }
    await applySession(data.session || null);
    return { user: data.user, isAdmin: admin, playerProfile };
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    await applySession(null);
  }

  async function fetchAvailability() {
    if (!client || !isConfigured()) return [];
    const [{ data: profiles, error: profileError }, { data: availability, error: availabilityError }] = await Promise.all([
      client.from("player_profiles").select("user_id, player_name, active").eq("active", true),
      client.from("player_availability").select("user_id, status, note, updated_at")
    ]);
    if (profileError) throw profileError;
    if (availabilityError) throw availabilityError;
    const availabilityMap = new Map((availability || []).map(item => [item.user_id, item]));
    return (profiles || []).map(profile => {
      const row = availabilityMap.get(profile.user_id) || {};
      return {
        userId: profile.user_id,
        playerName: profile.player_name,
        status: row.status || "unavailable",
        note: row.note || "",
        updatedAt: row.updated_at || null
      };
    });
  }

  async function setAvailability(status, note = "") {
    if (!client || !session?.user) throw new Error("Uygunluk durumunu değiştirmek için oyuncu hesabıyla giriş yapmalısın.");
    if (!playerProfile) throw new Error("Bu hesap henüz bir oyuncu profiline bağlanmamış.");
    const allowed = ["now", "evening", "unavailable", "open"];
    if (!allowed.includes(status)) throw new Error("Geçersiz uygunluk durumu.");
    const { error } = await client.from("player_availability").upsert({
      user_id: session.user.id,
      status,
      note: String(note || "").trim().slice(0, 120),
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw error;
    return true;
  }

  async function linkPlayerAccount(email, playerName) {
    if (!client || !admin) throw new Error("Oyuncu hesaplarını yalnızca turnuva yöneticisi bağlayabilir.");
    const { data, error } = await client.rpc("link_player_account", {
      p_email: String(email || "").trim(),
      p_player_name: String(playerName || "").trim()
    });
    if (error) throw error;
    return data;
  }

  async function refresh() {
    return fetchState();
  }

  window.FIFA_CLOUD = {
    init,
    save,
    signIn,
    signOut,
    refresh,
    fetchAvailability,
    setAvailability,
    linkPlayerAccount,
    isConfigured,
    getClient: () => client,
    getUser: () => session?.user || null,
    getPlayerProfile: () => playerProfile,
    isAdmin: () => admin
  };
})();
