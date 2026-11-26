-- Claiming a place someone runs is an ownership dispute (2026-11-26; the
-- founder: fix how Abonten invites people to claim a place "in the best
-- possible way").
--
-- Until now every place page invited every visitor to claim the place,
-- including places with a real owner and Verified places. The pages now
-- follow one rule (@abonten/core/placeClaimInvite): a prominent "Claim this
-- place" only where nobody real is behind the place, and a quiet "I own
-- this business" (worded as a dispute) where someone runs it. This
-- migration gives the database the same definitions, for the two things
-- the pages cannot do themselves:
--
--   1. public.place_listed_by_abonten(owner, claimed): the place was put up
--      by Abonten's own staff (its owner is an active admin_user) and
--      nobody has claimed it. The same test as the On Abonten showcase's
--      'not_claimed' (PR #145, _showcase_subject_state), which can call
--      this function once both are in.
--   2. public.place_claim_situation(place, claimant): where a request
--      stands. 'owner' or 'team_member' (the claimant already runs the
--      place), 'owner_deleted' or 'listed_by_abonten' (nobody is behind
--      it), 'dispute' (someone else runs it). A suspended or banned owner
--      is still the owner.
--   3. A guard on new requests (place_claim_request_guard, before insert,
--      every path: the website's action, the app's direct insert, Field
--      Ops claim assistance). It refuses a request from someone who runs
--      the place, and a dispute from someone whose latest request for the
--      same place staff turned down less than 30 days ago (the same person
--      could otherwise file dispute after dispute). The one-pending-request
--      index and the website's hourly limit stay as they were. Nobody is
--      told when a dispute is filed: staff decide whether to contact the
--      current owner (docs/admin/claims.md).
--   4. public.admin_place_claims_page(...): the Admin › Claims list with
--      each waiting request's situation worked out when it is read (no
--      stored column: a request becomes a dispute the moment someone else
--      takes the place), disputes first among the waiting ones, and a
--      disputes-only view. A decided request has no situation; its audit
--      entry says whether it was a dispute.
--
-- Everything here is service-role only. Nothing existing is replaced.

begin;

-- ---------------------------------------------------------------------------
-- 1. Listed by Abonten
-- ---------------------------------------------------------------------------

create or replace function public.place_listed_by_abonten(
  p_owner_id uuid,
  p_claimed  boolean
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not coalesce(p_claimed, false)
     and exists (
       select 1 from public.admin_user au
       where au.user_id = p_owner_id and au.status = 'active'
     );
$$;

comment on function public.place_listed_by_abonten(uuid, boolean) is
  'Whether a place was put up by Abonten''s own staff (owner is an active admin_user) and nobody has claimed it: nobody runs it yet. Mirrors placeStewardship() in @abonten/core/placeClaimInvite. Service role only.';

revoke all on function public.place_listed_by_abonten(uuid, boolean) from public, anon, authenticated;
grant execute on function public.place_listed_by_abonten(uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Where a request stands
-- ---------------------------------------------------------------------------

create or replace function public.place_claim_situation(
  p_place_id    uuid,
  p_claimant_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.id is null then null
           when p.owner_id = p_claimant_id then 'owner'
           when exists (
             select 1 from public.team_member m
             where m.team_id = p.owner_id
               and m.user_id = p_claimant_id
               and m.status = 'active'
           ) then 'team_member'
           when o.id is null or o.status_id = 4 then 'owner_deleted'
           when public.place_listed_by_abonten(p.owner_id, p.claimed) then 'listed_by_abonten'
           else 'dispute'
         end
  from (select 1) as one
  left join public.place p on p.id = p_place_id
  left join public.user_info o on o.id = p.owner_id;
$$;

comment on function public.place_claim_situation(uuid, uuid) is
  'Where a request to claim a place stands, worked out now: owner / team_member (the claimant runs it), owner_deleted / listed_by_abonten (nobody is behind it), dispute (someone else runs it), null (no such place). Mirrors placeClaimInvite() in @abonten/core/placeClaimInvite. Service role only.';

revoke all on function public.place_claim_situation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.place_claim_situation(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The guard on new requests
-- ---------------------------------------------------------------------------

-- The 30 days are DISPUTE_RETRY_DAYS in @abonten/core/placeClaimInvite:
-- change both together. The refusals' messages are codes the website, the
-- app and Field Ops translate (placeClaimRefusal); the date in DETAIL is
-- when the person may ask again.
create or replace function public.place_claim_request_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_situation   text;
  v_last_status text;
  v_last_review timestamptz;
begin
  -- Claims are filed waiting; anything else is staff or a test writing a
  -- decided row.
  if new.status is distinct from 'pending' then
    return new;
  end if;

  v_situation := public.place_claim_situation(new.place_id, new.claimant_id);

  if v_situation in ('owner', 'team_member') then
    raise exception 'place_claim:runs_place' using errcode = 'P0001';
  end if;

  if v_situation = 'dispute' then
    select c.status, c.reviewed_at
      into v_last_status, v_last_review
      from public.place_claim_request c
     where c.place_id = new.place_id
       and c.claimant_id = new.claimant_id
     order by c.created_at desc, c.id desc
     limit 1;
    if v_last_status = 'rejected'
       and v_last_review > now() - interval '30 days' then
      raise exception 'place_claim:dispute_wait' using
        errcode = 'P0001',
        detail = to_char(
          (v_last_review + interval '30 days') at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        );
    end if;
  end if;

  return new;
end;
$$;

comment on function public.place_claim_request_guard() is
  'Before a request to claim a place is filed: refuses one from someone who runs the place, and a dispute from someone whose latest request for it was turned down less than 30 days ago. Trigger only.';

revoke all on function public.place_claim_request_guard() from public, anon, authenticated;

drop trigger if exists place_claim_request_guard on public.place_claim_request;
create trigger place_claim_request_guard
  before insert on public.place_claim_request
  for each row execute function public.place_claim_request_guard();

-- ---------------------------------------------------------------------------
-- 4. The Admin › Claims list
-- ---------------------------------------------------------------------------

-- One page of requests in p_status ('pending', 'approved', 'rejected' or
-- 'all'), newest first; among waiting requests (p_status 'pending')
-- disputes come first (sort_rank 1). The cursor is the last row's
-- (sort_rank, created_at, id). A situation is worked out for waiting
-- requests only: there are few of them, and a decided request has none.
create or replace function public.admin_place_claims_page(
  p_status        text,
  p_disputes_only boolean     default false,
  p_after_rank    integer     default null,
  p_after_created timestamptz default null,
  p_after_id      uuid        default null,
  p_limit         integer     default 25
)
returns table (
  id             uuid,
  status         text,
  place_id       uuid,
  claimant_id    uuid,
  contact_email  text,
  contact_phone  text,
  created_at     timestamptz,
  reviewed_at    timestamptz,
  place_name     text,
  place_slug     text,
  document_count integer,
  situation      text,
  is_dispute     boolean,
  sort_rank      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select c.id, c.status, c.place_id, c.claimant_id, c.contact_email,
           c.contact_phone, c.created_at, c.reviewed_at,
           case when c.status = 'pending'
                then public.place_claim_situation(c.place_id, c.claimant_id)
           end as situation
    from public.place_claim_request c
    where p_status in ('pending', 'approved', 'rejected', 'all')
      and (p_status = 'all' or c.status = p_status)
  ),
  ranked as (
    select cl.*,
           coalesce(cl.situation in ('dispute', 'team_member'), false) as is_dispute,
           case when p_status = 'pending'
                     and cl.situation in ('dispute', 'team_member')
                then 1 else 0
           end as sort_rank
    from claims cl
  )
  select r.id, r.status, r.place_id, r.claimant_id, r.contact_email,
         r.contact_phone, r.created_at, r.reviewed_at,
         p.name, p.slug,
         (select count(*)::integer
            from public.place_claim_document d
           where d.claim_request_id = r.id),
         r.situation, r.is_dispute, r.sort_rank
  from ranked r
  left join public.place p on p.id = r.place_id
  where (not coalesce(p_disputes_only, false) or r.is_dispute)
    and (p_after_created is null
         or (r.sort_rank, r.created_at, r.id)
            < (coalesce(p_after_rank, 0), p_after_created, p_after_id))
  order by r.sort_rank desc, r.created_at desc, r.id desc
  limit greatest(1, least(coalesce(p_limit, 25), 200));
$$;

comment on function public.admin_place_claims_page(text, boolean, integer, timestamptz, uuid, integer) is
  'Admin › Claims: a page of place claim requests with each waiting one''s situation (place_claim_situation) worked out on read, disputes first among the waiting ones. Service role only; the console checks claims.view.';

revoke all on function public.admin_place_claims_page(text, boolean, integer, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_place_claims_page(text, boolean, integer, timestamptz, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Checks
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.place_listed_by_abonten(uuid, boolean)',
    'public.place_claim_situation(uuid, uuid)',
    'public.place_claim_request_guard()',
    'public.admin_place_claims_page(text, boolean, integer, timestamptz, uuid, integer)'
  ] loop
    if has_function_privilege('anon', v_fn, 'execute')
       or has_function_privilege('authenticated', v_fn, 'execute') then
      raise exception 'migration check: % must be service-role only', v_fn;
    end if;
  end loop;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.place_claim_request'::regclass
      and t.tgname = 'place_claim_request_guard'
      and not t.tgisinternal
  ) then
    raise exception 'migration check: the place_claim_request guard is missing';
  end if;
  -- No such place: no situation.
  if public.place_claim_situation(gen_random_uuid(), gen_random_uuid()) is not null then
    raise exception 'migration check: place_claim_situation answered for a missing place';
  end if;
end;
$$;

commit;
