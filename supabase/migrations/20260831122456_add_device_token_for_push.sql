-- Mobile push notifications: one row per (device, user) Expo push token.
-- Additive only — no existing table/policy/function/trigger is touched.
-- The web app never reads this; only the /api/mobile/devices/* routes
-- (owner-scoped) and the server-side push sender (service-role, because it
-- must look up tokens for an arbitrary target user, e.g. an organizer being
-- notified of a sale). Owner-only RLS matches the rest of the schema's
-- per-user tables.
--
-- NOTE (2026-09-08, migration reconciliation): this migration was applied to
-- production on 2026-08-31 as version 20260831122456 but its FILE was never
-- committed, so `public.device_token` did not exist at all in a from-scratch
-- replay of this repository — while `@abonten/services/notifications/
-- deviceTokenCore.ts` and `sendPushNotification.ts` both depend on it. The
-- body below is restored verbatim from production's own migration ledger
-- (supabase_migrations.schema_migrations.statements for that version); the
-- only addition is the `drop policy if exists` guard on the policy, so the
-- file is as replay-safe as its own `if not exists` table/index statements
-- already were. No production change — production already has this state.

create table if not exists public.device_token (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null unique,
  platform     text not null check (platform in ('ios', 'android')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_token_user_id_idx
  on public.device_token (user_id);

alter table public.device_token enable row level security;

drop policy if exists device_token_owner_all on public.device_token;
create policy device_token_owner_all on public.device_token
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
