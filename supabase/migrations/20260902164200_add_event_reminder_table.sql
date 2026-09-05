-- Per-user, per-event reminder preference so a reminder set on one device
-- is mirrored to the user's other devices. The actual firing is still a
-- device-local scheduled notification (expo-notifications) — this table only
-- stores WHICH lead times the user chose. FK to event(id) ON DELETE CASCADE
-- so a deleted event's reminder rows disappear and every device's next
-- reconcile clears its local schedule.
--
-- Applied live via the Supabase MCP (project sderrexhawjbmsugndcq,
-- migration `add_event_reminder_table`); this file is the repo record.
create table if not exists public.event_reminder (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.event(id) on delete cascade,
  offsets integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists event_reminder_user_id_idx on public.event_reminder (user_id);
create index if not exists event_reminder_event_id_idx on public.event_reminder (event_id);

alter table public.event_reminder enable row level security;

drop policy if exists event_reminder_owner_all on public.event_reminder;
create policy event_reminder_owner_all on public.event_reminder
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.event_reminder is
  'Per-user chosen reminder lead times (minutes before start) for an event. Device-local notifications are scheduled from this; the row is the cross-device source of truth. RLS: owner-only.';
