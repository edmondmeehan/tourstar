insert into public.app_public_config (key, value) values ('ai_music_min_level', '3') on conflict (key) do nothing;

create or replace function public.my_perks() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vip', coalesce(p.vip_until > now(), false),
    'vip_until', p.vip_until,
    'ai_credits', coalesce(p.ai_credits, 0),
    'ai_songs_total', (select count(*) from public.ai_generations g where g.user_id = me.uid and g.kind = 'song' and g.status = 'ok'))
  from (select (select auth.uid()) as uid) me
  left join public.player_perks p on p.user_id = me.uid;
$$;
revoke execute on function public.my_perks() from public, anon;
grant execute on function public.my_perks() to authenticated;

alter table public.ai_generations add column if not exists hidden boolean not null default false;

create table if not exists public.radio_likes (
  gen_id uuid not null references public.ai_generations(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 6 and 64),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (gen_id, device_id)
);
alter table public.radio_likes enable row level security;
drop policy if exists "Admins read radio likes" on public.radio_likes;
create policy "Admins read radio likes" on public.radio_likes for select to authenticated using (public.is_admin());

create table if not exists public.radio_reports (
  gen_id uuid not null references public.ai_generations(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 6 and 64),
  user_id uuid references auth.users(id) on delete set null,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (gen_id, device_id)
);
alter table public.radio_reports enable row level security;
drop policy if exists "Admins read radio reports" on public.radio_reports;
create policy "Admins read radio reports" on public.radio_reports for select to authenticated using (public.is_admin());

create or replace function public.radio_station(p_station text, p_device text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  with songs as (
    select g.id, g.path, g.created_at,
      trim(split_part(g.detail, '·', 1)) as genre,
      trim(regexp_replace(coalesce(g.detail, ''), '^[^·]*·[^·]*·\s*', '')) as title,
      coalesce(nullif(trim(s.career->>'name'), ''), 'Unknown artist') as artist,
      (select count(*) from public.radio_likes l where l.gen_id = g.id) as likes,
      exists (select 1 from public.radio_likes l where l.gen_id = g.id and l.device_id = p_device) as liked
    from public.ai_generations g
    left join public.saves s on s.user_id = g.user_id
    where g.kind = 'song' and g.status = 'ok' and g.path is not null and not g.hidden
      and g.created_at > now() - interval '365 days'
      and (select count(*) from public.radio_reports r where r.gen_id = g.id) < 3
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', path, 'genre', genre, 'title', title, 'artist', artist, 'likes', likes, 'liked', liked)), '[]'::jsonb)
  from (
    select * from songs
    where p_station in ('all', 'hot', 'new') or genre = p_station
    order by
      case when p_station = 'hot' then likes end desc nulls last,
      case when p_station = 'new' then created_at end desc nulls last,
      random()
    limit 60
  ) x;
$$;
revoke execute on function public.radio_station(text, text) from public;
grant execute on function public.radio_station(text, text) to anon, authenticated;

create or replace function public.radio_like(p_gen uuid, p_device text) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if char_length(coalesce(p_device, '')) not between 6 and 64 then raise exception 'Bad device.'; end if;
  if exists (select 1 from public.radio_likes where gen_id = p_gen and device_id = p_device) then
    delete from public.radio_likes where gen_id = p_gen and device_id = p_device;
  elsif exists (select 1 from public.ai_generations where id = p_gen and kind = 'song' and status = 'ok') then
    insert into public.radio_likes (gen_id, device_id, user_id) values (p_gen, p_device, auth.uid());
  end if;
  return (select count(*) from public.radio_likes where gen_id = p_gen);
end; $$;
revoke execute on function public.radio_like(uuid, text) from public;
grant execute on function public.radio_like(uuid, text) to anon, authenticated;

create or replace function public.radio_report(p_gen uuid, p_device text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if char_length(coalesce(p_device, '')) not between 6 and 64 then raise exception 'Bad device.'; end if;
  if not exists (select 1 from public.ai_generations where id = p_gen and kind = 'song') then return; end if;
  insert into public.radio_reports (gen_id, device_id, user_id, reason) values (p_gen, p_device, auth.uid(), left(coalesce(p_reason, ''), 200))
  on conflict (gen_id, device_id) do nothing;
end; $$;
revoke execute on function public.radio_report(uuid, text, text) from public;
grant execute on function public.radio_report(uuid, text, text) to anon, authenticated;

create or replace function public.admin_radio_reports() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return coalesce((select jsonb_agg(x order by x->>'last' desc) from (
    select jsonb_build_object(
      'id', g.id, 'path', g.path, 'hidden', g.hidden,
      'title', trim(regexp_replace(coalesce(g.detail, ''), '^[^·]*·[^·]*·\s*', '')),
      'artist', coalesce(nullif(trim(s.career->>'name'), ''), 'Unknown artist'),
      'email', u.email,
      'reports', (select count(*) from public.radio_reports r where r.gen_id = g.id),
      'reasons', (select jsonb_agg(distinct r.reason) from public.radio_reports r where r.gen_id = g.id and r.reason <> ''),
      'last', (select max(r.created_at) from public.radio_reports r where r.gen_id = g.id)
    ) as x
    from public.ai_generations g
    left join public.saves s on s.user_id = g.user_id
    left join auth.users u on u.id = g.user_id
    where exists (select 1 from public.radio_reports r where r.gen_id = g.id) or g.hidden
  ) t), '[]'::jsonb);
end; $$;
revoke execute on function public.admin_radio_reports() from public, anon;
grant execute on function public.admin_radio_reports() to authenticated;

create or replace function public.admin_set_song_hidden(p_gen uuid, p_hidden boolean, p_clear_reports boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  update public.ai_generations set hidden = p_hidden where id = p_gen;
  if p_clear_reports then delete from public.radio_reports where gen_id = p_gen; end if;
end; $$;
revoke execute on function public.admin_set_song_hidden(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_song_hidden(uuid, boolean, boolean) to authenticated;

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
      'reports', (select count(*) from public.radio_reports r where r.gen_id = g.id)
    ) order by g.created_at)
    from public.ai_generations g
    left join public.saves s on s.user_id = g.user_id
    left join auth.users u on u.id = g.user_id
    where g.kind = 'song' and g.status = 'ok' and g.path is not null and not g.hidden
      and g.created_at >= v_from and g.created_at < (v_from + interval '1 month')), '[]'::jsonb);
end; $$;
revoke execute on function public.admin_month_songs(date) from public, anon;
grant execute on function public.admin_month_songs(date) to authenticated;
