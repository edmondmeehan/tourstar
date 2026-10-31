-- Optional player location: zip / postal code (US, Canada, UK), worked out on the device to a
-- state/province and the nearest tour city. Used for hometown suggestions, nearby real shows and presales,
-- and admin totals by area. Players can change or remove it any time; it's deleted with the account.
create table if not exists public.player_location (
  user_id uuid primary key references auth.users(id) on delete cascade,
  postal_code text not null check (char_length(postal_code) between 3 and 10),
  country text not null check (country in ('US', 'CA', 'GB')),
  area text not null default '',
  nearest_city text not null default '',
  -- Opted in to emails about real shows, presales and offers near them (off unless they tick the box).
  marketing_ok boolean not null default false,
  marketing_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.player_location add column if not exists marketing_ok boolean not null default false;
alter table public.player_location add column if not exists marketing_at timestamptz;
create index if not exists player_location_postal on public.player_location (country, postal_code);
alter table public.player_location enable row level security;
drop policy if exists "own location" on public.player_location;
create policy "own location" on public.player_location for select to authenticated using (user_id = (select auth.uid()));

drop function if exists public.set_my_location(text, text, text, text);
create or replace function public.set_my_location(p_postal text, p_country text, p_area text, p_city text, p_marketing boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  if p_postal is null or trim(p_postal) = '' then
    delete from public.player_location where user_id = v_uid;
    return;
  end if;
  insert into public.player_location (user_id, postal_code, country, area, nearest_city, marketing_ok, marketing_at, updated_at)
  values (v_uid, upper(left(trim(p_postal), 10)), p_country, left(coalesce(p_area, ''), 40), left(coalesce(p_city, ''), 40),
          coalesce(p_marketing, false), case when p_marketing then now() end, now())
  on conflict (user_id) do update set postal_code = excluded.postal_code, country = excluded.country, area = excluded.area,
    nearest_city = excluded.nearest_city, marketing_ok = excluded.marketing_ok,
    marketing_at = case when excluded.marketing_ok and not public.player_location.marketing_ok then now()
                        when excluded.marketing_ok then public.player_location.marketing_at end,
    updated_at = now();
end; $$;
revoke all on function public.set_my_location(text, text, text, text, boolean) from public, anon;
grant execute on function public.set_my_location(text, text, text, text, boolean) to authenticated;

-- The signed-in player's saved area (so Account can show the opt-in state).
create or replace function public.my_location()
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(l) - 'user_id' from public.player_location l where l.user_id = (select auth.uid());
$$;
revoke all on function public.my_location() from public, anon;
grant execute on function public.my_location() to authenticated;

-- Admin: players per postal code (US zip, Canadian first 3 characters, UK outward code). The admin page
-- matches these against the zip database for radius, county, city, state and range searches.
create or replace function public.admin_postal_counts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return coalesce((select jsonb_agg(t) from (
    select country,
           case country when 'US' then left(postal_code, 5) when 'CA' then left(postal_code, 3) else split_part(postal_code, ' ', 1) end as code,
           count(*) as players, count(*) filter (where marketing_ok) as opted_in
    from public.player_location group by 1, 2) t), '[]'::jsonb);
end; $$;
revoke all on function public.admin_postal_counts() from public, anon;
grant execute on function public.admin_postal_counts() to authenticated;

-- Admin: contact list for an area, only players who opted in to local emails.
create or replace function public.admin_area_contacts(p_codes text[])
returns table (email text, artist_name text, postal_code text, country text, opted_in_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select u.email::text, s.artist_name, l.postal_code, l.country, l.marketing_at
    from public.player_location l
    join auth.users u on u.id = l.user_id
    left join public.saves s on s.user_id = l.user_id
    where l.marketing_ok
      and (case l.country when 'US' then left(l.postal_code, 5) when 'CA' then left(l.postal_code, 3) else split_part(l.postal_code, ' ', 1) end) = any (p_codes)
    order by l.postal_code;
end; $$;
revoke all on function public.admin_area_contacts(text[]) from public, anon;
grant execute on function public.admin_area_contacts(text[]) to authenticated;

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
