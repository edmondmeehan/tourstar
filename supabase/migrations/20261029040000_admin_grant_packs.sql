-- Admin: give packs to a player by email (support make-goods, giveaways, partners, the team).
-- p_drop = one pack; p_all = every pack; p_items = a custom set (e.g. "everything" from the app's catalog).
-- Never gives reward points or raffle entries; free grants don't count as sales.
create or replace function public.admin_grant_packs(p_email text, p_drop uuid default null, p_all boolean default false, p_name text default null, p_items jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_added int := 0;
  v_skipped int := 0;
  d public.drops;
  it jsonb;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'No player with that email. They need a TourStar account first.'; end if;

  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 500 then raise exception 'Nothing to give.'; end if;
    for it in select * from jsonb_array_elements(p_items) loop
      if coalesce(it->>'type', '') not in ('stage', 'title', 'badge', 'skin', 'moves', 'look', 'venue', 'perk') then
        raise exception 'Custom grants can include stages, titles, badges, app colors, moves, looks, venues and perks only.';
      end if;
    end loop;
    insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
    values (v_uid, null, left(coalesce(nullif(trim(p_name), ''), 'Admin gift'), 80), 0, p_items);
    v_added := 1;
  end if;

  for d in select * from public.drops where (p_all and p_items is null) or id = p_drop loop
    if exists (select 1 from public.drop_purchases where user_id = v_uid and drop_id = d.id) then
      v_skipped := v_skipped + 1;
    else
      insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
      values (v_uid, d.id, d.name, 0, d.items);
      v_added := v_added + 1;
    end if;
  end loop;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped);
end; $$;
revoke execute on function public.admin_grant_packs(text, uuid, boolean, text, jsonb) from public, anon;
grant execute on function public.admin_grant_packs(text, uuid, boolean, text, jsonb) to authenticated;

-- Sales and partner statements count paid packs only (admin gifts are free).
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
       select drop_id, count(*) as n, sum(price_gold) as g from public.drop_purchases where drop_id is not null and price_gold > 0 group by drop_id) s), '{}'::jsonb)
  );
end; $$;
revoke execute on function public.admin_drops_summary() from public, anon;
grant execute on function public.admin_drops_summary() to authenticated;

create or replace function public.admin_partner_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'packs', coalesce((select jsonb_agg(jsonb_build_object('partner_id', d.partner_id, 'drop_id', d.id, 'name', d.name, 'sold', s.n, 'gold', s.g)) from (
        select drop_id, count(*) as n, sum(price_gold) as g from public.drop_purchases
        where created_at >= p_from and created_at < p_to + 1 and drop_id is not null and price_gold > 0 group by drop_id) s
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
