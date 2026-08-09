-- FIFA Universe V5.7.2 · Player Result Desk
-- Run once in Supabase Dashboard > SQL Editor.
-- Purpose: A player may submit only their own knockout result. The opponent must
-- confirm the exact same score and teams. Only then is the result written to the
-- official Championship OS JSON. Play-In and QF winners wait for the next official draw; only SF winners/losers feed the fixed Final/3rd-place matches.

create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  player_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fifa10_championship_result_submissions (
  tournament_id text not null,
  series_id text not null,
  match_id text not null,
  home_score integer not null check (home_score >= 0),
  away_score integer not null check (away_score >= 0),
  home_team text not null,
  away_team text not null,
  confirmed_home boolean not null default false,
  confirmed_away boolean not null default false,
  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  official_at timestamptz,
  status text not null default 'pending' check (status in ('pending','official','rejected')),
  primary key (tournament_id, series_id, match_id)
);

alter table public.fifa10_championship_result_submissions enable row level security;
revoke all on public.fifa10_championship_result_submissions from anon, authenticated;
grant usage on schema public to authenticated;

create or replace function public._fifa10_set_series_participant(
  p_journey jsonb,
  p_series_id text,
  p_field text,
  p_value text
) returns jsonb
language plpgsql
immutable
as $$
declare
  v_round text;
  v_item record;
  v_series jsonb;
begin
  if p_value is null then return p_journey; end if;
  foreach v_round in array array['playin','quarterfinal','semifinal','bronze','final'] loop
    for v_item in
      select value as series, ordinality as idx
      from jsonb_array_elements(coalesce(p_journey->'rounds'->v_round,'[]'::jsonb)) with ordinality
    loop
      if v_item.series->>'id' = p_series_id then
        v_series := jsonb_set(v_item.series, array[p_field], to_jsonb(p_value), true);
        if coalesce(v_series->>'homeId','') <> '' and coalesce(v_series->>'awayId','') <> '' and coalesce(v_series->>'status','waiting') = 'waiting' then
          v_series := jsonb_set(v_series, '{status}', '"ready"'::jsonb, true);
        end if;
        return jsonb_set(p_journey, array['rounds',v_round,(v_item.idx-1)::text],v_series,true);
      end if;
    end loop;
  end loop;
  return p_journey;
end;
$$;

create or replace function public.get_my_fifa10_result_desk(
  p_tournament_id text default 'fifa-9'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_player text;
  v_admin boolean := false;
  v_payload jsonb;
  v_draw jsonb;
  v_journey jsonb;
  v_round text;
  v_series_rec record;
  v_match_rec record;
  v_home_name text;
  v_away_name text;
  v_submission public.fifa10_championship_result_submissions%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_can boolean;
  v_prior_open boolean;
  v_round_label text;
begin
  if v_uid is null then raise exception 'Oyuncu girişi gereklidir.'; end if;
  select exists(select 1 from public.tournament_admins where user_id=v_uid) into v_admin;
  select player_name into v_player from public.player_profiles where user_id=v_uid and active is not false;
  if not v_admin and coalesce(btrim(v_player),'')='' then
    raise exception 'Bu hesap aktif bir oyuncu profiline bağlı değil.';
  end if;
  select payload into v_payload from public.tournament_state where id=p_tournament_id;
  if v_payload is null then raise exception 'Turnuva verisi bulunamadı.'; end if;
  v_draw := v_payload #> '{seasonSystem,fifa10Draft,draw}';
  v_journey := v_payload #> '{seasonSystem,fifa10Draft,championshipOS}';
  if v_draw is null then raise exception 'FIFA 10 kura verisi bulunamadı.'; end if;
  if v_journey is null then
    return jsonb_build_object('role',case when v_admin then 'admin' else 'player' end,'player_name',v_player,'journey_status','preview','matches','[]'::jsonb);
  end if;

  foreach v_round in array array['playin','quarterfinal','semifinal','bronze','final'] loop
    v_round_label := case v_round when 'playin' then 'CHAMPIONSHIP PLAY-IN' when 'quarterfinal' then 'ÇEYREK FİNAL' when 'semifinal' then 'YARI FİNAL' when 'bronze' then 'ÜÇÜNCÜLÜK' else 'BÜYÜK FİNAL' end;
    for v_series_rec in
      select value as series, ordinality as idx
      from jsonb_array_elements(coalesce(v_journey->'rounds'->v_round,'[]'::jsonb)) with ordinality
    loop
      select p->>'name' into v_home_name from jsonb_array_elements(coalesce(v_draw->'participants','[]'::jsonb)) p where p->>'id'=v_series_rec.series->>'homeId' limit 1;
      select p->>'name' into v_away_name from jsonb_array_elements(coalesce(v_draw->'participants','[]'::jsonb)) p where p->>'id'=v_series_rec.series->>'awayId' limit 1;
      if not v_admin and lower(btrim(coalesce(v_player,''))) not in (lower(btrim(coalesce(v_home_name,''))),lower(btrim(coalesce(v_away_name,'')))) then continue; end if;
      v_prior_open := false;
      for v_match_rec in
        select value as match, ordinality as idx
        from jsonb_array_elements(coalesce(v_series_rec.series->'matches','[]'::jsonb)) with ordinality
      loop
        if coalesce((v_match_rec.match->>'notRequired')::boolean,false) then continue; end if;
        select * into v_submission from public.fifa10_championship_result_submissions
          where tournament_id=p_tournament_id and series_id=v_series_rec.series->>'id' and match_id=v_match_rec.match->>'id';
        v_can := coalesce(v_home_name,'')<>'' and coalesce(v_away_name,'')<>'' and not v_prior_open and not coalesce((v_match_rec.match->>'completed')::boolean,false);
        if v_admin or v_can or v_submission.match_id is not null or coalesce((v_match_rec.match->>'completed')::boolean,false) then
          v_rows := v_rows || jsonb_build_array(jsonb_build_object(
            'series_id',v_series_rec.series->>'id','match_id',v_match_rec.match->>'id','round',v_round,'round_label',v_round_label,
            'series_label',v_series_rec.series->>'label','status',v_series_rec.series->>'status','stars',coalesce((v_match_rec.match->>'stars')::numeric,0),
            'match_number',coalesce((v_match_rec.match->>'number')::int,1),'home_name',v_home_name,'away_name',v_away_name,
            'home_score',case when (v_match_rec.match->>'homeScore')~'^\d+$' then (v_match_rec.match->>'homeScore')::int else null end,
            'away_score',case when (v_match_rec.match->>'awayScore')~'^\d+$' then (v_match_rec.match->>'awayScore')::int else null end,
            'home_team',coalesce(v_match_rec.match->>'homeTeam',''),'away_team',coalesce(v_match_rec.match->>'awayTeam',''),
            'completed',coalesce((v_match_rec.match->>'completed')::boolean,false),'can_submit',v_can,
            'submission_status',coalesce(v_submission.status,''),'confirmed_home',coalesce(v_submission.confirmed_home,false),
            'confirmed_away',coalesce(v_submission.confirmed_away,false),'submitted_at',v_submission.submitted_at,
            'proposal',case when v_submission.match_id is null then null else jsonb_build_object('home_score',v_submission.home_score,'away_score',v_submission.away_score,'home_team',v_submission.home_team,'away_team',v_submission.away_team) end
          ));
        end if;
        if not coalesce((v_match_rec.match->>'completed')::boolean,false) then v_prior_open := true; end if;
        v_submission := null;
      end loop;
    end loop;
  end loop;
  return jsonb_build_object('role',case when v_admin then 'admin' else 'player' end,'player_name',coalesce(v_player,'Tournament Administrator'),'journey_status',coalesce(v_journey->>'status','preview'),'matches',v_rows);
end;
$$;

create or replace function public.submit_fifa10_championship_result(
  p_tournament_id text,
  p_series_id text,
  p_match_id text,
  p_home_score integer,
  p_away_score integer,
  p_home_team text,
  p_away_team text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_player text;
  v_payload jsonb;
  v_draw jsonb;
  v_journey jsonb;
  v_round text;
  v_check_round text;
  v_series_rec record;
  v_match_rec record;
  v_series jsonb;
  v_match jsonb;
  v_home_name text;
  v_away_name text;
  v_home_id text;
  v_away_id text;
  v_team_used boolean := false;
  v_side text;
  v_existing public.fifa10_championship_result_submissions%rowtype;
  v_both boolean := false;
  v_matches jsonb := '[]'::jsonb;
  v_match_item record;
  v_home_wins integer := 0;
  v_away_wins integer := 0;
  v_target integer;
  v_decided boolean := false;
  v_winner text;
  v_loser text;
  v_official boolean := false;
  v_found boolean := false;
begin
  if v_uid is null then raise exception 'Oyuncu girişi gereklidir.'; end if;
  if p_home_score is null or p_away_score is null or p_home_score<0 or p_away_score<0 or p_home_score=p_away_score then raise exception 'Eleme maçında geçerli ve eşit olmayan skor gerekir.'; end if;
  if coalesce(btrim(p_home_team),'')='' or coalesce(btrim(p_away_team),'')='' then raise exception 'İki takım adı da zorunludur.'; end if;
  if lower(btrim(p_home_team))=lower(btrim(p_away_team)) then raise exception 'İki rakip aynı takımı kullanamaz.'; end if;
  select player_name into v_player from public.player_profiles where user_id=v_uid and active is not false;
  if coalesce(btrim(v_player),'')='' then raise exception 'Bu hesap aktif bir oyuncu profiline bağlı değil.'; end if;
  select payload into v_payload from public.tournament_state where id=p_tournament_id for update;
  if v_payload is null then raise exception 'Turnuva verisi bulunamadı.'; end if;
  v_draw := v_payload #> '{seasonSystem,fifa10Draft,draw}';
  v_journey := v_payload #> '{seasonSystem,fifa10Draft,championshipOS}';
  if v_journey is null or coalesce(v_journey->>'status','preview')='preview' then raise exception 'Resmî eleme ağacı henüz mühürlenmedi.'; end if;

  foreach v_round in array array['playin','quarterfinal','semifinal','bronze','final'] loop
    for v_series_rec in select value as series, ordinality as idx from jsonb_array_elements(coalesce(v_journey->'rounds'->v_round,'[]'::jsonb)) with ordinality loop
      if v_series_rec.series->>'id'<>p_series_id then continue; end if;
      v_series := v_series_rec.series;
      v_home_id := v_series->>'homeId';
      v_away_id := v_series->>'awayId';
      select p->>'name' into v_home_name from jsonb_array_elements(coalesce(v_draw->'participants','[]'::jsonb)) p where p->>'id'=v_series->>'homeId' limit 1;
      select p->>'name' into v_away_name from jsonb_array_elements(coalesce(v_draw->'participants','[]'::jsonb)) p where p->>'id'=v_series->>'awayId' limit 1;
      if lower(btrim(v_player))=lower(btrim(coalesce(v_home_name,''))) then v_side:='home';
      elsif lower(btrim(v_player))=lower(btrim(coalesce(v_away_name,''))) then v_side:='away';
      else raise exception 'Yalnızca kendi eleme maçınızın sonucunu gönderebilirsiniz.'; end if;
      for v_match_rec in select value as match, ordinality as idx from jsonb_array_elements(coalesce(v_series->'matches','[]'::jsonb)) with ordinality loop
        if v_match_rec.match->>'id'=p_match_id then v_match:=v_match_rec.match; v_found:=true; exit; end if;
      end loop;
      exit when v_found;
    end loop;
    exit when v_found;
  end loop;
  if not v_found then raise exception 'Eleme maçı bulunamadı.'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_series->'matches','[]'::jsonb)) with ordinality x(match,idx)
    where x.idx < v_match_rec.idx
      and not coalesce((x.match->>'completed')::boolean,false)
      and not coalesce((x.match->>'notRequired')::boolean,false)
  ) then raise exception 'Seride önceki maç sonucu girilmeden bu maç işlenemez.'; end if;
  if coalesce((v_match->>'completed')::boolean,false) then raise exception 'Bu maçın resmî sonucu zaten girilmiş.'; end if;
  if coalesce((v_match->>'notRequired')::boolean,false) then raise exception 'Seri tamamlandığı için bu maç artık gerekli değil.'; end if;

  select exists(
    select 1 from jsonb_array_elements(coalesce(v_draw->'fixtures','[]'::jsonb)) g
    where coalesce((g->>'completed')::boolean,false) and (
      ((g->>'homeId'=v_home_id and lower(btrim(coalesce(g->>'homeTeam','')))=lower(btrim(p_home_team))) or (g->>'awayId'=v_home_id and lower(btrim(coalesce(g->>'awayTeam','')))=lower(btrim(p_home_team))))
      or ((g->>'homeId'=v_away_id and lower(btrim(coalesce(g->>'homeTeam','')))=lower(btrim(p_away_team))) or (g->>'awayId'=v_away_id and lower(btrim(coalesce(g->>'awayTeam','')))=lower(btrim(p_away_team))))
    )
  ) into v_team_used;
  if v_team_used then raise exception 'Seçilen takımlardan biri ilgili oyuncu tarafından FIFA 10 içinde daha önce kullanılmış.'; end if;

  foreach v_check_round in array array['playin','quarterfinal','semifinal','bronze','final'] loop
    select exists(
      select 1
      from jsonb_array_elements(coalesce(v_journey->'rounds'->v_check_round,'[]'::jsonb)) srs,
           jsonb_array_elements(coalesce(srs->'matches','[]'::jsonb)) gm
      where gm->>'id'<>p_match_id and coalesce((gm->>'completed')::boolean,false) and (
        ((srs->>'homeId'=v_home_id and lower(btrim(coalesce(gm->>'homeTeam','')))=lower(btrim(p_home_team))) or (srs->>'awayId'=v_home_id and lower(btrim(coalesce(gm->>'awayTeam','')))=lower(btrim(p_home_team))))
        or ((srs->>'homeId'=v_away_id and lower(btrim(coalesce(gm->>'homeTeam','')))=lower(btrim(p_away_team))) or (srs->>'awayId'=v_away_id and lower(btrim(coalesce(gm->>'awayTeam','')))=lower(btrim(p_away_team))))
      )
    ) into v_team_used;
    if v_team_used then raise exception 'Seçilen takımlardan biri ilgili oyuncu tarafından Championship içinde daha önce kullanılmış.'; end if;
  end loop;

  select * into v_existing from public.fifa10_championship_result_submissions where tournament_id=p_tournament_id and series_id=p_series_id and match_id=p_match_id for update;
  if v_existing.match_id is null then
    insert into public.fifa10_championship_result_submissions(tournament_id,series_id,match_id,home_score,away_score,home_team,away_team,confirmed_home,confirmed_away,submitted_by)
    values(p_tournament_id,p_series_id,p_match_id,p_home_score,p_away_score,btrim(p_home_team),btrim(p_away_team),v_side='home',v_side='away',v_uid)
    returning * into v_existing;
  else
    if v_existing.status='official' then raise exception 'Bu sonuç zaten resmîleşti.'; end if;
    if v_existing.home_score<>p_home_score or v_existing.away_score<>p_away_score or lower(btrim(v_existing.home_team))<>lower(btrim(p_home_team)) or lower(btrim(v_existing.away_team))<>lower(btrim(p_away_team)) then
      if (v_side='home' and v_existing.confirmed_away) or (v_side='away' and v_existing.confirmed_home) then
        raise exception 'Gönderdiğiniz sonuç rakibin teyit ettiği kayıtla uyuşmuyor. İki oyuncu aynı skor ve takımları girmelidir.';
      end if;
      update public.fifa10_championship_result_submissions set home_score=p_home_score,away_score=p_away_score,home_team=btrim(p_home_team),away_team=btrim(p_away_team),confirmed_home=(v_side='home'),confirmed_away=(v_side='away'),submitted_by=v_uid,submitted_at=now(),updated_at=now(),status='pending'
      where tournament_id=p_tournament_id and series_id=p_series_id and match_id=p_match_id returning * into v_existing;
    else
      update public.fifa10_championship_result_submissions set confirmed_home=confirmed_home or (v_side='home'),confirmed_away=confirmed_away or (v_side='away'),updated_at=now()
      where tournament_id=p_tournament_id and series_id=p_series_id and match_id=p_match_id returning * into v_existing;
    end if;
  end if;
  v_both := v_existing.confirmed_home and v_existing.confirmed_away;

  if v_both then
    v_match := jsonb_set(v_match,'{completed}','true'::jsonb,true);
    v_match := jsonb_set(v_match,'{homeScore}',to_jsonb(p_home_score),true);
    v_match := jsonb_set(v_match,'{awayScore}',to_jsonb(p_away_score),true);
    v_match := jsonb_set(v_match,'{homeTeam}',to_jsonb(btrim(p_home_team)),true);
    v_match := jsonb_set(v_match,'{awayTeam}',to_jsonb(btrim(p_away_team)),true);
    v_match := jsonb_set(v_match,'{confirmation}',jsonb_build_object('home',true,'away',true,'admin',false,'source','player-mutual-confirmation'),true);
    v_match := jsonb_set(v_match,'{updatedAt}',to_jsonb(now()::text),true);
    v_series := jsonb_set(v_series,array['matches',(v_match_rec.idx-1)::text],v_match,true);

    v_target := case when coalesce((v_series->>'bestOf')::int,3)=1 then 1 else 2 end;
    v_matches := '[]'::jsonb;
    for v_match_item in select value as match, ordinality as idx from jsonb_array_elements(v_series->'matches') with ordinality loop
      v_match := v_match_item.match;
      if v_decided then
        v_match := jsonb_set(v_match,'{notRequired}','true'::jsonb,true);
      else
        v_match := jsonb_set(v_match,'{notRequired}','false'::jsonb,true);
        if coalesce((v_match->>'completed')::boolean,false) then
          if (v_match->>'homeScore')::int > (v_match->>'awayScore')::int then v_home_wins:=v_home_wins+1; else v_away_wins:=v_away_wins+1; end if;
          if v_home_wins>=v_target or v_away_wins>=v_target then v_decided:=true; end if;
        end if;
      end if;
      v_matches := v_matches || jsonb_build_array(v_match);
    end loop;
    v_series := jsonb_set(v_series,'{matches}',v_matches,true);
    v_series := jsonb_set(v_series,'{homeWins}',to_jsonb(v_home_wins),true);
    v_series := jsonb_set(v_series,'{awayWins}',to_jsonb(v_away_wins),true);
    if v_decided then
      v_winner := case when v_home_wins>v_away_wins then v_series->>'homeId' else v_series->>'awayId' end;
      v_loser := case when v_home_wins>v_away_wins then v_series->>'awayId' else v_series->>'homeId' end;
      v_series := jsonb_set(v_series,'{winnerId}',to_jsonb(v_winner),true);
      v_series := jsonb_set(v_series,'{loserId}',to_jsonb(v_loser),true);
      v_series := jsonb_set(v_series,'{status}','"completed"'::jsonb,true);
      v_series := jsonb_set(v_series,'{completedAt}',to_jsonb(now()::text),true);
    else
      v_series := jsonb_set(v_series,'{status}','"active"'::jsonb,true);
    end if;
    v_journey := jsonb_set(v_journey,array['rounds',v_round,(v_series_rec.idx-1)::text],v_series,true);

    if v_decided then
      case p_series_id
        when 'F10-SF-1' then v_journey:=public._fifa10_set_series_participant(public._fifa10_set_series_participant(v_journey,'F10-FINAL-1','homeId',v_winner),'F10-BR-1','homeId',v_loser);
        when 'F10-SF-2' then v_journey:=public._fifa10_set_series_participant(public._fifa10_set_series_participant(v_journey,'F10-FINAL-1','awayId',v_winner),'F10-BR-1','awayId',v_loser);
        when 'F10-BR-1' then v_journey:=jsonb_set(v_journey,'{thirdId}',to_jsonb(v_winner),true);
        when 'F10-FINAL-1' then v_journey:=jsonb_set(jsonb_set(v_journey,'{championId}',to_jsonb(v_winner),true),'{runnerUpId}',to_jsonb(v_loser),true);
        else null;
      end case;
    end if;
    if coalesce(v_journey->>'championId','')<>'' and coalesce(v_journey->>'thirdId','')<>'' then v_journey:=jsonb_set(v_journey,'{status}','"completed"'::jsonb,true); end if;
    v_journey:=jsonb_set(v_journey,'{updatedAt}',to_jsonb(now()::text),true);
    v_payload:=jsonb_set(v_payload,'{seasonSystem,fifa10Draft,championshipOS}',v_journey,true);
    v_payload:=jsonb_set(v_payload,'{seasonSystem,fifa10Draft,updatedAt}',to_jsonb(now()::text),true);
    update public.tournament_state set payload=v_payload,updated_at=now(),updated_by=v_uid where id=p_tournament_id;
    update public.fifa10_championship_result_submissions set status='official',official_at=now(),updated_at=now() where tournament_id=p_tournament_id and series_id=p_series_id and match_id=p_match_id;
    v_official:=true;
  end if;

  return jsonb_build_object('ok',true,'official',v_official,'series_id',p_series_id,'match_id',p_match_id,'confirmed_home',v_existing.confirmed_home,'confirmed_away',v_existing.confirmed_away);
end;
$$;

revoke all on function public._fifa10_set_series_participant(jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.get_my_fifa10_result_desk(text) from public, anon;
revoke all on function public.submit_fifa10_championship_result(text,text,text,integer,integer,text,text) from public, anon;
grant execute on function public.get_my_fifa10_result_desk(text) to authenticated;
grant execute on function public.submit_fifa10_championship_result(text,text,text,integer,integer,text,text) to authenticated;

-- Optional audit view for the administrator in SQL Editor.
create or replace view public.fifa10_result_submission_audit as
select tournament_id,series_id,match_id,home_score,away_score,home_team,away_team,confirmed_home,confirmed_away,status,submitted_at,official_at
from public.fifa10_championship_result_submissions;

-- V5.7.3 safe state migration: remove the legacy fixed QF/SF routes only when
-- no quarter-final or later result has been recorded. Play-In results are preserved.
do $$
declare
  r record;
  v_journey jsonb;
  v_round text;
  v_arr jsonb;
  v_series jsonb;
  v_has_later_result boolean;
begin
  for r in select id, payload from public.tournament_state loop
    v_journey := r.payload #> '{seasonSystem,fifa10Draft,championshipOS}';
    if v_journey is null or coalesce((v_journey->>'version')::int,1) <> 1 then continue; end if;

    select exists(
      select 1
      from unnest(array['quarterfinal','semifinal','bronze','final']) rd(round_name),
           jsonb_array_elements(coalesce(v_journey->'rounds'->rd.round_name,'[]'::jsonb)) srs,
           jsonb_array_elements(coalesce(srs->'matches','[]'::jsonb)) gm
      where coalesce((gm->>'completed')::boolean,false)
    ) into v_has_later_result;
    if v_has_later_result then continue; end if;

    v_journey := jsonb_set(v_journey,'{version}','2'::jsonb,true);
    v_journey := jsonb_set(v_journey,'{build}',to_jsonb('573000'::text),true);
    v_journey := jsonb_set(v_journey,'{draws}',jsonb_build_object(
      'quarterfinal',jsonb_build_object('status','pending','mode',null,'drawnAt',null,'pairings','[]'::jsonb),
      'semifinal',jsonb_build_object('status','pending','mode',null,'drawnAt',null,'pairings','[]'::jsonb)
    ),true);

    foreach v_round in array array['quarterfinal','semifinal'] loop
      v_arr := '[]'::jsonb;
      for v_series in select value from jsonb_array_elements(coalesce(v_journey->'rounds'->v_round,'[]'::jsonb)) loop
        v_series := jsonb_set(v_series,'{homeSource}',jsonb_build_object('type','draw-pending','draw',v_round),true);
        v_series := jsonb_set(v_series,'{awaySource}',jsonb_build_object('type','draw-pending','draw',v_round),true);
        v_series := jsonb_set(v_series,'{homeId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{awayId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{winnerId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{loserId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{homeWins}','0'::jsonb,true);
        v_series := jsonb_set(v_series,'{awayWins}','0'::jsonb,true);
        v_series := jsonb_set(v_series,'{status}','"waiting"'::jsonb,true);
        v_arr := v_arr || jsonb_build_array(v_series);
      end loop;
      v_journey := jsonb_set(v_journey,array['rounds',v_round],v_arr,true);
    end loop;

    -- Final and third-place remain source-linked to SF winners/losers, but any
    -- pre-resolved participant IDs from the old route are cleared.
    foreach v_round in array array['bronze','final'] loop
      v_arr := '[]'::jsonb;
      for v_series in select value from jsonb_array_elements(coalesce(v_journey->'rounds'->v_round,'[]'::jsonb)) loop
        v_series := jsonb_set(v_series,'{homeId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{awayId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{winnerId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{loserId}','null'::jsonb,true);
        v_series := jsonb_set(v_series,'{status}','"waiting"'::jsonb,true);
        v_arr := v_arr || jsonb_build_array(v_series);
      end loop;
      v_journey := jsonb_set(v_journey,array['rounds',v_round],v_arr,true);
    end loop;

    v_journey := jsonb_set(v_journey,'{updatedAt}',to_jsonb(now()::text),true);
    update public.tournament_state
      set payload=jsonb_set(r.payload,'{seasonSystem,fifa10Draft,championshipOS}',v_journey,true), updated_at=now()
      where id=r.id;
  end loop;
end;
$$;
