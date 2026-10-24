-- Identity verification (PROJECT.md §66, docs/architecture/identity-verification.md).
--
-- The person behind an organizer or a place proves who they are: a
-- government ID (Ghana Card, passport, driver's licence, voter ID, or the
-- documents a market lists) and a live selfie, checked by an identity
-- provider (Smile ID). Abonten never receives the images: the person goes
-- through the provider's hosted page, and Abonten keeps the outcome, the
-- legal name and date of birth on the document, its last four characters,
-- keyed hashes of its number and of the name with the date of birth (to find
-- the same person on two accounts) and its expiry. The provider keeps the
-- images under its own retention.
--
-- Why: payouts, place claims and the Verified badges move money and trust;
-- the person behind them must be traceable when something goes wrong, and a
-- banned person must not come back on a new account with the same document.
--
--   identity_program_setting   switches (all off), audience, requirements
--   market.identity_config     provider and accepted documents per market
--   identity_verification      one attempt; outcome and the kept fields
--   identity_verification_event  history (no update)
--   user_info.identity_*       cached flags, written only by identity_transition
--
-- identity_transition() is the only thing that moves an attempt and the only
-- writer of the cached flags. Every table and function is service-role only.

-- ---------------------------------------------------------------------------
-- 1. Programme settings
-- ---------------------------------------------------------------------------

create table public.identity_program_setting (
  id                             smallint primary key default 1 check (id = 1),
  enabled                        boolean not null default false,
  audience                       text not null default 'staff'
                                   check (audience in ('staff', 'beta', 'all')),
  beta_user_ids                  uuid[] not null default '{}',
  -- What a verified identity is required for. Each is its own switch.
  require_for_payouts            boolean not null default false,
  require_for_place_claims       boolean not null default false,
  require_for_verified_badges    boolean not null default false,
  require_for_paid_events        boolean not null default false,
  -- A clean result with no duplicate is approved without a person looking.
  auto_approve_clear             boolean not null default true,
  attempts_per_day               integer not null default 3
                                   check (attempts_per_day between 1 and 20),
  attempts_per_30_days           integer not null default 6
                                   check (attempts_per_30_days between 1 and 60),
  minimum_age                    integer not null default 18
                                   check (minimum_age between 13 and 25),
  validity_months                integer not null default 36
                                   check (validity_months between 6 and 120),
  link_expiry_hours              integer not null default 24
                                   check (link_expiry_hours between 1 and 168),
  retention_days_unsuccessful    integer not null default 365
                                   check (retention_days_unsuccessful between 30 and 3650),
  retention_days_after_deletion  integer not null default 730
                                   check (retention_days_after_deletion between 30 and 3650),
  retention_days_fraud           integer not null default 1825
                                   check (retention_days_fraud between 365 and 3650),
  updated_at                     timestamptz not null default now(),
  updated_by                     uuid references public.user_info (id) on delete set null
);

insert into public.identity_program_setting (id) values (1)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Accepted documents per market
-- ---------------------------------------------------------------------------

alter table public.market
  add column if not exists identity_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(identity_config) = 'object');
comment on column public.market.identity_config is
  'Identity verification for people in this market: {"provider":"smile_id","documents":[{"type":"GHANA_CARD","method":"biometric_kyc"}, …]}. type and method are the provider''s own codes; the first document is offered first.';

-- Ghana: the Ghana Card is checked against the National Identification
-- Authority's record (Biometric KYC: the selfie is compared with the photo
-- the authority holds). The other documents are checked from the document
-- itself (Document Verification: security features, the selfie against the
-- photo on it, and liveness).
update public.market
set identity_config = jsonb_build_object(
  'provider', 'smile_id',
  'documents', jsonb_build_array(
    jsonb_build_object('type', 'GHANA_CARD',      'method', 'biometric_kyc'),
    jsonb_build_object('type', 'PASSPORT',        'method', 'document_verification'),
    jsonb_build_object('type', 'DRIVERS_LICENSE', 'method', 'document_verification'),
    jsonb_build_object('type', 'VOTER_ID',        'method', 'document_verification')
  )
)
where country_code = 'GH'
  and identity_config = '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. Attempts and their history
-- ---------------------------------------------------------------------------

create table public.identity_verification (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.user_info (id) on delete cascade,
  provider                text not null check (provider in ('smile_id', 'test')),
  status                  text not null default 'created'
                            check (status in ('created', 'submitted', 'processing',
                                              'approved', 'needs_review', 'rejected',
                                              'failed', 'expired', 'cancelled', 'revoked')),
  document_country        text not null check (document_country ~ '^[A-Z]{2}$'),
  document_type           text not null check (document_type ~ '^[A-Z0-9_]{2,40}$'),
  verification_method     text not null check (verification_method ~ '^[a-z_]{2,40}$'),
  -- The person's id at the provider for this attempt (ours, not theirs).
  provider_user_ref       text not null unique
                            check (provider_user_ref ~ '^[A-Za-z0-9_-]{8,80}$'),
  provider_link_ref       text unique,
  provider_job_id         text unique,
  -- The provider's page; plain http only for the stand-in on a developer's
  -- own machine.
  link_url                text check (link_url is null or link_url ~ '^https://'
                                      or link_url ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]+)?/'),
  link_expires_at         timestamptz,
  submitted_at            timestamptz,
  result_received_at      timestamptz,
  -- The provider's verdict, kept as it came.
  result_status           text check (result_status in ('clear', 'attention', 'block', 'error')),
  result_reason           text check (char_length(result_reason) <= 80),
  risk_level              text check (char_length(risk_level) <= 20),
  fraud_detected          boolean,
  provider_duplicate      boolean,
  -- What Abonten keeps from the document. Never the images, the full number,
  -- the address or the photo.
  legal_name              text check (char_length(legal_name) <= 200),
  date_of_birth           date,
  id_number_last4         text check (id_number_last4 ~ '^[A-Za-z0-9]{1,4}$'),
  id_number_hash          text check (id_number_hash ~ '^[0-9a-f]{64}$'),
  -- Keyed hash of the legal name and date of birth: the same person showing
  -- a different document on another account.
  person_hash             text check (person_hash ~ '^[0-9a-f]{64}$'),
  document_expires_on     date,
  is_adult                boolean,
  -- Other accounts that showed the same document when this one was decided.
  matched_user_ids        uuid[] not null default '{}',
  decision_source         text check (decision_source in ('auto', 'staff', 'system')),
  decided_at              timestamptz,
  decided_by              uuid references public.user_info (id) on delete set null,
  decision_reason         text check (char_length(decision_reason) <= 500),
  valid_until             timestamptz,
  consent_at              timestamptz not null,
  consent_notice_version  text not null check (char_length(consent_notice_version) between 1 and 40),
  consent_locale          text not null check (consent_locale ~ '^[a-z]{2}$'),
  account_deleted_at      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.identity_verification is
  'One identity check of a person. Service-role only; moved only by identity_transition(). The images stay with the provider.';

-- At most one open attempt and one live verification per person.
create unique index identity_verification_one_open
  on public.identity_verification (user_id)
  where status in ('created', 'submitted', 'processing');
create unique index identity_verification_one_live
  on public.identity_verification (user_id)
  where status = 'approved';
create index identity_verification_hash_idx
  on public.identity_verification (id_number_hash)
  where id_number_hash is not null;
create index identity_verification_person_idx
  on public.identity_verification (person_hash)
  where person_hash is not null;
create index identity_verification_user_idx
  on public.identity_verification (user_id, created_at desc);
create index identity_verification_queue_idx
  on public.identity_verification (status, created_at);
create index identity_verification_deleted_idx
  on public.identity_verification (account_deleted_at)
  where account_deleted_at is not null;
create index identity_verification_decided_by_idx
  on public.identity_verification (decided_by)
  where decided_by is not null;

create table public.identity_verification_event (
  id               bigint generated always as identity primary key,
  verification_id  uuid not null references public.identity_verification (id) on delete cascade,
  kind             text not null check (char_length(kind) between 1 and 40),
  from_status      text,
  to_status        text,
  actor_kind       text not null check (actor_kind in ('user', 'system', 'staff', 'provider')),
  actor_id         uuid,
  reason           text check (char_length(reason) <= 500),
  detail           jsonb not null default '{}'::jsonb,
  at               timestamptz not null default now()
);
create index identity_verification_event_idx
  on public.identity_verification_event (verification_id, at);

create or replace function public._identity_event_no_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'identity_verification_event rows are never changed';
end;
$$;

create trigger identity_verification_event_no_update
  before update on public.identity_verification_event
  for each row execute function public._identity_event_no_update();

create or replace function public._identity_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger identity_verification_touch
  before update on public.identity_verification
  for each row execute function public._identity_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Cached flags on the profile
-- ---------------------------------------------------------------------------

alter table public.user_info
  add column if not exists identity_verified boolean not null default false,
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_valid_until timestamptz,
  add column if not exists identity_verification_id uuid
    references public.identity_verification (id) on delete set null;

comment on column public.user_info.identity_verified is
  'True while the person has a live identity verification. Written only by identity_transition(); clients cannot change it.';

create index if not exists user_info_identity_verification_idx
  on public.user_info (identity_verification_id)
  where identity_verification_id is not null;

-- The client-write guard now covers the identity flags too.
create or replace function public.protect_user_info_privileged_columns()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  -- Trusted server contexts only: the service-role key (admin console,
  -- backend services) or a superuser / the postgres role (migrations,
  -- SECURITY DEFINER maintenance such as verification_transition). A
  -- signed-in staff account is not one of them: staff change these fields
  -- through the console, which checks the permission, asks for step-up
  -- where required and writes the audit entry.
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
     or new.status_id is distinct from old.status_id
     or new.organizer_verified is distinct from old.organizer_verified
     or new.organizer_verified_at is distinct from old.organizer_verified_at
     or new.organizer_verification_case_id is distinct from old.organizer_verification_case_id
     or new.country_code is distinct from old.country_code
     or new.identity_verified is distinct from old.identity_verified
     or new.identity_verified_at is distinct from old.identity_verified_at
     or new.identity_valid_until is distinct from old.identity_valid_until
     or new.identity_verification_id is distinct from old.identity_verification_id then
    raise exception 'Not authorized to modify this field' using errcode = '42501';
  end if;

  return new;
end;
$function$;

-- The public profile header says whether the person's identity is checked
-- (a yes or no; never anything from the document). Same function as
-- 20260919092000 otherwise.
create or replace function public.get_public_profile(p_username text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', d.user_id,
    'username', d.username,
    'full_name', d.full_name,
    'bio', d.bio,
    'avatar_public_id', d.avatar_public_id,
    'avatar_version', d.avatar_version,
    'total_posts', d.total_posts,
    'total_favorites', d.total_favorites,
    'average_rating', coalesce(r.average_rating, 0),
    'total_ratings', coalesce(r.total_ratings, 0),
    'organizer_verified', coalesce(u.organizer_verified, false),
    'identity_verified', coalesce(u.identity_verified
                                  and u.identity_valid_until > now(), false),
    'status_id', u.status_id,
    'follower_count', coalesce(fc.follower_count, 0),
    'viewer_follows', public.viewer_follows('organizer', d.user_id)
  )
  from public.user_profile_details d
  left join public.user_info u on u.id = d.user_id
  left join public.follow_count fc
    on fc.target_kind = 'organizer' and fc.target_id = d.user_id
  left join lateral public.get_user_rating(d.user_id) r on true
  where d.username = p_username::extensions.citext
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 5. Access
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'identity_program_setting', 'identity_verification', 'identity_verification_event'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The state machine
-- ---------------------------------------------------------------------------
--
--   created ─submit─▶ submitted ─process─▶ processing
--      │                 │                     │
--      └────────┬────────┴─────────────────────┘
--               ├─approve─▶ approved ─revoke─▶ revoked      (staff, system)
--               │              └────expire──▶ expired       (system: validity over, or replaced)
--               ├─refer───▶ needs_review ─approve/reject─▶   (staff)
--               ├─reject──▶ rejected
--               └─fail────▶ failed      (the provider could not finish: try again)
--   created | submitted ─cancel─▶ cancelled (the person, or the account closing)
--   created | submitted ─expire─▶ expired   (the link was never used)
--
-- p_result carries the provider's verdict and the kept fields when the
-- outcome arrives (approve, refer, reject or fail by the system). It is
-- written in the same transaction as the move.

create or replace function public.identity_transition(
  p_verification_id uuid,
  p_action          text,
  p_actor_kind      text,
  p_actor_id        uuid default null,
  p_reason          text default null,
  p_result          jsonb default null
)
returns public.identity_verification
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row      public.identity_verification;
  v_user     public.user_info;
  v_from     text;
  v_to       text;
  v_months   integer;
  v_old_live uuid;
  v_auto     boolean := p_actor_kind in ('system', 'provider');
begin
  select user_id into v_row.user_id
  from public.identity_verification where id = p_verification_id;
  if v_row.user_id is null then
    raise exception 'identity_not_found' using errcode = 'P0002';
  end if;

  -- The person first, then the attempt: the same order everywhere.
  select * into v_user from public.user_info where id = v_row.user_id for update;
  select * into v_row from public.identity_verification
  where id = p_verification_id for update;
  v_from := v_row.status;

  v_to := case
    when p_action = 'submit' and p_actor_kind in ('user', 'system', 'provider')
         and v_from = 'created' then 'submitted'
    when p_action = 'process' and v_auto
         and v_from in ('created', 'submitted') then 'processing'
    when p_action = 'approve' and v_auto
         and v_from in ('created', 'submitted', 'processing') then 'approved'
    when p_action = 'approve' and p_actor_kind = 'staff'
         and v_from = 'needs_review' then 'approved'
    when p_action = 'refer' and v_auto
         and v_from in ('created', 'submitted', 'processing') then 'needs_review'
    when p_action = 'reject' and v_auto
         and v_from in ('created', 'submitted', 'processing') then 'rejected'
    when p_action = 'reject' and p_actor_kind = 'staff'
         and v_from = 'needs_review' then 'rejected'
    when p_action = 'fail' and v_auto
         and v_from in ('created', 'submitted', 'processing') then 'failed'
    when p_action = 'expire' and p_actor_kind = 'system'
         and v_from in ('created', 'submitted', 'approved') then 'expired'
    when p_action = 'cancel' and p_actor_kind in ('user', 'system')
         and v_from in ('created', 'submitted') then 'cancelled'
    when p_action = 'revoke' and p_actor_kind in ('staff', 'system')
         and v_from = 'approved' then 'revoked'
    else null
  end;
  if v_to is null then
    raise exception 'identity_invalid_transition' using errcode = 'P0001';
  end if;

  if p_actor_kind = 'staff' and p_action in ('reject', 'revoke')
     and coalesce(btrim(p_reason), '') = '' then
    raise exception 'identity_reason_required' using errcode = 'P0001';
  end if;

  -- A closed or banned account is never approved.
  if v_to = 'approved' and v_user.status_id in (3, 4) then
    raise exception 'identity_account_ineligible' using errcode = 'P0001';
  end if;

  -- The provider's verdict and the kept fields, when they arrive.
  if p_result is not null and v_auto
     and p_action in ('submit', 'process', 'approve', 'refer', 'reject', 'fail') then
    update public.identity_verification set
      provider_job_id     = coalesce(p_result ->> 'provider_job_id', provider_job_id),
      result_status       = coalesce(p_result ->> 'result_status', result_status),
      result_reason       = coalesce(p_result ->> 'result_reason', result_reason),
      risk_level          = coalesce(p_result ->> 'risk_level', risk_level),
      fraud_detected      = coalesce((p_result ->> 'fraud_detected')::boolean, fraud_detected),
      provider_duplicate  = coalesce((p_result ->> 'provider_duplicate')::boolean, provider_duplicate),
      legal_name          = coalesce(p_result ->> 'legal_name', legal_name),
      date_of_birth       = coalesce((p_result ->> 'date_of_birth')::date, date_of_birth),
      id_number_last4     = coalesce(p_result ->> 'id_number_last4', id_number_last4),
      id_number_hash      = coalesce(p_result ->> 'id_number_hash', id_number_hash),
      person_hash         = coalesce(p_result ->> 'person_hash', person_hash),
      document_expires_on = coalesce((p_result ->> 'document_expires_on')::date, document_expires_on),
      is_adult            = coalesce((p_result ->> 'is_adult')::boolean, is_adult),
      matched_user_ids    = coalesce(
                              (select array_agg(x::uuid)
                                 from jsonb_array_elements_text(p_result -> 'matched_user_ids') x),
                              matched_user_ids),
      result_received_at  = case when p_result ? 'result_status' then now()
                                 else result_received_at end
    where id = v_row.id
    returning * into v_row;
  end if;

  if v_to = 'approved' then
    select s.validity_months into v_months
    from public.identity_program_setting s where s.id = 1;

    -- A newer check replaces the live one.
    for v_old_live in
      select id from public.identity_verification
      where user_id = v_row.user_id and status = 'approved' and id <> v_row.id
    loop
      update public.identity_verification
         set status = 'expired', decision_reason = 'replaced by a newer check'
       where id = v_old_live;
      insert into public.identity_verification_event
        (verification_id, kind, from_status, to_status, actor_kind, reason)
      values (v_old_live, 'expire', 'approved', 'expired', 'system',
              'replaced by a newer check');
    end loop;

    update public.identity_verification set
      status          = 'approved',
      decided_at      = now(),
      decided_by      = case when p_actor_kind = 'staff' then p_actor_id end,
      decision_source = case when p_actor_kind = 'staff' then 'staff' else 'auto' end,
      decision_reason = coalesce(p_reason, decision_reason),
      valid_until     = least(
                          coalesce(document_expires_on::timestamptz + interval '1 day',
                                   'infinity'::timestamptz),
                          now() + make_interval(months => coalesce(v_months, 36)))
    where id = v_row.id
    returning * into v_row;

    update public.user_info set
      identity_verified        = v_row.valid_until > now(),
      identity_verified_at     = now(),
      identity_valid_until     = v_row.valid_until,
      identity_verification_id = v_row.id,
      updated_at               = now()
    where id = v_row.user_id;
  else
    update public.identity_verification set
      status          = v_to,
      submitted_at    = case when v_to = 'submitted' then coalesce(submitted_at, now())
                             else submitted_at end,
      decided_at      = case when v_to in ('needs_review', 'rejected', 'failed', 'revoked')
                             then now() else decided_at end,
      decided_by      = case when p_actor_kind = 'staff' then p_actor_id else decided_by end,
      decision_source = case
                          when v_to in ('rejected', 'revoked', 'needs_review', 'failed')
                            then case when p_actor_kind = 'staff' then 'staff'
                                      when p_actor_kind = 'provider' then 'auto'
                                      else 'system' end
                          else decision_source end,
      decision_reason = coalesce(p_reason, decision_reason)
    where id = v_row.id
    returning * into v_row;

    -- Losing the live verification clears the flags.
    if v_from = 'approved' and v_user.identity_verification_id = v_row.id then
      update public.user_info set
        identity_verified    = false,
        identity_valid_until = null,
        updated_at           = now()
      where id = v_row.user_id;
    end if;
  end if;

  insert into public.identity_verification_event
    (verification_id, kind, from_status, to_status, actor_kind, actor_id, reason, detail)
  values (v_row.id, p_action, v_from, v_to, p_actor_kind, p_actor_id, p_reason,
          coalesce(p_result - 'legal_name' - 'date_of_birth' - 'id_number_hash'
                            - 'person_hash' - 'id_number_last4', '{}'::jsonb));

  return v_row;
end;
$$;

-- Other accounts that showed the same document, or the same legal name and
-- date of birth on another document (by their keyed hashes).
create or replace function public.identity_document_matches(
  p_hash        text,
  p_person_hash text,
  p_user_id     uuid
)
returns table (
  user_id             uuid,
  account_status_id   smallint,
  verification_status text,
  revoked             boolean,
  same_document       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (v.user_id)
         v.user_id,
         u.status_id::smallint,
         v.status,
         bool_or(v.status = 'revoked') over (partition by v.user_id),
         bool_or(v.id_number_hash = p_hash) over (partition by v.user_id)
  from public.identity_verification v
  join public.user_info u on u.id = v.user_id
  where v.user_id <> p_user_id
    and ((p_hash is not null and v.id_number_hash = p_hash)
         or (p_person_hash is not null and v.person_hash = p_person_hash))
  order by v.user_id, v.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 7. When the account closes
-- ---------------------------------------------------------------------------
--
-- Deleting an account keeps user_info (status 4), so nothing cascades. The
-- live flags go at once; open attempts are cancelled; the kept records start
-- their retention clock (account_deleted_at) instead of disappearing, so a
-- person who closes an account to escape a fraud report can still be traced
-- for the period counsel approves (legal K2).

create or replace function public._identity_account_closed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status_id = 4 and old.status_id is distinct from 4 then
    new.identity_verified := false;
    new.identity_valid_until := null;

    insert into public.identity_verification_event
      (verification_id, kind, from_status, to_status, actor_kind, reason)
    select v.id, 'cancel', v.status, 'cancelled', 'system', 'account deleted'
    from public.identity_verification v
    where v.user_id = new.id and v.status in ('created', 'submitted', 'processing');

    update public.identity_verification
       set status = case when status in ('created', 'submitted', 'processing')
                         then 'cancelled' else status end,
           account_deleted_at = coalesce(account_deleted_at, now())
     where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists user_info_identity_account_closed on public.user_info;
create trigger user_info_identity_account_closed
  before update of status_id on public.user_info
  for each row
  when (new.status_id = 4 and old.status_id is distinct from 4)
  execute function public._identity_account_closed();

-- ---------------------------------------------------------------------------
-- 8. Housekeeping (daily)
-- ---------------------------------------------------------------------------

create or replace function public.identity_housekeeping()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s            public.identity_program_setting;
  r            record;
  v_links      integer := 0;
  v_validity   integer := 0;
  v_deleted    integer := 0;
  v_unsuccess  integer := 0;
  v_fraud      integer := 0;
begin
  select * into s from public.identity_program_setting where id = 1;

  -- Links never used, and checks the provider never answered.
  for r in
    select id from public.identity_verification
    where (status = 'created'
           and coalesce(link_expires_at, created_at + interval '1 day') < now() - interval '1 day')
       or (status = 'submitted' and coalesce(submitted_at, created_at) < now() - interval '14 days')
  loop
    perform public.identity_transition(r.id, 'expire', 'system', null,
                                       'not finished in time', null);
    v_links := v_links + 1;
  end loop;

  -- Live verifications past their validity (document expiry or the period).
  for r in
    select id from public.identity_verification
    where status = 'approved' and valid_until <= now()
  loop
    perform public.identity_transition(r.id, 'expire', 'system', null,
                                       'validity ended', null);
    v_validity := v_validity + 1;
  end loop;

  -- Records tied to fraud: kept for the fraud period after the decision.
  with gone as (
    delete from public.identity_verification v
    where (v.status = 'revoked' or v.result_status = 'block'
           or coalesce(v.fraud_detected, false)
           or cardinality(v.matched_user_ids) > 0)
      and coalesce(v.decided_at, v.updated_at)
          < now() - make_interval(days => coalesce(s.retention_days_fraud, 1825))
    returning 1)
  select count(*) into v_fraud from gone;

  -- Everything else of a deleted account.
  with gone as (
    delete from public.identity_verification v
    where v.account_deleted_at is not null
      and v.account_deleted_at
          < now() - make_interval(days => coalesce(s.retention_days_after_deletion, 730))
      and not (v.status = 'revoked' or v.result_status = 'block'
               or coalesce(v.fraud_detected, false)
               or cardinality(v.matched_user_ids) > 0)
    returning 1)
  select count(*) into v_deleted from gone;

  -- Attempts that came to nothing, and checks replaced or run out.
  with gone as (
    delete from public.identity_verification v
    where v.status in ('rejected', 'failed', 'expired', 'cancelled')
      and v.account_deleted_at is null
      and v.updated_at
          < now() - make_interval(days => coalesce(s.retention_days_unsuccessful, 365))
      and not (v.result_status = 'block' or coalesce(v.fraud_detected, false)
               or cardinality(v.matched_user_ids) > 0)
      and not exists (select 1 from public.user_info u
                      where u.identity_verification_id = v.id)
    returning 1)
  select count(*) into v_unsuccess from gone;

  return jsonb_build_object(
    'linksExpired', v_links, 'validityEnded', v_validity,
    'purgedAfterDeletion', v_deleted, 'purgedUnsuccessful', v_unsuccess,
    'purgedFraud', v_fraud, 'at', now());
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public._identity_event_no_update()',
    'public._identity_touch_updated_at()',
    'public._identity_account_closed()',
    'public.identity_transition(uuid, text, text, uuid, text, jsonb)',
    'public.identity_document_matches(text, text, uuid)',
    'public.identity_housekeeping()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Admin permissions
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('identity.view',      'View identity checks',
     'See whether a person''s identity was checked, its status, document type and history. Not their legal name or document details.'),
  ('identity.view_pii',  'See identity details',
     'See the legal name, date of birth and document details of a checked person. Requires step-up; every view is audited.'),
  ('identity.review',    'Review identity checks',
     'Approve or reject a check the provider or the duplicate rules sent for review.'),
  ('identity.revoke',    'Revoke an identity check',
     'Withdraw a live identity verification, for example after fraud. Requires step-up.'),
  ('identity.configure', 'Configure identity checks',
     'Switch identity checks on or off, choose the audience, what they are required for and their limits. Requires step-up.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('operations',    'identity.view'),
  ('operations',    'identity.view_pii'),
  ('operations',    'identity.review'),
  ('operations',    'identity.revoke'),
  ('operations',    'identity.configure'),
  ('moderator',     'identity.view'),
  ('moderator',     'identity.review'),
  ('finance_admin', 'identity.view'),
  ('support_admin', 'identity.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 10. Job
-- ---------------------------------------------------------------------------

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname = 'identity-housekeeping';

select cron.schedule('identity-housekeeping', '10 4 * * *',
  $cron$select public.identity_housekeeping();$cron$);

-- ---------------------------------------------------------------------------
-- 11. Checks
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'identity_program_setting', 'identity_verification', 'identity_verification_event'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t)::regclass) then
      raise exception 'migration check: % has row level security off', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'insert') then
      raise exception 'migration check: % is reachable from the apps', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.identity_transition(uuid, text, text, uuid, text, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.identity_transition(uuid, text, text, uuid, text, jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.identity_document_matches(text, text, uuid)', 'execute') then
    raise exception 'migration check: an identity function is callable by the apps';
  end if;
  if (select enabled from public.identity_program_setting where id = 1) then
    raise exception 'migration check: identity checks must ship switched off';
  end if;
  if not exists (select 1 from cron.job where jobname = 'identity-housekeeping' and active) then
    raise exception 'migration check: the identity job is not scheduled';
  end if;
end;
$$;
