-- Replaces src/services/phoneOtpStore.ts's in-memory Map with durable
-- Postgres-backed state for phone OTP abuse protection (resend cooldown,
-- pending-code TTL, verify-attempt cap) plus a per-IP send log.
--
-- Why: the in-memory Map only worked correctly on a single, long-lived
-- server process. On a multi-instance deployment (e.g. Vercel with more
-- than one lambda instance), a resend/verify request routed to a different
-- instance than the one that handled the original send would see no
-- pending state at all -- silently bypassing the cooldown/attempt cap on
-- one instance, or producing a spurious "code expired" error on another.
-- See the app-side rewrite of src/services/phoneOtpStore.ts in the same
-- change that adds this migration.
--
-- Both tables are read/written exclusively via the service-role client
-- (src/config/supabase/serviceClient.ts) from server actions
-- (requestPhoneVerification.ts, verifyPhoneSignIn.ts, updateVerifiedPhone.ts)
-- -- never from a browser session. RLS is enabled with no policies defined,
-- so anon/authenticated get zero access by default; only service_role
-- (which bypasses RLS) can read or write, matching the
-- get_auth_user_id_by_phone() convention from
-- 20260823194629_phone_auth_and_profile_completion.sql.

create table public.phone_otp_state (
  purpose text not null check (purpose in ('sign-in', 'phone-update')),
  phone_e164 text not null,
  request_id text not null,
  prefix text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  primary key (purpose, phone_e164)
);

alter table public.phone_otp_state enable row level security;

comment on table public.phone_otp_state is
  'Durable pending-OTP state for phone sign-in/phone-update, replacing an in-memory Map. Service-role access only -- see src/services/phoneOtpStore.ts.';

-- Append-only log used only to enforce a coarse per-IP send cap (Phase 17
-- abuse protection: no Redis/Upstash dependency exists in this app, so this
-- stays in Postgres rather than introducing a new external service).
create table public.phone_otp_send_log (
  id bigint generated always as identity primary key,
  phone_e164 text not null,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.phone_otp_send_log enable row level security;

create index phone_otp_send_log_ip_created_idx
  on public.phone_otp_send_log (ip_address, created_at);

comment on table public.phone_otp_send_log is
  'Append-only log of phone OTP sends, used to enforce a per-IP rate cap in requestPhoneVerification.ts. Service-role access only.';
