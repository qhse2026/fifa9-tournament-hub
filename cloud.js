(() => {
  "use strict";

  const config = window.FIFA_CLOUD_CONFIG || {};
  let client = null;
  let session = null;
  let admin = false;
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
    callbacks.onStatus({ status, detail, configured: isConfigured(), admin, user: session?.user || null });
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

  async function applySession(nextSession) {
    session = nextSession || null;
    admin = await checkAdmin(session?.user || null);
    callbacks.onAuth({ user: session?.user || null, isAdmin: admin });
    emitStatus(admin ? "admin-online" : "viewer-online");
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
    emitStatus(admin ? "admin-online" : "viewer-online");
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
          emitStatus(admin ? "admin-online" : "viewer-online");
        }
      )
      .subscribe(status => {
        if (status === "SUBSCRIBED") emitStatus(admin ? "admin-online" : "viewer-online");
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) emitStatus("reconnecting", status);
      });
  }

  async function init(nextCallbacks = {}) {
    callbacks = { ...callbacks, ...nextCallbacks };
    if (!isConfigured()) {
      emitStatus("not-configured");
      callbacks.onAuth({ user: null, isAdmin: false });
      return { configured: false, isAdmin: false, user: null };
    }
    if (!window.supabase?.createClient) {
      emitStatus("error", "Supabase client could not be loaded");
      return { configured: true, isAdmin: false, user: null };
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

    return { configured: true, isAdmin: admin, user: session?.user || null };
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
    return { user: data.user, isAdmin: admin };
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
    await applySession(null);
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
    isConfigured,
    getClient: () => client,
    getUser: () => session?.user || null,
    isAdmin: () => admin
  };
})();
