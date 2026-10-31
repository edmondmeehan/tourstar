-- Optional player location: zip / postal code (US, Canada, UK), worked out on the device to a
-- state/province and the nearest tour city. Used for hometown suggestions, nearby real shows and presales,
-- and admin totals by area. Players can change or remove it any time; it's deleted with the account.
create table if not exists public.player_location (
  user_id uuid primary key references auth.users(id) on delete cascade,
  postal_code text not null check (char_length(postal_code) between 3 and 10),
  country text not null check (country in ('US', 'CA', 'GB')),
  area text not null default '',
  nearest_city text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.player_location enable row level security;
drop policy if exists "own location" on public.player_location;
create policy "own location" on public.player_location for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.set_my_location(p_postal text, p_country text, p_area text, p_city text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_postal is null or trim(p_postal) = '' then
    delete from public.player_location where user_id = v_uid;
    return;
  end if;
  insert into public.player_location (user_id, postal_code, country, area, nearest_city, updated_at)
  values (v_uid, upper(left(trim(p_postal), 10)), p_country, left(coalesce(p_area, ''), 40), left(coalesce(p_city, ''), 40), now())
  on conflict (user_id) do update set postal_code = excluded.postal_code, country = excluded.country, area = excluded.area,
    nearest_city = excluded.nearest_city, updated_at = now();
end; $$;
revoke all on function public.set_my_location(text, text, text, text) from public, anon;
grant execute on function public.set_my_location(text, text, text, text) to authenticated;

-- Admin: players by nearest tour city and by state/province (counts only, no individual codes).
create or replace function public.admin_location_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'total', (select count(*) from public.player_location),
    'by_city', coalesce((select jsonb_agg(t order by t.players desc) from (select nearest_city as city, count(*) as players from public.player_location group by 1) t), '[]'::jsonb),
    'by_area', coalesce((select jsonb_agg(t order by t.players desc) from (select country || ' · ' || area as area, count(*) as players from public.player_location group by 1 order by 2 desc limit 25) t), '[]'::jsonb));
end; $$;
revoke all on function public.admin_location_counts() from public, anon;
grant execute on function public.admin_location_counts() to authenticated;
