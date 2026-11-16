-- Team accounts: members are 18 or older (legal item K7), and Front desk
-- and Door staff can be limited to some of a team's places (Tickets, entry
-- and teams plan, Part 2; docs/architecture/team-accounts.md §4k).
--
-- 1. Age. The plan: a member under 18 is not allowed while 18 is the
--    minimum for running events or places (K7). Everyone who makes a team,
--    makes their account a team or accepts an invitation says they are 18
--    or older; the service records when (team_member.adult_confirmed_at). A
--    person whose ID check found them under 18 (identity_verification
--    .is_adult = false) cannot become an active member, and one already in
--    a team leaves it when such a result arrives (the team pauses if they
--    were its last Owner, as when an account closes).
-- 2. Places. A team that runs several places (a chain) can limit a Front
--    desk or Door staff member to some of them (team_member_place; none =
--    all the team's places). A limited member's bookings, visit QR and
--    check-in reach only those places (for Door staff: the events held at
--    them): acting_accounts() leaves their team out, and acting_places()
--    gives the access rules their places instead.
--
-- Nothing here is reachable until a team exists (teams ship switched off).

-- ---------------------------------------------------------------------------
-- 1. Age
-- ---------------------------------------------------------------------------

alter table public.team_member
  add column if not exists adult_confirmed_at timestamptz;

comment on column public.team_member.adult_confirmed_at is
  'When the member said they are 18 or older (making the team, making their account a team, accepting the invitation; K7). Null for members who joined before 2026-11-16. Written by the server only.';

create or replace function public.team_member_age_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and exists (
       select 1 from public.identity_verification iv
       where iv.user_id = new.user_id and iv.is_adult is false
     ) then
    perform public._team_fail('under_age');
  end if;
  return new;
end;
$$;

revoke all on function public.team_member_age_guard() from public, anon, authenticated;

drop trigger if exists team_member_age_guard on public.team_member;
create trigger team_member_age_guard
  before insert or update of status on public.team_member
  for each row
  when (new.status = 'active')
  execute function public.team_member_age_guard();

-- An ID check that finds someone under 18 takes them out of every team.
create or replace function public.identity_under_age_leaves_teams()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.team_forget_member(new.user_id, 'under_age');
  return null;
end;
$$;

revoke all on function public.identity_under_age_leaves_teams() from public, anon, authenticated;

drop trigger if exists identity_under_age_leaves_teams on public.identity_verification;
create trigger identity_under_age_leaves_teams
  after insert or update of is_adult on public.identity_verification
  for each row
  when (new.is_adult is false)
  execute function public.identity_under_age_leaves_teams();

-- ---------------------------------------------------------------------------
-- 2. Places for Front desk and Door staff
-- ---------------------------------------------------------------------------

create table if not exists public.team_member_place (
  team_id    uuid not null,
  user_id    uuid not null,
  place_id   uuid not null references public.place (id) on delete cascade,
  added_by   uuid references public.user_info (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id, place_id),
  foreign key (team_id, user_id) references public.team_member (team_id, user_id) on delete cascade
);

comment on table public.team_member_place is
  'The places a Front desk or Door staff member is limited to (none = all the team''s places). Written only by team_member_set_places; cleared when the member leaves or changes role.';

create index if not exists team_member_place_user on public.team_member_place (user_id);
create index if not exists team_member_place_place on public.team_member_place (place_id);

alter table public.team_member_place enable row level security;
revoke all on table public.team_member_place from anon, authenticated;
grant select, insert, update, delete on table public.team_member_place to service_role;

-- Roles a team can limit to places: they only take bookings, show the visit
-- QR and scan tickets.
create or replace function public.team_role_place_limited(p_role text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_role in ('front_desk', 'door');
$$;

create or replace function public.team_member_set_places(
  p_team   uuid,
  p_by     uuid,
  p_user   uuid,
  p_places uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role  text;
  v_count integer;
begin
  perform public._team_require(p_team, p_by, 'team.members');
  select role into v_role from public.team_member
  where team_id = p_team and user_id = p_user and status = 'active'
  for update;
  if v_role is null then
    perform public._team_fail('not_member');
  end if;
  if not public.team_role_place_limited(v_role) then
    perform public._team_fail('role_not_limited');
  end if;
  if exists (
    select 1 from unnest(coalesce(p_places, '{}'::uuid[])) x(id)
    where not exists (select 1 from public.place p where p.id = x.id and p.owner_id = p_team)
  ) then
    perform public._team_fail('place_not_team');
  end if;

  delete from public.team_member_place where team_id = p_team and user_id = p_user;
  insert into public.team_member_place (team_id, user_id, place_id, added_by)
  select distinct p_team, p_user, x.id, p_by
  from unnest(coalesce(p_places, '{}'::uuid[])) x(id);
  get diagnostics v_count = row_count;

  perform public._team_log(p_team, p_by, 'member.places_changed', 'member', p_user::text,
    jsonb_build_object('places', coalesce(to_jsonb(p_places), '[]'::jsonb)));
  return v_count;
end;
$$;

revoke all on function public.team_member_set_places(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.team_member_set_places(uuid, uuid, uuid, uuid[]) to service_role;

-- A member who leaves, or moves to a role that is not limited to places,
-- loses the limit (a new Front desk role starts with all places again).
create or replace function public.team_member_places_follow_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'active' or not public.team_role_place_limited(new.role) then
    delete from public.team_member_place
    where team_id = new.team_id and user_id = new.user_id;
  end if;
  return null;
end;
$$;

revoke all on function public.team_member_places_follow_role() from public, anon, authenticated;

drop trigger if exists team_member_places_follow_role on public.team_member;
create trigger team_member_places_follow_role
  after update of role, status on public.team_member
  for each row
  execute function public.team_member_places_follow_role();

-- The places the signed-in person reaches as a limited member of a team
-- whose role covers one of the capabilities (still the team's places).
create or replace function public.acting_places(p_caps text[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select array_agg(distinct mp.place_id)
    from public.team_member_place mp
    join public.team_member m
      on m.team_id = mp.team_id and m.user_id = mp.user_id and m.status = 'active'
    join public.team t on t.account_id = m.team_id and t.status = 'active'
    join public.place p on p.id = mp.place_id and p.owner_id = mp.team_id
    where mp.user_id = auth.uid()
      and exists (select 1 from unnest(p_caps) c where public.team_role_can(m.role, c))
  ), '{}'::uuid[]);
$$;

revoke all on function public.acting_places(text[]) from public;
grant execute on function public.acting_places(text[]) to anon, authenticated, service_role;

-- From 20261116100000_team_accounts_events_places.sql, with the marked change.
create or replace function public.acting_accounts(p_caps text[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then '{}'::uuid[] else
    array[auth.uid()] || coalesce((
      select array_agg(distinct m.team_id)
      from public.team_member m
      join public.team t on t.account_id = m.team_id
      where m.user_id = auth.uid()
        and m.status = 'active'
        and t.status = 'active'
        and exists (
          select 1 from unnest(p_caps) c where public.team_role_can(m.role, c)
        )
        -- A member limited to some places reaches them through
        -- acting_places(), never the whole team.
        and not exists (
          select 1 from public.team_member_place mp
          where mp.team_id = m.team_id and mp.user_id = m.user_id
        )
    ), '{}'::uuid[])
  end;
$$;

-- From 20261116100000_team_accounts_events_places.sql, with the marked change.
create or replace function public.guard_place_booking_client_write()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      raise exception 'A booking starts as a request' using errcode = '42501';
    end if;
    return new;
  end if;

  if to_jsonb(new) - array['updated_at'] = to_jsonb(old) - array['updated_at'] then
    return new;
  end if;
  if (to_jsonb(new) - array['status', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'Only a booking''s status can change' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.place where id = new.place_id;

  if v_uid = old.customer_id
     and old.status in ('pending', 'accepted') and new.status = 'cancelled' then
    return new;
  end if;
  if (v_owner = any (public.acting_accounts(array['bookings.manage']))
      or new.place_id = any (public.acting_places(array['bookings.manage'])))
     and old.status = 'pending' and new.status in ('accepted', 'declined') then
    return new;
  end if;

  raise exception 'That booking change is not allowed' using errcode = '42501';
end;
$function$;

-- The access rules: a limited member's places, besides the accounts they
-- act for (each array computed once per statement).
drop policy if exists place_booking_select on public.place_booking;
create policy place_booking_select on public.place_booking
  as permissive for select to public
  using (((( SELECT auth.uid() AS uid) = customer_id) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_booking.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['bookings.manage']))::uuid[]))))) OR (place_id = ANY (( SELECT public.acting_places(ARRAY['bookings.manage']))::uuid[]))));

drop policy if exists place_booking_update on public.place_booking;
create policy place_booking_update on public.place_booking
  as permissive for update to public
  using (((( SELECT auth.uid() AS uid) = customer_id) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_booking.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['bookings.manage']))::uuid[]))))) OR (place_id = ANY (( SELECT public.acting_places(ARRAY['bookings.manage']))::uuid[]))))
  with check (((( SELECT auth.uid() AS uid) = customer_id) OR (EXISTS ( SELECT 1
   FROM place p
  WHERE ((p.id = place_booking.place_id) AND (p.owner_id = ANY (( SELECT public.acting_accounts(ARRAY['bookings.manage']))::uuid[]))))) OR (place_id = ANY (( SELECT public.acting_places(ARRAY['bookings.manage']))::uuid[]))));

drop policy if exists ticket_organizer_update on public.ticket;
create policy ticket_organizer_update on public.ticket
  as permissive for update to public
  using ((EXISTS ( SELECT 1
   FROM (ticket_type tt
     JOIN event e ON ((e.id = tt.event_id)))
  WHERE ((tt.id = ticket.ticket_type_id) AND ((e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['checkin.scan']))::uuid[])) OR (e.place_id = ANY (( SELECT public.acting_places(ARRAY['checkin.scan']))::uuid[])))))))
  with check ((EXISTS ( SELECT 1
   FROM (ticket_type tt
     JOIN event e ON ((e.id = tt.event_id)))
  WHERE ((tt.id = ticket.ticket_type_id) AND ((e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['checkin.scan']))::uuid[])) OR (e.place_id = ANY (( SELECT public.acting_places(ARRAY['checkin.scan']))::uuid[])))))));

drop policy if exists ticket_select on public.ticket;
create policy ticket_select on public.ticket
  as permissive for select to public
  using (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM (ticket_type tt
     JOIN event e ON ((e.id = tt.event_id)))
  WHERE ((tt.id = ticket.ticket_type_id) AND ((e.organizer_id = ANY (( SELECT public.acting_accounts(ARRAY['attendees.view', 'checkin.scan']))::uuid[])) OR (e.place_id = ANY (( SELECT public.acting_places(ARRAY['checkin.scan']))::uuid[]))))))));

-- ---------------------------------------------------------------------------
-- 3. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated', 'public.team_member_set_places(uuid, uuid, uuid, uuid[])', 'execute') then
    raise exception 'migration check: clients may set a member''s places';
  end if;
  if not public.team_role_place_limited('door') or public.team_role_place_limited('manager') then
    raise exception 'migration check: place-limited roles';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'team_member_age_guard')
     or not exists (select 1 from pg_trigger where tgname = 'identity_under_age_leaves_teams') then
    raise exception 'migration check: the age guards are missing';
  end if;
end;
$$;
