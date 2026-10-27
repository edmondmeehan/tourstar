alter table public.waitlist add column if not exists ref_code text;
alter table public.waitlist add column if not exists referred_by uuid references public.waitlist(id) on delete set null;
alter table public.waitlist add column if not exists referral_count int not null default 0;
alter table public.waitlist add column if not exists welcome_sent_at timestamptz;
alter table public.waitlist add column if not exists unsubscribed_at timestamptz;
alter table public.waitlist add column if not exists unsub_token uuid not null default gen_random_uuid();

create or replace function public.waitlist_new_code() returns text
language plpgsql volatile set search_path = '' as $$
declare c text;
begin
  loop
    c := substr(replace(gen_random_uuid()::text, '-', ''), 1, 7);
    exit when char_length(c) = 7 and not exists (select 1 from public.waitlist where ref_code = c);
  end loop;
  return c;
end; $$;

update public.waitlist set ref_code = public.waitlist_new_code() where ref_code is null;
alter table public.waitlist alter column ref_code set not null;
alter table public.waitlist alter column ref_code set default public.waitlist_new_code();
create unique index if not exists waitlist_ref_code on public.waitlist (ref_code);
create index if not exists waitlist_rank on public.waitlist (referral_count desc, created_at asc);

create table if not exists public.waitlist_emails (
  id bigint generated always as identity primary key,
  waitlist_id uuid not null references public.waitlist(id) on delete cascade,
  campaign text not null,
  sent_at timestamptz not null default now(),
  unique (waitlist_id, campaign)
);
alter table public.waitlist_emails enable row level security;
drop policy if exists "Admins read waitlist emails" on public.waitlist_emails;
create policy "Admins read waitlist emails" on public.waitlist_emails for select to authenticated using (public.is_admin());

create table if not exists public.email_campaigns (
  id text primary key,
  subject text not null,
  heading text,
  message text,
  cta_label text,
  cta_url text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.email_campaigns enable row level security;
drop policy if exists "Admins read campaigns" on public.email_campaigns;
create policy "Admins read campaigns" on public.email_campaigns for select to authenticated using (public.is_admin());

drop policy if exists "Admins update waitlist" on public.waitlist;
create policy "Admins update waitlist" on public.waitlist for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.waitlist_position(p_id uuid) returns int
language sql stable security definer set search_path = '' as $$
  select 1 + count(*)::int from public.waitlist o, public.waitlist me
  where me.id = p_id and o.id <> me.id
    and (o.referral_count > me.referral_count or (o.referral_count = me.referral_count and o.created_at < me.created_at));
$$;

create or replace function public.waitlist_join_service(p_email text, p_source text, p_referrer text, p_ref text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_ref public.waitlist;
  v_row public.waitlist;
  v_new boolean := false;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or char_length(v_email) > 254 then raise exception 'Enter a valid email.'; end if;
  select * into v_row from public.waitlist where lower(email) = v_email;
  if not found then
    select * into v_ref from public.waitlist where ref_code = lower(trim(p_ref)) and lower(email) <> v_email;
    insert into public.waitlist (email, source, referrer, ref_code, referred_by)
    values (v_email, left(p_source, 100), left(p_referrer, 300), public.waitlist_new_code(), v_ref.id)
    on conflict ((lower(email))) do nothing
    returning * into v_row;
    if v_row.id is null then
      select * into v_row from public.waitlist where lower(email) = v_email;
    else
      v_new := true;
      if v_ref.id is not null then
        update public.waitlist set referral_count = referral_count + 1 where id = v_ref.id;
      end if;
    end if;
  end if;
  return jsonb_build_object(
    'new', v_new, 'id', v_row.id, 'email', v_row.email, 'code', v_row.ref_code,
    'unsub', v_row.unsub_token, 'unsubscribed', v_row.unsubscribed_at is not null,
    'welcome_sent_at', v_row.welcome_sent_at, 'referrals', v_row.referral_count,
    'position', public.waitlist_position(v_row.id), 'total', (select count(*)::int from public.waitlist),
    'referrer_id', case when v_new then v_ref.id end
  );
end; $$;

create or replace function public.waitlist_status(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code', w.ref_code, 'referrals', w.referral_count,
    'position', public.waitlist_position(w.id), 'total', (select count(*)::int from public.waitlist))
  from public.waitlist w where w.ref_code = lower(trim(p_code));
$$;

create or replace function public.waitlist_unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.waitlist set unsubscribed_at = coalesce(unsubscribed_at, now()) where unsub_token = p_token;
  return found;
end; $$;

create or replace function public.waitlist_batch(p_campaign text, p_limit int)
returns table (id uuid, email text, ref_code text, unsub_token uuid, referral_count int, pos int)
language sql stable security definer set search_path = '' as $$
  with ranked as (
    select w.*, (row_number() over (order by w.referral_count desc, w.created_at asc))::int as pos
    from public.waitlist w
  )
  select r.id, r.email, r.ref_code, r.unsub_token, r.referral_count, r.pos
  from ranked r
  where r.unsubscribed_at is null
    and not exists (select 1 from public.waitlist_emails e where e.waitlist_id = r.id and e.campaign = p_campaign)
  order by r.created_at
  limit greatest(1, least(p_limit, 500));
$$;

create or replace function public.waitlist_campaign_remaining(p_campaign text) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.waitlist w
  where w.unsubscribed_at is null
    and not exists (select 1 from public.waitlist_emails e where e.waitlist_id = w.id and e.campaign = p_campaign);
$$;

revoke execute on function public.waitlist_batch(text, int), public.waitlist_campaign_remaining(text) from public, anon;
grant execute on function public.waitlist_batch(text, int) to service_role;
grant execute on function public.waitlist_campaign_remaining(text) to service_role, authenticated;

revoke execute on function public.waitlist_new_code(), public.waitlist_position(uuid), public.waitlist_join_service(text, text, text, text) from public, anon, authenticated;
grant execute on function public.waitlist_join_service(text, text, text, text) to service_role;
revoke execute on function public.waitlist_status(text), public.waitlist_unsubscribe(uuid) from public;
grant execute on function public.waitlist_status(text), public.waitlist_unsubscribe(uuid) to anon, authenticated;

insert into public.app_public_config (key, value) values
  ('waitlist_welcome_enabled', 'false'),
  ('email_from', 'TourStar <hello@tourstarapp.com>'),
  ('email_reply_to', 'help@please.co')
on conflict (key) do nothing;
