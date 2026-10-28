create or replace function public.admin_level_pace(p_days int default 90) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return coalesce((
    with starts as (
      select device_id, min(created_at) as started from public.analytics_events
      where name = 'career_created' group by device_id
    ),
    ups as (
      select (e.props->>'level')::int as level,
             coalesce((e.props->>'days')::numeric, extract(epoch from e.created_at - s.started) / 86400.0) as days,
             nullif(e.props->>'gigs', '')::int as gigs
      from public.analytics_events e
      left join starts s on s.device_id = e.device_id
      where e.name = 'level_up' and e.created_at > now() - make_interval(days => greatest(1, least(p_days, 3650)))
        and (e.props->>'level') ~ '^[0-9]+$'
    )
    select jsonb_object_agg(level, jsonb_build_object(
      'players', n, 'median', med, 'p25', p25, 'p75', p75, 'gigs', g
    ))
    from (
      select level, count(*) as n,
        round(percentile_cont(0.5) within group (order by days)::numeric, 2) as med,
        round(percentile_cont(0.25) within group (order by days)::numeric, 2) as p25,
        round(percentile_cont(0.75) within group (order by days)::numeric, 2) as p75,
        round(percentile_cont(0.5) within group (order by gigs)::numeric) as g
      from ups where days is not null and days >= 0 group by level
    ) x
  ), '{}'::jsonb);
end; $$;
revoke execute on function public.admin_level_pace(int) from public, anon;
grant execute on function public.admin_level_pace(int) to authenticated;
