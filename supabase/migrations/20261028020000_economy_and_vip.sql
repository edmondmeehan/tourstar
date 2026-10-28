create table if not exists public.reward_costs (
  item_id uuid primary key references public.reward_items(id) on delete cascade,
  cost_usd numeric(10,2) not null check (cost_usd >= 0),
  updated_at timestamptz not null default now()
);
alter table public.reward_costs enable row level security;
drop policy if exists "Admins manage reward costs" on public.reward_costs;
create policy "Admins manage reward costs" on public.reward_costs for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_settings enable row level security;
drop policy if exists "Admins manage settings" on public.admin_settings;
create policy "Admins manage settings" on public.admin_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.admin_settings (key, value) values
  ('economy', '{"redeem_rate": 0.5, "alert_usd": 5000}'::jsonb)
on conflict (key) do nothing;

create table if not exists public.economy_snapshots (
  day date primary key,
  earned bigint not null,
  spent bigint not null,
  outstanding bigint not null,
  withheld bigint not null,
  liability_usd numeric(12,2),
  players int not null,
  active_30d int not null,
  created_at timestamptz not null default now()
);
alter table public.economy_snapshots enable row level security;
drop policy if exists "Admins read snapshots" on public.economy_snapshots;
create policy "Admins read snapshots" on public.economy_snapshots for select to authenticated using (public.is_admin());

create table if not exists public.revenue_events (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  product_id text,
  price_usd numeric(10,2) not null default 0,
  environment text,
  at timestamptz not null default now(),
  raw jsonb
);
create index if not exists revenue_events_at on public.revenue_events (at desc);
alter table public.revenue_events enable row level security;
drop policy if exists "Admins read revenue" on public.revenue_events;
create policy "Admins read revenue" on public.revenue_events for select to authenticated using (public.is_admin());

create table if not exists public.player_perks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vip_until timestamptz,
  ai_credits int not null default 0 check (ai_credits >= 0),
  updated_at timestamptz not null default now()
);
alter table public.player_perks enable row level security;
drop policy if exists "Players read their perks" on public.player_perks;
create policy "Players read their perks" on public.player_perks for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Admins read perks" on public.player_perks;
create policy "Admins read perks" on public.player_perks for select to authenticated using (public.is_admin());

create or replace function public.admin_economy() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_set jsonb;
  v_earned bigint; v_spent bigint; v_out bigint; v_held bigint;
  v_players int; v_a30 int; v_a7 int;
  v_cpp numeric; v_rate numeric; v_liab numeric;
  v_owed_items numeric; v_owed_raffles numeric;
  v_rev30 numeric; v_payers30 int; v_prize30 numeric;
  v_week jsonb; v_items jsonb; v_snaps jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select value into v_set from public.admin_settings where key = 'economy';
  v_set := coalesce(v_set, '{"redeem_rate": 0.5, "alert_usd": 5000}'::jsonb);

  with per as (
    select s.user_id, (s.points_verified + s.points_adjust)::bigint as earned, s.points_withheld::bigint as held,
      (coalesce((select sum(r.cost_points) from public.reward_redemptions r where r.user_id = s.user_id and r.status <> 'rejected'), 0)
       + coalesce((select sum(e.cost_points) from public.raffle_entries e where e.user_id = s.user_id), 0))::bigint as spent
    from public.saves s
  )
  select coalesce(sum(earned), 0), coalesce(sum(spent), 0), coalesce(sum(greatest(0, earned - spent)), 0), coalesce(sum(held), 0)
  into v_earned, v_spent, v_out, v_held from per;

  select count(*), count(*) filter (where updated_at > now() - interval '30 days'), count(*) filter (where updated_at > now() - interval '7 days')
  into v_players, v_a30, v_a7 from public.saves;

  select sum(c.cost_usd * (1 + coalesce(n.cnt, 0))) / nullif(sum(i.cost_points * (1 + coalesce(n.cnt, 0))), 0)
  into v_cpp
  from public.reward_items i
  join public.reward_costs c on c.item_id = i.id
  left join (select item_id, count(*) as cnt from public.reward_redemptions where status <> 'rejected' group by item_id) n on n.item_id = i.id
  where i.cost_points > 0 and (i.active or n.cnt > 0);

  v_rate := case when v_earned >= 50000 then least(1, v_spent::numeric / nullif(v_earned, 0)) else (v_set->>'redeem_rate')::numeric end;
  v_liab := round(v_out * coalesce(v_cpp, 0) * coalesce(v_rate, 0.5), 2);

  select coalesce(sum(c.cost_usd), 0) into v_owed_items
  from public.reward_redemptions r left join public.reward_costs c on c.item_id = r.item_id
  where r.status in ('pending', 'approved');
  select coalesce(sum(prize_value_usd), 0) into v_owed_raffles from public.raffles where status in ('open', 'closed');

  select coalesce(sum(price_usd), 0), count(distinct user_id) into v_rev30, v_payers30
  from public.revenue_events
  where at > now() - interval '30 days' and coalesce(environment, 'PRODUCTION') = 'PRODUCTION'
    and type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE');

  select coalesce((select sum(c.cost_usd) from public.reward_redemptions r join public.reward_costs c on c.item_id = r.item_id
                   where r.status <> 'rejected' and r.created_at > now() - interval '30 days'), 0)
       + coalesce((select sum(prize_value_usd) from public.raffles where drawn_at > now() - interval '30 days'), 0)
  into v_prize30;

  select coalesce(jsonb_agg(w order by w.week), '[]'::jsonb) into v_week from (
    select to_char(wk, 'YYYY-MM-DD') as week,
      coalesce((select sum(r.cost_points) from public.reward_redemptions r where r.status <> 'rejected' and date_trunc('week', r.created_at) = wk), 0)::bigint as redeemed_points,
      coalesce((select sum(e.cost_points) from public.raffle_entries e where date_trunc('week', e.created_at) = wk), 0)::bigint as raffle_points,
      coalesce((select sum(c.cost_usd) from public.reward_redemptions r join public.reward_costs c on c.item_id = r.item_id where r.status <> 'rejected' and date_trunc('week', r.created_at) = wk), 0)::numeric as prize_usd,
      coalesce((select sum(v.price_usd) from public.revenue_events v where coalesce(v.environment, 'PRODUCTION') = 'PRODUCTION' and v.type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE') and date_trunc('week', v.at) = wk), 0)::numeric as revenue_usd
    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week') wk
  ) w;

  select coalesce(jsonb_agg(x order by x.cost_points), '[]'::jsonb) into v_items from (
    select i.id, i.emoji, i.name, i.cost_points, i.active, c.cost_usd,
      round(c.cost_usd / nullif(i.cost_points, 0) * 1000, 3) as usd_per_1000,
      (select count(*) from public.reward_redemptions r where r.item_id = i.id and r.status <> 'rejected') as redeemed
    from public.reward_items i left join public.reward_costs c on c.item_id = i.id
  ) x;

  insert into public.economy_snapshots (day, earned, spent, outstanding, withheld, liability_usd, players, active_30d)
  values (current_date, v_earned, v_spent, v_out, v_held, v_liab, v_players, v_a30)
  on conflict (day) do update set earned = excluded.earned, spent = excluded.spent, outstanding = excluded.outstanding,
    withheld = excluded.withheld, liability_usd = excluded.liability_usd, players = excluded.players, active_30d = excluded.active_30d;

  select coalesce(jsonb_agg(s order by s.day), '[]'::jsonb) into v_snaps from (
    select day, earned, spent, outstanding, liability_usd, active_30d from public.economy_snapshots where day > current_date - 90
  ) s;

  return jsonb_build_object(
    'settings', v_set,
    'earned', v_earned, 'spent', v_spent, 'outstanding', v_out, 'withheld', v_held,
    'players', v_players, 'active_30d', v_a30, 'active_7d', v_a7,
    'cost_per_point', v_cpp, 'redeem_rate', v_rate, 'redeem_rate_is_actual', v_earned >= 50000,
    'liability_usd', v_liab, 'owed_items_usd', v_owed_items, 'owed_raffles_usd', v_owed_raffles,
    'revenue_30d', v_rev30, 'payers_30d', v_payers30, 'prize_cost_30d', v_prize30,
    'weeks', v_week, 'items', v_items, 'snapshots', v_snaps
  );
end; $$;
revoke execute on function public.admin_economy() from public, anon;
grant execute on function public.admin_economy() to authenticated;

create or replace function public.my_perks() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vip', coalesce(p.vip_until > now(), false),
    'vip_until', p.vip_until,
    'ai_credits', coalesce(p.ai_credits, 0))
  from (select (select auth.uid()) as uid) me
  left join public.player_perks p on p.user_id = me.uid;
$$;
revoke execute on function public.my_perks() from public, anon;
grant execute on function public.my_perks() to authenticated;

insert into public.app_public_config (key, value) values ('ai_music_vip_bonus', '3') on conflict (key) do nothing;
