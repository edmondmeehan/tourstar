-- Applied 2026-10-27. Admin RPCs + execute permissions (see admin_tools for tables).
revoke execute on function public.admin_add(text), public.admin_remove(text), public.claim_admin_invite(), public.is_admin() from public, anon;
grant execute on function public.admin_add(text), public.admin_remove(text), public.claim_admin_invite(), public.is_admin() to authenticated;
-- admin_insights(p_days), admin_players(p_search, p_limit), admin_list(): see project database for full definitions
-- (created via SQL on 2026-10-27; each raises 'not authorized' unless public.is_admin()).
