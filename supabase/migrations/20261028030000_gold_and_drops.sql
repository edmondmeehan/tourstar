alter table public.player_perks add column if not exists gold int not null default 0;
alter table public.player_perks drop constraint if exists player_perks_gold_check;
alter table public.player_perks add constraint player_perks_gold_check check (gold >= 0);

create table if not exists public.gold_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta int not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create index if not exists gold_ledger_user on public.gold_ledger (user_id, created_at desc);
create unique index if not exists gold_ledger_ref on public.gold_ledger (ref) where ref is not null;
alter table public.gold_ledger enable row level security;
drop policy if exists "Players read their gold" on public.gold_ledger;
create policy "Players read their gold" on public.gold_ledger for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Admins read gold" on public.gold_ledger;
create policy "Admins read gold" on public.gold_ledger for select to authenticated using (public.is_admin());

create or replace function public.gold_add(p_user uuid, p_delta int, p_reason text, p_ref text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_bal int;
begin
  if p_ref is not null and exists (select 1 from public.gold_ledger where ref = p_ref) then
    return (select gold from public.player_perks where user_id = p_user);
  end if;
  insert into public.player_perks (user_id, gold) values (p_user, 0) on conflict (user_id) do nothing;
  select gold into v_bal from public.player_perks where user_id = p_user for update;
  if v_bal + p_delta < 0 then raise exception 'Not enough Gold Records.'; end if;
  update public.player_perks set gold = gold + p_delta, updated_at = now() where user_id = p_user returning gold into v_bal;
  insert into public.gold_ledger (user_id, delta, reason, ref) values (p_user, p_delta, left(p_reason, 120), p_ref);
  return v_bal;
end; $$;
revoke execute on function public.gold_add(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.gold_add(uuid, int, text, text) to service_role;

create table if not exists public.drops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  emoji text not null default '🎁',
  image_url text check (image_url is null or image_url ~ '^https://'),
  kind text not null default 'bundle' check (kind in ('bundle', 'artist', 'starter', 'season')),
  price_gold int not null check (price_gold >= 0),
  was_gold int check (was_gold >= 0),
  items jsonb not null default '[]'::jsonb,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  new_players_days int check (new_players_days >= 1),
  min_level int not null default 1 check (min_level between 1 and 7),
  active boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
alter table public.drops enable row level security;
drop policy if exists "Players see live drops" on public.drops;
create policy "Players see live drops" on public.drops for select to anon, authenticated using (active and starts_at <= now() and (ends_at is null or ends_at > now()));
drop policy if exists "Admins manage drops" on public.drops;
create policy "Admins manage drops" on public.drops for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.drops_validate_items() returns trigger
language plpgsql set search_path = '' as $$
declare it jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then raise exception 'Items must be a list.'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    if coalesce(it->>'type', '') not in ('stage', 'title', 'badge', 'cash', 'energy', 'gold') then
      raise exception 'Drops can only contain stages, titles, badges, game cash, energy or Gold. Reward points and raffle entries can never be sold.';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists drops_validate on public.drops;
create trigger drops_validate before insert or update on public.drops for each row execute function public.drops_validate_items();

create table if not exists public.drop_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  drop_id uuid references public.drops(id) on delete set null,
  drop_name text not null,
  price_gold int not null,
  items jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, drop_id)
);
alter table public.drop_purchases enable row level security;
drop policy if exists "Players see their drops" on public.drop_purchases;
create policy "Players see their drops" on public.drop_purchases for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Admins see drop purchases" on public.drop_purchases;
create policy "Admins see drop purchases" on public.drop_purchases for select to authenticated using (public.is_admin());

create or replace function public.my_gold() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'gold', coalesce((select gold from public.player_perks where user_id = (select auth.uid())), 0),
    'owned', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'drop_id', p.drop_id, 'name', p.drop_name, 'items', p.items, 'at', p.created_at) order by p.created_at)
                       from public.drop_purchases p where p.user_id = (select auth.uid())), '[]'::jsonb),
    'account_days', coalesce((select floor(extract(epoch from now() - created_at) / 86400)::int from auth.users where id = (select auth.uid())), 0)
  );
$$;
revoke execute on function public.my_gold() from public, anon;
grant execute on function public.my_gold() to authenticated;

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
  if not found or not v_d.active or v_d.starts_at > now() or (v_d.ends_at is not null and v_d.ends_at <= now()) then
    raise exception 'This drop is no longer available.';
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

create or replace function public.admin_grant_gold(p_email text, p_amount int, p_reason text) returns int
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_amount = 0 or abs(p_amount) > 100000 then raise exception 'Enter an amount between -100,000 and 100,000.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'No player with that email.'; end if;
  return public.gold_add(v_uid, p_amount, 'Admin: ' || coalesce(nullif(trim(p_reason), ''), 'adjustment'), null);
end; $$;
revoke execute on function public.admin_grant_gold(text, int, text) from public, anon;
grant execute on function public.admin_grant_gold(text, int, text) to authenticated;

create or replace function public.admin_drops_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'gold_outstanding', coalesce((select sum(gold) from public.player_perks), 0),
    'gold_bought_30d', coalesce((select sum(delta) from public.gold_ledger where delta > 0 and reason like 'Purchase%' and created_at > now() - interval '30 days'), 0),
    'gold_spent_30d', coalesce((select -sum(delta) from public.gold_ledger where delta < 0 and created_at > now() - interval '30 days'), 0),
    'holders', (select count(*) from public.player_perks where gold > 0),
    'sales', coalesce((select jsonb_object_agg(drop_id, jsonb_build_object('count', n, 'gold', g)) from (
       select drop_id, count(*) as n, sum(price_gold) as g from public.drop_purchases where drop_id is not null group by drop_id) s), '{}'::jsonb)
  );
end; $$;
revoke execute on function public.admin_drops_summary() from public, anon;
grant execute on function public.admin_drops_summary() to authenticated;

insert into public.app_public_config (key, value) values ('vip_monthly_gold', '150') on conflict (key) do nothing;
