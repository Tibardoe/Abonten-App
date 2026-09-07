-- In-app messaging — Phase 1 (schema + RLS + storage).
--
-- A production messaging layer for user <-> organizer and user <-> place
-- conversations (plus a user <-> support type), built to the same rules the
-- rest of this schema follows:
--   * every table has RLS; row visibility is "are you a participant".
--   * NO client-facing INSERT/UPDATE/DELETE on conversation / message /
--     conversation_participant — every write goes through a SECURITY DEFINER
--     RPC that self-authorizes on auth.uid() (see
--     20260907090100_messaging_rpcs.sql). Same hardening pattern as
--     issue_free_ticket / create_ticket_checkout / issue_tickets_for_checkout.
--   * Postgres is the source of truth; realtime (Phase 3) is delivery only.
--
-- The model deliberately represents the *organization / event / place*, not
-- a private employee: conversation_participant.role distinguishes the
-- 'member' (the person who reached out) from the 'organizer' / 'place_owner'
-- side, and more than one business-side participant can be added later
-- ('staff', 'admin') without a schema change.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq).

-- ============================================================
-- conversation
-- ============================================================
create table public.conversation (
  id                     uuid primary key default extensions.uuid_generate_v4(),
  type                   text not null check (type in ('event','place','support','direct')),
  event_id               uuid references public.event(id) on delete set null,
  place_id               uuid references public.place(id) on delete set null,
  created_by             uuid references public.user_info(id) on delete set null,
  title                  text,                       -- denormalized display name at creation time
  status                 text not null default 'open' check (status in ('open','closed')),
  moderation_state       text not null default 'visible'
                           check (moderation_state in ('visible','hidden','removed')),
  last_message_at        timestamptz,
  last_message_preview   text,
  last_message_sender_id uuid references public.user_info(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- an event / place conversation must carry its subject fk
  constraint conversation_subject_consistency check (
       (type = 'event'   and event_id is not null and place_id is null)
    or (type = 'place'   and place_id is not null and event_id is null)
    or (type in ('support','direct'))
  )
);

-- Dedupe: at most one conversation per (initiator, subject). open_conversation
-- relies on these for a race-safe INSERT ... ON CONFLICT get-or-create.
create unique index uq_conversation_event_initiator
  on public.conversation (event_id, created_by) where type = 'event';
create unique index uq_conversation_place_initiator
  on public.conversation (place_id, created_by) where type = 'place';
create unique index uq_conversation_support_open
  on public.conversation (created_by) where type = 'support' and status = 'open';

create index idx_conversation_event on public.conversation (event_id) where event_id is not null;
create index idx_conversation_place on public.conversation (place_id) where place_id is not null;
create index idx_conversation_updated_at on public.conversation (updated_at desc);

-- ============================================================
-- conversation_participant
-- ============================================================
create table public.conversation_participant (
  id              uuid primary key default extensions.uuid_generate_v4(),
  conversation_id uuid not null references public.conversation(id) on delete cascade,
  user_id         uuid not null references public.user_info(id) on delete cascade,
  role            text not null check (role in ('member','organizer','place_owner','staff','admin')),
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  muted           boolean not null default false,
  archived        boolean not null default false,
  left_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create index idx_conv_participant_user on public.conversation_participant (user_id) where left_at is null;
create index idx_conv_participant_conv on public.conversation_participant (conversation_id);

-- ============================================================
-- message
-- ============================================================
create table public.message (
  id                  uuid primary key default extensions.uuid_generate_v4(),
  conversation_id     uuid not null references public.conversation(id) on delete cascade,
  sender_id           uuid references public.user_info(id) on delete set null,  -- null => system message
  message_type        text not null default 'text'
                        check (message_type in ('text','image','file','system')),
  content             text check (content is null or char_length(content) <= 4000),
  system_event        text,                          -- e.g. 'conversation_started'
  system_data         jsonb not null default '{}'::jsonb,
  reply_to_message_id uuid references public.message(id) on delete set null,
  client_generated_id uuid,                          -- optimistic-send dedupe key
  moderation_state    text not null default 'visible'
                        check (moderation_state in ('visible','hidden','removed')),
  created_at          timestamptz not null default now(),
  edited_at           timestamptz,
  deleted_at          timestamptz,
  constraint message_content_presence check (
       message_type = 'system'
    or deleted_at is not null
    or (content is not null and char_length(btrim(content)) > 0)
    or message_type in ('image','file')
  )
);

-- Primary access pattern: newest-first page of one conversation.
create index idx_message_conversation on public.message (conversation_id, created_at desc, id desc);
create index idx_message_sender on public.message (sender_id) where sender_id is not null;
create index idx_message_reply_to on public.message (reply_to_message_id) where reply_to_message_id is not null;
-- One row per (conversation, sender, client id): a replayed optimistic send
-- collapses onto the same row instead of duplicating.
create unique index uq_message_client_id
  on public.message (conversation_id, sender_id, client_generated_id)
  where client_generated_id is not null;

-- ============================================================
-- message_attachment
-- ============================================================
create table public.message_attachment (
  id               uuid primary key default extensions.uuid_generate_v4(),
  message_id       uuid not null references public.message(id) on delete cascade,
  storage_bucket   text not null default 'message-attachments',
  storage_path     text not null,
  file_name        text,
  mime_type        text,
  file_size        integer check (file_size is null or file_size >= 0),
  width            integer,
  height           integer,
  duration_seconds numeric,                          -- future: voice / video
  created_at       timestamptz not null default now()
);

create index idx_message_attachment_message on public.message_attachment (message_id);

-- ============================================================
-- message_reaction  (schema only in V1 — no UI yet)
-- ============================================================
create table public.message_reaction (
  message_id uuid not null references public.message(id) on delete cascade,
  user_id    uuid not null references public.user_info(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index idx_message_reaction_message on public.message_reaction (message_id);

-- ============================================================
-- conversation_block  (server-enforced; see send_message RPC)
-- ============================================================
create table public.conversation_block (
  id              uuid primary key default extensions.uuid_generate_v4(),
  blocker_id      uuid not null references public.user_info(id) on delete cascade,
  blocked_id      uuid not null references public.user_info(id) on delete cascade,
  conversation_id uuid references public.conversation(id) on delete cascade,  -- null => global
  created_at      timestamptz not null default now(),
  check (blocker_id <> blocked_id)
);

-- coalesce the nullable conversation_id so "global" and "per-conversation"
-- blocks each dedupe correctly.
create unique index uq_conversation_block
  on public.conversation_block
     (blocker_id, blocked_id,
      coalesce(conversation_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index idx_conversation_block_blocker on public.conversation_block (blocker_id);
create index idx_conversation_block_pair on public.conversation_block (blocked_id, blocker_id);

-- ============================================================
-- updated_at touch trigger (conversation)
-- ============================================================
create function public.touch_messaging_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_conversation_touch_updated_at
  before update on public.conversation
  for each row execute function public.touch_messaging_updated_at();

-- ============================================================
-- participation helper — the spine of every RLS policy below.
-- SECURITY DEFINER so it reads conversation_participant with RLS bypassed,
-- which is what stops the policies on that table from recursing.
-- ============================================================
create function public.is_conversation_participant(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
  returns boolean
  language sql
  security definer
  stable
  set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participant cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_user_id
      and cp.left_at is null
  );
$$;

revoke execute on function public.is_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated, service_role;

-- ============================================================
-- Grants + RLS
-- ============================================================

-- conversation: participant read only; all writes via RPC (service_role).
revoke all on public.conversation from anon, authenticated;
grant select on public.conversation to authenticated;
grant all on public.conversation to service_role;
alter table public.conversation enable row level security;

create policy conversation_participant_select on public.conversation
  for select to authenticated
  using (public.is_conversation_participant(id) or public.is_staff());

-- conversation_participant: participant read (needed for co-participant list,
-- read receipts, presence); every mutation via RPC (mark read / mute /
-- archive / leave). No self-UPDATE policy so role can't be escalated.
revoke all on public.conversation_participant from anon, authenticated;
grant select on public.conversation_participant to authenticated;
grant all on public.conversation_participant to service_role;
alter table public.conversation_participant enable row level security;

create policy conv_participant_select on public.conversation_participant
  for select to authenticated
  using (public.is_conversation_participant(conversation_id) or public.is_staff());

-- message: participant read of visible rows (own rows always visible so a
-- sender still sees a message an admin hid). Insert/edit/delete via RPC.
revoke all on public.message from anon, authenticated;
grant select on public.message to authenticated;
grant all on public.message to service_role;
alter table public.message enable row level security;

create policy message_participant_select on public.message
  for select to authenticated
  using (
    (public.is_conversation_participant(conversation_id) and moderation_state = 'visible')
    or sender_id = (select auth.uid())
    or public.is_staff()
  );

-- message_attachment: readable iff the parent message is.
revoke all on public.message_attachment from anon, authenticated;
grant select on public.message_attachment to authenticated;
grant all on public.message_attachment to service_role;
alter table public.message_attachment enable row level security;

create policy message_attachment_select on public.message_attachment
  for select to authenticated
  using (
    exists (
      select 1 from public.message m
      where m.id = message_id
        and (
          (public.is_conversation_participant(m.conversation_id) and m.moderation_state = 'visible')
          or m.sender_id = (select auth.uid())
          or public.is_staff()
        )
    )
  );

-- message_reaction: participant read; own-row write (kept minimal for the
-- deferred reactions UI). Still gated on conversation membership.
revoke all on public.message_reaction from anon, authenticated;
grant select, insert, delete on public.message_reaction to authenticated;
grant all on public.message_reaction to service_role;
alter table public.message_reaction enable row level security;

create policy message_reaction_select on public.message_reaction
  for select to authenticated
  using (
    exists (
      select 1 from public.message m
      where m.id = message_id and public.is_conversation_participant(m.conversation_id)
    )
  );
create policy message_reaction_own_insert on public.message_reaction
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.message m
      where m.id = message_id and public.is_conversation_participant(m.conversation_id)
    )
  );
create policy message_reaction_own_delete on public.message_reaction
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- conversation_block: a user manages only their own blocks.
revoke all on public.conversation_block from anon, authenticated;
grant select, insert, delete on public.conversation_block to authenticated;
grant all on public.conversation_block to service_role;
alter table public.conversation_block enable row level security;

create policy conversation_block_own_select on public.conversation_block
  for select to authenticated
  using (blocker_id = (select auth.uid()) or public.is_staff());
create policy conversation_block_own_insert on public.conversation_block
  for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy conversation_block_own_delete on public.conversation_block
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ============================================================
-- Private attachment storage — mirrors report-attachments /
-- place-claim-documents (private bucket + participant-scoped object RLS +
-- signed-URL reads). Key layout: <conversation_id>/<message_id>/<uuid>.<ext>
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do nothing;

create policy "message_attachments_participant_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

create policy "message_attachments_participant_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
      or public.is_staff()
    )
  );

create policy "message_attachments_participant_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and public.is_conversation_participant(((storage.foldername(name))[1])::uuid)
  );

-- ============================================================
-- Extend the generic report target set with message / conversation
-- (widening a CHECK is safe — every existing row still satisfies it).
-- ============================================================
alter table public.report drop constraint if exists report_target_type_check;
alter table public.report add constraint report_target_type_check check (
  target_type in (
    'event','place','event_review','place_review','user_review',
    'user','organizer','highlight','message','conversation'
  )
);
