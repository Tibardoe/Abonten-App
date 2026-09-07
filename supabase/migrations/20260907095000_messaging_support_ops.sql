-- In-app messaging — support operations (Admin Console).
--
-- Adds the pieces the dedicated admin "support queue" needs on top of the
-- Phase 1 messaging schema:
--
--   1. conversation.assigned_to / assigned_at / assigned_by — a support
--      agent "claims" a type='support' conversation. This is an ADMIN-SIDE
--      ownership marker only: the agent is deliberately NOT added as a
--      conversation_participant, so their real name / avatar never reaches
--      the requester (the thread already renders every non-self message as
--      "Abonten Support" — bubbles carry no sender identity, and
--      getConversationContext builds its participant list from
--      conversation_participant rows, which now stays just [requester]).
--      Admin replies are inserted straight onto public.message by the
--      service-role client (same "guarded direct write" pattern as
--      claimsAdminCore's rejection path) — no new RPC.
--
--   2. Two partial indexes for the queue's list + "assigned to me" filter.
--
--   3. RBAC: support.view / support.respond permission keys, granted to
--      support_admin and operations. super_admin is NOT inserted here — its
--      admin_role_permission rows are immutable (trigger
--      guard_super_admin_role_permissions) and resolveAdminContext already
--      hard-guarantees super_admin = every key in ADMIN_PERMISSION_KEYS.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq) then saved
-- here as the source-of-truth copy.

-- ── 1. assignment columns ───────────────────────────────────────────────
alter table public.conversation
  add column if not exists assigned_to  uuid references public.user_info(id) on delete set null,
  add column if not exists assigned_at  timestamptz,
  add column if not exists assigned_by  uuid references public.user_info(id) on delete set null;

comment on column public.conversation.assigned_to is
  'Support agent who has claimed this type=support conversation. Admin-side ownership marker only — the agent is not a conversation_participant.';

-- ── 2. queue indexes (support conversations only) ───────────────────────
create index if not exists idx_conversation_support_queue
  on public.conversation (last_message_at desc nulls last, id desc)
  where type = 'support';

create index if not exists idx_conversation_support_assignee
  on public.conversation (assigned_to)
  where type = 'support' and assigned_to is not null;

-- ── 3. RBAC ────────────────────────────────────────────────────────────
insert into public.admin_permission (key, label, description) values
  ('support.view',    'View support queue', 'See the in-app support conversation queue and threads.'),
  ('support.respond', 'Respond to support', 'Claim, reply to, reassign and close/reopen support conversations.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('support_admin', 'support.view'),
  ('support_admin', 'support.respond'),
  ('operations',    'support.view'),
  ('operations',    'support.respond')
on conflict do nothing;
