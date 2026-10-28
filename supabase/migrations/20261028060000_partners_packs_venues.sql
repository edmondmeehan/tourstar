create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'artist' check (kind in ('artist', 'venue', 'brand')),
  contact_name text not null default '' check (char_length(contact_name) <= 80),
  contact_email text not null default '' check (char_length(contact_email) <= 120),
  rev_share_pct numeric(5,2) not null default 0 check (rev_share_pct between 0 and 100),
  flat_fee_usd numeric(10,2) not null default 0 check (flat_fee_usd >= 0),
  license_signed_on date,
  license_expires_on date,
  approved_assets text not null default '' check (char_length(approved_assets) <= 600),
  notes text not null default '' check (char_length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (license_expires_on is null or license_signed_on is null or license_expires_on >= license_signed_on)
);
alter table public.partners enable row level security;
drop policy if exists "Admins manage partners" on public.partners;
create policy "Admins manage partners" on public.partners for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.partner_ok(p_partner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_partner is null or exists (
    select 1 from public.partners p
    where p.id = p_partner and p.active and p.license_signed_on is not null
      and (p.license_expires_on is null or p.license_expires_on >= current_date)
  );
$$;
revoke execute on function public.partner_ok(uuid) from public;
grant execute on function public.partner_ok(uuid) to anon, authenticated;

alter table public.drops add column if not exists partner_id uuid references public.partners(id) on delete set null;
create index if not exists drops_partner on public.drops (partner_id);

drop policy if exists "Players see live drops" on public.drops;
create policy "Players see live drops" on public.drops for select to anon, authenticated
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()) and public.partner_ok(partner_id));

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  city text not null default '' check (char_length(city) <= 80),
  emoji text not null default '🏟️',
  tagline text not null default '' check (char_length(tagline) <= 200),
  image_url text check (image_url is null or image_url ~ '^https://'),
  base_tour text not null check (base_tour in ('bar-gig', 'club-tour', 'theater-tour', 'arena-tour', 'stadium-tour', 'stadium-encore')),
  capacity int check (capacity between 50 and 200000),
  stage_theme text,
  fame_bonus_pct int not null default 10 check (fame_bonus_pct between 0 and 50),
  ticket_url text check (ticket_url is null or ticket_url ~ '^https://'),
  ticket_label text not null default 'See real upcoming shows' check (char_length(ticket_label) <= 40),
  pack_only boolean not null default false,
  sponsored boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
alter table public.venues enable row level security;
drop policy if exists "Players see live venues" on public.venues;
create policy "Players see live venues" on public.venues for select to anon, authenticated
  using (active and starts_at <= now() and (ends_at is null or ends_at > now()) and public.partner_ok(partner_id));
drop policy if exists "Admins manage venues" on public.venues;
create policy "Admins manage venues" on public.venues for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.drops_validate_items() returns trigger
language plpgsql set search_path = '' as $$
declare it jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then raise exception 'Items must be a list.'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    if coalesce(it->>'type', '') not in ('stage', 'title', 'badge', 'cash', 'energy', 'gold', 'venue') then
      raise exception 'Packs can only contain stages, titles, badges, venues, game cash, energy or Gold. Reward points and raffle entries can never be sold.';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end; $$;

create table if not exists public.venue_events (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues(id) on delete cascade,
  kind text not null check (kind in ('view', 'play', 'ticket')),
  device_id text not null check (char_length(device_id) between 6 and 64),
  user_id uuid references auth.users(id) on delete set null,
  day date not null default current_date,
  created_at timestamptz not null default now()
);
create unique index if not exists venue_events_view_once on public.venue_events (venue_id, device_id, day) where kind = 'view';
create index if not exists venue_events_venue on public.venue_events (venue_id, created_at desc);
alter table public.venue_events enable row level security;
drop policy if exists "Admins read venue events" on public.venue_events;
create policy "Admins read venue events" on public.venue_events for select to authenticated using (public.is_admin());

create or replace function public.venue_event(p_venue uuid, p_kind text, p_device text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('view', 'play', 'ticket') or char_length(coalesce(p_device, '')) not between 6 and 64 then return; end if;
  if not exists (select 1 from public.venues where id = p_venue) then return; end if;
  if p_kind <> 'view' and (select count(*) from public.venue_events where device_id = p_device and created_at > now() - interval '1 hour') >= 60 then return; end if;
  insert into public.venue_events (venue_id, kind, device_id, user_id) values (p_venue, p_kind, p_device, auth.uid())
  on conflict do nothing;
end; $$;
revoke execute on function public.venue_event(uuid, text, text) from public;
grant execute on function public.venue_event(uuid, text, text) to anon, authenticated;

create or replace function public.admin_partner_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'packs', coalesce((select jsonb_agg(jsonb_build_object('partner_id', d.partner_id, 'drop_id', d.id, 'name', d.name, 'sold', s.n, 'gold', s.g)) from (
        select drop_id, count(*) as n, sum(price_gold) as g from public.drop_purchases
        where created_at >= p_from and created_at < p_to + 1 and drop_id is not null group by drop_id) s
        join public.drops d on d.id = s.drop_id), '[]'::jsonb),
    'venues', coalesce((select jsonb_agg(jsonb_build_object('partner_id', v.partner_id, 'venue_id', v.id, 'name', v.name,
        'views', coalesce(e.views, 0), 'plays', coalesce(e.plays, 0), 'tickets', coalesce(e.tickets, 0))) from public.venues v
        left join (select venue_id,
            count(*) filter (where kind = 'view') as views, count(*) filter (where kind = 'play') as plays, count(*) filter (where kind = 'ticket') as tickets
          from public.venue_events where created_at >= p_from and created_at < p_to + 1 group by venue_id) e on e.venue_id = v.id), '[]'::jsonb)
  );
end; $$;
revoke execute on function public.admin_partner_report(date, date) from public, anon;
grant execute on function public.admin_partner_report(date, date) to authenticated;

create or replace function public.buy_drop(p_drop uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_d public.drops;
  v_days int;
  v_level int;
  v_bal int;
  v_gold_in int;
begin
  if v_uid is null then raise exception 'Sign in to buy drops.'; end if;
  select * into v_d from public.drops where id = p_drop for share;
  if not found or not v_d.active or v_d.starts_at > now() or (v_d.ends_at is not null and v_d.ends_at <= now()) or not public.partner_ok(v_d.partner_id) then
    raise exception 'This pack is no longer available.';
  end if;
  if exists (select 1 from public.drop_purchases where user_id = v_uid and drop_id = p_drop) then raise exception 'You already own this.'; end if;
  if v_d.new_players_days is not null then
    select floor(extract(epoch from now() - created_at) / 86400)::int into v_days from auth.users where id = v_uid;
    if coalesce(v_days, 0) >= v_d.new_players_days then raise exception 'This offer was for new players.'; end if;
  end if;
  select coalesce((career->>'peakLevel')::int, 1) into v_level from public.saves where user_id = v_uid;
  if coalesce(v_level, 1) < v_d.min_level then raise exception 'Reach level % to unlock this.', v_d.min_level; end if;

  insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
  values (v_uid, v_d.id, v_d.name, v_d.price_gold, v_d.items);
  if v_d.price_gold > 0 then
    v_bal := public.gold_add(v_uid, -v_d.price_gold, 'Bought ' || v_d.name, 'drop:' || v_uid || ':' || v_d.id);
  end if;
  select coalesce(sum((it->>'amount')::int), 0) into v_gold_in from jsonb_array_elements(v_d.items) it where it->>'type' = 'gold';
  if v_gold_in > 0 then
    v_bal := public.gold_add(v_uid, v_gold_in, 'Bonus from ' || v_d.name, 'dropbonus:' || v_uid || ':' || v_d.id);
  end if;
  return jsonb_build_object('gold', coalesce(v_bal, (select gold from public.player_perks where user_id = v_uid)), 'items', v_d.items, 'name', v_d.name);
end; $$;
revoke execute on function public.buy_drop(uuid) from public, anon;
grant execute on function public.buy_drop(uuid) to authenticated;
