-- TourStar admin tools. Paste into Supabase → SQL Editor → Run (project: tourstar).
-- Adds new tables only; the player saves table just gets one extra "admins can read" rule.

-- ===================== Admin roles =====================
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.admin_invites (
  email text primary key,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
alter table public.admin_invites enable row level security;
insert into public.admin_invites (email) values ('eddie@please.co');

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

create policy "Admins see admins" on public.admins for select to authenticated using (public.is_admin());
create policy "Admins see invites" on public.admin_invites for select to authenticated using (public.is_admin());

-- A signed-in user whose CONFIRMED email has an invite becomes an admin.
create or replace function public.claim_admin_invite() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_email text; v_confirmed timestamptz;
begin
  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = (select auth.uid());
  if v_email is null or v_confirmed is null then return false; end if;
  if exists (select 1 from public.admin_invites where lower(email) = lower(v_email)) then
    insert into public.admins (user_id, email) values ((select auth.uid()), v_email) on conflict do nothing;
    delete from public.admin_invites where lower(email) = lower(v_email);
  end if;
  return exists (select 1 from public.admins where user_id = (select auth.uid()));
end; $$;

create or replace function public.admin_add(p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_confirmed timestamptz;
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  p_email := lower(trim(p_email));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email'; end if;
  select id, email_confirmed_at into v_uid, v_confirmed from auth.users where lower(email) = p_email limit 1;
  if v_uid is not null and v_confirmed is not null then
    insert into public.admins (user_id, email, added_by) values (v_uid, p_email, (select auth.uid())) on conflict do nothing;
    return 'added';
  end if;
  insert into public.admin_invites (email, invited_by) values (p_email, (select auth.uid())) on conflict do nothing;
  return 'invited';
end; $$;

create or replace function public.admin_remove(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not authorized'; end if;
  p_email := lower(trim(p_email));
  delete from public.admin_invites where lower(email) = p_email;
  if (select count(*) from public.admins) <= 1 and exists (select 1 from public.admins where lower(email) = p_email) then
    raise exception 'cannot remove the last admin';
  end if;
  delete from public.admins where lower(email) = p_email;
end; $$;

-- ===================== Analytics =====================
create table public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  device_id text not null check (char_length(device_id) between 6 and 64),
  name text not null check (char_length(name) between 1 and 40),
  props jsonb not null default '{}' check (pg_column_size(props) < 2000),
  platform text check (platform in ('web','ios','android'))
);
create index analytics_events_created_idx on public.analytics_events (created_at desc);
create index analytics_events_name_idx on public.analytics_events (name, created_at desc);
create index analytics_events_user_idx on public.analytics_events (user_id);
alter table public.analytics_events enable row level security;
create policy "Anyone can log their own events" on public.analytics_events for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));
create policy "Admins read events" on public.analytics_events for select to authenticated using (public.is_admin());

-- ===================== Announcements =====================
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 600),
  style text not null default 'banner' check (style in ('banner','popup')),
  cta_label text check (char_length(cta_label) <= 30),
  cta_route text check (char_length(cta_route) <= 60),
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
create policy "Players read live announcements" on public.announcements for select to anon, authenticated
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()));
create policy "Admins read all announcements" on public.announcements for select to authenticated using (public.is_admin());
create policy "Admins write announcements" on public.announcements for insert to authenticated with check (public.is_admin());
create policy "Admins update announcements" on public.announcements for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins delete announcements" on public.announcements for delete to authenticated using (public.is_admin());

-- ===================== Live balance config =====================
create table public.game_config (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.game_config (id, data) values (1, '{}');
alter table public.game_config enable row level security;
create policy "Everyone reads config" on public.game_config for select to anon, authenticated using (true);
create policy "Admins update config" on public.game_config for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===================== Triggered events / gifts =====================
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event','gift')),
  event_id text check (char_length(event_id) <= 40),
  gift jsonb check (gift is null or pg_column_size(gift) < 500),
  message text check (char_length(message) <= 200),
  active boolean not null default true,
  expires_at timestamptz not null default now() + interval '3 days',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.broadcasts enable row level security;
create policy "Players read live broadcasts" on public.broadcasts for select to anon, authenticated using (active and expires_at > now());
create policy "Admins read all broadcasts" on public.broadcasts for select to authenticated using (public.is_admin());
create policy "Admins write broadcasts" on public.broadcasts for insert to authenticated with check (public.is_admin());
create policy "Admins update broadcasts" on public.broadcasts for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ===================== Distribution orders (Stripe later) =====================
create table public.distribution_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  release_title text not null,
  services text[] not null default '{}',
  amount_cents int not null default 999,
  status text not null default 'pending' check (status in ('pending','paid','submitted','live','failed','refunded')),
  stripe_session_id text,
  created_at timestamptz not null default now()
);
alter table public.distribution_orders enable row level security;
create policy "Players see own orders" on public.distribution_orders for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players create own orders" on public.distribution_orders for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending');
create policy "Admins see all orders" on public.distribution_orders for select to authenticated using (public.is_admin());
create policy "Admins update orders" on public.distribution_orders for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Admins can read every save (for the Players tab).
create policy "Admins read all saves" on public.saves for select to authenticated using (public.is_admin());
