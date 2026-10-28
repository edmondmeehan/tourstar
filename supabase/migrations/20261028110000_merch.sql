insert into public.app_public_config (key, value) values
  ('merch_enabled', 'false'),
  ('merch_shop_domain', ''),
  ('merch_collection', ''),
  ('merch_api_version', '2026-07')
on conflict (key) do nothing;

create table if not exists public.merch_unlocks (
  product_id text primary key check (product_id ~ '^[0-9]+$'),
  title text not null default '' check (char_length(title) <= 200),
  items jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.merch_unlocks enable row level security;
drop policy if exists "Anyone sees merch unlocks" on public.merch_unlocks;
create policy "Anyone sees merch unlocks" on public.merch_unlocks for select to anon, authenticated using (active);
drop policy if exists "Admins manage merch unlocks" on public.merch_unlocks;
create policy "Admins manage merch unlocks" on public.merch_unlocks for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.merch_unlocks_validate() returns trigger
language plpgsql set search_path = '' as $$
declare it jsonb;
begin
  if jsonb_typeof(new.items) <> 'array' then raise exception 'Items must be a list.'; end if;
  for it in select * from jsonb_array_elements(new.items) loop
    if coalesce(it->>'type', '') not in ('stage', 'title', 'badge', 'skin', 'moves') then
      raise exception 'Merch can unlock stages, titles, badges, app colors or dance moves only. Never points, raffle entries, Gold or cash.';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists merch_unlocks_validate on public.merch_unlocks;
create trigger merch_unlocks_validate before insert or update on public.merch_unlocks for each row execute function public.merch_unlocks_validate();

create table if not exists public.merch_orders (
  id bigint primary key,
  order_number text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  email text,
  total numeric(12,2) not null default 0,
  currency text not null default 'USD',
  items jsonb not null default '[]'::jsonb,
  unlocked jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists merch_orders_created on public.merch_orders (created_at desc);
alter table public.merch_orders enable row level security;
drop policy if exists "Admins read merch orders" on public.merch_orders;
create policy "Admins read merch orders" on public.merch_orders for select to authenticated using (public.is_admin());
drop policy if exists "Players see their merch orders" on public.merch_orders;
create policy "Players see their merch orders" on public.merch_orders for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.merch_record_order(p_order jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint := (p_order->>'id')::bigint;
  v_uid uuid;
  v_email text := lower(nullif(trim(coalesce(p_order->>'email', p_order->'customer'->>'email', '')), ''));
  v_attr text;
  v_items jsonb := '[]'::jsonb;
  v_unlock jsonb := '[]'::jsonb;
  li jsonb;
  u public.merch_unlocks;
begin
  if v_id is null then raise exception 'No order id.'; end if;
  if exists (select 1 from public.merch_orders where id = v_id) then return jsonb_build_object('duplicate', true); end if;
  select a->>'value' into v_attr from jsonb_array_elements(coalesce(p_order->'note_attributes', '[]'::jsonb)) a where a->>'name' = 'tourstar_user' limit 1;
  if v_attr ~ '^[0-9a-f-]{36}$' and exists (select 1 from auth.users where id = v_attr::uuid) then v_uid := v_attr::uuid; end if;
  if v_uid is null and v_email is not null then select id into v_uid from auth.users where lower(email) = v_email limit 1; end if;
  for li in select * from jsonb_array_elements(coalesce(p_order->'line_items', '[]'::jsonb)) loop
    v_items := v_items || jsonb_build_array(jsonb_build_object('product_id', li->>'product_id', 'title', li->>'title', 'variant', li->>'variant_title', 'qty', (li->>'quantity')::int, 'price', li->>'price'));
    select * into u from public.merch_unlocks where product_id = li->>'product_id' and active;
    if found then v_unlock := v_unlock || u.items; end if;
  end loop;
  insert into public.merch_orders (id, order_number, user_id, email, total, currency, items, unlocked)
  values (v_id, coalesce(p_order->>'name', p_order->>'order_number', ''), v_uid, v_email, coalesce((p_order->>'total_price')::numeric, 0), coalesce(p_order->>'currency', 'USD'), v_items, v_unlock);
  if v_uid is not null and jsonb_array_length(v_unlock) > 0 then
    insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
    values (v_uid, null, 'Merch order ' || coalesce(p_order->>'name', v_id::text), 0, v_unlock || jsonb_build_array(jsonb_build_object('type', 'badge', 'emoji', '👕', 'name', 'Merch Crew')));
  elsif v_uid is not null then
    insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
    values (v_uid, null, 'Merch order ' || coalesce(p_order->>'name', v_id::text), 0, jsonb_build_array(jsonb_build_object('type', 'badge', 'emoji', '👕', 'name', 'Merch Crew')));
  end if;
  return jsonb_build_object('user', v_uid, 'unlocked', jsonb_array_length(v_unlock));
end; $$;
revoke execute on function public.merch_record_order(jsonb) from public, anon, authenticated;
grant execute on function public.merch_record_order(jsonb) to service_role;

create or replace function public.my_merch_vip_code() returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.player_perks where user_id = auth.uid() and vip_until > now()) then return null; end if;
  return public.get_secret('merch_vip_code');
end; $$;
revoke execute on function public.my_merch_vip_code() from public, anon;
grant execute on function public.my_merch_vip_code() to authenticated;

create or replace function public.admin_merch_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'orders_30d', (select count(*) from public.merch_orders where created_at > now() - interval '30 days'),
    'revenue_30d', coalesce((select sum(total) from public.merch_orders where created_at > now() - interval '30 days'), 0),
    'players_30d', (select count(distinct user_id) from public.merch_orders where created_at > now() - interval '30 days' and user_id is not null),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'order', o.order_number, 'email', o.email, 'player', s.artist_name, 'total', o.total, 'currency', o.currency, 'items', o.items, 'unlocked', jsonb_array_length(o.unlocked), 'at', o.created_at) order by o.created_at desc)
      from (select * from public.merch_orders order by created_at desc limit 50) o left join public.saves s on s.user_id = o.user_id), '[]'::jsonb)
  );
end; $$;
revoke execute on function public.admin_merch_summary() from public, anon;
grant execute on function public.admin_merch_summary() to authenticated;
