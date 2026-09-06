-- In-app messaging — Phase 1 follow-up: covering indexes for the three
-- FKs the performance advisor flagged after 20260907090000. Same cleanup
-- the repo already did for the rest of the schema in
-- 20260903201259_fk_covering_indexes / 20260904130247.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

create index if not exists idx_conversation_last_message_sender
  on public.conversation (last_message_sender_id)
  where last_message_sender_id is not null;

create index if not exists idx_conversation_block_conversation
  on public.conversation_block (conversation_id)
  where conversation_id is not null;

create index if not exists idx_message_reaction_user
  on public.message_reaction (user_id);
