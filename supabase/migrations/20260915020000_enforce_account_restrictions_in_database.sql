-- Banning an account did not stop it writing.
--
-- getMobileAuth blocks a suspended (2), banned (3) or deleted (4) account
-- from every /api/mobile route, and setUserStatusCore revokes their Supabase
-- sessions. But mobile deliberately writes a large part of the app straight
-- to PostgREST under RLS ("class-A" writes — see
-- docs/architecture/shared-backend.md), and none of those policies look at
-- status_id. Nor does send_message, which is EXECUTE-able by `authenticated`
-- and checks participation, conversation state, blocks and rate limits but
-- not whether the sender is banned.
--
-- Verified against production with a real banned account still holding its
-- pre-ban JWT: POST /rest/v1/place_review returned 201 and the review landed
-- status 'approved', immediately public. The mobile API refused the same
-- account with 403 on every route. So banning stopped the half of the app
-- that goes through the API and left the half that does not — including
-- reviews and direct messages, which are the two things accounts get banned
-- for in the first place.
--
-- Session revocation is not a substitute: it closes the window only once the
-- existing JWT expires, and it does nothing about a token already in flight.
--
-- The fix puts the check where every path has to pass through it. A restricted
-- account can still read, and can still be un-restricted; it simply cannot
-- create or change anything other people see, request anything from staff, or
-- change where money would be sent.

-- Restricted = suspended, banned or deleted. Same three the API gate uses.
create or replace function public.account_is_restricted()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_info ui
    where ui.id = (select auth.uid())
      and ui.status_id in (2, 3, 4)
  );
$$;

-- Neither function is meant to be callable by a client: the trigger runs as
-- the table owner when it fires, and the helper is only ever called from
-- inside it. Leaving EXECUTE open would make them directly callable SECURITY
-- DEFINER functions for anon and authenticated, which the database linter
-- flags and which is a real (if small) surface of its own.
revoke all on function public.account_is_restricted() from public, anon, authenticated;
grant execute on function public.account_is_restricted() to service_role;

create or replace function public.guard_restricted_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role, pg_cron jobs and migrations have no auth.uid(); they must
  -- never be blocked, or moderation and the ban itself would break.
  if (select auth.uid()) is null then
    return new;
  end if;

  if public.account_is_restricted() then
    raise exception 'Your account has been restricted.' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Attach to everything a person can write as themselves that either becomes
-- visible to someone else, asks something of staff, or decides where money
-- goes. Deliberately NOT attached to private-to-the-user rows (drafts,
-- favourites, device tokens, notification read-state): blocking those
-- changes nothing for anyone else and only produces confusing failures.
do $$
declare
  t text;
  guarded text[] := array[
    -- public content
    'place_review', 'event_review', 'review',
    'place_review_photo', 'event_review_photo',
    'highlight', 'story',
    'place', 'place_photo', 'place_service', 'place_opening_hours',
    'event', 'event_occurrence', 'event_media', 'ticket_type', 'promo_code',
    -- messages and reactions other people see
    'message', 'message_reaction',
    -- requests aimed at staff or another person
    'place_booking', 'place_claim_request', 'place_claim_document',
    'report', 'report_attachment',
    -- the name and picture everyone else sees
    'user_info',
    -- where money would be sent
    'payout_account', 'receiving_account'
  ];
begin
  foreach t in array guarded loop
    execute format(
      'drop trigger if exists guard_restricted_account_trg on public.%I', t);
    execute format(
      'create trigger guard_restricted_account_trg
         before insert or update on public.%I
         for each row execute function public.guard_restricted_account()', t);
  end loop;
end;
$$;

revoke all on function public.guard_restricted_account() from public, anon, authenticated;
