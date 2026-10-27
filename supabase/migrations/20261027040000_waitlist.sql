-- Splash page waitlist (applied to vtpgrxavyspadmubfwtb on 2026-10-27).
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text,
  referrer text,
  created_at timestamptz not null default now()
);
create unique index waitlist_email on public.waitlist (lower(email));
alter table public.waitlist enable row level security;
create policy "Admins read waitlist" on public.waitlist for select to authenticated using (public.is_admin());
create policy "Admins delete waitlist" on public.waitlist for delete to authenticated using (public.is_admin());

-- Join without revealing whether an email is already on the list. Returns the total count.
create or replace function public.join_waitlist(p_email text, p_source text default null, p_referrer text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(p_email));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or char_length(v_email) > 254 then raise exception 'Enter a valid email.'; end if;
  insert into public.waitlist (email, source, referrer) values (v_email, left(p_source, 100), left(p_referrer, 300))
  on conflict ((lower(email))) do nothing;
  return (select count(*)::int from public.waitlist);
end; $$;

create or replace function public.waitlist_count() returns int
language sql stable security definer set search_path = '' as $$ select count(*)::int from public.waitlist; $$;

revoke execute on function public.join_waitlist(text, text, text), public.waitlist_count() from public;
grant execute on function public.join_waitlist(text, text, text), public.waitlist_count() to anon, authenticated;
