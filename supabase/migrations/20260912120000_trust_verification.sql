-- Trust & Verification, Phase 1 (PROJECT.md §30, docs/architecture/trust-and-verification.md)
--
-- Before this migration `place.verified` was a bare boolean set only as a
-- side effect of approve_place_claim (ownership transfer). There was no
-- evidence, no review lifecycle, no way for an owner-created place to be
-- verified, and nothing at all for organizers. This migration adds:
--
--   * verification_program_setting  one row of switches; ships OFF
--   * verification_evidence_type    the evidence categories (extensible by INSERT)
--   * verification_case             one request; typed FK per subject kind
--   * verification_evidence         metadata for files in the private bucket
--   * verification_event            append-only history (never internal-only text)
--   * verification-evidence bucket  private, no storage.objects policies:
--                                   uploads via service-issued signed upload
--                                   URLs, reads via admin-only 5-minute links
--   * verification_transition()     THE state machine (single SECURITY DEFINER
--                                   RPC; locks subject then case)
--   * approve_place_claim_and_verify() atomic "approve claim + verify"
--   * approve_place_claim()         no longer sets verified (decoupled)
--   * cache columns                 place.verified_at / verification_case_id,
--                                   user_info.organizer_verified(_at)/(_case_id),
--                                   client writes refused by the existing guards
--   * triggers                      owner change -> revoke; ban -> revoke;
--                                   material edit -> subject_changed event
--   * purge_verification_evidence() retention job (pg_cron, 03:30 daily)
--   * 4 admin permissions           verification.view/evidence/review/revoke
--   * backfill                      existing verified places -> legacy cases
--
-- Access model: the four verification tables carry NO anon/authenticated
-- privileges and RLS is enabled with a deny-all policy. Every read/write goes
-- through @abonten/services on the service-role client after an ownership or
-- permission check (the case row holds reviewer ids, which a requester must
-- never see). Evidence types are readable by everyone (labels only).

-- ---------------------------------------------------------------------
-- 1. Programme switches (one row)
-- ---------------------------------------------------------------------

create table public.verification_program_setting (
  id                          smallint    primary key default 1 check (id = 1),
  place_requests_enabled      boolean     not null default false,
  organizer_requests_enabled  boolean     not null default false,
  -- staff: active admin_user rows only · beta: beta_user_ids · all: everyone
  audience                    text        not null default 'staff'
                                check (audience in ('staff', 'beta', 'all')),
  beta_user_ids               uuid[]      not null default '{}',
  organizer_types_enabled     text[]      not null default '{business,organisation,individual}',
  max_evidence_files          smallint    not null default 5  check (max_evidence_files between 1 and 20),
  max_file_bytes              integer     not null default 10485760 check (max_file_bytes between 65536 and 10485760),
  -- Retention (business decision V1): rejected / withdrawn cases are purged
  -- this many days after their last change; approved evidence is kept while
  -- the verification is live and purged this long after a revocation.
  retention_days_unapproved   integer     not null default 90  check (retention_days_unapproved between 7 and 3650),
  retention_days_after_revoke integer     not null default 365 check (retention_days_after_revoke between 7 and 3650),
  draft_expiry_days           integer     not null default 14  check (draft_expiry_days between 1 and 90),
  updated_at                  timestamptz not null default now(),
  updated_by                  uuid
);

comment on table public.verification_program_setting is
  'Trust & Verification switches (one row). Ships off. Edited only from the admin console (service role).';

insert into public.verification_program_setting (id) values (1) on conflict do nothing;

revoke all on public.verification_program_setting from anon, authenticated;
grant all on public.verification_program_setting to service_role;
alter table public.verification_program_setting enable row level security;

-- ---------------------------------------------------------------------
-- 2. Evidence categories (labels are public; a new category is one INSERT)
-- ---------------------------------------------------------------------

create table public.verification_evidence_type (
  key         text        primary key,
  label       text        not null,
  description text,
  applies_to  text[]      not null default '{place,organizer}',
  sort_order  smallint    not null default 100,
  active      boolean     not null default true
);

insert into public.verification_evidence_type (key, label, description, applies_to, sort_order) values
  ('business_registration', 'Business registration certificate',
     'Certificate of incorporation or business-name registration from the Registrar General''s Department.',
     '{place,organizer}', 10),
  ('operating_permit', 'Business operating permit',
     'The operating permit issued by your district, municipal or metropolitan assembly.',
     '{place,organizer}', 20),
  ('sector_licence', 'Sector licence or permit',
     'A licence for your type of business, for example a hospitality, food or tourism licence.',
     '{place,organizer}', 30),
  ('tin_certificate', 'TIN certificate',
     'Your business tax identification certificate.',
     '{place,organizer}', 40),
  ('lease_or_tenancy', 'Lease or tenancy agreement',
     'A signed agreement for the premises, showing the business name and address.',
     '{place}', 50),
  ('utility_bill', 'Utility bill for the premises',
     'A recent electricity, water or similar bill addressed to the business at this location.',
     '{place}', 60),
  ('authorisation_letter', 'Authorisation letter',
     'A signed letter on the business or organisation''s letterhead authorising you to manage this account.',
     '{place,organizer}', 70),
  ('event_permit', 'Event or venue permit',
     'A permit for a past or upcoming event you organised.',
     '{organizer}', 80),
  ('venue_confirmation', 'Venue booking confirmation',
     'A booking confirmation from a venue for an event you organised.',
     '{organizer}', 90),
  ('past_event_material', 'Past event material',
     'Flyers, tickets, press coverage or photos from events you organised.',
     '{organizer}', 100),
  ('other', 'Other supporting document',
     'Any other document that shows your connection to the business or your work as an organizer.',
     '{place,organizer}', 200)
on conflict (key) do nothing;

grant select on public.verification_evidence_type to anon, authenticated;
grant all on public.verification_evidence_type to service_role;
alter table public.verification_evidence_type enable row level security;
create policy verification_evidence_type_read on public.verification_evidence_type
  for select to anon, authenticated using (active);

-- ---------------------------------------------------------------------
-- 3. verification_case
-- ---------------------------------------------------------------------

create table public.verification_case (
  id                 uuid        primary key default extensions.uuid_generate_v4(),
  subject_type       text        not null check (subject_type in ('place', 'organizer')),
  -- Typed subject: exactly one of these is set and it matches subject_type,
  -- so the row cascades with its subject and the FK is real.
  place_id           uuid        references public.place (id) on delete cascade,
  organizer_user_id  uuid        references public.user_info (id) on delete cascade,
  subject_id         uuid        generated always as (coalesce(place_id, organizer_user_id)) stored,
  requester_id       uuid        not null references public.user_info (id) on delete cascade,
  status             text        not null default 'draft'
                       check (status in ('draft', 'pending_review', 'needs_info', 'approved',
                                         'rejected', 'withdrawn', 'revoked')),
  organizer_type     text        check (organizer_type is null
                                        or organizer_type in ('individual', 'business', 'organisation')),
  legal_name         text        check (legal_name is null or char_length(legal_name) <= 200),
  applicant_note     text        check (applicant_note is null or char_length(applicant_note) <= 1000),
  contact_phone      text        check (contact_phone is null or char_length(contact_phone) <= 40),
  contact_email      text        check (contact_email is null or char_length(contact_email) <= 320),
  -- What the subject looked like when it was submitted (place: name,
  -- address, category, owner; organizer: username, full name).
  subject_snapshot   jsonb,
  -- USER-VISIBLE reason for needs_info / rejected / revoked. Internal notes
  -- go to admin_note (target_type = 'verification_case'), never here.
  decision_reason    text        check (decision_reason is null or char_length(decision_reason) <= 2000),
  source             text        not null default 'owner'
                       check (source in ('owner', 'legacy_claim', 'claim_review', 'admin')),
  claim_request_id   uuid        references public.place_claim_request (id) on delete set null,
  submitted_at       timestamptz,
  info_requested_at  timestamptz,
  reviewed_by        uuid        references auth.users (id) on delete set null,
  reviewed_at        timestamptz,
  revoked_by         uuid        references auth.users (id) on delete set null,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint verification_case_subject_matches check (
       (subject_type = 'place'     and place_id is not null and organizer_user_id is null)
    or (subject_type = 'organizer' and organizer_user_id is not null and place_id is null)
  ),
  constraint verification_case_organizer_type_scope check (subject_type = 'organizer' or organizer_type is null),
  constraint verification_case_organizer_is_requester check (subject_type <> 'organizer' or organizer_user_id = requester_id)
);

create index idx_verification_case_subject      on public.verification_case (subject_type, subject_id);
create index idx_verification_case_status       on public.verification_case (status, submitted_at desc);
create index idx_verification_case_requester    on public.verification_case (requester_id);
create index idx_verification_case_reviewed_by  on public.verification_case (reviewed_by);
create index idx_verification_case_revoked_by   on public.verification_case (revoked_by);
create index idx_verification_case_claim        on public.verification_case (claim_request_id);
-- One OPEN case per subject and one LIVE approval per subject.
create unique index uq_verification_case_open_per_subject
  on public.verification_case (subject_type, subject_id)
  where status in ('draft', 'pending_review', 'needs_info');
create unique index uq_verification_case_approved_per_subject
  on public.verification_case (subject_type, subject_id)
  where status = 'approved';

revoke all on public.verification_case from anon, authenticated;
grant all on public.verification_case to service_role;
alter table public.verification_case enable row level security;

-- ---------------------------------------------------------------------
-- 4. verification_evidence (metadata; bytes live in the private bucket)
-- ---------------------------------------------------------------------

create table public.verification_evidence (
  id            uuid        primary key default extensions.uuid_generate_v4(),
  case_id       uuid        not null references public.verification_case (id) on delete cascade,
  evidence_type text        not null references public.verification_evidence_type (key),
  -- <subject_type>/<subject_id>/<case_id>/<evidence_id>.<ext>
  storage_path  text        not null unique,
  file_name     text        check (file_name is null or char_length(file_name) <= 255),
  mime_type     text        not null,
  size_bytes    integer     not null check (size_bytes > 0),
  -- pending_upload: ticket issued, object not yet confirmed · uploaded:
  -- confirmed at submission · purged: bytes deleted by the retention job.
  status        text        not null default 'pending_upload'
                  check (status in ('pending_upload', 'uploaded', 'purged')),
  uploaded_by   uuid        not null references public.user_info (id) on delete cascade,
  created_at    timestamptz not null default now(),
  uploaded_at   timestamptz,
  purged_at     timestamptz
);

create index idx_verification_evidence_case on public.verification_evidence (case_id);
create index idx_verification_evidence_type on public.verification_evidence (evidence_type);
create index idx_verification_evidence_uploaded_by on public.verification_evidence (uploaded_by);

revoke all on public.verification_evidence from anon, authenticated;
grant all on public.verification_evidence to service_role;
alter table public.verification_evidence enable row level security;

-- ---------------------------------------------------------------------
-- 5. verification_event (append-only history)
-- ---------------------------------------------------------------------

create table public.verification_event (
  id          bigint      generated always as identity primary key,
  case_id     uuid        not null references public.verification_case (id) on delete cascade,
  actor_id    uuid,
  actor_kind  text        not null check (actor_kind in ('user', 'admin', 'system')),
  event_type  text        not null check (event_type in (
                'created', 'evidence_added', 'evidence_removed', 'submitted', 'resubmitted',
                'info_requested', 'approved', 'rejected', 'withdrawn', 'revoked',
                'subject_changed', 'evidence_purged')),
  from_status text,
  to_status   text,
  -- The same user-visible reason the requester is shown. No internal text.
  reason      text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index idx_verification_event_case on public.verification_event (case_id, created_at);

revoke all on public.verification_event from anon, authenticated;
grant all on public.verification_event to service_role;
alter table public.verification_event enable row level security;

create function public.verification_event_is_append_only()
  returns trigger
  language plpgsql
  set search_path = ''
as $function$
begin
  raise exception 'verification_event is append-only';
end;
$function$;

revoke all on function public.verification_event_is_append_only() from public, anon, authenticated;

create trigger trg_verification_event_no_update
  before update or delete on public.verification_event
  for each row execute function public.verification_event_is_append_only();

-- Deny-all policies (LOW-009 shape): the tables are service-role only; the
-- policy only makes that intent legible to the security advisor.
do $$
declare
  t text;
begin
  foreach t in array array['verification_program_setting', 'verification_case',
                           'verification_evidence', 'verification_event'] loop
    execute format(
      'create policy service_role_only on public.%I for all to public using (false) with check (false)', t);
    execute format(
      'comment on policy service_role_only on public.%I is '
      || $c$'Deliberate deny-all for anon/authenticated -- this table is read/written only by '$c$
      || $c$'@abonten/services on the service-role client after an ownership or permission check.'$c$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Private bucket (no storage.objects policies, on purpose)
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-evidence',
  'verification-evidence',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do nothing;
-- Uploads use service-issued signed upload URLs (minted after the service
-- checked the caller owns the case); reads use 5-minute signed URLs minted
-- for admins holding verification.evidence. Nothing is ever public.

-- ---------------------------------------------------------------------
-- 7. Cache columns on the subjects + client-write guards
-- ---------------------------------------------------------------------

alter table public.place
  add column verified_at          timestamptz,
  add column verification_case_id uuid references public.verification_case (id) on delete set null;
create index idx_place_verification_case on public.place (verification_case_id);

alter table public.user_info
  add column organizer_verified              boolean not null default false,
  add column organizer_verified_at           timestamptz,
  add column organizer_verification_case_id  uuid references public.verification_case (id) on delete set null;
create index idx_user_info_organizer_verification_case on public.user_info (organizer_verification_case_id);

-- place: extend the staff-only guard (20260911080616) to the new columns.
create or replace function public.guard_staff_managed_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only direct client writes are checked. SECURITY DEFINER functions run as
  -- their owner and the backend as service_role, so current_user is neither.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if current_user = 'authenticated' and public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' and (
       new.moderation_state  is distinct from old.moderation_state
    or new.moderation_reason is distinct from old.moderation_reason
    or new.moderated_at      is distinct from old.moderated_at
    or new.moderated_by      is distinct from old.moderated_by) then
    raise exception 'Only Abonten staff can change moderation status'
      using errcode = '42501';
  end if;

  -- Fields of `place` only (plpgsql resolves NEW.verified at run time, so
  -- the other tables never evaluate it).
  if tg_table_name = 'place' then
    if (tg_op = 'INSERT' and (new.verified or new.claimed
                              or new.verified_at is not null
                              or new.verification_case_id is not null))
       or (tg_op = 'UPDATE' and (new.verified is distinct from old.verified
                                 or new.claimed is distinct from old.claimed
                                 or new.verified_at is distinct from old.verified_at
                                 or new.verification_case_id is distinct from old.verification_case_id)) then
      raise exception 'Only Abonten staff can mark a place as verified or claimed'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_staff_managed_columns() from public, anon, authenticated;

-- user_info: extend the privileged-column guard (20260903231755, made
-- SECURITY INVOKER by 20260911080616 -- keep it that way).
create or replace function public.protect_user_info_privileged_columns()
  returns trigger
  language plpgsql
  security invoker
  set search_path to ''
as $function$
begin
  -- signed-in platform admin (unchanged)
  if public.is_admin() then
    return new;
  end if;

  -- trusted server contexts: the service-role key (admin console / backend
  -- services), or a superuser / the postgres role (migrations, dashboard,
  -- SECURITY DEFINER maintenance such as verification_transition).
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.status_id is distinct from old.status_id
     or new.organizer_verified is distinct from old.organizer_verified
     or new.organizer_verified_at is distinct from old.organizer_verified_at
     or new.organizer_verification_case_id is distinct from old.organizer_verification_case_id then
    raise exception 'Not authorized to modify this field' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. verification_transition(): the state machine
-- ---------------------------------------------------------------------
--
--   draft ──submit──▶ pending_review ──approve──▶ approved ──revoke──▶ revoked
--     │                  │  ▲                       (admin / system)
--     │                  │  └──resubmit── needs_info ◀──request_info──┘
--     │                  ├──reject──▶ rejected        needs_info ──reject──▶ rejected
--     └──withdraw──▶ withdrawn ◀──withdraw── pending_review | needs_info  (user / system)
--
-- Lock order is subject FIRST, then case, so the claim path (claim → place
-- → trigger → case) and the review path cannot deadlock. Errors carry stable
-- message keys the service maps to HTTP statuses:
--   verification_case_not_found · verification_status_changed ·
--   verification_invalid_transition · verification_reason_required ·
--   verification_subject_ineligible · verification_no_evidence

create function public.verification_transition(
  p_case_id         uuid,
  p_actor_id        uuid,
  p_actor_kind      text,
  p_action          text,
  p_reason          text default null,
  p_expected_status text default null
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_subject_type   text;
  v_place_id       uuid;
  v_organizer_id   uuid;
  v_case           public.verification_case%rowtype;
  v_place          public.place%rowtype;
  v_user_status    smallint;
  v_from           text;
  v_to             text;
  v_event          text;
  v_evidence_count integer;
  v_now            timestamptz := now();
begin
  if p_actor_kind not in ('user', 'admin', 'system') then
    raise exception 'verification_invalid_actor';
  end if;

  select subject_type, place_id, organizer_user_id
    into v_subject_type, v_place_id, v_organizer_id
  from public.verification_case where id = p_case_id;
  if not found then
    raise exception 'verification_case_not_found';
  end if;

  -- subject lock first
  if v_subject_type = 'place' then
    perform 1 from public.place where id = v_place_id for update;
  else
    perform 1 from public.user_info where id = v_organizer_id for update;
  end if;

  select * into v_case from public.verification_case where id = p_case_id for update;
  v_from := v_case.status;

  if p_expected_status is not null and v_from <> p_expected_status then
    raise exception 'verification_status_changed';
  end if;

  v_to := case
    when p_action = 'submit'       and v_from = 'draft'          and p_actor_kind = 'user'                 then 'pending_review'
    when p_action = 'resubmit'     and v_from = 'needs_info'     and p_actor_kind = 'user'                 then 'pending_review'
    when p_action = 'withdraw'     and v_from in ('draft', 'pending_review', 'needs_info')
                                                                and p_actor_kind in ('user', 'system')    then 'withdrawn'
    when p_action = 'approve'      and v_from = 'pending_review' and p_actor_kind = 'admin'                then 'approved'
    when p_action = 'reject'       and v_from in ('pending_review', 'needs_info')
                                                                and p_actor_kind = 'admin'                then 'rejected'
    when p_action = 'request_info' and v_from = 'pending_review' and p_actor_kind = 'admin'                then 'needs_info'
    when p_action = 'revoke'       and v_from = 'approved'       and p_actor_kind in ('admin', 'system')   then 'revoked'
    else null
  end;
  if v_to is null then
    raise exception 'verification_invalid_transition: % -> % by %', v_from, p_action, p_actor_kind;
  end if;

  if p_action in ('reject', 'request_info', 'revoke') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'verification_reason_required';
  end if;

  -- The subject must still be eligible when it is submitted and when it is
  -- approved: same owner, published, not moderated away, account active.
  if p_action in ('submit', 'resubmit', 'approve') then
    if v_subject_type = 'place' then
      select * into v_place from public.place where id = v_place_id;
      if not found
         or v_place.status <> 'published'
         or coalesce(v_place.moderation_state, 'visible') in ('hidden', 'removed')
         or v_place.owner_id <> v_case.requester_id then
        raise exception 'verification_subject_ineligible';
      end if;
    else
      select status_id into v_user_status from public.user_info where id = v_organizer_id;
      if not found or v_user_status <> 1 then
        raise exception 'verification_subject_ineligible';
      end if;
    end if;

    if p_action in ('submit', 'resubmit') then
      select count(*) into v_evidence_count
      from public.verification_evidence
      where case_id = p_case_id and status = 'uploaded';
      if v_evidence_count = 0 then
        raise exception 'verification_no_evidence';
      end if;
    end if;
  end if;

  v_event := case p_action
    when 'submit'       then 'submitted'
    when 'resubmit'     then 'resubmitted'
    when 'withdraw'     then 'withdrawn'
    when 'approve'      then 'approved'
    when 'reject'       then 'rejected'
    when 'request_info' then 'info_requested'
    when 'revoke'       then 'revoked'
  end;

  update public.verification_case set
    status            = v_to,
    updated_at        = v_now,
    submitted_at      = case when p_action in ('submit', 'resubmit') then v_now else submitted_at end,
    info_requested_at = case when p_action = 'request_info' then v_now else info_requested_at end,
    reviewed_by       = case when p_action in ('approve', 'reject', 'request_info') then p_actor_id else reviewed_by end,
    reviewed_at       = case when p_action in ('approve', 'reject', 'request_info') then v_now else reviewed_at end,
    revoked_by        = case when p_action = 'revoke' then p_actor_id else revoked_by end,
    revoked_at        = case when p_action = 'revoke' then v_now else revoked_at end,
    decision_reason   = case
                          when p_action in ('reject', 'request_info', 'revoke') then btrim(p_reason)
                          when p_action in ('submit', 'resubmit') then null
                          else decision_reason
                        end
  where id = p_case_id
  returning * into v_case;

  if p_action = 'approve' then
    if v_subject_type = 'place' then
      update public.place
         set verified = true, verified_at = v_now, verification_case_id = p_case_id, updated_at = v_now
       where id = v_place_id;
    else
      update public.user_info
         set organizer_verified = true, organizer_verified_at = v_now,
             organizer_verification_case_id = p_case_id, updated_at = v_now
       where id = v_organizer_id;
    end if;
  elsif p_action = 'revoke' then
    if v_subject_type = 'place' then
      update public.place
         set verified = false, verified_at = null, verification_case_id = null, updated_at = v_now
       where id = v_place_id
         and (verification_case_id = p_case_id or verification_case_id is null);
    else
      update public.user_info
         set organizer_verified = false, organizer_verified_at = null,
             organizer_verification_case_id = null, updated_at = v_now
       where id = v_organizer_id
         and (organizer_verification_case_id = p_case_id or organizer_verification_case_id is null);
    end if;
  end if;

  insert into public.verification_event (case_id, actor_id, actor_kind, event_type, from_status, to_status, reason)
  values (p_case_id, p_actor_id, p_actor_kind, v_event, v_from, v_to,
          case when p_action in ('reject', 'request_info', 'revoke', 'withdraw') then btrim(p_reason) else null end);

  return to_jsonb(v_case);
end;
$function$;

revoke all on function public.verification_transition(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.verification_transition(uuid, uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------
-- 9. Claims: decouple, plus the atomic "approve and verify"
-- ---------------------------------------------------------------------

-- approve_place_claim no longer verifies. CREATE OR REPLACE resets function
-- attributes, so the search_path from 20260825112821 is re-declared here.
-- Stays SECURITY INVOKER (its is_admin check is on p_admin_id).
create or replace function public.approve_place_claim(p_request_id uuid, p_admin_id uuid)
  returns void
  language plpgsql
  set search_path to public, extensions
as $function$
declare
  v_is_admin boolean;
  v_place_id uuid;
  v_claimant uuid;
  v_status text;
begin
  select is_admin into v_is_admin from user_info where id = p_admin_id;
  if v_is_admin is not true then
    raise exception 'Not authorized: caller is not an admin';
  end if;

  select place_id, claimant_id, status into v_place_id, v_claimant, v_status
  from place_claim_request where id = p_request_id for update;

  if v_place_id is null then
    raise exception 'Claim request not found';
  end if;
  if v_status <> 'pending' then
    raise exception 'Claim request already reviewed';
  end if;

  -- Ownership + claimed only. Verification is a separate reviewed step
  -- (verification_case); see approve_place_claim_and_verify.
  update place
  set owner_id = v_claimant, claimed = true, updated_at = now()
  where id = v_place_id;

  update place_claim_request
  set status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
  where id = p_request_id;
end;
$function$;

-- One transaction: approve the claim (ownership) and open an approved
-- verification case for the new owner. Used when the reviewer judged the
-- claim's documents sufficient. The claim documents stay under the claims
-- 30-day retention; the case records claim_request_id instead of copies.
create function public.approve_place_claim_and_verify(p_request_id uuid, p_admin_id uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_place_id uuid;
  v_claimant uuid;
  v_place    public.place%rowtype;
  v_case_id  uuid;
  v_now      timestamptz := now();
begin
  perform public.approve_place_claim(p_request_id, p_admin_id);

  select place_id, claimant_id into v_place_id, v_claimant
  from public.place_claim_request where id = p_request_id;

  select * into v_place from public.place where id = v_place_id for update;

  -- idempotent: an approved case already exists for this place
  select id into v_case_id from public.verification_case
  where subject_type = 'place' and place_id = v_place_id and status = 'approved';
  if found then
    return v_case_id;
  end if;

  insert into public.verification_case (
    subject_type, place_id, requester_id, status, source, claim_request_id,
    submitted_at, reviewed_by, reviewed_at, subject_snapshot
  ) values (
    'place', v_place_id, v_claimant, 'approved', 'claim_review', p_request_id,
    v_now, p_admin_id, v_now,
    jsonb_build_object('name', v_place.name, 'address', v_place.address,
                       'category_id', v_place.category_id, 'owner_id', v_place.owner_id)
  ) returning id into v_case_id;

  update public.place
     set verified = true, verified_at = v_now, verification_case_id = v_case_id, updated_at = v_now
   where id = v_place_id;

  insert into public.verification_event (case_id, actor_id, actor_kind, event_type, from_status, to_status, meta)
  values (v_case_id, p_admin_id, 'admin', 'submitted', null, 'pending_review',
          jsonb_build_object('claim_request_id', p_request_id)),
         (v_case_id, p_admin_id, 'admin', 'approved', 'pending_review', 'approved',
          jsonb_build_object('claim_request_id', p_request_id));

  return v_case_id;
end;
$function$;

revoke all on function public.approve_place_claim_and_verify(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_place_claim_and_verify(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 10. Triggers: owner change, material edit, account ban
-- ---------------------------------------------------------------------
-- All SECURITY DEFINER: the legacy web /admin/place-claims page still runs
-- approve_place_claim under an admin's `authenticated` session, which holds
-- no privileges on the verification tables.

create function public.verification_on_place_owner_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  r record;
begin
  for r in
    select id from public.verification_case
    where place_id = new.id and status in ('draft', 'pending_review', 'needs_info')
  loop
    perform public.verification_transition(r.id, null, 'system', 'withdraw', 'owner_changed', null);
  end loop;

  if old.verified then
    for r in
      select id from public.verification_case where place_id = new.id and status = 'approved'
    loop
      perform public.verification_transition(r.id, null, 'system', 'revoke', 'owner_changed', null);
    end loop;
    -- legacy verified flag with no case behind it
    update public.place
       set verified = false, verified_at = null, verification_case_id = null
     where id = new.id and verified;
  end if;
  return null;
end;
$function$;

revoke all on function public.verification_on_place_owner_change() from public, anon, authenticated;

create trigger trg_verification_place_owner_change
  after update of owner_id on public.place
  for each row
  when (old.owner_id is distinct from new.owner_id)
  execute function public.verification_on_place_owner_change();

-- A verified place whose identifying details change gets a subject_changed
-- event on its case (no automatic action in Phase 1 -- decision V4).
create function public.verification_on_place_subject_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_changed text[];
begin
  if new.verification_case_id is null then
    return null;
  end if;
  v_changed := array_remove(array[
    case when new.name        is distinct from old.name        then 'name' end,
    case when new.address     is distinct from old.address     then 'address' end,
    case when new.category_id is distinct from old.category_id then 'category' end,
    case when not extensions.st_equals(new.location::extensions.geometry, old.location::extensions.geometry)
         then 'location' end
  ], null);
  if cardinality(v_changed) = 0 then
    return null;
  end if;
  insert into public.verification_event (case_id, actor_id, actor_kind, event_type, from_status, to_status, meta)
  values (new.verification_case_id, new.owner_id, 'system', 'subject_changed', 'approved', 'approved',
          jsonb_build_object('changed', to_jsonb(v_changed)));
  return null;
end;
$function$;

revoke all on function public.verification_on_place_subject_change() from public, anon, authenticated;

create trigger trg_verification_place_subject_change
  after update of name, address, location, category_id on public.place
  for each row
  when (new.verified)
  execute function public.verification_on_place_subject_change();

create function public.verification_on_user_status_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  r record;
begin
  -- 3 = Banned (user_status). Suspended (2) keeps the case; the badge is
  -- hidden at render time while the account is not active.
  if new.status_id = 3 and new.organizer_verified then
    for r in
      select id from public.verification_case
      where organizer_user_id = new.id and status = 'approved'
    loop
      perform public.verification_transition(r.id, null, 'system', 'revoke', 'account_banned', null);
    end loop;
    update public.user_info
       set organizer_verified = false, organizer_verified_at = null, organizer_verification_case_id = null
     where id = new.id and organizer_verified;
  end if;
  return null;
end;
$function$;

revoke all on function public.verification_on_user_status_change() from public, anon, authenticated;

create trigger trg_verification_user_status_change
  after update of status_id on public.user_info
  for each row
  when (old.status_id is distinct from new.status_id)
  execute function public.verification_on_user_status_change();

-- ---------------------------------------------------------------------
-- 11. Retention job
-- ---------------------------------------------------------------------

create function public.purge_verification_evidence()
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  s            public.verification_program_setting%rowtype;
  r            record;
  v_withdrawn  integer := 0;
  v_purged     integer := 0;
  v_orphans    integer := 0;
  v_due_ids    uuid[];
begin
  select * into s from public.verification_program_setting where id = 1;

  -- 1. Stale drafts are withdrawn (their evidence then ages out below).
  for r in
    select id from public.verification_case
    where status = 'draft'
      and updated_at < now() - make_interval(days => s.draft_expiry_days)
  loop
    perform public.verification_transition(r.id, null, 'system', 'withdraw', 'draft_expired', null);
    v_withdrawn := v_withdrawn + 1;
  end loop;

  -- 2. Evidence past its retention window.
  select coalesce(array_agg(e.id), '{}') into v_due_ids
  from public.verification_evidence e
  join public.verification_case c on c.id = e.case_id
  where e.status in ('pending_upload', 'uploaded')
    and (
         (c.status in ('rejected', 'withdrawn')
            and c.updated_at < now() - make_interval(days => s.retention_days_unapproved))
      or (c.status = 'revoked'
            and c.revoked_at < now() - make_interval(days => s.retention_days_after_revoke))
    );

  if cardinality(v_due_ids) > 0 then
    delete from storage.objects o
    using public.verification_evidence e
    where e.id = any (v_due_ids)
      and o.bucket_id = 'verification-evidence'
      and o.name = e.storage_path;

    update public.verification_evidence
       set status = 'purged', purged_at = now()
     where id = any (v_due_ids);
    get diagnostics v_purged = row_count;

    insert into public.verification_event (case_id, actor_kind, event_type, meta)
    select e.case_id, 'system', 'evidence_purged', jsonb_build_object('count', count(*))
    from public.verification_evidence e
    where e.id = any (v_due_ids)
    group by e.case_id;
  end if;

  -- 3. Objects whose metadata row is gone (subject deleted -> rows cascaded).
  delete from storage.objects o
  where o.bucket_id = 'verification-evidence'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.verification_evidence e where e.storage_path = o.name);
  get diagnostics v_orphans = row_count;

  -- 4. Tickets that were never used.
  delete from public.verification_evidence
  where status = 'pending_upload' and created_at < now() - interval '2 days';

  return jsonb_build_object('withdrawn', v_withdrawn, 'purged', v_purged, 'orphans', v_orphans);
end;
$function$;

revoke all on function public.purge_verification_evidence() from public, anon, authenticated;
grant execute on function public.purge_verification_evidence() to service_role;

select cron.unschedule('purge-verification-evidence')
where exists (select 1 from cron.job where jobname = 'purge-verification-evidence');

select cron.schedule(
  'purge-verification-evidence',
  '30 3 * * *',
  $$select public.purge_verification_evidence();$$
);

-- ---------------------------------------------------------------------
-- 12. Admin: dashboard count + permissions
-- ---------------------------------------------------------------------

create or replace function public.admin_dashboard_counts()
  returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select jsonb_build_object(
    'openReports', (
      select count(*) from public.report
      where status in ('new','under_review','awaiting_info','escalated')
    ),
    'urgentReports', (
      select count(*) from public.report
      where status in ('new','under_review','awaiting_info','escalated')
        and priority = 'urgent'
    ),
    'reportsUnassigned', (
      select count(*) from public.report
      where status in ('new','under_review','awaiting_info','escalated')
        and assigned_to is null
    ),
    'pendingClaims', (
      select count(*) from public.place_claim_request where status = 'pending'
    ),
    'pendingVerifications', (
      select count(*) from public.verification_case where status = 'pending_review'
    ),
    'openErrorGroups', (
      select count(*) from public.app_error_group where status = 'open'
    ),
    'failingHealthChecks', (
      select count(*) from (
        select distinct on (check_key) check_key, ok
        from public.health_check_result
        order by check_key, checked_at desc
      ) latest
      where latest.ok = false
    ),
    'stuckPayments', (
      select count(*) from public.payment_attempt
      where status in ('initiated','pending','processing')
        and created_at < now() - interval '30 minutes'
    ),
    'pendingRefunds', (
      select count(*) from public.transaction where status = 'refund_pending'
    ),
    'pendingPayouts', (
      select count(*) from public.payout
      where status in ('pending','processing','requested')
    )
  );
$function$;

insert into public.admin_permission (key, label, description) values
  ('verification.view',     'View verification requests',
     'Browse place and organizer verification requests and their history.'),
  ('verification.evidence', 'Open verification evidence',
     'Open the documents submitted with a verification request (short-lived links).'),
  ('verification.review',   'Review verification requests',
     'Approve, reject or request more information on a verification request; approve-and-verify on claims.'),
  ('verification.revoke',   'Revoke verification',
     'Remove a verified badge after approval. Requires step-up.')
on conflict (key) do nothing;

-- super_admin is granted everything in code (its rows are immutable).
insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',        'verification.view'),
  ('operations',        'verification.evidence'),
  ('operations',        'verification.review'),
  ('operations',        'verification.revoke'),
  ('moderator',         'verification.view'),
  ('moderator',         'verification.evidence'),
  ('moderator',         'verification.review'),
  ('support_admin',     'verification.view'),
  ('analyst',           'verification.view'),
  ('field_ops_manager', 'verification.view')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 13. Backfill: places verified under the old claim rule get a legacy case
-- ---------------------------------------------------------------------

do $$
declare
  p record;
  v_case_id      uuid;
  v_claim_id     uuid;
  v_claim_by     uuid;
  v_claim_at     timestamptz;
begin
  for p in select * from public.place where verified loop
    v_claim_id := null; v_claim_by := null; v_claim_at := null;
    select id, reviewed_by, reviewed_at into v_claim_id, v_claim_by, v_claim_at
    from public.place_claim_request
    where place_id = p.id and status = 'approved'
    order by reviewed_at desc nulls last
    limit 1;

    insert into public.verification_case (
      subject_type, place_id, requester_id, status, source, claim_request_id,
      submitted_at, reviewed_by, reviewed_at, subject_snapshot
    ) values (
      'place', p.id, p.owner_id, 'approved', 'legacy_claim', v_claim_id,
      coalesce(v_claim_at, p.updated_at),
      v_claim_by,
      coalesce(v_claim_at, p.updated_at),
      jsonb_build_object('name', p.name, 'address', p.address,
                         'category_id', p.category_id, 'owner_id', p.owner_id)
    ) returning id into v_case_id;

    update public.place
       set verified_at = coalesce(v_claim_at, p.updated_at),
           verification_case_id = v_case_id
     where id = p.id;

    insert into public.verification_event (case_id, actor_id, actor_kind, event_type, from_status, to_status, meta)
    values (v_case_id, v_claim_by, 'system', 'approved', 'pending_review', 'approved',
            jsonb_build_object('legacy', true, 'claim_request_id', v_claim_id));
  end loop;
end $$;
