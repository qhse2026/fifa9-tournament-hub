-- FIFA 9 Tournament Hub
-- Administrator account: cglrcnttr@gmail.com
-- IMPORTANT: First create this user in Supabase Dashboard > Authentication > Users.
-- Then run this complete script in Supabase Dashboard > SQL Editor.

insert into public.tournament_admins (user_id, display_name)
select id, 'Tournament Administrator'
from auth.users
where lower(email) = lower('cglrcnttr@gmail.com')
on conflict (user_id) do update
set display_name = excluded.display_name;

-- Verification: the query below must return exactly one row.
select
  a.user_id,
  a.display_name,
  u.email,
  a.created_at
from public.tournament_admins a
join auth.users u on u.id = a.user_id
where lower(u.email) = lower('cglrcnttr@gmail.com');
