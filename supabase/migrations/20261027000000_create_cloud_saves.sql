-- Applied to project vtpgrxavyspadmubfwtb on 2026-10-27. Kept here for reference / new environments.
create table public.saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  career jsonb,
  settings jsonb,
  membership jsonb,
  artist_name text generated always as (career->>'name') stored,
  fame bigint generated always as (coalesce((career->'stats'->>'fame')::bigint, 0)) stored,
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.saves enable row level security;
create policy "Players read their own save" on public.saves for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players create their own save" on public.saves for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Players update their own save" on public.saves for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Players delete their own save" on public.saves for delete to authenticated using ((select auth.uid()) = user_id);
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger saves_touch before update on public.saves for each row execute function public.touch_updated_at();
