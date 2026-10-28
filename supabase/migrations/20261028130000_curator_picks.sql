-- Curator's Picks: a radio station of player AI songs hand-picked by the game's featured curator.
-- The curator's display name lives in app_public_config (blank = "Curator's Picks").
insert into public.app_public_config (key, value) values ('curator_name', '')
on conflict (key) do nothing;

create table if not exists public.radio_picks (
  gen_id uuid primary key references public.ai_generations(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 140),
  created_at timestamptz not null default now()
);
alter table public.radio_picks enable row level security;
drop policy if exists "Anyone sees picks" on public.radio_picks;
create policy "Anyone sees picks" on public.radio_picks for select to anon, authenticated using (true);
drop policy if exists "Admins manage picks" on public.radio_picks;
create policy "Admins manage picks" on public.radio_picks for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.radio_station(p_station text, p_device text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with songs as (
    select g.id, g.path, g.created_at,
      trim(split_part(g.detail, '·', 1)) as genre,
      trim(regexp_replace(coalesce(g.detail, ''), '^[^·]*·[^·]*·\s*', '')) as title,
      coalesce(nullif(trim(s.career->>'name'), ''), 'Unknown artist') as artist,
      (select count(*) from public.radio_likes l where l.gen_id = g.id) as likes,
      exists (select 1 from public.radio_likes l where l.gen_id = g.id and l.device_id = p_device) as liked,
      p.created_at as picked_at,
      p.note as pick_note
    from public.ai_generations g
    left join public.saves s on s.user_id = g.user_id
    left join public.radio_picks p on p.gen_id = g.id
    where g.kind = 'song' and g.status = 'ok' and g.path is not null and not g.hidden
      and (g.created_at > now() - interval '365 days' or p.gen_id is not null)
      and (select count(*) from public.radio_reports r where r.gen_id = g.id) < 3
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path, 'genre', genre, 'title', title, 'artist', artist, 'likes', likes, 'liked', liked, 'picked', picked_at is not null, 'note', pick_note)), '[]'::jsonb)
  from (
    select * from songs
    where p_station in ('all', 'hot', 'new') or genre = p_station or (p_station = 'picks' and picked_at is not null)
    order by
      case when p_station = 'picks' then picked_at end desc nulls last,
      case when p_station = 'hot' then likes end desc nulls last,
      case when p_station = 'new' then created_at end desc nulls last,
      random()
    limit 60
  ) x;
$$;
revoke execute on function public.radio_station(text, text) from public;
grant execute on function public.radio_station(text, text) to anon, authenticated;

create or replace function public.admin_set_pick(p_gen uuid, p_on boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_on then
    insert into public.radio_picks (gen_id, note) values (p_gen, left(coalesce(p_note, ''), 140))
    on conflict (gen_id) do update set note = excluded.note;
  else
    delete from public.radio_picks where gen_id = p_gen;
  end if;
end; $$;
revoke execute on function public.admin_set_pick(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_pick(uuid, boolean, text) to authenticated;

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
      'email', u.email,
      'likes', (select count(*) from public.radio_likes l where l.gen_id = g.id),
      'reports', (select count(*) from public.radio_reports r where r.gen_id = g.id),
      'picked', exists (select 1 from public.radio_picks p where p.gen_id = g.id)
    ) order by g.created_at)
    from public.ai_generations g
    left join public.saves s on s.user_id = g.user_id
    left join auth.users u on u.id = g.user_id
    where g.kind = 'song' and g.status = 'ok' and g.path is not null and not g.hidden
      and g.created_at >= v_from and g.created_at < (v_from + interval '1 month')), '[]'::jsonb);
end; $$;
revoke execute on function public.admin_month_songs(date) from public, anon;
grant execute on function public.admin_month_songs(date) to authenticated;
