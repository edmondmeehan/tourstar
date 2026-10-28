create or replace function public.drops_validate_items() returns trigger
language plpgsql set search_path = '' as $$
declare it jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then raise exception 'Items must be a list.'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    if coalesce(it->>'type', '') not in ('stage', 'title', 'badge', 'cash', 'energy', 'gold', 'venue', 'skin', 'moves', 'perk', 'look') then
      raise exception 'Packs can only contain stages, app colors, dance moves, outfits, titles, badges, venues, perks, game cash, energy or Gold. Reward points and raffle entries can never be sold.';
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
create or replace function public.merch_unlocks_validate() returns trigger
language plpgsql set search_path = '' as $$
declare it jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then raise exception 'Items must be a list.'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    if coalesce(it->>'type', '') not in ('stage', 'title', 'badge', 'skin', 'moves', 'look') then
      raise exception 'Merch can unlock stages, titles, badges, app colors, dance moves or outfits only. Never points, raffle entries, Gold or cash.';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end; $$;
drop function if exists public.lb_week_scores(date);
create or replace function public.lb_week_scores(p_week date) returns table (user_id uuid, artist_name text, genre text, level int, badge text, score bigint, fame bigint, look jsonb)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.artist_name, s.career->>'genre', coalesce((s.career->>'peakLevel')::int, 1), s.career->'style'->>'badge',
    greatest(0, coalesce((select f2.fame_start from public.fame_snapshots f2 where f2.user_id = s.user_id and f2.week > p_week order by f2.week limit 1), s.fame) - f.fame_start) as score,
    s.fame, s.career->'look'
  from public.saves s
  join public.fame_snapshots f on f.user_id = s.user_id and f.week = p_week
  where s.artist_name is not null and s.flagged_at is null
    and not exists (select 1 from public.leaderboard_bans b where b.user_id = s.user_id);
$$;
revoke execute on function public.lb_week_scores(date) from public, anon, authenticated;
create or replace function public.leaderboard(p_board text default 'week', p_genre text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with params as (
    select public.lb_week() as wk,
      coalesce((select nullif(value, '')::bigint from public.app_public_config where key = 'lb_week_cap'), 5000000) as cap,
      (select auth.uid()) as me
  ),
  pool as (
    select s.user_id, s.artist_name, s.career->>'genre' as genre, coalesce((s.career->>'peakLevel')::int, 1) as level,
      s.career->'style'->>'badge' as badge, s.fame as score, s.career->'look' as look
    from public.saves s
    where p_board = 'all' and s.artist_name is not null and s.fame > 0 and s.flagged_at is null
      and not exists (select 1 from public.leaderboard_bans b where b.user_id = s.user_id)
      and (p_genre is null or s.career->>'genre' = p_genre)
    union all
    select w.user_id, w.artist_name, w.genre, w.level, w.badge, w.score, w.look
    from params, public.lb_week_scores(params.wk) w
    where coalesce(p_board, 'week') <> 'all' and w.score > 0 and w.score <= params.cap and (p_genre is null or w.genre = p_genre)
  ),
  ranked as (
    select pool.*, rank() over (order by score desc) as rnk, count(*) over () as total from pool
  )
  select jsonb_build_object(
    'board', coalesce(p_board, 'week'),
    'week', (select wk from params),
    'resets_at', ((select wk from params) + 7)::timestamp at time zone 'UTC',
    'total', coalesce((select max(total) from ranked), 0),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', rnk, 'name', artist_name, 'genre', genre, 'level', level, 'badge', badge, 'look', look, 'score', score, 'me', user_id = (select me from params)) order by rnk, artist_name)
      from (select * from ranked order by rnk, artist_name limit 50) t), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rnk, 'score', score, 'pct', greatest(1, ceil(100.0 * rnk / total))) from ranked where user_id = (select me from params) limit 1),
    'last_week', coalesce((select jsonb_agg(jsonb_build_object('rank', a.rank, 'name', a.artist_name, 'score', a.score) order by a.rank)
      from public.leaderboard_awards a where a.week = (select wk from params) - 7 and a.rank <= 3), '[]'::jsonb)
  );
$$;
revoke execute on function public.leaderboard(text, text) from public;
grant execute on function public.leaderboard(text, text) to anon, authenticated;
