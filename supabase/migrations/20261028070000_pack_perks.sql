create or replace function public.drops_validate_items() returns trigger
language plpgsql set search_path = '' as $$
declare it jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then raise exception 'Items must be a list.'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    if coalesce(it->>'type', '') not in ('stage', 'title', 'badge', 'cash', 'energy', 'gold', 'venue', 'skin', 'moves', 'perk') then
      raise exception 'Packs can only contain stages, app colors, dance moves, titles, badges, venues, perks, game cash, energy or Gold. Reward points and raffle entries can never be sold.';
    end if;
    if it->>'type' = 'skin' and not (coalesce(it->>'a', '') ~ '^#[0-9a-fA-F]{6}$' and coalesce(it->>'b', '') ~ '^#[0-9a-fA-F]{6}$' and coalesce(it->>'bg', '') ~ '^#[0-9a-fA-F]{6}$') then
      raise exception 'App colors need three hex colors like #F5F7FF.';
    end if;
    if it->>'type' = 'moves' and (coalesce((it->>'members')::int, 1) not between 1 and 5) then
      raise exception 'A dance formation can have 1 to 5 performers.';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end; $$;

create table if not exists public.pack_perks (
  drop_id uuid primary key references public.drops(id) on delete cascade,
  merch_url text check (merch_url is null or merch_url ~ '^https://'),
  merch_label text not null default 'Official store' check (char_length(merch_label) <= 60),
  discount_text text not null default '' check (char_length(discount_text) <= 80),
  code_mode text not null default 'shared' check (code_mode in ('shared', 'unique', 'none')),
  shared_code text check (shared_code is null or char_length(shared_code) between 1 and 80),
  updated_at timestamptz not null default now()
);
alter table public.pack_perks enable row level security;
drop policy if exists "Admins manage pack perks" on public.pack_perks;
create policy "Admins manage pack perks" on public.pack_perks for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.pack_perk_codes (
  id bigint generated always as identity primary key,
  drop_id uuid not null references public.drops(id) on delete cascade,
  code text not null check (char_length(code) between 1 and 80),
  user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  unique (drop_id, code)
);
create index if not exists pack_perk_codes_free on public.pack_perk_codes (drop_id) where user_id is null;
alter table public.pack_perk_codes enable row level security;
drop policy if exists "Admins manage pack codes" on public.pack_perk_codes;
create policy "Admins manage pack codes" on public.pack_perk_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.pack_perk_reveals (
  drop_id uuid not null references public.drops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  revealed_at timestamptz not null default now(),
  primary key (drop_id, user_id)
);
alter table public.pack_perk_reveals enable row level security;
drop policy if exists "Players see their pack codes" on public.pack_perk_reveals;
create policy "Players see their pack codes" on public.pack_perk_reveals for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Admins see pack codes" on public.pack_perk_reveals;
create policy "Admins see pack codes" on public.pack_perk_reveals for select to authenticated using (public.is_admin());

create table if not exists public.pack_perk_taps (
  id bigint generated always as identity primary key,
  drop_id uuid not null references public.drops(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists pack_perk_taps_drop on public.pack_perk_taps (drop_id, created_at desc);
alter table public.pack_perk_taps enable row level security;
drop policy if exists "Admins read pack taps" on public.pack_perk_taps;
create policy "Admins read pack taps" on public.pack_perk_taps for select to authenticated using (public.is_admin());

create or replace function public.my_pack_perks() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'drop_id', d.id, 'pack', d.name, 'emoji', d.emoji,
    'merch_url', pp.merch_url, 'merch_label', pp.merch_label, 'discount_text', pp.discount_text,
    'has_code', pp.code_mode <> 'none' and (pp.code_mode = 'unique' or coalesce(pp.shared_code, '') <> ''),
    'code', r.code,
    'sold_out', pp.code_mode = 'unique' and r.code is null and not exists (select 1 from public.pack_perk_codes c where c.drop_id = d.id and c.user_id is null)
  ) order by p.created_at desc), '[]'::jsonb)
  from public.drop_purchases p
  join public.drops d on d.id = p.drop_id
  join public.pack_perks pp on pp.drop_id = d.id
  left join public.pack_perk_reveals r on r.drop_id = d.id and r.user_id = p.user_id
  where p.user_id = (select auth.uid()) and public.partner_ok(d.partner_id);
$$;
revoke execute on function public.my_pack_perks() from public, anon;
grant execute on function public.my_pack_perks() to authenticated;

create or replace function public.reveal_pack_code(p_drop uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_pp public.pack_perks;
  v_partner uuid;
  v_code text;
  v_id bigint;
begin
  if v_uid is null then raise exception 'Sign in to get your code.'; end if;
  if not exists (select 1 from public.drop_purchases where user_id = v_uid and drop_id = p_drop) then raise exception 'This code comes with the pack.'; end if;
  select partner_id into v_partner from public.drops where id = p_drop;
  if not public.partner_ok(v_partner) then raise exception 'This perk has ended.'; end if;
  select code into v_code from public.pack_perk_reveals where drop_id = p_drop and user_id = v_uid;
  if v_code is not null then return v_code; end if;
  select * into v_pp from public.pack_perks where drop_id = p_drop;
  if not found or v_pp.code_mode = 'none' then raise exception 'This pack has no discount code.'; end if;
  if v_pp.code_mode = 'shared' then
    v_code := v_pp.shared_code;
    if coalesce(v_code, '') = '' then raise exception 'The code is not ready yet. Check back soon.'; end if;
  else
    select id, code into v_id, v_code from public.pack_perk_codes where drop_id = p_drop and user_id is null order by id limit 1 for update skip locked;
    if v_id is null then raise exception 'All discount codes have been claimed. We will add more soon.'; end if;
    update public.pack_perk_codes set user_id = v_uid, claimed_at = now() where id = v_id;
  end if;
  insert into public.pack_perk_reveals (drop_id, user_id, code) values (p_drop, v_uid, v_code);
  return v_code;
end; $$;
revoke execute on function public.reveal_pack_code(uuid) from public, anon;
grant execute on function public.reveal_pack_code(uuid) to authenticated;

create or replace function public.pack_perk_tap(p_drop uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.drop_purchases where user_id = auth.uid() and drop_id = p_drop) then return; end if;
  if (select count(*) from public.pack_perk_taps where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then return; end if;
  insert into public.pack_perk_taps (drop_id, user_id) values (p_drop, auth.uid());
end; $$;
revoke execute on function public.pack_perk_tap(uuid) from public, anon;
grant execute on function public.pack_perk_tap(uuid) to authenticated;

create or replace function public.admin_pack_perk_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return coalesce((select jsonb_object_agg(pp.drop_id, jsonb_build_object(
    'codes', (select count(*) from public.pack_perk_codes c where c.drop_id = pp.drop_id),
    'codes_left', (select count(*) from public.pack_perk_codes c where c.drop_id = pp.drop_id and c.user_id is null),
    'revealed', (select count(*) from public.pack_perk_reveals r where r.drop_id = pp.drop_id),
    'taps', (select count(*) from public.pack_perk_taps t where t.drop_id = pp.drop_id)
  )) from public.pack_perks pp), '{}'::jsonb);
end; $$;
revoke execute on function public.admin_pack_perk_stats() from public, anon;
grant execute on function public.admin_pack_perk_stats() to authenticated;

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
          from public.venue_events where created_at >= p_from and created_at < p_to + 1 group by venue_id) e on e.venue_id = v.id), '[]'::jsonb),
    'merch', coalesce((select jsonb_agg(jsonb_build_object('partner_id', d.partner_id, 'drop_id', d.id, 'name', d.name,
        'taps', (select count(*) from public.pack_perk_taps t where t.drop_id = d.id and t.created_at >= p_from and t.created_at < p_to + 1),
        'codes', (select count(*) from public.pack_perk_reveals r where r.drop_id = d.id and r.revealed_at >= p_from and r.revealed_at < p_to + 1)))
        from public.drops d join public.pack_perks pp on pp.drop_id = d.id), '[]'::jsonb)
  );
end; $$;
revoke execute on function public.admin_partner_report(date, date) from public, anon;
grant execute on function public.admin_partner_report(date, date) to authenticated;

alter table public.presales add column if not exists pack_id uuid references public.drops(id) on delete set null;
do $$
declare r record;
begin
  for r in select conname from pg_constraint where conrelid = 'public.presales'::regclass and contype = 'c'
           and pg_get_constraintdef(oid) like '%for_vip%' and pg_get_constraintdef(oid) like '%min_level%' loop
    execute format('alter table public.presales drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.presales add constraint presales_audience_check check (for_vip or min_level is not null or pack_id is not null);

create or replace function public.presale_eligible(p_presale public.presales, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and (
    (p_presale.for_vip and exists (select 1 from public.player_perks where user_id = p_user and vip_until > now()))
    or (p_presale.min_level is not null and coalesce((select (career->>'peakLevel')::int from public.saves where user_id = p_user), 1) >= p_presale.min_level)
    or (p_presale.pack_id is not null and exists (select 1 from public.drop_purchases where user_id = p_user and drop_id = p_presale.pack_id))
  );
$$;
revoke execute on function public.presale_eligible(public.presales, uuid) from public, anon, authenticated;

create or replace function public.my_presales() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'artist', p.artist, 'title', p.title, 'description', p.description, 'emoji', p.emoji,
    'ticket_url', p.ticket_url, 'starts_at', p.presale_starts_at, 'ends_at', p.presale_ends_at,
    'for_vip', p.for_vip, 'min_level', p.min_level, 'pack_id', p.pack_id, 'pack_name', d.name,
    'eligible', public.presale_eligible(p, (select auth.uid())),
    'code', r.code,
    'sold_out', p.code_mode = 'unique' and r.code is null and not exists (select 1 from public.presale_codes c where c.presale_id = p.id and c.user_id is null)
  ) order by p.presale_starts_at), '[]'::jsonb)
  from public.presales p
  left join public.drops d on d.id = p.pack_id
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
  v_who text[];
begin
  if v_uid is null then raise exception 'Sign in to get presale codes.'; end if;
  select * into v_p from public.presales where id = p_presale;
  if not found or not v_p.active or v_p.presale_ends_at <= now() then raise exception 'This presale has ended.'; end if;
  select code into v_code from public.presale_reveals where presale_id = p_presale and user_id = v_uid;
  if v_code is not null then return v_code; end if;
  if not public.presale_eligible(v_p, v_uid) then
    v_who := array_remove(array[
      case when v_p.for_vip then 'TourStar VIP members' end,
      case when v_p.min_level is not null then 'players at level ' || v_p.min_level || '+' end,
      case when v_p.pack_id is not null then 'owners of ' || coalesce((select case when name ~* 'pack$' then name else name || ' pack' end from public.drops where id = v_p.pack_id), 'the artist pack') end
    ], null);
    raise exception 'This presale is for %.', array_to_string(v_who, ' and ');
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
    'level_ok', case when p.min_level is null then 0 else (select count(*) from public.saves s where coalesce((s.career->>'peakLevel')::int, 1) >= p.min_level) end,
    'pack_owners', case when p.pack_id is null then 0 else (select count(*) from public.drop_purchases dp where dp.drop_id = p.pack_id) end
  )) from public.presales p), '{}'::jsonb);
end; $$;
revoke execute on function public.admin_presale_stats() from public, anon;
grant execute on function public.admin_presale_stats() to authenticated;
