-- FIFA Tournament Hub / Supabase database setup
-- Run this entire file once in Supabase Dashboard > SQL Editor.

create table if not exists public.tournament_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_state (
  id text primary key,
  edition integer not null default 9,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.tournament_admins enable row level security;
alter table public.tournament_state enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.tournament_state to anon, authenticated;
grant insert, update on public.tournament_state to authenticated;
grant select on public.tournament_admins to authenticated;

-- Recreate policies safely.
drop policy if exists "Admins can read own admin record" on public.tournament_admins;
create policy "Admins can read own admin record"
on public.tournament_admins
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Public can read tournament state" on public.tournament_state;
create policy "Public can read tournament state"
on public.tournament_state
for select
to anon, authenticated
using (true);

drop policy if exists "Tournament admins can insert state" on public.tournament_state;
create policy "Tournament admins can insert state"
on public.tournament_state
for insert
to authenticated
with check (
  exists (
    select 1 from public.tournament_admins a
    where a.user_id = auth.uid()
  )
);

drop policy if exists "Tournament admins can update state" on public.tournament_state;
create policy "Tournament admins can update state"
on public.tournament_state
for update
to authenticated
using (
  exists (
    select 1 from public.tournament_admins a
    where a.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.tournament_admins a
    where a.user_id = auth.uid()
  )
);

insert into public.tournament_state (id, edition, payload)
values (
  'fifa-9',
  9,
  '{
    "schemaVersion": 1,
    "current": {
      "edition": 9,
      "participants": [
        {"id":"P01","name":""},{"id":"P02","name":""},{"id":"P03","name":""},{"id":"P04","name":""},
        {"id":"P05","name":""},{"id":"P06","name":""},{"id":"P07","name":""},{"id":"P08","name":""},
        {"id":"P09","name":""},{"id":"P10","name":""},{"id":"P11","name":""},{"id":"P12","name":""},
        {"id":"P13","name":""},{"id":"P14","name":""},{"id":"P15","name":""},{"id":"P16","name":""}
      ],
      "league": {"generated":false,"drawSeed":null,"rounds":[]},
      "phase2": {"generated":false,"goldIds":[],"silverIds":[],"eliminatedIds":[],"goldRounds":[],"silverRounds":[]},
      "knockout": {"generated":false,"seeds":null,"qf1":null,"qf2":null,"qf3":null,"sf1":null,"sf2":null,"final":null,"championId":null}
    }
  }'::jsonb
)
on conflict (id) do nothing;

-- Enable Realtime for the state table.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tournament_state'
  ) then
    alter publication supabase_realtime add table public.tournament_state;
  end if;
end $$;

-- AFTER creating your administrator user in Authentication > Users,
-- copy the user's UUID and run the command below with the UUID replaced:
-- insert into public.tournament_admins (user_id, display_name)
-- values ('PASTE_AUTH_USER_UUID_HERE', 'Tournament Administrator');
