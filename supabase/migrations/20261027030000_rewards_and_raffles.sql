-- Rewards store (real goods for points) and raffles.
-- Points are EARNED in the game only; they can never be bought with money. Earnings come from the
-- player's cloud save (career.pointsEarned); all spending is recorded here, so a balance can't be
-- spent twice across devices. Every redemption is reviewed by an admin before anything ships.

-- ---------------------------------------------------------------- reward items
create table public.reward_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 600),
  emoji text not null default '🎁',
  image_url text check (image_url is null or image_url ~ '^https://'),
  category text not null default 'Merch',
  cost_points int not null check (cost_points >= 0),
  min_level int not null default 1 check (min_level between 1 and 7),
  stock int check (stock >= 0),                       -- null = unlimited
  per_user_limit int check (per_user_limit >= 1),     -- null = no limit
  needs_shipping boolean not null default true,
  options text[] not null default '{}',               -- e.g. sizes; player must pick one if present
  active boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reward_items enable row level security;
create policy "Players see live rewards" on public.reward_items for select to anon, authenticated using (active);
create policy "Admins manage rewards" on public.reward_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger reward_items_touch before update on public.reward_items for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- redemptions
create table public.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid references public.reward_items(id) on delete set null,
  item_name text not null,
  cost_points int not null,
  option text,
  level_at int not null,
  ship_name text,
  ship_address text,
  ship_email text,
  ship_phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'shipped', 'fulfilled', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reward_redemptions_user on public.reward_redemptions (user_id);
create index reward_redemptions_status on public.reward_redemptions (status, created_at desc);
alter table public.reward_redemptions enable row level security;
create policy "Players see their redemptions" on public.reward_redemptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Admins see redemptions" on public.reward_redemptions for select to authenticated using (public.is_admin());
create policy "Admins update redemptions" on public.reward_redemptions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger reward_redemptions_touch before update on public.reward_redemptions for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- raffles
create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  prize text not null check (char_length(prize) between 1 and 200),
  description text not null default '' check (char_length(description) <= 1000),
  emoji text not null default '🎟️',
  image_url text check (image_url is null or image_url ~ '^https://'),
  prize_value_usd int check (prize_value_usd >= 0),
  ticket_cost int not null check (ticket_cost >= 1),
  min_level int not null default 1 check (min_level between 1 and 7),
  max_tickets_per_user int check (max_tickets_per_user >= 1),
  free_daily_entry boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'drawn')),
  rules text not null default '',
  winner_user_id uuid references auth.users(id) on delete set null,
  winner_name text,
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
alter table public.raffles enable row level security;
create policy "Players see published raffles" on public.raffles for select to anon, authenticated using (status <> 'draft');
create policy "Admins manage raffles" on public.raffles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger raffles_touch before update on public.raffles for each row execute function public.touch_updated_at();

create table public.raffle_entries (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tickets int not null check (tickets > 0),
  source text not null check (source in ('points', 'free')),
  cost_points int not null default 0,
  entry_day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now()
);
create index raffle_entries_raffle on public.raffle_entries (raffle_id);
create index raffle_entries_user on public.raffle_entries (user_id);
create unique index raffle_entries_one_free_per_day on public.raffle_entries (raffle_id, user_id, entry_day) where source = 'free';
alter table public.raffle_entries enable row level security;
create policy "Players see their entries" on public.raffle_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Admins see entries" on public.raffle_entries for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- points
create or replace function public.points_spent(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(cost_points) from public.reward_redemptions where user_id = p_user and status <> 'rejected'), 0)::int
       + coalesce((select sum(cost_points) from public.raffle_entries where user_id = p_user), 0)::int;
$$;

create or replace function public.my_points() returns json
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_career jsonb;
  v_earned int;
  v_spent int;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select career into v_career from public.saves where user_id = v_uid;
  v_earned := coalesce((v_career->>'pointsEarned')::int, 0);
  v_spent := public.points_spent(v_uid);
  return json_build_object('earned', v_earned, 'spent', v_spent, 'balance', greatest(0, v_earned - v_spent),
                           'level', coalesce((v_career->>'peakLevel')::int, 1));
end; $$;

create or replace function public.redeem_reward(p_item uuid, p_option text, p_name text, p_address text, p_email text, p_phone text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_item public.reward_items;
  v_career jsonb;
  v_level int;
  v_balance int;
  v_count int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to redeem rewards.'; end if;
  perform pg_advisory_xact_lock(hashtext('points:' || v_uid::text));
  select * into v_item from public.reward_items where id = p_item for update;
  if not found or not v_item.active then raise exception 'That reward isn''t available.'; end if;
  select career into v_career from public.saves where user_id = v_uid;
  if v_career is null then raise exception 'Your career hasn''t synced yet. Try again in a moment.'; end if;
  v_level := coalesce((v_career->>'peakLevel')::int, 1);
  if v_level < v_item.min_level then raise exception 'Reach level % to unlock this reward.', v_item.min_level; end if;
  if v_item.stock is not null and v_item.stock < 1 then raise exception 'Sold out.'; end if;
  if v_item.per_user_limit is not null then
    select count(*) into v_count from public.reward_redemptions where user_id = v_uid and item_id = p_item and status <> 'rejected';
    if v_count >= v_item.per_user_limit then raise exception 'You''ve already redeemed the limit for this reward.'; end if;
  end if;
  if array_length(v_item.options, 1) > 0 and (p_option is null or not (p_option = any (v_item.options))) then
    raise exception 'Pick an option.';
  end if;
  if v_item.needs_shipping and (coalesce(trim(p_name), '') = '' or coalesce(trim(p_address), '') = '' or coalesce(trim(p_email), '') = '') then
    raise exception 'Add your name, shipping address and email.';
  end if;
  v_balance := coalesce((v_career->>'pointsEarned')::int, 0) - public.points_spent(v_uid);
  if v_balance < v_item.cost_points then raise exception 'Not enough points.'; end if;

  insert into public.reward_redemptions (user_id, item_id, item_name, cost_points, option, level_at, ship_name, ship_address, ship_email, ship_phone)
  values (v_uid, v_item.id, v_item.name, v_item.cost_points, nullif(p_option, ''), v_level,
          left(trim(p_name), 120), left(trim(p_address), 500), left(trim(p_email), 200), left(trim(p_phone), 40))
  returning id into v_id;
  if v_item.stock is not null then update public.reward_items set stock = stock - 1 where id = v_item.id; end if;
  return json_build_object('id', v_id, 'balance', v_balance - v_item.cost_points);
end; $$;

create or replace function public.enter_raffle(p_raffle uuid, p_tickets int, p_free boolean)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_r public.raffles;
  v_career jsonb;
  v_level int;
  v_have int;
  v_cost int;
  v_balance int;
begin
  if v_uid is null then raise exception 'Sign in to enter.'; end if;
  perform pg_advisory_xact_lock(hashtext('points:' || v_uid::text));
  select * into v_r from public.raffles where id = p_raffle;
  if not found or v_r.status <> 'open' or now() < v_r.starts_at or now() >= v_r.ends_at then raise exception 'This raffle isn''t open.'; end if;
  select career into v_career from public.saves where user_id = v_uid;
  if v_career is null then raise exception 'Your career hasn''t synced yet. Try again in a moment.'; end if;
  v_level := coalesce((v_career->>'peakLevel')::int, 1);
  if v_level < v_r.min_level then raise exception 'Reach level % to enter.', v_r.min_level; end if;
  if p_free then p_tickets := 1; end if;
  if p_tickets is null or p_tickets < 1 or p_tickets > 100 then raise exception 'Pick 1 to 100 tickets.'; end if;
  select coalesce(sum(tickets), 0) into v_have from public.raffle_entries where raffle_id = p_raffle and user_id = v_uid;
  if v_r.max_tickets_per_user is not null and v_have + p_tickets > v_r.max_tickets_per_user then
    raise exception 'You can hold up to % tickets for this raffle.', v_r.max_tickets_per_user;
  end if;

  if p_free then
    if not v_r.free_daily_entry then raise exception 'This raffle has no free entry.'; end if;
    begin
      insert into public.raffle_entries (raffle_id, user_id, tickets, source) values (p_raffle, v_uid, 1, 'free');
    exception when unique_violation then
      raise exception 'You''ve used today''s free entry. Come back tomorrow.';
    end;
    v_cost := 0;
  else
    v_cost := v_r.ticket_cost * p_tickets;
    v_balance := coalesce((v_career->>'pointsEarned')::int, 0) - public.points_spent(v_uid);
    if v_balance < v_cost then raise exception 'Not enough points.'; end if;
    insert into public.raffle_entries (raffle_id, user_id, tickets, source, cost_points) values (p_raffle, v_uid, p_tickets, 'points', v_cost);
  end if;
  return json_build_object('tickets', v_have + p_tickets,
                           'balance', greatest(0, coalesce((v_career->>'pointsEarned')::int, 0) - public.points_spent(v_uid)));
end; $$;

-- ---------------------------------------------------------------- admin
create or replace function public.admin_redemptions(p_status text default null)
returns table (id uuid, created_at timestamptz, status text, item_name text, option text, cost_points int, level_at int,
               email text, artist_name text, ship_name text, ship_address text, ship_email text, ship_phone text, admin_note text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select r.id, r.created_at, r.status, r.item_name, r.option, r.cost_points, r.level_at,
           u.email::text, s.artist_name, r.ship_name, r.ship_address, r.ship_email, r.ship_phone, r.admin_note
    from public.reward_redemptions r
    left join auth.users u on u.id = r.user_id
    left join public.saves s on s.user_id = r.user_id
    where p_status is null or r.status = p_status
    order by r.created_at desc
    limit 500;
end; $$;

create or replace function public.admin_raffle_summary()
returns table (raffle_id uuid, entrants bigint, tickets bigint, free_tickets bigint, points_spent bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select e.raffle_id, count(distinct e.user_id), sum(e.tickets), sum(e.tickets) filter (where e.source = 'free'), sum(e.cost_points)
    from public.raffle_entries e group by e.raffle_id;
end; $$;

-- Weighted draw: each ticket is one chance. Returns the winner's contact details for the admin.
create or replace function public.admin_draw_raffle(p_raffle uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_r public.raffles;
  v_total bigint;
  v_pick bigint;
  v_user uuid;
  v_email text;
  v_artist text;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into v_r from public.raffles where id = p_raffle for update;
  if not found then raise exception 'Raffle not found.'; end if;
  if v_r.status = 'drawn' then raise exception 'A winner was already drawn.'; end if;
  if now() < v_r.ends_at then raise exception 'This raffle is still running. Close it or wait until it ends.'; end if;
  select coalesce(sum(tickets), 0) into v_total from public.raffle_entries where raffle_id = p_raffle;
  if v_total = 0 then raise exception 'No entries yet.'; end if;
  v_pick := 1 + floor(random() * v_total)::bigint;
  select user_id into v_user from (
    select user_id, sum(tickets) over (order by created_at, id) as cum from public.raffle_entries where raffle_id = p_raffle
  ) x where cum >= v_pick order by cum limit 1;
  select u.email::text, s.artist_name into v_email, v_artist from auth.users u left join public.saves s on s.user_id = u.id where u.id = v_user;
  update public.raffles set status = 'drawn', winner_user_id = v_user, winner_name = coalesce(v_artist, 'Player'), drawn_at = now() where id = p_raffle;
  return json_build_object('email', v_email, 'artist', v_artist, 'tickets_total', v_total);
end; $$;

revoke execute on function public.points_spent(uuid), public.my_points(), public.redeem_reward(uuid, text, text, text, text, text),
  public.enter_raffle(uuid, int, boolean), public.admin_redemptions(text), public.admin_raffle_summary(), public.admin_draw_raffle(uuid) from public, anon;
revoke execute on function public.points_spent(uuid) from authenticated;
grant execute on function public.my_points(), public.redeem_reward(uuid, text, text, text, text, text),
  public.enter_raffle(uuid, int, boolean), public.admin_redemptions(text), public.admin_raffle_summary(), public.admin_draw_raffle(uuid) to authenticated;
