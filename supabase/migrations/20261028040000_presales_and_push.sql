create table if not exists public.presales (
  id uuid primary key default gen_random_uuid(),
  artist text not null check (char_length(artist) between 1 and 80),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 600),
  emoji text not null default '🎟️',
  ticket_url text not null check (ticket_url ~ '^https://'),
  presale_starts_at timestamptz not null,
  presale_ends_at timestamptz not null,
  code_mode text not null default 'unique' check (code_mode in ('shared', 'unique')),
  shared_code text,
  for_vip boolean not null default true,
  min_level int check (min_level between 1 and 7),
  active boolean not null default false,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (presale_ends_at > presale_starts_at),
  check (for_vip or min_level is not null)
);
alter table public.presales enable row level security;
drop policy if exists "Admins manage presales" on public.presales;
create policy "Admins manage presales" on public.presales for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.presale_codes (
  id bigint generated always as identity primary key,
  presale_id uuid not null references public.presales(id) on delete cascade,
  code text not null check (char_length(code) between 1 and 80),
  user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  unique (presale_id, code)
);
create index if not exists presale_codes_free on public.presale_codes (presale_id) where user_id is null;
alter table public.presale_codes enable row level security;
drop policy if exists "Admins manage presale codes" on public.presale_codes;
create policy "Admins manage presale codes" on public.presale_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.presale_reveals (
  presale_id uuid not null references public.presales(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  revealed_at timestamptz not null default now(),
  primary key (presale_id, user_id)
);
alter table public.presale_reveals enable row level security;
drop policy if exists "Players see their presale codes" on public.presale_reveals;
create policy "Players see their presale codes" on public.presale_reveals for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Admins see presale reveals" on public.presale_reveals;
create policy "Admins see presale reveals" on public.presale_reveals for select to authenticated using (public.is_admin());

create or replace function public.presale_eligible(p_presale public.presales, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    (p_presale.for_vip and exists (select 1 from public.player_perks where user_id = p_user and vip_until > now()))
    or (p_presale.min_level is not null and coalesce((select (career->>'peakLevel')::int from public.saves where user_id = p_user), 1) >= p_presale.min_level)
  );
$$;
revoke execute on function public.presale_eligible(public.presales, uuid) from public, anon, authenticated;

create or replace function public.my_presales() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'artist', p.artist, 'title', p.title, 'description', p.description, 'emoji', p.emoji,
    'ticket_url', p.ticket_url, 'starts_at', p.presale_starts_at, 'ends_at', p.presale_ends_at,
    'for_vip', p.for_vip, 'min_level', p.min_level,
    'eligible', public.presale_eligible(p, (select auth.uid())),
    'code', r.code,
    'sold_out', p.code_mode = 'unique' and r.code is null and not exists (select 1 from public.presale_codes c where c.presale_id = p.id and c.user_id is null)
  ) order by p.presale_starts_at), '[]'::jsonb)
  from public.presales p
  left join public.presale_reveals r on r.presale_id = p.id and r.user_id = (select auth.uid())
  where p.active and p.presale_ends_at > now();
$$;
revoke execute on function public.my_presales() from public;
grant execute on function public.my_presales() to anon, authenticated;

create or replace function public.reveal_presale_code(p_presale uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_p public.presales;
  v_code text;
  v_id bigint;
begin
  if v_uid is null then raise exception 'Sign in to get presale codes.'; end if;
  select * into v_p from public.presales where id = p_presale;
  if not found or not v_p.active or v_p.presale_ends_at <= now() then raise exception 'This presale has ended.'; end if;
  select code into v_code from public.presale_reveals where presale_id = p_presale and user_id = v_uid;
  if v_code is not null then return v_code; end if;
  if not public.presale_eligible(v_p, v_uid) then
    raise exception '%', case when v_p.for_vip and v_p.min_level is not null then 'This presale is for TourStar VIP members and players at level ' || v_p.min_level || '+.'
                              when v_p.for_vip then 'This presale is for TourStar VIP members.'
                              else 'Reach level ' || v_p.min_level || ' to unlock this presale.' end;
  end if;
  if v_p.code_mode = 'shared' then
    v_code := v_p.shared_code;
    if coalesce(v_code, '') = '' then raise exception 'The code for this presale is not ready yet. Check back soon.'; end if;
  else
    select id, code into v_id, v_code from public.presale_codes where presale_id = p_presale and user_id is null order by id limit 1 for update skip locked;
    if v_id is null then raise exception 'All codes for this presale have been claimed.'; end if;
    update public.presale_codes set user_id = v_uid, claimed_at = now() where id = v_id;
  end if;
  insert into public.presale_reveals (presale_id, user_id, code) values (p_presale, v_uid, v_code);
  return v_code;
end; $$;
revoke execute on function public.reveal_presale_code(uuid) from public, anon;
grant execute on function public.reveal_presale_code(uuid) to authenticated;

create or replace function public.admin_presale_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return coalesce((select jsonb_object_agg(p.id, jsonb_build_object(
    'revealed', (select count(*) from public.presale_reveals r where r.presale_id = p.id),
    'codes', (select count(*) from public.presale_codes c where c.presale_id = p.id),
    'codes_left', (select count(*) from public.presale_codes c where c.presale_id = p.id and c.user_id is null),
    'vip_now', (select count(*) from public.player_perks where vip_until > now()),
    'level_ok', case when p.min_level is null then 0 else (select count(*) from public.saves s where coalesce((s.career->>'peakLevel')::int, 1) >= p.min_level) end
  )) from public.presales p), '{}'::jsonb);
end; $$;
revoke execute on function public.admin_presale_stats() from public, anon;
grant execute on function public.admin_presale_stats() to authenticated;

create table if not exists public.push_devices (
  token text primary key check (char_length(token) between 10 and 400),
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  apns_env text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user on public.push_devices (user_id);
alter table public.push_devices enable row level security;
drop policy if exists "Admins read devices" on public.push_devices;
create policy "Admins read devices" on public.push_devices for select to authenticated using (public.is_admin());

create or replace function public.register_push(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_platform not in ('ios', 'android') or char_length(coalesce(p_token, '')) not between 10 and 400 then raise exception 'Bad device.'; end if;
  insert into public.push_devices (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = coalesce(auth.uid(), public.push_devices.user_id), platform = excluded.platform, updated_at = now();
end; $$;
revoke execute on function public.register_push(text, text) from public;
grant execute on function public.register_push(text, text) to anon, authenticated;

create or replace function public.unregister_push(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_devices where token = p_token;
$$;
revoke execute on function public.unregister_push(text) from public;
grant execute on function public.unregister_push(text) to anon, authenticated;

create table if not exists public.push_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 240),
  link text,
  audience text not null check (audience in ('all', 'vip', 'inactive', 'presale', 'test')),
  presale_id uuid references public.presales(id) on delete set null,
  sent_at timestamptz,
  devices int not null default 0,
  delivered int not null default 0,
  failed int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.push_messages enable row level security;
drop policy if exists "Admins read push messages" on public.push_messages;
create policy "Admins read push messages" on public.push_messages for select to authenticated using (public.is_admin());

create or replace function public.push_audience(p_audience text, p_presale uuid, p_admin uuid)
returns table (token text, platform text, apns_env text)
language sql stable security definer set search_path = '' as $$
  select d.token, d.platform, d.apns_env from public.push_devices d
  where case p_audience
    when 'all' then true
    when 'test' then d.user_id = p_admin
    when 'vip' then exists (select 1 from public.player_perks pp where pp.user_id = d.user_id and pp.vip_until > now())
    when 'inactive' then exists (select 1 from public.saves s where s.user_id = d.user_id and s.updated_at < now() - interval '3 days')
    when 'presale' then exists (select 1 from public.presales p where p.id = p_presale and public.presale_eligible(p, d.user_id))
    else false end;
$$;
revoke execute on function public.push_audience(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.push_audience(text, uuid, uuid) to service_role;

create or replace function public.admin_push_counts() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'all', (select count(*) from public.push_devices),
    'signed_in', (select count(*) from public.push_devices where user_id is not null),
    'vip', (select count(*) from public.push_devices d where exists (select 1 from public.player_perks pp where pp.user_id = d.user_id and pp.vip_until > now())),
    'inactive', (select count(*) from public.push_devices d where exists (select 1 from public.saves s where s.user_id = d.user_id and s.updated_at < now() - interval '3 days')),
    'mine', (select count(*) from public.push_devices where user_id = (select auth.uid()))
  );
end; $$;
revoke execute on function public.admin_push_counts() from public, anon;
grant execute on function public.admin_push_counts() to authenticated;
