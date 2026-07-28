(() => {
  "use strict";
  const TABLE = "fifa10_registrations";
  const TOURNAMENT_ID = "fifa-10";
  const NEW_PLAYER_ELO = 1350;
  let client = null;

  function credentials() {
    const cfg = window.FIFA_CLOUD_CONFIG || {};
    const url = cfg.supabaseUrl || cfg.url || cfg.SUPABASE_URL || cfg.projectUrl || "";
    const key = cfg.supabaseAnonKey || cfg.anonKey || cfg.key || cfg.SUPABASE_ANON_KEY || "";
    return { url, key };
  }
  function getClient() {
    if (client) return client;
    const sharedClient = window.FIFA_CLOUD?.getClient?.();
    if (sharedClient) {
      client = sharedClient;
      return client;
    }
    const {url,key}=credentials();
    if (!url || !key || !window.supabase?.createClient) return null;
    client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return client;
  }
  function isConfigured(){ return Boolean(getClient()); }
  function friendly(error){
    const message=String(error?.message||error||"Canlı kayıt işlemi tamamlanamadı.");
    if (/does not exist|schema cache|relation/i.test(message)) return "FIFA 10 kayıt tablosu henüz kurulmadı. Paketteki SUPABASE_FIFA10_REGISTRATION_V47_12.sql dosyasını Supabase SQL Editor'da bir kez çalıştırın.";
    if (/duplicate key|unique constraint/i.test(message)) return "Bu oyuncu FIFA 10'a zaten kayıtlı.";
    return message;
  }
  async function list(){
    const c=getClient(); if(!c) throw new Error("Supabase bağlantısı bulunamadı.");
    const {data,error}=await c.from(TABLE).select("id,player_name,elo,source,registered_at").eq("tournament_id",TOURNAMENT_ID).order("elo",{ascending:false}).order("registered_at",{ascending:true});
    if(error) throw new Error(friendly(error));
    return (data||[]).map(row=>{const source=row.source||"existing";return {id:row.id,playerName:row.player_name,elo:Number(row.elo)||(source==="new"?NEW_PLAYER_ELO:1500),source,registeredAt:row.registered_at};});
  }
  async function register(payload){
    const c=getClient(); if(!c) throw new Error("Supabase bağlantısı bulunamadı.");
    const source=payload.source||"existing";
    const entryElo=source==="new"?NEW_PLAYER_ELO:(Number(payload.elo)||1500);
    const {data,error}=await c.from(TABLE).insert({tournament_id:TOURNAMENT_ID,player_name:payload.playerName,elo:entryElo,source}).select("id,player_name,elo,source,registered_at").single();
    if(error) throw new Error(friendly(error));
    return data;
  }
  async function remove(id){
    const c=getClient(); if(!c) throw new Error("Supabase bağlantısı bulunamadı.");
    const {error}=await c.from(TABLE).delete().eq("id",id).eq("tournament_id",TOURNAMENT_ID);
    if(error) throw new Error(friendly(error));
  }
  window.FIFA10_REGISTRATION_CLOUD={isConfigured,list,register,remove,newPlayerElo:NEW_PLAYER_ELO};

  // V47.14.0 — draw engine is loaded directly by index.html for deterministic startup.

})();
