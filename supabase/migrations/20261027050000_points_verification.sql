-- Points anti-cheat. The game earns points on the device, so a player could edit their save.
-- The server now keeps its own verified count: every time a save syncs, the increase in
-- career.pointsEarned is credited only up to what's humanly possible since the last sync.
-- Anything above that is held back and the account is flagged for an admin to review.
-- Spending (rewards, raffles) uses the verified count, never the raw number from the device.

alter table public.saves
  add column points_verified int not null default 0,     -- credited points (lifetime)
  add column points_seen int not null default 0,         -- last raw value seen from the device
  add column points_checked_at timestamptz,              -- last time points were credited
  add column points_withheld int not null default 0,     -- lifetime points held back
  add column points_adjust int not null default 0,       -- admin correction (+/-)
  add column flagged_at timestamptz,
  add column flag_reason text;

-- Allowance: 500 points/hour of real time plus a 1,500 burst (a level-up, quests and a hot streak),
-- at most 6,000 a day. A strong honest player earns roughly 300-450 an hour.
create or replace function public.points_allowance(p_since timestamptz) returns int
language sql stable as $$
  select least(6000, 1500 + floor(greatest(0, extract(epoch from (now() - coalesce(p_since, now()))) / 3600.0) * 500)::int);
$$;

create or replace function public.verify_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_raw int := greatest(0, coalesce((new.career->>'pointsEarned')::int, 0));
  v_prev_seen int;
  v_delta int;
  v_allow int;
  v_credit int;
begin
  if tg_op = 'INSERT' then
    -- First upload (e.g. a guest signing up): credit up to one burst; the rest waits for review.
    v_allow := 1500;
    new.points_verified := least(v_raw, v_allow);
    new.points_withheld := v_raw - new.points_verified;
    new.points_seen := v_raw;
    new.points_checked_at := now();
    new.points_adjust := 0;
    if new.points_withheld > 0 then
      new.flagged_at := now();
      new.flag_reason := format('First sync claimed %s points; credited %s.', v_raw, new.points_verified);
    else
      new.flagged_at := null; new.flag_reason := null;
    end if;
    return new;
  end if;

  -- Admin corrections (admin_resolve_flag) set this transaction flag and pass straight through.
  if current_setting('tourstar.admin_write', true) = 'on' then return new; end if;

  -- Players can't write these columns; always carry the server's values forward.
  new.points_verified := old.points_verified;
  new.points_withheld := old.points_withheld;
  new.points_adjust := old.points_adjust;
  new.flagged_at := old.flagged_at;
  new.flag_reason := old.flag_reason;
  new.points_checked_at := old.points_checked_at;
  v_prev_seen := old.points_seen;

  if new.career is distinct from old.career and coalesce(new.career->>'id', '') <> coalesce(old.career->>'id', '') then
    -- A new career (retired / reset / chose the other save): start counting from its current value,
    -- crediting it as a first upload would.
    v_prev_seen := 0;
  end if;

  v_delta := v_raw - v_prev_seen;
  if v_delta > 0 then
    v_allow := public.points_allowance(old.points_checked_at);
    v_credit := least(v_delta, v_allow);
    new.points_verified := old.points_verified + v_credit;
    new.points_checked_at := now();
    if v_delta > v_allow then
      new.points_withheld := old.points_withheld + (v_delta - v_allow);
      new.flagged_at := now();
      new.flag_reason := format('Gained %s points since %s; credited %s.', v_delta,
                                to_char(old.points_checked_at at time zone 'utc', 'Mon DD HH24:MI "UTC"'), v_credit);
    end if;
  end if;
  new.points_seen := v_raw;
  return new;
end; $$;

-- Existing saves: credit what they have today (pre-launch testers).
update public.saves set points_verified = greatest(0, coalesce((career->>'pointsEarned')::int, 0)),
  points_seen = greatest(0, coalesce((career->>'pointsEarned')::int, 0)), points_checked_at = now();

create trigger saves_verify_points before insert or update on public.saves
for each row execute function public.verify_points();

-- Players may only write their game data, never the verification columns.
revoke insert, update on public.saves from authenticated;
grant insert (user_id, career, settings, membership, client_updated_at) on public.saves to authenticated;
grant update (user_id, career, settings, membership, client_updated_at) on public.saves to authenticated;

-- ---------------------------------------------------------------- spending now uses verified points
create or replace function public.points_available(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(0, coalesce((select points_verified + points_adjust from public.saves where user_id = p_user), 0) - public.points_spent(p_user));
$$;
revoke execute on function public.points_available(uuid) from public, anon, authenticated;

create or replace function public.my_points() returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_s public.saves;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select * into v_s from public.saves where user_id = v_uid;
  return json_build_object(
    'earned', coalesce(v_s.points_verified + v_s.points_adjust, 0),
    'spent', public.points_spent(v_uid),
    'balance', public.points_available(v_uid),
    'pending', coalesce(v_s.points_withheld, 0),
    'level', coalesce((v_s.career->>'peakLevel')::int, 1));
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
  v_balance := public.points_available(v_uid);
  if v_balance < v_item.cost_points then raise exception 'Not enough verified points.'; end if;
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
  else
    v_cost := v_r.ticket_cost * p_tickets;
    if public.points_available(v_uid) < v_cost then raise exception 'Not enough verified points.'; end if;
    insert into public.raffle_entries (raffle_id, user_id, tickets, source, cost_points) values (p_raffle, v_uid, p_tickets, 'points', v_cost);
  end if;
  return json_build_object('tickets', v_have + p_tickets, 'balance', public.points_available(v_uid));
end; $$;

-- ---------------------------------------------------------------- admin review
create or replace function public.admin_flagged_players()
returns table (user_id uuid, email text, artist_name text, raw_points int, verified int, withheld int, adjust int,
               spent int, flagged_at timestamptz, flag_reason text, gigs int, level int)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select s.user_id, u.email::text, s.artist_name, s.points_seen, s.points_verified, s.points_withheld, s.points_adjust,
           public.points_spent(s.user_id), s.flagged_at, s.flag_reason,
           coalesce((s.career->'totals'->>'gigs')::int, 0), coalesce((s.career->>'peakLevel')::int, 1)
    from public.saves s left join auth.users u on u.id = s.user_id
    where s.flagged_at is not null
    order by s.flagged_at desc limit 200;
end; $$;

-- Approve held-back points (credit them) or clear the flag without crediting.
create or replace function public.admin_resolve_flag(p_user uuid, p_credit_withheld boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  perform set_config('tourstar.admin_write', 'on', true);
  update public.saves set
    points_adjust = points_adjust + case when p_credit_withheld then points_withheld else 0 end,
    points_withheld = 0, flagged_at = null, flag_reason = null
  where user_id = p_user;
end; $$;

revoke execute on function public.admin_flagged_players(), public.admin_resolve_flag(uuid, boolean) from public, anon;
grant execute on function public.admin_flagged_players(), public.admin_resolve_flag(uuid, boolean) to authenticated;
