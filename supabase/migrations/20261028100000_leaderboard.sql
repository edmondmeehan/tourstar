insert into public.app_public_config (key, value) values
  ('lb_rewards_enabled', 'true'),
  ('lb_gold_top1', '500'),
  ('lb_gold_top3', '250'),
  ('lb_gold_top10', '100'),
  ('lb_week_cap', '5000000')
on conflict (key) do nothing;

create or replace function public.lb_week(p_at timestamptz default now()) returns date
language sql stable set search_path = '' as $$
  select date_trunc('week', p_at at time zone 'UTC')::date;
$$;

create table if not exists public.fame_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  week date not null,
  fame_start bigint not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, week)
);
create index if not exists fame_snapshots_week on public.fame_snapshots (week);
alter table public.fame_snapshots enable row level security;
drop policy if exists "Admins read fame snapshots" on public.fame_snapshots;
create policy "Admins read fame snapshots" on public.fame_snapshots for select to authenticated using (public.is_admin());

create or replace function public.saves_fame_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fame_snapshots (user_id, week, fame_start)
  values (new.user_id, public.lb_week(), case when tg_op = 'UPDATE' then coalesce(old.fame, 0) else coalesce(new.fame, 0) end)
  on conflict (user_id, week) do nothing;
  return null;
end; $$;
drop trigger if exists saves_fame_snapshot on public.saves;
create trigger saves_fame_snapshot after insert or update on public.saves for each row execute function public.saves_fame_snapshot();

insert into public.fame_snapshots (user_id, week, fame_start)
select user_id, public.lb_week(), coalesce(fame, 0) from public.saves
on conflict (user_id, week) do nothing;

create table if not exists public.leaderboard_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now()
);
alter table public.leaderboard_bans enable row level security;
drop policy if exists "Admins manage leaderboard bans" on public.leaderboard_bans;
create policy "Admins manage leaderboard bans" on public.leaderboard_bans for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.leaderboard_weeks (
  week date primary key,
  settled_at timestamptz not null default now()
);
alter table public.leaderboard_weeks enable row level security;
drop policy if exists "Admins read leaderboard weeks" on public.leaderboard_weeks;
create policy "Admins read leaderboard weeks" on public.leaderboard_weeks for select to authenticated using (public.is_admin());

create table if not exists public.leaderboard_awards (
  week date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank int not null,
  score bigint not null,
  artist_name text not null default '',
  gold int not null default 0,
  created_at timestamptz not null default now(),
  primary key (week, user_id)
);
alter table public.leaderboard_awards enable row level security;
drop policy if exists "Admins read leaderboard awards" on public.leaderboard_awards;
create policy "Admins read leaderboard awards" on public.leaderboard_awards for select to authenticated using (public.is_admin());

drop function if exists public.lb_week_scores(date);
create or replace function public.lb_week_scores(p_week date) returns table (user_id uuid, artist_name text, genre text, level int, badge text, score bigint, fame bigint)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.artist_name, s.career->>'genre', coalesce((s.career->>'peakLevel')::int, 1), s.career->'style'->>'badge',
    greatest(0, coalesce((select f2.fame_start from public.fame_snapshots f2 where f2.user_id = s.user_id and f2.week > p_week order by f2.week limit 1), s.fame) - f.fame_start) as score,
    s.fame
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
      s.career->'style'->>'badge' as badge, s.fame as score
    from public.saves s
    where p_board = 'all' and s.artist_name is not null and s.fame > 0 and s.flagged_at is null
      and not exists (select 1 from public.leaderboard_bans b where b.user_id = s.user_id)
      and (p_genre is null or s.career->>'genre' = p_genre)
    union all
    select w.user_id, w.artist_name, w.genre, w.level, w.badge, w.score
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
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', rnk, 'name', artist_name, 'genre', genre, 'level', level, 'badge', badge, 'score', score, 'me', user_id = (select me from params)) order by rnk, artist_name)
      from (select * from ranked order by rnk, artist_name limit 50) t), '[]'::jsonb),
    'me', (select jsonb_build_object('rank', rnk, 'score', score, 'pct', greatest(1, ceil(100.0 * rnk / total))) from ranked where user_id = (select me from params) limit 1),
    'last_week', coalesce((select jsonb_agg(jsonb_build_object('rank', a.rank, 'name', a.artist_name, 'score', a.score) order by a.rank)
      from public.leaderboard_awards a where a.week = (select wk from params) - 7 and a.rank <= 3), '[]'::jsonb)
  );
$$;
revoke execute on function public.leaderboard(text, text) from public;
grant execute on function public.leaderboard(text, text) to anon, authenticated;

create or replace function public.leaderboard_settle() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_cur date := public.lb_week();
  v_week date;
  v_cap bigint := coalesce((select nullif(value, '')::bigint from public.app_public_config where key = 'lb_week_cap'), 5000000);
  v_on boolean := coalesce((select value from public.app_public_config where key = 'lb_rewards_enabled'), 'true') = 'true';
  v_g1 int := coalesce((select nullif(value, '')::int from public.app_public_config where key = 'lb_gold_top1'), 500);
  v_g3 int := coalesce((select nullif(value, '')::int from public.app_public_config where key = 'lb_gold_top3'), 250);
  v_g10 int := coalesce((select nullif(value, '')::int from public.app_public_config where key = 'lb_gold_top10'), 100);
  v_settled int := 0;
  r record;
  v_gold int;
  v_items jsonb;
  v_label text;
begin
  for v_week in select generate_series(v_cur - 28, v_cur - 7, interval '7 days')::date loop
    if not exists (select 1 from public.fame_snapshots where week = v_week) then continue; end if;
    insert into public.leaderboard_weeks (week) values (v_week) on conflict do nothing;
    if not found then continue; end if;
    v_settled := v_settled + 1;
    v_label := to_char(v_week, 'Mon FMDD');
    for r in
      select w.user_id, w.artist_name, w.score, row_number() over (order by w.score desc, w.fame desc) as rnk
      from public.lb_week_scores(v_week) w where w.score > 0 and w.score <= v_cap
      order by w.score desc, w.fame desc limit 10
    loop
      v_gold := case when r.rnk = 1 then v_g1 when r.rnk <= 3 then v_g3 else v_g10 end;
      if not v_on then v_gold := 0; end if;
      insert into public.leaderboard_awards (week, user_id, rank, score, artist_name, gold)
      values (v_week, r.user_id, r.rnk, r.score, coalesce(r.artist_name, ''), v_gold) on conflict do nothing;
      if v_on then
        if v_gold > 0 then
          perform public.gold_add(r.user_id, v_gold, 'Weekly leaderboard #' || r.rnk, 'lb:' || v_week || ':' || r.user_id);
        end if;
        v_items := case
          when r.rnk = 1 then jsonb_build_array(jsonb_build_object('type', 'badge', 'emoji', '🏆', 'name', 'Weekly #1'), jsonb_build_object('type', 'title', 'name', 'Weekly Champion'))
          when r.rnk <= 3 then jsonb_build_array(jsonb_build_object('type', 'badge', 'emoji', case when r.rnk = 2 then '🥈' else '🥉' end, 'name', 'Weekly Top 3'), jsonb_build_object('type', 'title', 'name', 'Top 3 Artist'))
          else jsonb_build_array(jsonb_build_object('type', 'badge', 'emoji', '🔟', 'name', 'Weekly Top 10'))
        end;
        insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
        values (r.user_id, null, 'Weekly leaderboard #' || r.rnk || ' · week of ' || v_label, 0, v_items);
      end if;
    end loop;
  end loop;
  return v_settled;
end; $$;
revoke execute on function public.leaderboard_settle() from public;
grant execute on function public.leaderboard_settle() to anon, authenticated;

create or replace function public.admin_leaderboard(p_board text default 'week') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_week date := public.lb_week();
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(x order by (x->>'score')::bigint desc) from (
      select jsonb_build_object('user_id', s.user_id, 'name', s.artist_name, 'email', u.email, 'level', coalesce((s.career->>'peakLevel')::int, 1),
        'genre', s.career->>'genre', 'fame', s.fame,
        'score', case when p_board = 'all' then s.fame else greatest(0, s.fame - coalesce(f.fame_start, s.fame)) end,
        'flagged', s.flagged_at is not null,
        'banned', exists (select 1 from public.leaderboard_bans b where b.user_id = s.user_id),
        'ban_reason', (select b.reason from public.leaderboard_bans b where b.user_id = s.user_id)) as x
      from public.saves s
      left join auth.users u on u.id = s.user_id
      left join public.fame_snapshots f on f.user_id = s.user_id and f.week = v_week
      where s.artist_name is not null and (p_board = 'all' or f.user_id is not null)
      order by case when p_board = 'all' then s.fame else greatest(0, s.fame - coalesce(f.fame_start, s.fame)) end desc
      limit 100) t), '[]'::jsonb),
    'winners', coalesce((select jsonb_agg(jsonb_build_object('week', a.week, 'rank', a.rank, 'name', a.artist_name, 'score', a.score, 'gold', a.gold, 'email', u.email) order by a.week desc, a.rank)
      from public.leaderboard_awards a left join auth.users u on u.id = a.user_id where a.week >= v_week - 56), '[]'::jsonb)
  );
end; $$;
revoke execute on function public.admin_leaderboard(text) from public, anon;
grant execute on function public.admin_leaderboard(text) to authenticated;

create or replace function public.admin_leaderboard_ban(p_user uuid, p_ban boolean, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_ban then
    insert into public.leaderboard_bans (user_id, reason) values (p_user, left(coalesce(p_reason, ''), 200))
    on conflict (user_id) do update set reason = excluded.reason;
  else
    delete from public.leaderboard_bans where user_id = p_user;
  end if;
end; $$;
revoke execute on function public.admin_leaderboard_ban(uuid, boolean, text) from public, anon;
grant execute on function public.admin_leaderboard_ban(uuid, boolean, text) to authenticated;
