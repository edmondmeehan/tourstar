-- Referrals that actually pay out.
-- 1) Waitlist invite rewards (1 friend = 500 points, 3 = Founding Fan badge + 1,500 points, 10 = 5 raffle tickets)
--    land on the TourStar account that signs in with the same confirmed email.
-- 2) Player invites: every player gets an invite code. When a friend enters it on a new account and plays
--    their first show, the inviter gets 300 points and the friend gets 200 (up to 20 paid invites per player).
-- Every grant is recorded once in referral_rewards, so nothing can be claimed twice.

create table if not exists public.referral_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  points int not null default 0,
  tickets int not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.referral_rewards enable row level security;
drop policy if exists "own referral rewards" on public.referral_rewards;
create policy "own referral rewards" on public.referral_rewards for select to authenticated using (user_id = (select auth.uid()));

create table if not exists public.player_invites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique default public.waitlist_new_code(),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists player_invites_invited_by on public.player_invites (invited_by);
alter table public.player_invites enable row level security;
drop policy if exists "own invite" on public.player_invites;
create policy "own invite" on public.player_invites for select to authenticated using (user_id = (select auth.uid()));

-- Bonus raffle tickets come from referral rewards and cost no points.
alter table public.raffle_entries drop constraint if exists raffle_entries_source_check;
alter table public.raffle_entries add constraint raffle_entries_source_check check (source in ('points', 'free', 'bonus'));

/** Grant once. Points go on the server-side adjustment (players can't write it). Needs a synced save first. */
create or replace function public.referral_grant(p_user uuid, p_key text, p_points int, p_tickets int, p_note text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_points > 0 and not exists (select 1 from public.saves where user_id = p_user) then return false; end if;
  insert into public.referral_rewards (user_id, key, points, tickets, note) values (p_user, p_key, greatest(p_points, 0), greatest(p_tickets, 0), p_note)
    on conflict do nothing;
  if not found then return false; end if;
  if p_points > 0 then
    perform set_config('tourstar.admin_write', 'on', true);
    update public.saves set points_adjust = points_adjust + p_points where user_id = p_user;
    perform set_config('tourstar.admin_write', 'off', true);
  end if;
  return true;
end; $$;
revoke all on function public.referral_grant(uuid, text, int, int, text) from public, anon, authenticated;

create or replace function public.bonus_tickets_left(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  select greatest(0, coalesce((select sum(tickets) from public.referral_rewards where user_id = p_user), 0)
    - coalesce((select sum(tickets) from public.raffle_entries where user_id = p_user and source = 'bonus'), 0))::int;
$$;
revoke all on function public.bonus_tickets_left(uuid) from public, anon, authenticated;

/** Waitlist rewards for the signed-in player (matched by confirmed email). Safe to call on every launch. */
create or replace function public.claim_waitlist_rewards()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_refs int;
  v_new jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('granted', v_new); end if;
  select referral_count into v_refs from public.waitlist where lower(email) = v_email;
  if v_refs is null then return jsonb_build_object('granted', v_new); end if;
  if v_refs >= 1 and public.referral_grant(v_uid, 'waitlist:1', 500, 0, 'Waitlist invite reward: 1 friend') then
    v_new := v_new || jsonb_build_array('+500 ⭐ for inviting a friend to the waitlist');
  end if;
  if v_refs >= 3 and public.referral_grant(v_uid, 'waitlist:3', 1500, 0, 'Waitlist invite reward: 3 friends') then
    insert into public.drop_purchases (user_id, drop_id, drop_name, price_gold, items)
      values (v_uid, null, 'Founding Fan', 0, '[{"type":"badge","emoji":"🎟️","name":"Founding Fan"}]'::jsonb);
    v_new := v_new || jsonb_build_array('🎟️ Founding Fan badge + 1,500 ⭐');
  end if;
  if v_refs >= 10 and public.referral_grant(v_uid, 'waitlist:10', 0, 5, 'Waitlist invite reward: 10 friends') then
    v_new := v_new || jsonb_build_array('5 bonus raffle tickets');
  end if;
  return jsonb_build_object('granted', v_new, 'referrals', v_refs);
end; $$;
revoke all on function public.claim_waitlist_rewards() from public, anon;
grant execute on function public.claim_waitlist_rewards() to authenticated;

/** The signed-in player's invite code and how their invites are doing. */
create or replace function public.my_invite()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_row public.player_invites; v_days int;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  insert into public.player_invites (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into v_row from public.player_invites where user_id = v_uid;
  select floor(extract(epoch from now() - created_at) / 86400)::int into v_days from auth.users where id = v_uid;
  return jsonb_build_object(
    'code', v_row.code,
    'invited_by', v_row.invited_by is not null,
    'can_enter_code', v_row.invited_by is null and coalesce(v_days, 0) < 7,
    'joined', (select count(*) from public.player_invites where invited_by = v_uid),
    'rewarded', (select count(*) from public.player_invites where invited_by = v_uid and rewarded_at is not null),
    'points', coalesce((select sum(points) from public.referral_rewards where user_id = v_uid), 0),
    'bonus_tickets', public.bonus_tickets_left(v_uid));
end; $$;
revoke all on function public.my_invite() from public, anon;
grant execute on function public.my_invite() to authenticated;

/** A new player enters a friend's code (accounts under 7 days old, once). */
create or replace function public.claim_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_inviter uuid; v_days int;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select user_id into v_inviter from public.player_invites where code = lower(trim(p_code));
  if v_inviter is null then raise exception 'That invite code doesn''t exist.'; end if;
  if v_inviter = v_uid then raise exception 'That''s your own code.'; end if;
  select floor(extract(epoch from now() - created_at) / 86400)::int into v_days from auth.users where id = v_uid;
  if coalesce(v_days, 0) >= 7 then raise exception 'Invite codes only work in your first week.'; end if;
  insert into public.player_invites (user_id) values (v_uid) on conflict (user_id) do nothing;
  if exists (select 1 from public.player_invites where user_id = v_uid and invited_by is not null) then raise exception 'You already used an invite code.'; end if;
  if exists (select 1 from public.player_invites where user_id = v_inviter and invited_by = v_uid) then raise exception 'You invited them, so you can''t use their code.'; end if;
  update public.player_invites set invited_by = v_inviter, invited_at = now() where user_id = v_uid;
  perform public.invite_settle(v_uid);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

/** Pay an invite once the invited player has played a show: 300 to the inviter (max 20 paid), 200 to the friend. */
create or replace function public.invite_settle(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv public.player_invites; v_gigs int; v_paid int;
begin
  select * into v_inv from public.player_invites where user_id = p_user;
  if v_inv.invited_by is null or v_inv.rewarded_at is not null then return; end if;
  select coalesce((career->'totals'->>'gigs')::int, 0) into v_gigs from public.saves where user_id = p_user;
  if coalesce(v_gigs, 0) < 1 then return; end if;
  update public.player_invites set rewarded_at = now() where user_id = p_user;
  perform public.referral_grant(p_user, 'invited', 200, 0, 'Joined with a friend''s invite');
  select count(*) into v_paid from public.referral_rewards where user_id = v_inv.invited_by and key like 'invite:%';
  if v_paid < 20 then
    perform public.referral_grant(v_inv.invited_by, 'invite:' || p_user, 300, 0, 'A friend you invited played their first show');
  end if;
end; $$;
revoke all on function public.invite_settle(uuid) from public, anon, authenticated;

create or replace function public.saves_invite_settle() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce((new.career->'totals'->>'gigs')::int, 0) >= 1
     and exists (select 1 from public.player_invites where user_id = new.user_id and invited_by is not null and rewarded_at is null) then
    perform public.invite_settle(new.user_id);
  end if;
  return null;
end; $$;
drop trigger if exists saves_invite_settle on public.saves;
create trigger saves_invite_settle after insert or update of career on public.saves
  for each row execute function public.saves_invite_settle();

/** Put bonus tickets into an open raffle (all you have, within the raffle's per-player limit). */
create or replace function public.use_bonus_tickets(p_raffle uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_r public.raffles; v_left int; v_have int; v_n int; v_level int;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  perform pg_advisory_xact_lock(hashtext('points:' || v_uid::text));
  select * into v_r from public.raffles where id = p_raffle;
  if not found or v_r.status <> 'open' or now() < v_r.starts_at or now() >= v_r.ends_at then raise exception 'This raffle isn''t open.'; end if;
  select coalesce((career->>'peakLevel')::int, 1) into v_level from public.saves where user_id = v_uid;
  if coalesce(v_level, 1) < v_r.min_level then raise exception 'Reach level % to enter.', v_r.min_level; end if;
  v_left := public.bonus_tickets_left(v_uid);
  if v_left < 1 then raise exception 'No bonus tickets left.'; end if;
  select coalesce(sum(tickets), 0) into v_have from public.raffle_entries where raffle_id = p_raffle and user_id = v_uid;
  v_n := case when v_r.max_tickets_per_user is null then v_left else least(v_left, v_r.max_tickets_per_user - v_have) end;
  if v_n < 1 then raise exception 'You already hold the most tickets allowed for this raffle.'; end if;
  insert into public.raffle_entries (raffle_id, user_id, tickets, source, cost_points) values (p_raffle, v_uid, v_n, 'bonus', 0);
  return jsonb_build_object('entered', v_n, 'left', v_left - v_n);
end; $$;
revoke all on function public.use_bonus_tickets(uuid) from public, anon;
grant execute on function public.use_bonus_tickets(uuid) to authenticated;

/** Admin: player invite totals. */
create or replace function public.admin_invite_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'codes_used', (select count(*) from public.player_invites where invited_by is not null),
    'paid', (select count(*) from public.player_invites where rewarded_at is not null),
    'points_granted', coalesce((select sum(points) from public.referral_rewards), 0),
    'waitlist_rewards', (select count(*) from public.referral_rewards where key like 'waitlist:%'),
    'top', coalesce((select jsonb_agg(t) from (
      select coalesce(max(s.artist_name), 'Player') as name, count(*) as invites
      from public.player_invites i left join public.saves s on s.user_id = i.invited_by
      where i.invited_by is not null group by i.invited_by order by count(*) desc limit 10) t), '[]'::jsonb));
end; $$;
revoke all on function public.admin_invite_stats() from public, anon;
grant execute on function public.admin_invite_stats() to authenticated;
