-- AI press: news stories, critic reviews, weekly recaps and manager chat, written by Claude through the
-- ai-press edge function. Rows are written only by the server; players read their own.
insert into public.app_public_config (key, value) values
  ('press_enabled', 'false'),
  ('press_daily_limit', '5'),
  ('press_vip_bonus', '10'),
  ('press_chat_daily_limit', '10'),
  ('press_model', 'claude-haiku-5-5')
on conflict (key) do nothing;

create table if not exists public.ai_press (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('story', 'review', 'recap', 'chat')),
  event text not null default '' check (char_length(event) <= 120),
  outlet text not null default '' check (char_length(outlet) <= 60),
  headline text not null default '' check (char_length(headline) <= 200),
  body text not null default '' check (char_length(body) <= 2000),
  meta jsonb not null default '{}'::jsonb,
  tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_press_user_time on public.ai_press (user_id, created_at desc);
create index if not exists ai_press_user_event on public.ai_press (user_id, kind, event);
alter table public.ai_press enable row level security;
drop policy if exists "Players read their press" on public.ai_press;
create policy "Players read their press" on public.ai_press for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Players delete their press" on public.ai_press;
create policy "Players delete their press" on public.ai_press for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.ai_press_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  bucket text not null check (bucket in ('press', 'chat')),
  n int not null default 0,
  primary key (user_id, day, bucket)
);
alter table public.ai_press_usage enable row level security;
drop policy if exists "Players read their press usage" on public.ai_press_usage;
create policy "Players read their press usage" on public.ai_press_usage for select to authenticated using ((select auth.uid()) = user_id);

-- Atomically use one of today's AI requests. Returns false when the player is at the limit.
create or replace function public.ai_press_take(p_user uuid, p_bucket text, p_limit int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.ai_press_usage (user_id, day, bucket, n) values (p_user, (now() at time zone 'utc')::date, p_bucket, 1)
  on conflict (user_id, day, bucket) do update set n = public.ai_press_usage.n + 1
    where public.ai_press_usage.n < p_limit
  returning n into v_n;
  return v_n is not null;
end; $$;
revoke execute on function public.ai_press_take(uuid, text, int) from public, anon, authenticated;
grant execute on function public.ai_press_take(uuid, text, int) to service_role;

-- Give a request back when Claude fails, so a server error doesn't use up a player's day.
create or replace function public.ai_press_refund(p_user uuid, p_bucket text) returns void
language sql security definer set search_path = '' as $$
  update public.ai_press_usage set n = greatest(0, n - 1)
  where user_id = p_user and day = (now() at time zone 'utc')::date and bucket = p_bucket;
$$;
revoke execute on function public.ai_press_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_press_refund(uuid, text) to service_role;

create or replace function public.admin_press_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'today', (select count(*) from public.ai_press where created_at > date_trunc('day', now())),
    'week', (select count(*) from public.ai_press where created_at > now() - interval '7 days'),
    'players_week', (select count(distinct user_id) from public.ai_press where created_at > now() - interval '7 days'),
    'tokens_week', coalesce((select sum(tokens) from public.ai_press where created_at > now() - interval '7 days'), 0),
    'by_kind', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from public.ai_press where created_at > now() - interval '7 days' group by kind) k), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'outlet', p.outlet, 'headline', p.headline, 'body', p.body, 'player', s.artist_name, 'at', p.created_at) order by p.created_at desc)
      from (select * from public.ai_press where kind <> 'chat' order by created_at desc limit 30) p left join public.saves s on s.user_id = p.user_id), '[]'::jsonb)
  );
end; $$;
revoke execute on function public.admin_press_summary() from public, anon;
grant execute on function public.admin_press_summary() to authenticated;
