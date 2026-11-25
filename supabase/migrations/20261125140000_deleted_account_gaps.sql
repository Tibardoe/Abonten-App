-- A deleted account, person or team, leaves nothing that still acts for it
-- (2026-11-25; the three gaps recorded in docs/architecture/team-accounts.md
-- §8 the same day, the founder: "go ahead and fix the three gaps").
--
--   1. Its Spotlight posts and Stories come down (status 'deleted', the
--      state an author's own delete uses), unpaid promotion drafts on them
--      end, and their media is queued for destruction on Cloudinary
--      (draft_asset_cleanup_queue, drained by the storage-purge dispatch)
--      when nothing else uses the asset. A post under an open report keeps
--      its media for the usual retention (content_housekeeping), so staff
--      can still look at it. A paid promotion is never ended silently: a
--      running or paid one now stops the deletion (account_deletion_blockers
--      promotions_running / payments_in_progress, as for a team), and a post
--      that still has one (only possible for an account deleted before this
--      migration) stays until staff settle it.
--   2. Its places stay listed and unclaimed (claimed false, badge off, open
--      verification of the place withdrawn and an approved one revoked, as
--      an owner change does) and nobody starts a new conversation with a
--      place whose owner is gone, or with an organizer who is gone
--      (open_conversation). A conversation that already exists still opens,
--      closed, so its history stays readable. The place can be claimed again.
--   3. Its follows of other accounts go too (follows OF it already did).
--
-- The new public._deleted_account_cleanup(account) holds steps 1 and 2 and
-- the follow, alert and conversation clean-up that anonymize_deleted_account
-- did itself since 20261125100000; anonymize_deleted_account now calls it,
-- and this migration runs it once for every account already deleted, so
-- they are covered too. It is idempotent: a second run changes nothing.
--
-- How a review, comment or conversation names a deleted author ("Former
-- Abonten member", no handle, the default picture) is decided in code
-- (@abonten/core/reviews/reviewAuthor, personName); no SQL change.

begin;

-- ---------------------------------------------------------------------------
-- 0. What this migration was written against
-- ---------------------------------------------------------------------------
-- Replaced: anonymize_deleted_account, account_deletion_blockers,
-- open_conversation. Called: verification_transition,
-- content_campaign_transition (production's copy lacks one comment line,
-- "Not yet due: the admin asked for "active" but it is a schedule."; the
-- code is the same, so either fingerprint is accepted) and
-- team_deletion_blockers (reads account_deletion_blockers' keys by name; the
-- new keys are additions).

do $$
declare
  v_expected constant jsonb := jsonb_build_object(
    'anonymize_deleted_account',   '723374ecad9522c92c852cf3776dfbc3',
    'account_deletion_blockers',   '9bca40758a01e6902bcf419e103a4ac1',
    'open_conversation',           '632357352564bbbfe715ae1a0f2e8ac1',
    'verification_transition',     '8ba0ed97251788f8f2b7d931dd3aab41',
    'content_campaign_transition', 'ab12c306d227fe61a9a80da805789394,67e7d7f6ef8e01f13070efd1f9a9e410',
    'team_deletion_blockers',      'c901a4ee73a56c22d70b3db989d204b4'
  );
  v_name text;
begin
  for v_name in select jsonb_object_keys(v_expected) loop
    if not exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name
        and md5(replace(p.prosrc, E'\r', '')) = any (string_to_array(v_expected ->> v_name, ','))
    ) then
      raise exception 'deleted account gaps: public.% is not the definition this migration expects', v_name;
    end if;
  end loop;
  if to_regprocedure('public._deleted_account_cleanup(uuid)') is not null then
    raise exception 'migration 20261125140000: _deleted_account_cleanup already exists';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. What a deleted account leaves behind, cleared
-- ---------------------------------------------------------------------------
-- Runs inside anonymize_deleted_account (before the profile is scrubbed,
-- while a team is still active, so verification_transition's team checks
-- pass) and once below for the accounts deleted before this migration.

create or replace function public._deleted_account_cleanup(p_account uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_campaigns_cancelled integer := 0;
  v_posts_removed       integer := 0;
  v_posts_kept          integer := 0;
  v_media_queued        integer := 0;
  v_media_kept          integer := 0;
  v_place_cases_closed  integer := 0;
  v_places_unclaimed    integer := 0;
  v_follows_removed     integer := 0;
  v_follows_by_removed  integer := 0;
  v_alerts_ended        integer := 0;
  v_conversations_closed integer := 0;
begin
  -- Spotlight posts and Stories. An unpaid promotion draft on one ends: no
  -- money moved, and the system may cancel a draft.
  for r in
    select c.id
    from public.content_campaign c
    join public.content_post p on p.id = c.post_id
    where p.author_id = p_account and c.status = 'draft'
  loop
    perform public.content_campaign_transition(r.id, 'cancelled', null, 'system', 'account_deleted');
    v_campaigns_cancelled := v_campaigns_cancelled + 1;
  end loop;

  -- A post whose promotion holds or awaits money stays: the deletion is
  -- stopped for those (account_deletion_blockers), and staff settle one of
  -- an account deleted earlier before it comes down.
  with removed as (
    update public.content_post p
       set status = 'deleted',
           deleted_at = coalesce(p.deleted_at, now())
     where p.author_id = p_account
       and p.status in ('draft', 'published', 'archived')
       and not exists (
         select 1 from public.content_campaign c
         where c.post_id = p.id
           and c.status in ('pending_payment', 'payment_confirmed', 'pending_review',
                            'scheduled', 'active', 'paused'))
    returning 1
  )
  select count(*) into v_posts_removed from removed;

  select count(*) into v_posts_kept
  from public.content_post p
  where p.author_id = p_account and p.status <> 'deleted';

  -- Their media goes to the Cloudinary queue now, unless a listing, draft,
  -- gallery photo or avatar uses the same asset (the drain checks again
  -- before destroying, media/assetReferences.isAssetInUse), or the post is
  -- under an open report (then content_housekeeping queues it after the
  -- usual retention, deleted_post_retention_days).
  with due as (
    update public.content_media m
       set status = 'deleted',
           deleted_at = coalesce(m.deleted_at, now())
      from public.content_post p
     where m.post_id = p.id
       and p.author_id = p_account
       and p.status = 'deleted'
       and m.status <> 'deleted'
       and not exists (
         select 1 from public.report rp
         where rp.target_type in ('spotlight', 'story')
           and rp.target_id = p.id
           and rp.status in ('new', 'under_review', 'awaiting_info', 'escalated'))
       and not exists (select 1 from public.event e where e.flyer_public_id = m.public_id)
       and not exists (select 1 from public.event_drafts ed where ed.flyer_public_id = m.public_id)
       and not exists (select 1 from public.place pl where pl.cover_public_id = m.public_id)
       and not exists (select 1 from public.place_drafts pd where pd.cover_public_id = m.public_id)
       and not exists (select 1 from public.place_photo pp where pp.public_id = m.public_id)
       and not exists (select 1 from public.user_info u where u.avatar_public_id = m.public_id)
    returning m.public_id, m.media_type
  ), queued as (
    insert into public.draft_asset_cleanup_queue (public_id, resource_type)
    select d.public_id, d.media_type
    from due d
    where not exists (
      select 1 from public.draft_asset_cleanup_queue q
      where q.public_id = d.public_id and q.status in ('queued', 'sending'))
    returning 1
  )
  select (select count(*) from due) into v_media_queued;

  select count(*) into v_media_kept
  from public.content_media m
  join public.content_post p on p.id = m.post_id
  where p.author_id = p_account and m.status <> 'deleted';

  -- Its places: what an owner change does to verification (withdraw an open
  -- request, revoke an approved one: verification_on_place_owner_change),
  -- then unclaimed with the badge off. The listing stays and can be
  -- claimed again; open_conversation refuses new conversations with it.
  for r in
    select vc.id, vc.status
    from public.verification_case vc
    join public.place pl on pl.id = vc.place_id
    where pl.owner_id = p_account
      and vc.status in ('draft', 'pending_review', 'needs_info', 'approved')
  loop
    begin
      perform public.verification_transition(
        r.id, null, 'system',
        case when r.status = 'approved' then 'revoke' else 'withdraw' end,
        'account_deleted', null);
      v_place_cases_closed := v_place_cases_closed + 1;
    exception when others then
      null;
    end;
  end loop;

  update public.place
     set claimed = false,
         verified = false,
         verified_at = null,
         verification_case_id = null,
         updated_at = now()
   where owner_id = p_account
     and (claimed or verified or verification_case_id is not null);
  get diagnostics v_places_unclaimed = row_count;

  -- Nobody follows or watches an account that is gone, and it follows
  -- nobody (the follower counts follow, trigger trg_follow_count); its
  -- conversations close, so a message is never sent where nobody will read
  -- it.
  delete from public.follow
  where target_kind = 'organizer' and target_id = p_account;
  get diagnostics v_follows_removed = row_count;

  delete from public.follow
  where follower_id = p_account;
  get diagnostics v_follows_by_removed = row_count;

  update public.notification_subscription
     set status = 'unsubscribed', unsubscribed_at = now(), updated_at = now()
   where kind = 'organizer' and target_id = p_account and status <> 'unsubscribed';
  get diagnostics v_alerts_ended = row_count;

  update public.conversation c
     set status = 'closed'
   where c.status = 'open'
     and exists (
       select 1 from public.conversation_participant cp
       where cp.conversation_id = c.id and cp.user_id = p_account);
  get diagnostics v_conversations_closed = row_count;

  return jsonb_build_object(
    'campaigns_cancelled',   v_campaigns_cancelled,
    'posts_removed',         v_posts_removed,
    'posts_kept',            v_posts_kept,
    'media_queued',          v_media_queued,
    'media_kept',            v_media_kept,
    'place_cases_closed',    v_place_cases_closed,
    'places_unclaimed',      v_places_unclaimed,
    'follows_removed',       v_follows_removed,
    'follows_by_removed',    v_follows_by_removed,
    'alerts_ended',          v_alerts_ended,
    'conversations_closed',  v_conversations_closed
  );
end;
$$;

comment on function public._deleted_account_cleanup(uuid) is
  'What a deleted account (person or team) leaves behind, cleared: its Spotlight posts and Stories down with their unshared media queued for Cloudinary, its places unclaimed with their verification closed, follows of and by it removed, alerts on it ended, its conversations closed. Idempotent. Called by anonymize_deleted_account. Service role only.';

-- ---------------------------------------------------------------------------
-- 2. anonymize_deleted_account: the 20261125100000 definition, with the
--    places, follows, alerts and conversations blocks moved into
--    _deleted_account_cleanup (called where the places block was).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.anonymize_deleted_account(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_suffix          text := replace(left(p_user_id::text, 13), '-', '');
  r                 record;
  v_events_cancelled integer := 0;
  v_events_archived  integer := 0;
  v_drafts_deleted   integer := 0;
  v_claims_deleted   integer := 0;
  v_cases_closed     integer := 0;
  v_cleanup          jsonb;
begin
  if not exists (select 1 from public.user_info where id = p_user_id) then
    raise exception 'anonymize_deleted_account: unknown user %', p_user_id;
  end if;

  for r in
    select id, status from public.verification_case
    where requester_id = p_user_id
      and status in ('draft', 'pending_review', 'needs_info', 'approved')
  loop
    begin
      perform public.verification_transition(
        r.id, null, 'system',
        case when r.status = 'approved' then 'revoke' else 'withdraw' end,
        'account_deleted', null);
      v_cases_closed := v_cases_closed + 1;
    exception when others then
      null;
    end;
  end loop;

  insert into public.storage_purge_queue (bucket_id, object_path, reason)
  select 'place-claim-documents', d.storage_path, 'account_deleted'
  from public.place_claim_document d
  join public.place_claim_request cr on cr.id = d.claim_request_id
  where cr.claimant_id = p_user_id and cr.status = 'pending'
  on conflict (bucket_id, object_path) where status in ('queued', 'sending') do nothing;

  delete from public.place_claim_request
  where claimant_id = p_user_id and status = 'pending';
  get diagnostics v_claims_deleted = row_count;

  delete from public.event
  where organizer_id = p_user_id and status = 'draft';
  get diagnostics v_drafts_deleted = row_count;

  update public.event e
     set status = 'canceled'
   where e.organizer_id = p_user_id
     and e.status = 'published'
     and coalesce((select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id), e.ends_at) > now()
     and not exists (
       select 1
       from public.ticket t
       join public.ticket_type tt on tt.id = t.ticket_type_id
       where tt.event_id = e.id and t.status in ('active', 'used'));
  get diagnostics v_events_cancelled = row_count;

  update public.event e
     set archived_at = coalesce(e.archived_at, now())
   where e.organizer_id = p_user_id
     and e.archived_at is null;
  get diagnostics v_events_archived = row_count;

  -- Spotlight and Stories, places, follows, alerts, conversations.
  v_cleanup := public._deleted_account_cleanup(p_user_id);

  delete from public.device_token where user_id = p_user_id;
  delete from public.web_push_subscription where user_id = p_user_id;
  delete from public.favorite where user_id = p_user_id;
  delete from public.favorite_place where user_id = p_user_id;
  delete from public.event_reminder where user_id = p_user_id;
  delete from public.notification where user_id = p_user_id;
  delete from public.notification_preference where user_id = p_user_id;
  delete from public.notification_subscription where user_id = p_user_id;
  delete from public.area_waitlist where user_id = p_user_id;
  delete from public.user_image_history where user_id = p_user_id;
  delete from public.receiving_account where user_id = p_user_id;
  delete from public.highlight where user_id = p_user_id;
  delete from public.drafts where user_id = p_user_id;

  update public.payment_method
     set status = 'removed',
         is_default = false,
         details = jsonb_strip_nulls(jsonb_build_object(
           'scrubbed', true,
           'brand',   details ->> 'brand',
           'last4',   details ->> 'last4',
           'network', details ->> 'network',
           'bank',    details ->> 'bank')),
         updated_at = now()
   where user_id = p_user_id;

  update public.payout_account
     set status = 'removed',
         is_default = false,
         account_holder_name = 'Deleted user',
         account_number = 'removed',
         updated_at = now()
   where organizer_id = p_user_id;

  update public.user_info
     set full_name = 'Deleted user',
         username = ('deleted_' || v_suffix)::extensions.citext,
         username_is_generated = true,
         avatar_public_id = null,
         avatar_version = null,
         bio = null,
         website = null,
         organizer_verified = false,
         organizer_verified_at = null,
         organizer_verification_case_id = null,
         status_id = 4,
         updated_at = now()
   where id = p_user_id;

  return jsonb_build_object(
    'events_cancelled', v_events_cancelled,
    'events_archived',  v_events_archived,
    'drafts_deleted',   v_drafts_deleted,
    'claims_deleted',   v_claims_deleted,
    'cases_closed',     v_cases_closed
  ) || v_cleanup;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. What stops a person's deletion: a paid Spotlight promotion
-- ---------------------------------------------------------------------------
-- The 20260913200100 definition plus two counts, the same ones a team's
-- deletion has (team_deletion_blockers): a promotion of the account, or on
-- one of its posts, that is paid and not over (cancel it first; staff
-- refund what was not spent) or whose payment is going through (try again
-- in a few minutes). team_deletion_blockers reads the older keys by name
-- and keeps its own counts.

create or replace function public.account_deletion_blockers(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin',
      coalesce((select ui.is_admin from public.user_info ui where ui.id = p_user_id), false),
    'upcoming_events_with_attendees',
      (select count(*)
       from public.event e
       where e.organizer_id = p_user_id
         and e.status = 'published'
         and coalesce((select max(o.ends_at) from public.event_occurrence o where o.event_id = e.id), e.ends_at) > now()
         and exists (
           select 1
           from public.ticket t
           join public.ticket_type tt on tt.id = t.ticket_type_id
           where tt.event_id = e.id and t.status in ('active', 'used'))),
    'payouts_in_flight',
      (select count(*) from public.payout p
       where p.organizer_id = p_user_id and p.status = 'processing'),
    'balance_owed',
      (select coalesce(sum(le.amount), 0)
       from public.organizer_ledger_entry le
       where le.organizer_id = p_user_id),
    'payments_in_progress',
      (select count(*)
       from public.content_campaign cc
       where cc.status = 'pending_payment'
         and (cc.advertiser_id = p_user_id
              or exists (select 1 from public.content_post p
                         where p.id = cc.post_id and p.author_id = p_user_id))),
    'promotions_running',
      (select count(*)
       from public.content_campaign cc
       where cc.status in ('payment_confirmed', 'pending_review', 'scheduled', 'active', 'paused')
         and (cc.advertiser_id = p_user_id
              or exists (select 1 from public.content_post p
                         where p.id = cc.post_id and p.author_id = p_user_id)))
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. open_conversation: nobody starts a conversation with an account that
--    is gone. The 20261116140000 definition with one check before a new
--    conversation is made; an existing one is still returned (closed, its
--    history readable).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_conversation(p_type text, p_event_id uuid DEFAULT NULL::uuid, p_place_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_caller       uuid := auth.uid();
  v_conv_id      uuid;
  v_target_id    uuid;
  v_target_role  text;
  v_title        text;
  v_status       text;
  v_recent       integer;
begin
  if v_caller is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_type not in ('event','place','support') then
    raise exception 'Unsupported conversation type' using errcode = 'check_violation';
  end if;

  -- ---- resolve the business side + dedupe target ----
  if p_type = 'event' then
    if p_event_id is null then
      raise exception 'An event is required' using errcode = 'check_violation';
    end if;
    select organizer_id, title, status
      into v_target_id, v_title, v_status
      from public.event where id = p_event_id;
    if not found then
      raise exception 'That event no longer exists' using errcode = 'no_data_found';
    end if;
    if v_status = 'draft' then
      raise exception 'That event is not available' using errcode = 'check_violation';
    end if;
    if v_target_id = v_caller or public.is_team_member(v_target_id, v_caller) then
      raise exception 'You cannot message your own event' using errcode = 'check_violation';
    end if;
    v_target_role := 'organizer';

    select id into v_conv_id from public.conversation
      where type = 'event' and event_id = p_event_id and created_by = v_caller;

  elsif p_type = 'place' then
    if p_place_id is null then
      raise exception 'A place is required' using errcode = 'check_violation';
    end if;
    select owner_id, name, status
      into v_target_id, v_title, v_status
      from public.place where id = p_place_id;
    if not found then
      raise exception 'That place no longer exists' using errcode = 'no_data_found';
    end if;
    if v_status = 'draft' then
      raise exception 'That place is not available' using errcode = 'check_violation';
    end if;
    if v_target_id = v_caller or public.is_team_member(v_target_id, v_caller) then
      raise exception 'You cannot message your own place' using errcode = 'check_violation';
    end if;
    v_target_role := 'place_owner';

    select id into v_conv_id from public.conversation
      where type = 'place' and place_id = p_place_id and created_by = v_caller;

  else  -- support
    v_target_id := null;
    v_title := 'Abonten Support';
    select id into v_conv_id from public.conversation
      where type = 'support' and created_by = v_caller and status = 'open';
  end if;

  if v_conv_id is not null then
    return v_conv_id;   -- already exists
  end if;

  -- ---- an account that was deleted takes no new conversation: a place
  --      whose owner is gone waits to be claimed, an organizer who is gone
  --      reads nothing ----
  if v_target_id is not null
     and exists (select 1 from public.user_info u where u.id = v_target_id and u.status_id = 4) then
    if p_type = 'place' then
      raise exception 'Nobody manages this place on Abonten at the moment, so it cannot receive messages.'
        using errcode = 'check_violation';
    end if;
    raise exception 'This organizer is no longer on Abonten, so they cannot receive messages.'
      using errcode = 'check_violation';
  end if;

  -- ---- soft anti-spam: cap brand-new conversations per hour ----
  select count(*) into v_recent
    from public.conversation
    where created_by = v_caller and created_at > now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'You have started a lot of conversations recently. Please try again later.'
      using errcode = 'check_violation';
  end if;

  -- ---- create (race-safe: a concurrent create hits the partial unique
  --      index; we swallow it and re-select) ----
  begin
    insert into public.conversation (type, event_id, place_id, created_by, title)
    values (p_type, p_event_id, p_place_id, v_caller, v_title)
    returning id into v_conv_id;
  exception when unique_violation then
    select id into v_conv_id from public.conversation
      where created_by = v_caller
        and type = p_type
        and event_id is not distinct from p_event_id
        and place_id is not distinct from p_place_id
      order by created_at
      limit 1;
    return v_conv_id;
  end;

  insert into public.conversation_participant (conversation_id, user_id, role)
  values (v_conv_id, v_caller, 'member');

  if v_target_id is not null then
    insert into public.conversation_participant (conversation_id, user_id, role)
    values (v_conv_id, v_target_id, v_target_role);
  end if;

  insert into public.message (conversation_id, sender_id, message_type, system_event, system_data)
  values (
    v_conv_id, null, 'system', 'conversation_started',
    jsonb_build_object('initiator_id', v_caller, 'conversation_type', p_type)
  );

  update public.conversation
    set last_message_at = now(),
        last_message_preview = null,
        updated_at = now()
    where id = v_conv_id;

  return v_conv_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

revoke all on function public._deleted_account_cleanup(uuid) from public, anon, authenticated;
grant execute on function public._deleted_account_cleanup(uuid) to service_role;
revoke all on function public.anonymize_deleted_account(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_deleted_account(uuid) to service_role;
revoke all on function public.account_deletion_blockers(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_blockers(uuid) to service_role;
revoke execute on function public.open_conversation(text, uuid, uuid) from public, anon;
grant execute on function public.open_conversation(text, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The accounts deleted before this migration
-- ---------------------------------------------------------------------------
-- The same clean-up, once. Idempotent: nothing is left to change for an
-- account it already ran on. The counts are printed for the record.

do $$
declare
  r record;
  v jsonb;
  v_accounts integer := 0;
  v_total jsonb := '{}'::jsonb;
  k text;
begin
  for r in select id from public.user_info where status_id = 4 order by id loop
    v := public._deleted_account_cleanup(r.id);
    v_accounts := v_accounts + 1;
    for k in select jsonb_object_keys(v) loop
      v_total := v_total || jsonb_build_object(
        k, coalesce((v_total ->> k)::integer, 0) + (v ->> k)::integer);
    end loop;
  end loop;
  raise notice 'deleted account gaps: % deleted account(s) cleaned up: %', v_accounts, v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_function_privilege('authenticated', 'public._deleted_account_cleanup(uuid)', 'execute')
     or has_function_privilege('anon', 'public._deleted_account_cleanup(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.anonymize_deleted_account(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.account_deletion_blockers(uuid)', 'execute') then
    raise exception 'migration check: the deletion functions must be service-role only';
  end if;
  if has_function_privilege('anon', 'public.open_conversation(text, uuid, uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.open_conversation(text, uuid, uuid)', 'execute') then
    raise exception 'migration check: open_conversation grants changed';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'anonymize_deleted_account'
      and position('public._deleted_account_cleanup(p_user_id)' in p.prosrc) > 0
      and position('''deleted_'' || v_suffix' in p.prosrc) > 0
  ) then
    raise exception 'migration check: anonymize_deleted_account was not replaced';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'open_conversation'
      and position('u.status_id = 4' in p.prosrc) > 0
  ) then
    raise exception 'migration check: open_conversation was not replaced';
  end if;
  -- The keys team_deletion_blockers reads are still there.
  if not (public.account_deletion_blockers(gen_random_uuid())
          ?& array['upcoming_events_with_attendees', 'payouts_in_flight', 'balance_owed',
                   'payments_in_progress', 'promotions_running']) then
    raise exception 'migration check: account_deletion_blockers lost a key';
  end if;
end;
$$;

commit;
