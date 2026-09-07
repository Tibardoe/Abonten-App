-- In-app messaging — Phase 3 (realtime delivery layer).
--
-- Postgres stays the source of truth (Phase 1); this only turns on the
-- delivery mechanism.
--
--  1. postgres_changes stream — `message`, `conversation`,
--     `conversation_participant` are added to the `supabase_realtime`
--     publication. postgres_changes authorization is the RLS on the SOURCE
--     table, which for all three is already "are you a participant"
--     (20260907090000), so a non-participant's subscription receives
--     nothing. REPLICA IDENTITY FULL is set so UPDATE/DELETE change
--     payloads carry the whole row and RLS can be evaluated on them:
--       * message               — INSERT (new), UPDATE (edit / soft delete)
--       * conversation           — UPDATE (last_message_* bump -> live inbox)
--       * conversation_participant— UPDATE (last_read_at -> read receipts,
--                                   mute / archive)
--
--  2. Typing + presence — ephemeral, never written to Postgres. They ride
--     Realtime Broadcast/Presence on a PRIVATE channel named
--     `conversation:<uuid>`. Realtime Authorization gates a private channel
--     through RLS on `realtime.messages`; the policies below let an
--     authenticated user read/send broadcast + presence on that channel
--     only when they are a participant of that conversation. This is what
--     stops realtime-channel subscription abuse (threat model item).
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- 1. postgres_changes -----------------------------------------------------
alter table public.message replica identity full;
alter table public.conversation replica identity full;
alter table public.conversation_participant replica identity full;

alter publication supabase_realtime add table public.message;
alter publication supabase_realtime add table public.conversation;
alter publication supabase_realtime add table public.conversation_participant;

-- 2. private-channel authorization for typing / presence -----------------
-- realtime.messages already has RLS enabled with no policies (deny all), so
-- these are purely additive: they grant nothing to any channel whose topic
-- isn't exactly `conversation:<uuid>`, and within that, only to a
-- participant. The strict `[0-9a-fA-F-]{36}` shape guard means the ::uuid
-- cast below can never raise inside the predicate.

create policy "messaging_realtime_participant_read"
  on realtime.messages
  for select
  to authenticated
  using (
    extension in ('broadcast', 'presence')
    and realtime.topic() ~ '^conversation:[0-9a-fA-F-]{36}$'
    and public.is_conversation_participant(
      substring(realtime.topic() from '^conversation:(.+)$')::uuid
    )
  );

create policy "messaging_realtime_participant_write"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension in ('broadcast', 'presence')
    and realtime.topic() ~ '^conversation:[0-9a-fA-F-]{36}$'
    and public.is_conversation_participant(
      substring(realtime.topic() from '^conversation:(.+)$')::uuid
    )
  );
