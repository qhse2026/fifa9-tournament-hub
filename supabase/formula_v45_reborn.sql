-- Formula Horizon Reborn V45.0.0 — Phase 1
-- Safe to run again in Supabase SQL Editor.
-- Creates isolated Formula tables and RPC functions without touching FIFA tournament data.

create extension if not exists pgcrypto;

create table if not exists public.formula_v45_sessions (
  session_token uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  device_hash text not null,
  track_id text not null,
  session_version text not null default '45.0.0',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 hours'),
  submitted_at timestamptz null,
  status text not null default 'started',
  constraint formula_v45_session_track check (
    track_id in ('oruc-reis-coastal','filyos-harbour','dragon-mountain')
  ),
  constraint formula_v45_session_status check (
    status in ('started','submitted','rejected','expired')
  )
);

create table if not exists public.formula_v45_records (
  id bigint generated always as identity primary key,
  track_id text not null,
  player_key text not null,
  user_id uuid null references auth.users(id) on delete set null,
  player_name text not null,
  best_lap_ms integer null,
  five_lap_total_ms integer not null,
  valid_lap_count smallint not null default 0,
  sector_bests jsonb not null default '[]'::jsonb,
  platform text not null default 'unknown',
  control_type text not null default 'unknown',
  assists jsonb not null default '{}'::jsonb,
  physics_version text not null,
  track_version text not null,
  session_version text not null,
  review_status text not null default 'under-review',
  verified boolean not null default false,
  attempts integer not null default 1,
  last_session_hash text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(track_id, player_key),
  constraint formula_v45_record_track check (
    track_id in ('oruc-reis-coastal','filyos-harbour','dragon-mountain')
  ),
  constraint formula_v45_record_name check (char_length(player_name) between 2 and 40),
  constraint formula_v45_record_lap check (best_lap_ms is null or best_lap_ms between 15000 and 600000),
  constraint formula_v45_record_total check (five_lap_total_ms between 90000 and 3600000),
  constraint formula_v45_record_valid_laps check (valid_lap_count between 0 and 5),
  constraint formula_v45_record_platform check (platform in ('pc','mobile','tablet','unknown')),
  constraint formula_v45_record_control check (control_type in ('keyboard','touch','gamepad','unknown')),
  constraint formula_v45_record_review check (review_status in ('accepted','under-review','rejected','local'))
);

create table if not exists public.formula_v45_sector_records (
  id bigint generated always as identity primary key,
  track_id text not null,
  player_key text not null,
  sector_no smallint not null,
  sector_time_ms integer not null,
  session_hash text null,
  updated_at timestamptz not null default now(),
  unique(track_id, player_key, sector_no),
  constraint formula_v45_sector_track check (
    track_id in ('oruc-reis-coastal','filyos-harbour','dragon-mountain')
  ),
  constraint formula_v45_sector_no check (sector_no between 1 and 3),
  constraint formula_v45_sector_time check (sector_time_ms between 3000 and 300000)
);

create table if not exists public.formula_v45_ghosts (
  id bigint generated always as identity primary key,
  track_id text not null,
  player_key text not null,
  ghost_type text not null default 'personal',
  lap_time_ms integer not null,
  replay_version text not null default '45.0.0-ghost-1',
  replay_ref text null,
  replay_checksum text null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(track_id, player_key, ghost_type),
  constraint formula_v45_ghost_track check (
    track_id in ('oruc-reis-coastal','filyos-harbour','dragon-mountain')
  ),
  constraint formula_v45_ghost_type check (ghost_type in ('personal','world-record','selected-player'))
);

create table if not exists public.formula_v45_track_stats (
  track_id text primary key,
  attempts bigint not null default 0,
  completed_sessions bigint not null default 0,
  valid_laps bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint formula_v45_stats_track check (
    track_id in ('oruc-reis-coastal','filyos-harbour','dragon-mountain')
  )
);

create index if not exists formula_v45_fastest_lap_idx
  on public.formula_v45_records(track_id, best_lap_ms, updated_at)
  where best_lap_ms is not null and review_status = 'accepted';

create index if not exists formula_v45_total_idx
  on public.formula_v45_records(track_id, five_lap_total_ms, updated_at)
  where review_status = 'accepted';

alter table public.formula_v45_sessions enable row level security;
alter table public.formula_v45_records enable row level security;
alter table public.formula_v45_sector_records enable row level security;
alter table public.formula_v45_ghosts enable row level security;
alter table public.formula_v45_track_stats enable row level security;

revoke all on public.formula_v45_sessions from anon, authenticated;
revoke all on public.formula_v45_records from anon, authenticated;
revoke all on public.formula_v45_sector_records from anon, authenticated;
revoke all on public.formula_v45_ghosts from anon, authenticated;
revoke all on public.formula_v45_track_stats from anon, authenticated;

create or replace function public.formula_v45_start_session(
  p_track_id text,
  p_device_key text
)
returns table(session_token uuid, server_started_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_device_hash text;
begin
  if p_track_id not in ('oruc-reis-coastal','filyos-harbour','dragon-mountain') then
    raise exception 'Invalid Formula V45 track';
  end if;
  if coalesce(length(trim(p_device_key)), 0) < 8 then
    raise exception 'Device key is required';
  end if;

  v_device_hash := encode(digest(p_device_key || '|formula-v45-device', 'sha256'), 'hex');

  insert into public.formula_v45_sessions(
    session_token, user_id, device_hash, track_id
  )
  values(
    v_token, auth.uid(), v_device_hash, p_track_id
  );

  insert into public.formula_v45_track_stats(track_id, attempts)
  values(p_track_id, 1)
  on conflict(track_id) do update set
    attempts = public.formula_v45_track_stats.attempts + 1,
    updated_at = now();

  return query select v_token, now();
end;
$$;

create or replace function public.formula_v45_submit_session(
  p_session_token uuid,
  p_track_id text,
  p_player_name text,
  p_best_lap_ms integer,
  p_five_lap_total_ms integer,
  p_sector_bests jsonb,
  p_valid_lap_count integer,
  p_platform text,
  p_control_type text,
  p_assists jsonb,
  p_physics_version text,
  p_track_version text,
  p_session_version text,
  p_reset_count integer,
  p_track_limit_events integer,
  p_max_speed_kph integer,
  p_input_checksum text,
  p_session_hash text,
  p_local_validation_status text,
  p_device_key text
)
returns table(
  lap_rank bigint,
  total_rank bigint,
  review_status text,
  verified boolean,
  improved_lap boolean,
  improved_total boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_device_hash text;
  v_player_key text;
  v_name text;
  v_verified boolean := false;
  v_review text := 'under-review';
  v_previous_lap integer;
  v_previous_total integer;
  v_saved_lap integer;
  v_saved_total integer;
  v_session public.formula_v45_sessions%rowtype;
  v_expected_track_version text;
  i integer;
begin
  if p_track_id not in ('oruc-reis-coastal','filyos-harbour','dragon-mountain') then
    raise exception 'Invalid Formula V45 track';
  end if;
  if p_session_version <> '45.0.0' then raise exception 'Unsupported session version'; end if;
  if p_physics_version <> '45.0.0-physics-1' then raise exception 'Unsupported physics version'; end if;

  v_expected_track_version := case p_track_id
    when 'oruc-reis-coastal' then '45.0.0-orc-1'
    when 'filyos-harbour' then '45.0.0-fhy-1'
    when 'dragon-mountain' then '45.0.0-dmp-1'
  end;
  if p_track_version <> v_expected_track_version then raise exception 'Track version mismatch'; end if;

  if p_five_lap_total_ms not between 90000 and 3600000 then raise exception 'Implausible total time'; end if;
  if p_best_lap_ms is not null and p_best_lap_ms not between 15000 and 600000 then raise exception 'Implausible lap time'; end if;
  if p_valid_lap_count not between 0 and 5 then raise exception 'Invalid valid-lap count'; end if;
  if p_max_speed_kph > 345 then raise exception 'Implausible maximum speed'; end if;
  if coalesce(length(p_session_hash),0) < 32 or coalesce(length(p_input_checksum),0) < 32 then
    raise exception 'Session integrity data missing';
  end if;
  if coalesce(length(trim(p_device_key)),0) < 8 then raise exception 'Device key required'; end if;

  v_device_hash := encode(digest(p_device_key || '|formula-v45-device', 'sha256'), 'hex');

  if p_session_token is not null then
    select * into v_session
    from public.formula_v45_sessions
    where session_token = p_session_token
    for update;

    if not found then raise exception 'Session token not found'; end if;
    if v_session.track_id <> p_track_id then raise exception 'Session track mismatch'; end if;
    if v_session.device_hash <> v_device_hash then raise exception 'Session device mismatch'; end if;
    if v_session.status <> 'started' then raise exception 'Session already used'; end if;
    if v_session.expires_at < now() then
      update public.formula_v45_sessions set status='expired' where session_token=p_session_token;
      raise exception 'Session token expired';
    end if;
  end if;

  v_name := left(regexp_replace(trim(coalesce(p_player_name,'Guest Driver')), '\s+', ' ', 'g'), 40);
  if length(v_name) < 2 then raise exception 'Player name too short'; end if;

  v_verified := v_user_id is not null;
  v_player_key := case
    when v_user_id is not null then 'user:' || v_user_id::text
    else 'guest:' || v_device_hash
  end;

  if p_local_validation_status = 'accepted'
     and p_reset_count between 0 and 8
     and p_track_limit_events between 0 and 30
     and p_max_speed_kph between 0 and 345
  then
    v_review := 'accepted';
  else
    v_review := 'under-review';
  end if;

  select best_lap_ms, five_lap_total_ms
    into v_previous_lap, v_previous_total
  from public.formula_v45_records
  where track_id=p_track_id and player_key=v_player_key;

  insert into public.formula_v45_records(
    track_id, player_key, user_id, player_name, best_lap_ms, five_lap_total_ms,
    valid_lap_count, sector_bests, platform, control_type, assists,
    physics_version, track_version, session_version, review_status,
    verified, attempts, last_session_hash, updated_at
  )
  values(
    p_track_id, v_player_key, v_user_id, v_name, p_best_lap_ms, p_five_lap_total_ms,
    p_valid_lap_count, coalesce(p_sector_bests,'[]'::jsonb),
    case when p_platform in ('pc','mobile','tablet') then p_platform else 'unknown' end,
    case when p_control_type in ('keyboard','touch','gamepad') then p_control_type else 'unknown' end,
    coalesce(p_assists,'{}'::jsonb),
    p_physics_version, p_track_version, p_session_version, v_review,
    v_verified, 1, p_session_hash, now()
  )
  on conflict(track_id, player_key) do update set
    user_id = coalesce(excluded.user_id, public.formula_v45_records.user_id),
    player_name = excluded.player_name,
    best_lap_ms = case
      when excluded.best_lap_ms is null then public.formula_v45_records.best_lap_ms
      when public.formula_v45_records.best_lap_ms is null then excluded.best_lap_ms
      else least(public.formula_v45_records.best_lap_ms, excluded.best_lap_ms)
    end,
    five_lap_total_ms = least(public.formula_v45_records.five_lap_total_ms, excluded.five_lap_total_ms),
    valid_lap_count = greatest(public.formula_v45_records.valid_lap_count, excluded.valid_lap_count),
    sector_bests = excluded.sector_bests,
    platform = excluded.platform,
    control_type = excluded.control_type,
    assists = excluded.assists,
    physics_version = excluded.physics_version,
    track_version = excluded.track_version,
    session_version = excluded.session_version,
    review_status = case
      when public.formula_v45_records.review_status='accepted' then 'accepted'
      else excluded.review_status
    end,
    verified = public.formula_v45_records.verified or excluded.verified,
    attempts = public.formula_v45_records.attempts + 1,
    last_session_hash = excluded.last_session_hash,
    updated_at = now();

  select best_lap_ms, five_lap_total_ms
    into v_saved_lap, v_saved_total
  from public.formula_v45_records
  where track_id=p_track_id and player_key=v_player_key;

  if jsonb_array_length(coalesce(p_sector_bests,'[]'::jsonb)) = 3 then
    for i in 0..2 loop
      if (p_sector_bests->>i)::integer between 3000 and 300000 then
        insert into public.formula_v45_sector_records(
          track_id, player_key, sector_no, sector_time_ms, session_hash
        )
        values(
          p_track_id, v_player_key, i+1, (p_sector_bests->>i)::integer, p_session_hash
        )
        on conflict(track_id,player_key,sector_no) do update set
          sector_time_ms=least(public.formula_v45_sector_records.sector_time_ms, excluded.sector_time_ms),
          session_hash=excluded.session_hash,
          updated_at=now();
      end if;
    end loop;
  end if;

  if p_session_token is not null then
    update public.formula_v45_sessions
    set submitted_at=now(), status='submitted'
    where session_token=p_session_token;
  end if;

  insert into public.formula_v45_track_stats(track_id, completed_sessions, valid_laps)
  values(p_track_id, 1, p_valid_lap_count)
  on conflict(track_id) do update set
    completed_sessions=public.formula_v45_track_stats.completed_sessions+1,
    valid_laps=public.formula_v45_track_stats.valid_laps+p_valid_lap_count,
    updated_at=now();

  return query
  select
    case when v_saved_lap is null then null else (
      select count(*)::bigint + 1
      from public.formula_v45_records r
      where r.track_id=p_track_id
        and r.review_status='accepted'
        and r.best_lap_ms is not null
        and r.best_lap_ms < v_saved_lap
    ) end,
    (
      select count(*)::bigint + 1
      from public.formula_v45_records r
      where r.track_id=p_track_id
        and r.review_status='accepted'
        and r.five_lap_total_ms < v_saved_total
    ),
    v_review,
    v_verified,
    (p_best_lap_ms is not null and (v_previous_lap is null or p_best_lap_ms < v_previous_lap)),
    (v_previous_total is null or p_five_lap_total_ms < v_previous_total);
end;
$$;

create or replace function public.formula_v45_get_leaderboard(
  p_track_id text,
  p_metric text default 'lap',
  p_platform text default null,
  p_control_type text default null,
  p_verified_only boolean default false,
  p_limit integer default 50
)
returns table(
  rank bigint,
  player_name text,
  time_ms integer,
  platform text,
  control_type text,
  assists jsonb,
  verified boolean,
  review_status text,
  attempts integer,
  updated_at timestamptz
)
language sql
security definer
stable
set search_path=public
as $$
  select
    row_number() over(
      order by
        case when p_metric='total' then r.five_lap_total_ms else r.best_lap_ms end asc,
        r.updated_at asc
    )::bigint,
    r.player_name,
    case when p_metric='total' then r.five_lap_total_ms else r.best_lap_ms end,
    r.platform,
    r.control_type,
    r.assists,
    r.verified,
    r.review_status,
    r.attempts,
    r.updated_at
  from public.formula_v45_records r
  where r.track_id=p_track_id
    and r.review_status in ('accepted','under-review')
    and (
      (p_metric='total' and r.five_lap_total_ms is not null)
      or
      (p_metric<>'total' and r.best_lap_ms is not null)
    )
    and (p_platform is null or r.platform=p_platform)
    and (p_control_type is null or r.control_type=p_control_type)
    and (not p_verified_only or r.verified=true)
  order by
    case when p_metric='total' then r.five_lap_total_ms else r.best_lap_ms end asc,
    r.updated_at asc
  limit greatest(1,least(coalesce(p_limit,50),100));
$$;

create or replace function public.formula_v45_get_personal_records(
  p_device_key text
)
returns setof public.formula_v45_records
language plpgsql
security definer
stable
set search_path=public
as $$
declare
  v_player_key text;
begin
  v_player_key := case
    when auth.uid() is not null then 'user:' || auth.uid()::text
    else 'guest:' || encode(digest(p_device_key || '|formula-v45-device', 'sha256'), 'hex')
  end;
  return query
    select * from public.formula_v45_records
    where player_key=v_player_key
    order by track_id;
end;
$$;

create or replace function public.formula_v45_get_ghost_metadata(
  p_track_id text,
  p_ghost_type text default 'world-record'
)
returns table(
  player_key text,
  lap_time_ms integer,
  replay_version text,
  replay_ref text,
  replay_checksum text,
  approved boolean
)
language sql
security definer
stable
set search_path=public
as $$
  select g.player_key, g.lap_time_ms, g.replay_version, g.replay_ref, g.replay_checksum, g.approved
  from public.formula_v45_ghosts g
  where g.track_id=p_track_id and g.ghost_type=p_ghost_type and g.approved=true
  order by g.lap_time_ms asc
  limit 1;
$$;

revoke all on function public.formula_v45_start_session(text,text) from public;
revoke all on function public.formula_v45_submit_session(uuid,text,text,integer,integer,jsonb,integer,text,text,jsonb,text,text,text,integer,integer,integer,text,text,text,text) from public;
revoke all on function public.formula_v45_get_leaderboard(text,text,text,text,boolean,integer) from public;
revoke all on function public.formula_v45_get_personal_records(text) from public;
revoke all on function public.formula_v45_get_ghost_metadata(text,text) from public;

grant execute on function public.formula_v45_start_session(text,text) to anon, authenticated;
grant execute on function public.formula_v45_submit_session(uuid,text,text,integer,integer,jsonb,integer,text,text,jsonb,text,text,text,integer,integer,integer,text,text,text,text) to anon, authenticated;
grant execute on function public.formula_v45_get_leaderboard(text,text,text,text,boolean,integer) to anon, authenticated;
grant execute on function public.formula_v45_get_personal_records(text) to anon, authenticated;
grant execute on function public.formula_v45_get_ghost_metadata(text,text) to anon, authenticated;
