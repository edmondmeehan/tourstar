-- Engagement pack: usage + crash tracking, weekly leagues, friends and festival bill, tour events,
-- and the Hall of Fame. Safe to run more than once.

-- ============================================================ usage + crash tracking
create table if not exists public.client_events (
  id bigint generated always as identity primary key,
  device text not null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index if not exists client_events_at on public.client_events (at);
create index if not exists client_events_name_at on public.client_events (name, at);
create index if not exists client_events_device_at on public.client_events (device, at);
alter table public.client_events enable row level security;
drop policy if exists "Admins read client events" on public.client_events;
create policy "Admins read client events" on public.client_events for select to authenticated using (public.is_admin());

-- The app sends small batches: [{ name, props, ago }] where ago = seconds since it happened.
create or replace function public.track_events(p_device text, p_events jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare v int;
begin
  if coalesce(p_device, '') !~ '^[A-Za-z0-9_-]{8,64}$' or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  if (select count(*) from public.client_events where device = p_device and at > now() - interval '1 minute') > 300 then return 0; end if;
  insert into public.client_events (device, user_id, name, props, at)
  select p_device, auth.uid(), e->>'name',
    case when jsonb_typeof(e->'props') = 'object' and pg_column_size(e->'props') < 2000 then e->'props' else '{}'::jsonb end,
    now() - make_interval(secs => case when coalesce(e->>'ago', '') ~ '^[0-9]{1,6}$' then least(172800, (e->>'ago')::int) else 0 end)
  from (select e from jsonb_array_elements(p_events) e limit 50) t
  where coalesce(e->>'name', '') ~ '^[a-z0-9_]{1,40}$';
  get diagnostics v = row_count;
  return v;
end; $$;
revoke execute on function public.track_events(text, jsonb) from public;
grant execute on function public.track_events(text, jsonb) to anon, authenticated;

create or replace function public.admin_engagement(p_days int default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_days int := greatest(1, least(coalesce(p_days, 14), 60));
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return (
    with firsts as (
      select device, min(at) as first_at from public.client_events group by device
    ), cohort as (
      select device, first_at from firsts where first_at > now() - make_interval(days => v_days)
    ), has as (
      select c.device,
        bool_or(e.name = 'career_created') as created,
        max(case when e.name = 'tutorial' then coalesce((e.props->>'step')::int, 0) end) as tut,
        bool_or(e.name = 'tutorial_done') as tut_done,
        bool_or(e.name = 'tutorial_skip') as tut_skip,
        bool_or(e.name = 'show_done') as show1,
        count(*) filter (where e.name = 'show_done') >= 3 as show3,
        bool_or(e.name = 'release_done') as released,
        bool_or(e.name = 'signed_in') as signed_in,
        bool_or(e.at::date = c.first_at::date + 1) as d1,
        bool_or(e.at::date between c.first_at::date + 6 and c.first_at::date + 8) as d7
      from cohort c join public.client_events e on e.device = c.device
      group by c.device
    )
    select jsonb_build_object(
      'days', v_days,
      'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'active', a, 'new', n, 'shows', s, 'errors', er) order by d) from (
        select g.d::date as d,
          (select count(distinct device) from public.client_events where at >= g.d and at < g.d + interval '1 day') as a,
          (select count(*) from firsts where first_at >= g.d and first_at < g.d + interval '1 day') as n,
          (select count(*) from public.client_events where name = 'show_done' and at >= g.d and at < g.d + interval '1 day') as s,
          (select count(*) from public.client_events where name = 'error' and at >= g.d and at < g.d + interval '1 day') as er
        from generate_series(date_trunc('day', now()) - make_interval(days => v_days - 1), date_trunc('day', now()), interval '1 day') g(d)) x), '[]'::jsonb),
      'funnel', jsonb_build_object(
        'opened', (select count(*) from has),
        'created', (select count(*) from has where created),
        'tutorial_show', (select count(*) from has where tut >= 3 or tut_done),
        'first_show', (select count(*) from has where show1),
        'release', (select count(*) from has where released),
        'tutorial_done', (select count(*) from has where tut_done),
        'tutorial_skip', (select count(*) from has where tut_skip),
        'three_shows', (select count(*) from has where show3),
        'signed_in', (select count(*) from has where signed_in)
      ),
      'retention', jsonb_build_object(
        'd1_base', (select count(*) from has h join cohort c using (device) where c.first_at < date_trunc('day', now()) - interval '1 day'),
        'd1', (select count(*) from has h join cohort c using (device) where c.first_at < date_trunc('day', now()) - interval '1 day' and h.d1),
        'd7_base', (select count(*) from has h join cohort c using (device) where c.first_at < date_trunc('day', now()) - interval '8 days'),
        'd7', (select count(*) from has h join cohort c using (device) where c.first_at < date_trunc('day', now()) - interval '8 days' and h.d7)
      ),
      'tutorial_steps', coalesce((select jsonb_object_agg(step, n) from (
        select (props->>'step') as step, count(distinct device) as n from public.client_events
        where name = 'tutorial' and device in (select device from cohort) group by 1) t), '{}'::jsonb),
      'errors', coalesce((select jsonb_agg(x order by (x->>'count')::int desc) from (
        select jsonb_build_object('msg', left(coalesce(props->>'msg', '?'), 200), 'where', max(props->>'where'), 'count', count(*), 'devices', count(distinct device),
          'version', max(props->>'v'), 'last', max(at)) as x
        from public.client_events where name = 'error' and at > now() - interval '7 days'
        group by left(coalesce(props->>'msg', '?'), 200) order by count(*) desc limit 25) t), '[]'::jsonb),
      'calibrated', (select jsonb_build_object('players', count(distinct device), 'avg_ms', round(avg((props->>'ms')::numeric)))
        from public.client_events where name = 'calibrated' and at > now() - interval '30 days' and props->>'ms' ~ '^-?[0-9]{1,4}$')
    )
  );
end; $$;
revoke execute on function public.admin_engagement(int) from public, anon;
grant execute on function public.admin_engagement(int) to authenticated;

-- ============================================================ weekly gigs (for the festival bill)
alter table public.fame_snapshots add column if not exists gigs_start int not null default 0;

create or replace function public.saves_fame_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fame_snapshots (user_id, week, fame_start, gigs_start)
  values (new.user_id, public.lb_week(),
    case when tg_op = 'UPDATE' then coalesce(old.fame, 0) else coalesce(new.fame, 0) end,
    case when tg_op = 'UPDATE' then coalesce((old.career->'totals'->>'gigs')::int, 0) else coalesce((new.career->'totals'->>'gigs')::int, 0) end)
  on conflict (user_id, week) do nothing;
  return null;
end; $$;

-- Fame gained and shows played this week for one player (0 if they haven't synced this week).
create or replace function public.week_progress(p_user uuid, p_week date default null)
returns table (score bigint, gigs int)
language sql stable security definer set search_path = '' as $$
  select
    least(coalesce((select nullif(value, '')::bigint from public.app_public_config where key = 'lb_week_cap'), 5000000),
      greatest(0, coalesce((select f2.fame_start from public.fame_snapshots f2 where f2.user_id = p_user and f2.week > f.week order by f2.week limit 1), s.fame) - f.fame_start)),
    greatest(0, coalesce((select f2.gigs_start from public.fame_snapshots f2 where f2.user_id = p_user and f2.week > f.week order by f2.week limit 1), coalesce((s.career->'totals'->>'gigs')::int, 0)) - f.gigs_start)
  from public.saves s
  join public.fame_snapshots f on f.user_id = s.user_id and f.week = coalesce(p_week, public.lb_week())
  where s.user_id = p_user and s.flagged_at is null;
$$;
revoke execute on function public.week_progress(uuid, date) from public, anon, authenticated;

-- ============================================================ weekly leagues
-- Six divisions. Every Monday each league's top players move up and the bottom players move down.
insert into public.app_public_config (key, value) values
  ('league_rewards_enabled', 'true'),
  ('league_size', '30'),
  ('league_gold_per_tier', '20')
on conflict (key) do nothing;

create table if not exists public.league_members (
  week date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier int not null check (tier between 1 and 6),
  grp int not null,
  last_rank int,
  notified_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (week, user_id)
);
create index if not exists league_members_group on public.league_members (week, tier, grp);
alter table public.league_members enable row level security;
drop policy if exists "Admins read league members" on public.league_members;
create policy "Admins read league members" on public.league_members for select to authenticated using (public.is_admin());

create table if not exists public.league_results (
  week date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier int not null,
  rank int not null,
  size int not null,
  score bigint not null,
  next_tier int not null,
  gold int not null default 0,
  seen boolean not null default false,
  primary key (week, user_id)
);
alter table public.league_results enable row level security;
drop policy if exists "Players read their league results" on public.league_results;
create policy "Players read their league results" on public.league_results for select to authenticated using ((select auth.uid()) = user_id or public.is_admin());

create table if not exists public.league_weeks (week date primary key, settled_at timestamptz not null default now());
alter table public.league_weeks enable row level security;

-- How many move up/down in a league of n players.
create or replace function public.league_moves(n int) returns int
language sql immutable set search_path = '' as $$ select case when n < 4 then 0 when n < 10 then 1 else greatest(1, round(n * 0.2)::int) end; $$;

-- Ranked members of one league this week.
create or replace function public.league_table(p_week date, p_tier int, p_grp int)
returns table (user_id uuid, artist_name text, level int, badge text, look jsonb, score bigint, fame bigint, rnk int, size int)
language sql stable security definer set search_path = '' as $$
  with m as (
    select lm.user_id, s.artist_name, coalesce((s.career->>'peakLevel')::int, 1) as level, s.career->'style'->>'badge' as badge, s.career->'look' as look,
      coalesce((select w.score from public.week_progress(lm.user_id, p_week) w), 0) as score, coalesce(s.fame, 0) as fame, lm.joined_at
    from public.league_members lm
    left join public.saves s on s.user_id = lm.user_id
    where lm.week = p_week and lm.tier = p_tier and lm.grp = p_grp
  )
  select m.user_id, coalesce(m.artist_name, 'Unknown artist'), m.level, m.badge, m.look, m.score, m.fame,
    (row_number() over (order by m.score desc, m.joined_at))::int, (count(*) over ())::int
  from m;
$$;
revoke execute on function public.league_table(date, int, int) from public, anon, authenticated;

-- Your league this week (joins you on first call). p_ack marks last week's result as seen.
create or replace function public.my_league(p_ack boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_wk date := public.lb_week();
  v_size int := coalesce((select nullif(value, '')::int from public.app_public_config where key = 'league_size'), 30);
  v_tier int;
  v_grp int;
  v_moves int;
  v_n int;
  v_res jsonb;
begin
  if v_me is null then return jsonb_build_object('joined', false, 'reason', 'signin'); end if;
  if not exists (select 1 from public.saves where user_id = v_me and artist_name is not null) then
    return jsonb_build_object('joined', false, 'reason', 'save');
  end if;
  select tier, grp into v_tier, v_grp from public.league_members where week = v_wk and user_id = v_me;
  if v_tier is null then
    v_tier := coalesce((select next_tier from public.league_results where user_id = v_me order by week desc limit 1), 1);
    perform pg_advisory_xact_lock(hashtext('league:' || v_wk || ':' || v_tier));
    select grp into v_grp from public.league_members where week = v_wk and tier = v_tier
      group by grp having count(*) < v_size order by grp limit 1;
    if v_grp is null then
      v_grp := coalesce((select max(grp) from public.league_members where week = v_wk and tier = v_tier), 0) + 1;
    end if;
    insert into public.league_members (week, user_id, tier, grp) values (v_wk, v_me, v_tier, v_grp) on conflict do nothing;
  end if;
  select count(*) into v_n from public.league_members where week = v_wk and tier = v_tier and grp = v_grp;
  v_moves := public.league_moves(v_n);
  select jsonb_build_object('week', r.week, 'tier', r.tier, 'rank', r.rank, 'size', r.size, 'next_tier', r.next_tier, 'gold', r.gold)
    into v_res from public.league_results r where r.user_id = v_me and not r.seen order by r.week desc limit 1;
  if p_ack then update public.league_results set seen = true where user_id = v_me and not seen; end if;
  return jsonb_build_object(
    'joined', true, 'week', v_wk, 'tier', v_tier, 'size', v_n,
    'up', case when v_tier < 6 then v_moves else 0 end,
    'down', case when v_tier > 1 then v_moves else 0 end,
    'resets_at', (v_wk + 7)::timestamp at time zone 'UTC',
    'gold_on', coalesce((select value from public.app_public_config where key = 'league_rewards_enabled'), 'true') = 'true',
    'gold_per_tier', coalesce((select nullif(value, '')::int from public.app_public_config where key = 'league_gold_per_tier'), 20),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', t.rnk, 'name', t.artist_name, 'level', t.level, 'badge', t.badge, 'look', t.look, 'score', t.score, 'me', t.user_id = v_me) order by t.rnk)
      from public.league_table(v_wk, v_tier, v_grp) t), '[]'::jsonb),
    'result', v_res
  );
end; $$;
revoke execute on function public.my_league(boolean) from public, anon;
grant execute on function public.my_league(boolean) to authenticated;

-- Close finished weeks: record ranks, move players up/down, pay Gold to each league's top 3.
create or replace function public.league_settle() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_cur date := public.lb_week();
  v_week date;
  v_on boolean := coalesce((select value from public.app_public_config where key = 'league_rewards_enabled'), 'true') = 'true';
  v_per int := coalesce((select nullif(value, '')::int from public.app_public_config where key = 'league_gold_per_tier'), 20);
  v_done int := 0;
  g record;
  r record;
  v_moves int;
  v_next int;
  v_gold int;
begin
  for v_week in select distinct week from public.league_members where week < v_cur and week >= v_cur - 35 order by week loop
    insert into public.league_weeks (week) values (v_week) on conflict do nothing;
    if not found then continue; end if;
    v_done := v_done + 1;
    for g in select tier, grp from public.league_members where week = v_week group by tier, grp loop
      for r in select * from public.league_table(v_week, g.tier, g.grp) loop
        v_moves := public.league_moves(r.size);
        v_next := g.tier;
        if g.tier < 6 and r.rnk <= v_moves and r.score > 0 then v_next := g.tier + 1;
        elsif g.tier > 1 and (r.rnk > r.size - v_moves or r.score = 0) then v_next := g.tier - 1;
        end if;
        v_gold := case when not v_on or r.score = 0 then 0 when r.rnk = 1 then v_per * g.tier * 3 when r.rnk = 2 then v_per * g.tier * 2 when r.rnk = 3 then v_per * g.tier else 0 end;
        insert into public.league_results (week, user_id, tier, rank, size, score, next_tier, gold)
        values (v_week, r.user_id, g.tier, r.rnk, r.size, r.score, v_next, v_gold) on conflict do nothing;
        if found and v_gold > 0 then
          perform public.gold_add(r.user_id, v_gold, 'League #' || r.rnk || ' · week of ' || to_char(v_week, 'Mon FMDD'), 'league:' || v_week || ':' || r.user_id);
        end if;
      end loop;
    end loop;
  end loop;
  return v_done;
end; $$;
revoke execute on function public.league_settle() from public;
grant execute on function public.league_settle() to anon, authenticated;

-- Hourly (server only): players who just dropped out of their league's promotion spots, and who passed them.
create or replace function public.league_overtakes() returns table (user_id uuid, by_name text, rank int, up int, hours_left int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_wk date := public.lb_week();
  g record;
  r record;
  v_up int;
  v_prev int;
  v_by text;
begin
  for g in select tier, grp from public.league_members where week = v_wk and tier < 6 group by tier, grp loop
    for r in select * from public.league_table(v_wk, g.tier, g.grp) loop
      v_up := public.league_moves(r.size);
      select lm.last_rank into v_prev from public.league_members lm where lm.week = v_wk and lm.user_id = r.user_id;
      if v_up > 0 and v_prev is not null and v_prev <= v_up and r.rnk > v_up and r.score > 0
        and not exists (select 1 from public.league_members lm where lm.week = v_wk and lm.user_id = r.user_id and lm.notified_at > now() - interval '12 hours') then
        select t.artist_name into v_by from public.league_table(v_wk, g.tier, g.grp) t where t.rnk = v_up;
        user_id := r.user_id; by_name := coalesce(v_by, 'Someone'); rank := r.rnk; up := v_up;
        hours_left := greatest(0, floor(extract(epoch from ((v_wk + 7)::timestamp at time zone 'UTC' - now())) / 3600))::int;
        update public.league_members lm set notified_at = now() where lm.week = v_wk and lm.user_id = r.user_id;
        return next;
      end if;
      update public.league_members lm set last_rank = r.rnk where lm.week = v_wk and lm.user_id = r.user_id;
    end loop;
  end loop;
end; $$;
revoke execute on function public.league_overtakes() from public, anon, authenticated;
grant execute on function public.league_overtakes() to service_role;

create or replace function public.admin_leagues() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_wk date := public.lb_week();
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'week', v_wk,
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('tier', tier, 'players', n, 'leagues', g) order by tier) from (
      select tier, count(*) as n, count(distinct grp) as g from public.league_members where week = v_wk group by tier) t), '[]'::jsonb),
    'last', coalesce((select jsonb_agg(jsonb_build_object('week', week, 'players', n, 'up', up, 'down', down, 'gold', gold) order by week desc) from (
      select week, count(*) as n, count(*) filter (where next_tier > tier) as up, count(*) filter (where next_tier < tier) as down, sum(gold) as gold
      from public.league_results where week >= v_wk - 56 group by week) t), '[]'::jsonb)
  );
end; $$;
revoke execute on function public.admin_leagues() from public, anon;
grant execute on function public.admin_leagues() to authenticated;

-- ============================================================ friends and the festival bill
create table if not exists public.friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6}$')
);
alter table public.friend_codes enable row level security;

create table if not exists public.friends (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friends_friend on public.friends (friend_id);
alter table public.friends enable row level security;

create or replace function public.my_friend_code() returns text
language plpgsql security definer set search_path = '' as $$
declare v text; i int := 0;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select code into v from public.friend_codes where user_id = auth.uid();
  while v is null and i < 20 loop
    v := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6));
    begin
      insert into public.friend_codes (user_id, code) values (auth.uid(), v);
    exception when unique_violation then v := null; i := i + 1;
    end;
  end loop;
  return v;
end; $$;
revoke execute on function public.my_friend_code() from public, anon;
grant execute on function public.my_friend_code() to authenticated;

create or replace function public.add_friend(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_them uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select user_id into v_them from public.friend_codes where code = upper(trim(coalesce(p_code, '')));
  if v_them is null then raise exception 'No artist has that code. Check it and try again.'; end if;
  if v_them = auth.uid() then raise exception 'That''s your own code.'; end if;
  if (select count(*) from public.friends where user_id = auth.uid()) >= 50 then raise exception 'You can have up to 50 friends.'; end if;
  if (select count(*) from public.friends where user_id = v_them) >= 50 then raise exception 'That artist''s friend list is full.'; end if;
  insert into public.friends (user_id, friend_id) values (auth.uid(), v_them), (v_them, auth.uid()) on conflict do nothing;
  select artist_name into v_name from public.saves where user_id = v_them;
  return coalesce(v_name, 'your friend');
end; $$;
revoke execute on function public.add_friend(text) from public, anon;
grant execute on function public.add_friend(text) to authenticated;

create or replace function public.remove_friend(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_them uuid;
begin
  select user_id into v_them from public.friend_codes where code = upper(trim(coalesce(p_code, '')));
  delete from public.friends where (user_id = auth.uid() and friend_id = v_them) or (user_id = v_them and friend_id = auth.uid());
end; $$;
revoke execute on function public.remove_friend(text) from public, anon;
grant execute on function public.remove_friend(text) to authenticated;

insert into public.app_public_config (key, value) values ('festival_goals', '[10,25,50]') on conflict (key) do nothing;

-- Your friends this week, plus the festival bill: shows played this week by you and your friends together.
create or replace function public.my_friends() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('rows', '[]'::jsonb, 'code', null); end if;
  return (
    with f as (
      select fr.friend_id as id, fc.code, s.artist_name, s.career->>'genre' as genre, coalesce((s.career->>'peakLevel')::int, 1) as level,
        s.career->'style'->>'badge' as badge, s.career->'look' as look, coalesce(s.fame, 0) as fame, s.updated_at,
        coalesce((select w.score from public.week_progress(fr.friend_id) w), 0) as week_fame,
        coalesce((select w.gigs from public.week_progress(fr.friend_id) w), 0) as week_gigs
      from public.friends fr
      join public.friend_codes fc on fc.user_id = fr.friend_id
      left join public.saves s on s.user_id = fr.friend_id
      where fr.user_id = v_me
    )
    select jsonb_build_object(
      'code', (select code from public.friend_codes where user_id = v_me),
      'week', public.lb_week(),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', coalesce(artist_name, 'New artist'), 'genre', genre, 'level', level, 'badge', badge,
          'look', look, 'fame', fame, 'week_fame', week_fame, 'week_gigs', week_gigs, 'active_at', updated_at) order by week_fame desc, fame desc) from f), '[]'::jsonb),
      'bill', jsonb_build_object(
        'mine', coalesce((select w.gigs from public.week_progress(v_me) w), 0),
        'friends', coalesce((select sum(week_gigs) from f), 0),
        'goals', coalesce((select value::jsonb from public.app_public_config where key = 'festival_goals'), '[10,25,50]'::jsonb)
      )
    )
  );
end; $$;
revoke execute on function public.my_friends() from public, anon;
grant execute on function public.my_friends() to authenticated;

-- ============================================================ tour events
-- The event itself lives in app_public_config ('tour_event', JSON, set in Admin → Tour events).
-- Players earn the collectible on the device; the server checks the event is live and gives it once.
create table if not exists public.tour_event_claims (
  event_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.tour_event_claims enable row level security;
drop policy if exists "Admins read event claims" on public.tour_event_claims;
create policy "Admins read event claims" on public.tour_event_claims for select to authenticated using (public.is_admin());

create or replace function public.claim_tour_event(p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ev jsonb;
  v_items jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to keep event rewards.'; end if;
  select value::jsonb into ev from public.app_public_config where key = 'tour_event';
  if ev is null or ev->>'id' is distinct from p_id or coalesce((ev->>'enabled')::boolean, false) is not true then raise exception 'That event isn''t running.'; end if;
  if now() < (ev->>'starts')::timestamptz or now() > (ev->>'ends')::timestamptz + interval '3 days' then raise exception 'That event is over.'; end if;
  insert into public.tour_event_claims (event_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  v_items := coalesce(ev->'reward', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then v_items := jsonb_build_array(v_items); end if;
  v_items := (select coalesce(jsonb_agg(i), '[]'::jsonb) from jsonb_array_elements(v_items) i where i->>'type' in ('stage', 'title', 'badge', 'skin', 'moves', 'look'));
  if jsonb_array_length(v_items) > 0 then
    insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
    values (auth.uid(), null, left('Event: ' || coalesce(ev->>'name', 'Tour event'), 80), 0, v_items);
  end if;
  return jsonb_build_object('ok', true, 'already', false);
end; $$;
revoke execute on function public.claim_tour_event(text) from public, anon;
grant execute on function public.claim_tour_event(text) to authenticated;

-- ============================================================ Hall of Fame
create table if not exists public.hall_of_fame (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  artist_name text not null,
  genre text,
  fame bigint not null,
  weeks int not null default 0,
  gigs int not null default 0,
  look jsonb,
  retired_at timestamptz not null default now()
);
create index if not exists hall_of_fame_fame on public.hall_of_fame (fame desc);
alter table public.hall_of_fame enable row level security;

-- Called before a Legend retires on the device. Uses the synced save, never numbers from the app.
create or replace function public.enter_hall_of_fame() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if auth.uid() is null then raise exception 'Sign in to enter the Hall of Fame.'; end if;
  select * into s from public.saves where user_id = auth.uid();
  if s is null or s.artist_name is null then raise exception 'Sync your save first.'; end if;
  if coalesce((s.career->>'peakLevel')::int, 1) < 7 then raise exception 'Only Legends can retire to the Hall of Fame.'; end if;
  if s.flagged_at is not null then raise exception 'This save is under review. Contact support.'; end if;
  if exists (select 1 from public.hall_of_fame h where h.user_id = auth.uid() and h.artist_name = s.artist_name and h.retired_at > now() - interval '1 day') then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  insert into public.hall_of_fame (user_id, artist_name, genre, fame, weeks, gigs, look)
  values (auth.uid(), s.artist_name, s.career->>'genre', s.fame, coalesce((s.career->>'week')::int, 0), coalesce((s.career->'totals'->>'gigs')::int, 0), s.career->'look');
  return jsonb_build_object('ok', true, 'rank', (select count(*) from public.hall_of_fame where fame > s.fame) + 1);
end; $$;
revoke execute on function public.enter_hall_of_fame() from public, anon;
grant execute on function public.enter_hall_of_fame() to authenticated;

create or replace function public.hall_of_fame_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', artist_name, 'genre', genre, 'fame', fame, 'weeks', weeks, 'gigs', gigs, 'look', look,
    'retired_at', retired_at, 'me', user_id = (select auth.uid())) order by fame desc), '[]'::jsonb)
  from (select * from public.hall_of_fame order by fame desc limit 50) t;
$$;
revoke execute on function public.hall_of_fame_list() from public;
grant execute on function public.hall_of_fame_list() to anon, authenticated;

-- ============================================================ schedules
create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('tourstar-hourly') where exists (select 1 from cron.job where jobname = 'tourstar-hourly');
  perform cron.schedule('tourstar-hourly', '7 * * * *', $c$select net.http_post(
    url := 'https://vtpgrxavyspadmubfwtb.supabase.co/functions/v1/daily-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"source":"cron","job":"hourly"}'::jsonb, timeout_milliseconds := 60000)$c$);
  perform cron.unschedule('tourstar-events-prune') where exists (select 1 from cron.job where jobname = 'tourstar-events-prune');
  perform cron.schedule('tourstar-events-prune', '17 4 * * *', $c$delete from public.client_events where at < now() - interval '120 days'$c$);
end $$;
