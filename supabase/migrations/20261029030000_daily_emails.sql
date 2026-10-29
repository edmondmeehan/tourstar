-- Daily emails: the admin report (opt-in per admin) and win-back emails for players who stop playing.
-- A daily cron job calls the daily-jobs edge function with a secret header.

-- Settings (admin-only table). Both start off.
insert into public.admin_settings (key, value) values
  ('daily_report', '{"enabled": false}'::jsonb),
  ('winback', '{"enabled": false, "max_per_day": 300}'::jsonb)
on conflict (key) do nothing;

-- Which admins want the report.
alter table public.admins add column if not exists daily_report boolean not null default false;

create or replace function public.admin_set_daily_report(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  update public.admins set daily_report = p_on where user_id = auth.uid();
end; $$;
revoke execute on function public.admin_set_daily_report(boolean) from public, anon;
grant execute on function public.admin_set_daily_report(boolean) to authenticated;

create or replace function public.admin_my_daily_report() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select daily_report from public.admins where user_id = auth.uid()), false);
$$;
revoke execute on function public.admin_my_daily_report() from public, anon;
grant execute on function public.admin_my_daily_report() to authenticated;

-- Player email preferences (win-back reminders are on unless the player turns them off).
create table if not exists public.player_email_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  winback boolean not null default true,
  unsub_token uuid not null default gen_random_uuid() unique,
  winback_stage int not null default 0,
  winback_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.player_email_prefs enable row level security;
drop policy if exists "Players read their email prefs" on public.player_email_prefs;
create policy "Players read their email prefs" on public.player_email_prefs for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.set_winback_emails(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  insert into public.player_email_prefs (user_id, winback) values (auth.uid(), p_on)
  on conflict (user_id) do update set winback = p_on, updated_at = now();
end; $$;
revoke execute on function public.set_winback_emails(boolean) from public, anon;
grant execute on function public.set_winback_emails(boolean) to authenticated;

-- One-click unsubscribe from the email link (no sign-in needed; the token is the proof).
create or replace function public.player_email_unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.player_email_prefs set winback = false, updated_at = now() where unsub_token = p_token;
  return found;
end; $$;
revoke execute on function public.player_email_unsubscribe(uuid) from public;
grant execute on function public.player_email_unsubscribe(uuid) to anon, authenticated;

-- Players due a win-back email: away 3, 7 or 14 days (by their last cloud save), one email per stage,
-- stages reset when they come back. Server only.
create or replace function public.winback_batch(p_limit int) returns table (
  user_id uuid, email text, artist text, stage int, days int, unsub_token uuid, career jsonb
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select s.user_id, u.email, coalesce(nullif(trim(s.artist_name), ''), 'your artist') as artist, s.career,
      floor(extract(epoch from (now() - s.updated_at)) / 86400)::int as days,
      p.winback, p.winback_stage, p.winback_at, s.updated_at
    from public.saves s
    join auth.users u on u.id = s.user_id
    left join public.player_email_prefs p on p.user_id = s.user_id
    where u.email is not null
      and u.email_confirmed_at is not null
      and s.updated_at < now() - interval '3 days' and s.updated_at > now() - interval '30 days'
      and coalesce(p.winback, true)
      and not exists (select 1 from public.admins a where a.user_id = s.user_id)
  ), staged as (
    select b.*,
      case when b.days >= 14 then 3 when b.days >= 7 then 2 else 1 end as due,
      case when b.winback_at is null or b.winback_at < b.updated_at then 0 else coalesce(b.winback_stage, 0) end as sent
    from base b
  )
  select st.user_id, st.email, st.artist, st.due, st.days,
    coalesce((select p.unsub_token from public.player_email_prefs p where p.user_id = st.user_id), '00000000-0000-0000-0000-000000000000'::uuid),
    st.career
  from staged st
  where st.due > st.sent
  order by st.days
  limit greatest(0, least(p_limit, 1000));
$$;
revoke execute on function public.winback_batch(int) from public, anon, authenticated;
grant execute on function public.winback_batch(int) to service_role;

-- Record a sent win-back email (and make sure the player has an unsubscribe token). Returns the token.
create or replace function public.winback_mark(p_user uuid, p_stage int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  insert into public.player_email_prefs (user_id, winback_stage, winback_at) values (p_user, p_stage, now())
  on conflict (user_id) do update set winback_stage = p_stage, winback_at = now(), updated_at = now()
  returning unsub_token into v;
  return v;
end; $$;
revoke execute on function public.winback_mark(uuid, int) from public, anon, authenticated;
grant execute on function public.winback_mark(uuid, int) to service_role;

-- The numbers for the admin report: last 24 hours vs the 24 before. Server only.
create or replace function public.daily_report_data() returns jsonb
language sql stable security definer set search_path = '' as $$
  with w as (select now() - interval '24 hours' as a, now() - interval '48 hours' as b)
  select jsonb_build_object(
    'signups', (select count(*) from auth.users, w where created_at > w.a),
    'signups_prev', (select count(*) from auth.users, w where created_at > w.b and created_at <= w.a),
    'players_total', (select count(*) from public.saves),
    'active', (select count(*) from public.saves, w where updated_at > w.a),
    'active_prev', (select count(*) from public.saves, w where updated_at > w.b and updated_at <= w.a),
    'active_7d', (select count(*) from public.saves where updated_at > now() - interval '7 days'),
    'waitlist', (select count(*) from public.waitlist, w where created_at > w.a),
    'waitlist_total', (select count(*) from public.waitlist),
    'revenue', coalesce((select sum(price_usd) from public.revenue_events, w where at > w.a and coalesce(environment, 'PRODUCTION') <> 'SANDBOX' and type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE')), 0),
    'revenue_prev', coalesce((select sum(price_usd) from public.revenue_events, w where at > w.b and at <= w.a and coalesce(environment, 'PRODUCTION') <> 'SANDBOX' and type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE')), 0),
    'purchases', (select count(*) from public.revenue_events, w where at > w.a and coalesce(environment, 'PRODUCTION') <> 'SANDBOX' and type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE')),
    'refunds', (select count(*) from public.revenue_events, w where at > w.a and type in ('CANCELLATION', 'REFUND')),
    'vip_active', (select count(*) from public.player_perks where vip_until > now()),
    'merch_orders', (select count(*) from public.merch_orders, w where created_at > w.a),
    'merch_revenue', coalesce((select sum(total) from public.merch_orders, w where created_at > w.a), 0),
    'gold_spent', coalesce((select sum(price_gold) from public.drop_purchases, w where created_at > w.a), 0),
    'ai_songs', (select count(*) from public.ai_generations, w where kind = 'song' and status = 'ok' and created_at > w.a),
    'press', (select count(*) from public.ai_press, w where created_at > w.a),
    'press_tokens', coalesce((select sum(tokens) from public.ai_press, w where created_at > w.a), 0),
    'redemptions_pending', (select count(*) from public.reward_redemptions where status = 'pending'),
    'radio_reports', (select count(*) from public.radio_reports, w where created_at > w.a),
    'flagged', (select count(*) from public.saves, w where flagged_at > w.a),
    'top', coalesce((select jsonb_agg(jsonb_build_object('artist', artist_name, 'fame', fame) order by fame desc) from (select artist_name, fame from public.saves where artist_name is not null order by fame desc nulls last limit 3) t), '[]'::jsonb)
  );
$$;
revoke execute on function public.daily_report_data() from public, anon, authenticated;
grant execute on function public.daily_report_data() to service_role;

-- Last runs, for the admin page.
create table if not exists public.daily_job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  sent int not null default 0,
  detail text not null default '',
  created_at timestamptz not null default now()
);
alter table public.daily_job_runs enable row level security;
drop policy if exists "Admins read job runs" on public.daily_job_runs;
create policy "Admins read job runs" on public.daily_job_runs for select to authenticated using (public.is_admin());

-- Shared secret between the cron job and the edge function.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'cron_secret', 'Daily jobs cron → edge function');
  end if;
end $$;

create or replace function public.cron_secret_ok(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = p);
$$;
revoke execute on function public.cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.cron_secret_ok(text) to service_role;

-- Schedule: every day at 13:00 UTC (9 AM New York in summer, 8 AM in winter).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.run_daily_jobs() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://vtpgrxavyspadmubfwtb.supabase.co/functions/v1/daily-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$;
revoke execute on function public.run_daily_jobs() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('tourstar-daily') where exists (select 1 from cron.job where jobname = 'tourstar-daily');
  perform cron.schedule('tourstar-daily', '0 13 * * *', 'select public.run_daily_jobs()');
end $$;
