-- Integrations: API keys managed from /admin → Integrations.
--  * Public keys (meant to ship in the app, e.g. RevenueCat's appl_/goog_ SDK keys) live in
--    app_public_config, readable by everyone, writable by admins.
--  * Secret keys (Resend, Anthropic, ElevenLabs, Replicate, RevenueCat secret…) live encrypted in
--    Supabase Vault. Admins can set/replace/remove them but only ever see the last 4 characters.
--    Only server code (edge functions using the service role) can read them, via get_secret().

-- ---------------------------------------------------------------- public config
create table if not exists public.app_public_config (
  key text primary key check (key ~ '^[a-z0-9_]{3,60}$'),
  value text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.app_public_config enable row level security;
drop policy if exists "Anyone reads public config" on public.app_public_config;
create policy "Anyone reads public config" on public.app_public_config for select to anon, authenticated using (true);
drop policy if exists "Admins write public config" on public.app_public_config;
create policy "Admins write public config" on public.app_public_config for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.app_public_config (key, value) values ('revenuecat_ios_public', 'appl_IocIJOYqgyppYgvNABaStuisdWe')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------------------------------------------------------------- secrets (Vault)
create table if not exists public.integration_secrets (
  name text primary key check (name ~ '^[a-z0-9_]{3,60}$'),
  vault_id uuid not null,
  last4 text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  last_test_ok boolean,
  last_test_at timestamptz,
  last_test_message text
);
alter table public.integration_secrets enable row level security;
-- No direct access for anyone; admins go through the functions below.

create or replace function public.admin_list_secrets()
returns table (name text, last4 text, updated_at timestamptz, last_test_ok boolean, last_test_at timestamptz, last_test_message text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query select s.name, s.last4, s.updated_at, s.last_test_ok, s.last_test_at, s.last_test_message
    from public.integration_secrets s order by s.name;
end; $$;

create or replace function public.admin_set_secret(p_name text, p_value text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_value text := trim(p_value);
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_name !~ '^[a-z0-9_]{3,60}$' then raise exception 'Invalid key name.'; end if;
  if char_length(v_value) < 8 or char_length(v_value) > 4000 then raise exception 'That doesn''t look like an API key.'; end if;
  select vault_id into v_id from public.integration_secrets where name = p_name;
  if v_id is null then
    v_id := vault.create_secret(v_value, 'tourstar_' || p_name, 'TourStar integration key (managed in /admin)');
  else
    perform vault.update_secret(v_id, v_value);
  end if;
  insert into public.integration_secrets (name, vault_id, last4, updated_at, updated_by, last_test_ok, last_test_at, last_test_message)
  values (p_name, v_id, right(v_value, 4), now(), auth.uid(), null, null, null)
  on conflict (name) do update set vault_id = excluded.vault_id, last4 = excluded.last4, updated_at = now(),
    updated_by = auth.uid(), last_test_ok = null, last_test_at = null, last_test_message = null;
  return right(v_value, 4);
end; $$;

create or replace function public.admin_delete_secret(p_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  delete from public.integration_secrets where name = p_name returning vault_id into v_id;
  if v_id is not null then delete from vault.secrets where id = v_id; end if;
end; $$;

-- Server-only: edge functions (service role) read a key by name.
create or replace function public.get_secret(p_name text)
returns text language sql stable security definer set search_path = '' as $$
  select d.decrypted_secret from public.integration_secrets s join vault.decrypted_secrets d on d.id = s.vault_id where s.name = p_name;
$$;

-- Server-only: record a key test result.
create or replace function public.record_secret_test(p_name text, p_ok boolean, p_message text)
returns void language sql security definer set search_path = '' as $$
  update public.integration_secrets set last_test_ok = p_ok, last_test_at = now(), last_test_message = left(p_message, 300) where name = p_name;
$$;

revoke execute on function public.admin_list_secrets(), public.admin_set_secret(text, text), public.admin_delete_secret(text) from public, anon;
grant execute on function public.admin_list_secrets(), public.admin_set_secret(text, text), public.admin_delete_secret(text) to authenticated;
revoke execute on function public.get_secret(text), public.record_secret_test(text, boolean, text) from public, anon, authenticated;
grant execute on function public.get_secret(text), public.record_secret_test(text, boolean, text) to service_role;
