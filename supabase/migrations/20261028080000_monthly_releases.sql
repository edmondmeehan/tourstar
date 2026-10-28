create table if not exists public.monthly_releases (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'live')),
  cover_url text check (cover_url is null or cover_url ~ '^https://'),
  links jsonb not null default '{}'::jsonb,
  tracks jsonb not null default '[]'::jsonb,
  notes text not null default '' check (char_length(notes) <= 2000),
  released_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.monthly_releases enable row level security;
drop policy if exists "Admins manage monthly releases" on public.monthly_releases;
create policy "Admins manage monthly releases" on public.monthly_releases for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_month_songs(p_month date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_from date := date_trunc('month', p_month)::date;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'path', g.path, 'created_at', g.created_at,
      'genre', trim(split_part(g.detail, '·', 1)),
      'kind', trim(split_part(g.detail, '·', 2)),
      'title', trim(regexp_replace(coalesce(g.detail, ''), '^[^·]*·[^·]*·\s*', '')),
      'artist', coalesce(nullif(trim(s.career->>'name'), ''), 'Unknown artist'),
      'email', u.email
    ) order by g.created_at)
    from public.ai_generations g
    left join public.saves s on s.user_id = g.user_id
    left join auth.users u on u.id = g.user_id
    where g.kind = 'song' and g.status = 'ok' and g.path is not null
      and g.created_at >= v_from and g.created_at < (v_from + interval '1 month')), '[]'::jsonb);
end; $$;
revoke execute on function public.admin_month_songs(date) from public, anon;
grant execute on function public.admin_month_songs(date) to authenticated;

create or replace function public.public_monthly_releases() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'month', r.month, 'title', r.title, 'cover_url', r.cover_url, 'links', r.links, 'released_on', r.released_on,
    'tracks', (select coalesce(jsonb_agg(jsonb_build_object(
        'n', t.n, 'title', t.item->>'title', 'artist', t.item->>'artist', 'genre', t.item->>'genre',
        'mine', exists (select 1 from public.ai_generations g where g.id::text = t.item->>'gen_id' and g.user_id = (select auth.uid()))
      ) order by t.n), '[]'::jsonb)
      from jsonb_array_elements(r.tracks) with ordinality as t(item, n))
  ) order by r.month desc), '[]'::jsonb)
  from public.monthly_releases r where r.status = 'live';
$$;
revoke execute on function public.public_monthly_releases() from public;
grant execute on function public.public_monthly_releases() to anon, authenticated;
