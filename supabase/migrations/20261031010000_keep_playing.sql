-- Keep-playing pack: spend Gold on an energy refill or a Promoter's Pass, and an admin view of where
-- free and paying players stop progressing. Gold is never turned into reward points or fame.

create or replace function public.spend_gold(p_kind text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_price int;
  v_key text;
  v_bal int;
  v_today int;
begin
  if v_uid is null then raise exception 'Sign in to use Gold.'; end if;
  if p_kind = 'refill' then
    v_price := 40;
    select count(*) into v_today from public.gold_ledger
      where user_id = v_uid and reason = 'Energy refill' and created_at >= date_trunc('day', now());
    if v_today >= 3 then raise exception 'You''ve used all 3 refills today. More energy tomorrow!'; end if;
    v_key := 'refill:' || v_uid || ':' || to_char(now(), 'YYYYMMDDHH24MISSMS');
  elsif p_kind = 'pass' then
    if p_ref is null or p_ref !~ '^[a-z-]{3,40}$' then raise exception 'Unknown venue.'; end if;
    v_price := 150;
    v_key := 'pass:' || v_uid || ':' || p_ref;
    if exists (select 1 from public.gold_ledger where ref = v_key) then
      return jsonb_build_object('ok', true, 'already', true, 'gold', (select gold from public.player_perks where user_id = v_uid));
    end if;
  else
    raise exception 'Unknown item.';
  end if;
  if coalesce((select gold from public.player_perks where user_id = v_uid), 0) < v_price then
    raise exception 'Not enough Gold Records.';
  end if;
  v_bal := public.gold_add(v_uid, -v_price, case when p_kind = 'refill' then 'Energy refill' else 'Promoter''s Pass: ' || p_ref end, v_key);
  return jsonb_build_object('ok', true, 'gold', v_bal);
end; $$;
revoke all on function public.spend_gold(text, text) from public, anon;
grant execute on function public.spend_gold(text, text) to authenticated;

-- Where players stop: by highest level reached, how many are still active (played in the last 7 days),
-- split by whether they have ever paid.
create or replace function public.admin_level_funnel()
returns table(level int, payer boolean, players bigint, active_7d bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
  select coalesce((s.career->>'peakLevel')::int, 1) as level,
         exists (select 1 from public.revenue_events r where r.user_id = s.user_id and coalesce(r.price_usd, 0) > 0 and r.environment is distinct from 'SANDBOX') as payer,
         count(*)::bigint as players,
         count(*) filter (where s.updated_at >= now() - interval '7 days')::bigint as active_7d
  from public.saves s
  group by 1, 2
  order by 1, 2;
end; $$;
revoke all on function public.admin_level_funnel() from public, anon;
grant execute on function public.admin_level_funnel() to authenticated;
