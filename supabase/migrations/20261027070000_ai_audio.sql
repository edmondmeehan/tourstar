create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('song', 'intro', 'mo')),
  cache_key text unique,
  path text,
  status text not null default 'ok' check (status in ('ok', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists ai_generations_user_day on public.ai_generations (user_id, created_at desc);
alter table public.ai_generations enable row level security;
drop policy if exists "Admins read ai generations" on public.ai_generations;
create policy "Admins read ai generations" on public.ai_generations for select to authenticated using (public.is_admin());

insert into storage.buckets (id, name, public) values ('ai-audio', 'ai-audio', true) on conflict (id) do nothing;

insert into public.app_public_config (key, value) values
  ('ai_music_enabled', 'false'),
  ('ai_voice_enabled', 'false'),
  ('ai_music_daily_limit', '3')
on conflict (key) do nothing;
