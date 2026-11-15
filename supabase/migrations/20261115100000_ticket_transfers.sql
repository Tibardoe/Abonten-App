-- Send a ticket to a friend (Tickets, entry and teams plan, Part 1;
-- docs/architecture/ticket-transfers.md, decisions X1-X3, X15, X16, X27,
-- X38, X43, X44, all approved 2026-11-15).
--
-- A holder sends an unused ticket to another person's account (or to a
-- phone number with no account yet). The receiver accepts within 48 hours;
-- only then does the ticket move, with a NEW code and QR so the sender's
-- copy, the emailed PDF and any screenshot stop working. Until then the
-- sender keeps it and may cancel. A ticket can move at most 3 times.
--
--   ticket_transfer_program_setting  switches (off), audience, the rules
--   event_ticket_transfer_setting    the organizer's switch (absent = on)
--   ticket_transfer                  one offer and how it ended
--   ticket.issued_to                 who the ticket was first issued to
--   ticket.transfer_count            how many times it has moved
--
-- Rules the database keeps (the services check them first for wording):
--   * only the holder sends, only an active ticket whose date is not over,
--     of an event that is not cancelled, never to themselves or to someone
--     who has blocked them, never more than the programme's move limit;
--   * one open offer per ticket (unique index);
--   * the receiver must be the account named, or the account whose
--     verified phone is the number named;
--   * a free ticket counts against the person it was first issued to as
--     well as its holder, so nobody can send theirs and register again
--     (X38), and nobody can hold two free tickets of one event;
--   * an offer still open when its ticket is checked in or cancelled is
--     cancelled by trigger; one past its deadline is expired by a job that
--     tells the sender the ticket is theirs again.
--
-- The refund of a sent ticket still goes to whoever paid: refunds follow
-- the transaction, never the holder. Everything here is service-role only.
-- The programme ships switched off.

-- ---------------------------------------------------------------------------
-- 1. Programme settings and the organizer's switch
-- ---------------------------------------------------------------------------

create table public.ticket_transfer_program_setting (
  id                           smallint primary key default 1 check (id = 1),
  enabled                      boolean not null default false,
  audience                     text not null default 'staff'
                                 check (audience in ('staff', 'beta', 'all')),
  beta_user_ids                uuid[] not null default '{}',
  -- How many times one ticket may change hands (X2).
  max_moves                    smallint not null default 3
                                 check (max_moves between 1 and 10),
  -- How long the receiver has to accept (X3).
  accept_hours                 smallint not null default 48
                                 check (accept_hours between 1 and 336),
  -- Texts to numbers without an account, per sender per day (X44).
  texts_per_sender_per_day     smallint not null default 20
                                 check (texts_per_sender_per_day between 0 and 200),
  updated_at                   timestamptz not null default now(),
  updated_by                   uuid references public.user_info (id) on delete set null
);

insert into public.ticket_transfer_program_setting (id) values (1)
on conflict (id) do nothing;

-- On unless the organizer switched it off (X1), for example when guests
-- must be named in advance.
create table public.event_ticket_transfer_setting (
  event_id    uuid primary key references public.event (id) on delete cascade,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.user_info (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- 2. The ticket learns who it was first issued to, and how often it moved
-- ---------------------------------------------------------------------------

alter table public.ticket
  add column if not exists issued_to uuid references public.user_info (id),
  add column if not exists transfer_count smallint not null default 0
    check (transfer_count >= 0);

update public.ticket set issued_to = user_id where issued_to is null;

alter table public.ticket alter column issued_to set not null;

create or replace function public.ticket_set_issued_to()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.issued_to is null then
    new.issued_to := new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function public.ticket_set_issued_to() from public, anon, authenticated;

drop trigger if exists ticket_set_issued_to on public.ticket;
create trigger ticket_set_issued_to
  before insert on public.ticket
  for each row execute function public.ticket_set_issued_to();

-- One free registration per person, counted by who it was issued to (the
-- holder index ticket_one_active_free_registration stays as it is).
create unique index if not exists ticket_one_free_registration_per_issuee
  on public.ticket (issued_to, ticket_type_id)
  where status = 'active' and ticket_checkout_id is null;

create index if not exists idx_ticket_issued_to on public.ticket (issued_to);

-- ---------------------------------------------------------------------------
-- 3. Offers
-- ---------------------------------------------------------------------------

create table public.ticket_transfer (
  id             uuid primary key default gen_random_uuid(),
  ticket_id      uuid not null references public.ticket (id) on delete cascade,
  event_id       uuid not null references public.event (id) on delete cascade,
  from_user_id   uuid not null references public.user_info (id) on delete restrict,
  -- The account named, or (to_phone) a number with no account yet; the
  -- accepting account is written here when it accepts.
  to_user_id     uuid references public.user_info (id) on delete restrict,
  to_phone       text check (to_phone is null or to_phone ~ '^\+[1-9][0-9]{6,14}$'),
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  -- Why a cancelled offer ended: the sender cancelled, or the ticket or its
  -- event changed under it.
  cancel_reason  text check (cancel_reason in ('sender', 'ticket_changed', 'restricted')),
  from_code      text not null,
  to_code        text,
  text_sent_at   timestamptz,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  decided_at     timestamptz,
  constraint ticket_transfer_has_receiver check (to_user_id is not null or to_phone is not null),
  constraint ticket_transfer_not_to_self check (to_user_id is distinct from from_user_id)
);

create unique index ticket_transfer_one_open_per_ticket
  on public.ticket_transfer (ticket_id) where status = 'pending';
create index ticket_transfer_to_user
  on public.ticket_transfer (to_user_id, status, created_at desc);
create index ticket_transfer_to_phone_open
  on public.ticket_transfer (to_phone) where status = 'pending' and to_user_id is null;
create index ticket_transfer_from_user
  on public.ticket_transfer (from_user_id, created_at desc);
create index ticket_transfer_open_expiry
  on public.ticket_transfer (expires_at) where status = 'pending';
create index ticket_transfer_ticket on public.ticket_transfer (ticket_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Access: service role only
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'ticket_transfer_program_setting', 'event_ticket_transfer_setting', 'ticket_transfer'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Helpers
-- ---------------------------------------------------------------------------

-- The account whose VERIFIED phone is this number, if any. auth.users keeps
-- the number without its plus sign.
create or replace function public.ticket_transfer_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  join public.user_info ui on ui.id = u.id
  where u.phone_confirmed_at is not null
    and u.phone = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    and ui.status_id = 1
  limit 1;
$$;

-- The verified phone of an account, with its plus sign, or null.
create or replace function public._ticket_transfer_verified_phone(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '+' || u.phone
  from auth.users u
  where u.id = p_user_id
    and u.phone_confirmed_at is not null
    and coalesce(u.phone, '') <> '';
$$;

-- Raises a coded error the services turn into words.
create or replace function public._ticket_transfer_fail(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'ticket_transfer:%', p_code using errcode = 'P0001';
end;
$$;

-- What every send and accept checks about the ticket itself, with the
-- ticket row already locked by the caller.
create or replace function public._ticket_transfer_check_ticket(
  p_ticket public.ticket,
  p_event_status text,
  p_max_moves smallint
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_ticket.status <> 'active' then
    perform public._ticket_transfer_fail('ticket_not_active');
  end if;
  if p_ticket.expires_at <= now() then
    perform public._ticket_transfer_fail('event_over');
  end if;
  -- 'canceled' and 'completed' events take no more moves.
  if p_event_status is distinct from 'published' then
    perform public._ticket_transfer_fail('event_over');
  end if;
  if p_ticket.transfer_count >= p_max_moves then
    perform public._ticket_transfer_fail('too_many_moves');
  end if;
end;
$$;

-- A free registration may not end up with someone who already holds or was
-- issued one for the same ticket type (X38 from the receiver's side).
create or replace function public._ticket_transfer_check_free(
  p_ticket public.ticket,
  p_receiver uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_ticket.ticket_checkout_id is null
     and p_ticket.transaction_id is null
     and exists (
       select 1 from public.ticket t
       where t.ticket_type_id = p_ticket.ticket_type_id
         and t.id <> p_ticket.id
         and t.status in ('active', 'used')
         and t.ticket_checkout_id is null
         and (t.user_id = p_receiver or t.issued_to = p_receiver)
     ) then
    perform public._ticket_transfer_fail('receiver_has_free_ticket');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Send, accept, decline, cancel, expire
-- ---------------------------------------------------------------------------

create or replace function public.ticket_transfer_send(
  p_ticket_id    uuid,
  p_from_user_id uuid,
  p_to_user_id   uuid,
  p_to_phone     text
)
returns table (transfer_id uuid, expires_at timestamptz, event_id uuid, resolved_to_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting public.ticket_transfer_program_setting;
  v_ticket public.ticket;
  v_event_id uuid;
  v_event_status text;
  v_to uuid := p_to_user_id;
  v_id uuid;
  v_expires timestamptz;
begin
  if p_to_user_id is null and coalesce(p_to_phone, '') = '' then
    perform public._ticket_transfer_fail('no_receiver');
  end if;

  select * into v_setting from public.ticket_transfer_program_setting where id = 1;

  select * into v_ticket from public.ticket where id = p_ticket_id for update;
  if not found or v_ticket.user_id <> p_from_user_id then
    perform public._ticket_transfer_fail('not_holder');
  end if;

  select tt.event_id, e.status into v_event_id, v_event_status
  from public.ticket_type tt
  join public.event e on e.id = tt.event_id
  where tt.id = v_ticket.ticket_type_id;

  perform public._ticket_transfer_check_ticket(v_ticket, v_event_status, v_setting.max_moves);

  if exists (
    select 1 from public.event_ticket_transfer_setting s
    where s.event_id = v_event_id and not s.enabled
  ) then
    perform public._ticket_transfer_fail('organizer_off');
  end if;

  if exists (
    select 1 from public.user_info where id = p_from_user_id and status_id <> 1
  ) then
    perform public._ticket_transfer_fail('sender_restricted');
  end if;

  -- A number that belongs to an account is sent to that account.
  if v_to is null then
    v_to := public.ticket_transfer_user_by_phone(p_to_phone);
  end if;

  if v_to is not null then
    if v_to = p_from_user_id then
      perform public._ticket_transfer_fail('self');
    end if;
    if not exists (select 1 from public.user_info where id = v_to and status_id = 1) then
      perform public._ticket_transfer_fail('receiver_unavailable');
    end if;
    if exists (
      select 1 from public.conversation_block b
      where b.blocker_id = v_to and b.blocked_id = p_from_user_id
        and b.conversation_id is null
    ) then
      perform public._ticket_transfer_fail('receiver_unavailable');
    end if;
    perform public._ticket_transfer_check_free(v_ticket, v_to);
  end if;

  if exists (
    select 1 from public.ticket_transfer t
    where t.ticket_id = p_ticket_id and t.status = 'pending'
  ) then
    perform public._ticket_transfer_fail('already_pending');
  end if;

  v_expires := now() + make_interval(hours => v_setting.accept_hours);

  insert into public.ticket_transfer (
    ticket_id, event_id, from_user_id, to_user_id, to_phone, from_code, expires_at
  )
  values (
    p_ticket_id, v_event_id, p_from_user_id, v_to,
    case when v_to is null then p_to_phone else null end,
    v_ticket.ticket_code, v_expires
  )
  returning id into v_id;

  return query select v_id, v_expires, v_event_id, v_to;
end;
$$;

create or replace function public.ticket_transfer_accept(
  p_transfer_id   uuid,
  p_user_id       uuid,
  p_new_code      text,
  p_qr_public_id  text,
  p_qr_version    text
)
returns table (ticket_id uuid, from_user_id uuid, event_id uuid, old_qr_public_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting public.ticket_transfer_program_setting;
  v_transfer public.ticket_transfer;
  v_ticket public.ticket;
  v_event_status text;
  v_name text;
begin
  if coalesce(p_new_code, '') = '' or coalesce(p_qr_public_id, '') = ''
     or coalesce(p_qr_version, '') = '' then
    perform public._ticket_transfer_fail('missing_code');
  end if;

  select * into v_setting from public.ticket_transfer_program_setting where id = 1;

  select * into v_transfer from public.ticket_transfer where id = p_transfer_id for update;
  if not found then
    perform public._ticket_transfer_fail('not_found');
  end if;
  if v_transfer.status <> 'pending' then
    perform public._ticket_transfer_fail('not_pending');
  end if;
  if v_transfer.expires_at <= now() then
    perform public._ticket_transfer_fail('expired');
  end if;
  if v_transfer.to_user_id is not null then
    if v_transfer.to_user_id <> p_user_id then
      perform public._ticket_transfer_fail('not_receiver');
    end if;
  elsif public._ticket_transfer_verified_phone(p_user_id) is distinct from v_transfer.to_phone then
    perform public._ticket_transfer_fail('not_receiver');
  end if;
  if p_user_id = v_transfer.from_user_id then
    perform public._ticket_transfer_fail('self');
  end if;
  if not exists (select 1 from public.user_info where id = p_user_id and status_id = 1) then
    perform public._ticket_transfer_fail('receiver_unavailable');
  end if;

  select * into v_ticket from public.ticket where id = v_transfer.ticket_id for update;
  if v_ticket.user_id <> v_transfer.from_user_id then
    perform public._ticket_transfer_fail('ticket_changed');
  end if;

  select e.status into v_event_status
  from public.ticket_type tt join public.event e on e.id = tt.event_id
  where tt.id = v_ticket.ticket_type_id;

  perform public._ticket_transfer_check_ticket(v_ticket, v_event_status, v_setting.max_moves);
  perform public._ticket_transfer_check_free(v_ticket, p_user_id);

  update public.ticket
  set user_id = p_user_id,
      ticket_code = p_new_code,
      qr_public_id = p_qr_public_id,
      qr_version = p_qr_version,
      transfer_count = transfer_count + 1,
      updated_at = now()
  where id = v_ticket.id;

  -- The attendee row follows the ticket, carrying the holder's own name
  -- instead of the buyer's contact details.
  select full_name into v_name from public.user_info where id = p_user_id;
  update public.attendance
  set user_id = p_user_id,
      name = v_name,
      email = null,
      phone = null,
      for_someone_else = false
  where attendance.ticket_id = v_ticket.id;

  update public.ticket_transfer
  set status = 'accepted',
      to_user_id = p_user_id,
      to_code = p_new_code,
      decided_at = now()
  where id = p_transfer_id;

  return query select v_ticket.id, v_transfer.from_user_id, v_transfer.event_id, v_ticket.qr_public_id;
end;
$$;

-- The receiver says no: the ticket stays with the sender.
create or replace function public.ticket_transfer_decline(p_transfer_id uuid, p_user_id uuid)
returns table (from_user_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.ticket_transfer;
begin
  select * into v_transfer from public.ticket_transfer where id = p_transfer_id for update;
  if not found then
    perform public._ticket_transfer_fail('not_found');
  end if;
  if v_transfer.status <> 'pending' then
    perform public._ticket_transfer_fail('not_pending');
  end if;
  if v_transfer.to_user_id is not null then
    if v_transfer.to_user_id <> p_user_id then
      perform public._ticket_transfer_fail('not_receiver');
    end if;
  elsif public._ticket_transfer_verified_phone(p_user_id) is distinct from v_transfer.to_phone then
    perform public._ticket_transfer_fail('not_receiver');
  end if;

  update public.ticket_transfer
  set status = 'declined', to_user_id = coalesce(to_user_id, p_user_id), decided_at = now()
  where id = p_transfer_id;

  return query select v_transfer.from_user_id, v_transfer.event_id;
end;
$$;

-- The sender takes the offer back before it is accepted.
create or replace function public.ticket_transfer_cancel(p_transfer_id uuid, p_user_id uuid)
returns table (to_user_id uuid, event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer public.ticket_transfer;
begin
  select * into v_transfer from public.ticket_transfer where id = p_transfer_id for update;
  if not found or v_transfer.from_user_id <> p_user_id then
    perform public._ticket_transfer_fail('not_found');
  end if;
  if v_transfer.status <> 'pending' then
    perform public._ticket_transfer_fail('not_pending');
  end if;

  update public.ticket_transfer
  set status = 'cancelled', cancel_reason = 'sender', decided_at = now()
  where id = p_transfer_id;

  return query select v_transfer.to_user_id, v_transfer.event_id;
end;
$$;

-- An offer whose ticket was checked in, cancelled or refunded is over.
create or replace function public.ticket_transfer_on_ticket_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.status <> 'active' then
    update public.ticket_transfer
    set status = 'cancelled', cancel_reason = 'ticket_changed', decided_at = now()
    where ticket_transfer.ticket_id = new.id and ticket_transfer.status = 'pending';
  end if;
  return null;
end;
$$;

revoke all on function public.ticket_transfer_on_ticket_change() from public, anon, authenticated;

drop trigger if exists ticket_transfer_on_ticket_change on public.ticket;
create trigger ticket_transfer_on_ticket_change
  after update of status on public.ticket
  for each row execute function public.ticket_transfer_on_ticket_change();

-- The job: offers past their deadline end, and each sender is told the
-- ticket is theirs again (a registry notice, worded in their language).
create or replace function public.ticket_transfer_expire_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with ended as (
    update public.ticket_transfer t
    set status = 'expired', decided_at = now()
    where t.status = 'pending' and t.expires_at <= now()
    returning t.id, t.from_user_id, t.event_id, t.ticket_id
  ),
  notices as (
    insert into public.notification (user_id, type, title, body, link, data, image_public_id, image_version)
    select en.from_user_id,
           'ticket_transfer_expired',
           'Your ticket for ' || e.title || ' is still yours',
           'Nobody accepted it in time, so it stayed in your tickets.',
           '/manage/my-events',
           jsonb_build_object(
             'kind', 'ticket_transfer',
             'transferId', en.id,
             'ticketId', en.ticket_id,
             'eventId', en.event_id,
             'notice', jsonb_build_object(
               'id', 'ticket_transfer_expired',
               'params', jsonb_build_object('title', e.title)
             )
           ),
           e.flyer_public_id,
           e.flyer_version
    from ended en
    join public.event e on e.id = en.event_id
    returning id, user_id
  ),
  pushes as (
    insert into public.notification_delivery (notification_id, user_id, channel, source, urgent)
    select n.id, n.user_id, 'push', 'app', false
    from notices n
    on conflict (notification_id, channel) do nothing
    returning 1
  )
  select count(*) into v_count from ended;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Free registrations count against who they were issued to (X38)
-- ---------------------------------------------------------------------------

create or replace function public.issue_free_ticket(p_user_id uuid, p_event_id uuid, p_occurrence_id uuid, p_ticket_code text, p_qr_public_id text, p_qr_version text, p_expires_at timestamp with time zone)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_caller uuid := auth.uid();
  v_event_status text;
  v_event_starts_at timestamptz;
  v_occ_count integer;
  v_has_future boolean;
  v_ticket_type_id uuid;
  v_ticket_id uuid;
  v_updated_qty integer;
begin
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  if v_caller is not null and v_caller <> p_user_id then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_expires_at is null then
    raise exception 'expiry is required';
  end if;

  if coalesce(p_ticket_code, '') = ''
     or coalesce(p_qr_public_id, '') = ''
     or coalesce(p_qr_version, '') = '' then
    raise exception 'ticket code and qr are required';
  end if;

  -- ---- Sales-window guard (server clock is authoritative) -------------
  select status, starts_at
    into v_event_status, v_event_starts_at
  from public.event
  where id = p_event_id;

  if not found then
    raise exception 'No event found!' using errcode = 'no_data_found';
  end if;

  if v_event_status is distinct from 'published' then
    raise exception 'This event is no longer accepting RSVPs.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_occ_count
  from public.event_occurrence
  where event_id = p_event_id;

  if v_occ_count > 0 then
    v_has_future := exists (
      select 1 from public.event_occurrence
      where event_id = p_event_id and starts_at > now()
    );
  else
    v_has_future := v_event_starts_at is not null
      and v_event_starts_at > now();
  end if;

  if not v_has_future then
    raise exception 'This event is not open for registration.'
      using errcode = 'check_violation';
  end if;

  if p_occurrence_id is not null then
    if not exists (
      select 1 from public.event_occurrence
      where id = p_occurrence_id
        and event_id = p_event_id
        and starts_at > now()
    ) then
      raise exception 'That date is no longer available.'
        using errcode = 'check_violation';
    end if;
  end if;
  -- -------------------------------------------------------------------

  select id into v_ticket_type_id
  from public.ticket_type
  where event_id = p_event_id and type = 'FREE'
  limit 1;

  if v_ticket_type_id is null then
    raise exception 'This event has no free registration available'
      using errcode = 'no_data_found';
  end if;

  -- Friendly pre-check (the partial unique indexes
  -- ticket_one_active_free_registration and
  -- ticket_one_free_registration_per_issuee are the real race guarantee).
  -- A free ticket the person was issued and then sent on still counts as
  -- theirs (X38).
  if exists (
    select 1 from public.ticket
    where (user_id = p_user_id or issued_to = p_user_id)
      and ticket_type_id = v_ticket_type_id
      and status in ('active', 'used')
      and ticket_checkout_id is null
  ) then
    raise exception 'Ticket for this event already bought'
      using errcode = 'unique_violation';
  end if;

  -- Atomic single-unit reservation — no read-then-write window.
  update public.ticket_type
  set quantity = quantity - 1
  where id = v_ticket_type_id
    and (quantity is null or quantity >= 1)
  returning quantity into v_updated_qty;

  if not found then
    raise exception 'That ticket is no longer available.'
      using errcode = 'check_violation';
  end if;

  begin
    insert into public.ticket (
      user_id, ticket_type_id, transaction_id, seat_number, status,
      qr_public_id, qr_version, expires_at, used_at, ticket_code,
      occurrence_id, created_at, updated_at
    )
    values (
      p_user_id, v_ticket_type_id, null, null, 'active',
      p_qr_public_id, p_qr_version, p_expires_at, null, p_ticket_code,
      p_occurrence_id, now(), null
    )
    returning id into v_ticket_id;
  exception when unique_violation then
    raise exception 'Ticket for this event already bought'
      using errcode = 'unique_violation';
  end;

  insert into public.attendance (
    user_id, event_id, ticket_type_id, ticket_id, status, number_of_tickets
  )
  values (
    p_user_id, p_event_id, v_ticket_type_id, v_ticket_id, 'attending', 1
  );

  return v_ticket_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Grants and the job
-- ---------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.ticket_transfer_user_by_phone(text)',
    'public._ticket_transfer_verified_phone(uuid)',
    'public._ticket_transfer_fail(text)',
    'public._ticket_transfer_check_ticket(public.ticket, text, smallint)',
    'public._ticket_transfer_check_free(public.ticket, uuid)',
    'public.ticket_transfer_send(uuid, uuid, uuid, text)',
    'public.ticket_transfer_accept(uuid, uuid, text, text, text)',
    'public.ticket_transfer_decline(uuid, uuid)',
    'public.ticket_transfer_cancel(uuid, uuid)',
    'public.ticket_transfer_expire_due()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

select cron.schedule(
  'ticket-transfers-expire',
  '*/10 * * * *',
  $$select public.ticket_transfer_expire_due();$$
);

-- ---------------------------------------------------------------------------
-- 9. Admin permissions (Admin › Ticket transfers)
-- ---------------------------------------------------------------------------

insert into public.admin_permission (key, label, description) values
  ('transfers.view',      'View ticket transfers',
     'See the offers people made to send tickets, and the programme settings.'),
  ('transfers.configure', 'Configure ticket transfers',
     'Switch sending tickets on or off, choose the audience and set the rules. Requires step-up.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('finance_admin', 'transfers.view'),
  ('finance_admin', 'transfers.configure'),
  ('operations',    'transfers.view'),
  ('operations',    'transfers.configure'),
  ('support_admin', 'transfers.view')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 10. Checks
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'ticket_transfer_program_setting', 'event_ticket_transfer_setting', 'ticket_transfer'
  ] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t)::regclass) then
      raise exception 'migration check: % has row level security off', t;
    end if;
    if has_table_privilege('anon', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'select')
       or has_table_privilege('authenticated', format('public.%I', t), 'insert')
       or has_table_privilege('authenticated', format('public.%I', t), 'update') then
      raise exception 'migration check: % is reachable from the apps', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.ticket_transfer_send(uuid, uuid, uuid, text)', 'execute')
     or has_function_privilege('authenticated', 'public.ticket_transfer_accept(uuid, uuid, text, text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.ticket_transfer_user_by_phone(text)', 'execute')
     or has_function_privilege('anon', 'public.ticket_transfer_user_by_phone(text)', 'execute') then
    raise exception 'migration check: a transfer function is callable by the apps';
  end if;
  if (select enabled from public.ticket_transfer_program_setting where id = 1) then
    raise exception 'migration check: sending tickets must ship switched off';
  end if;
  if exists (select 1 from public.ticket where issued_to is null) then
    raise exception 'migration check: a ticket has no issued_to';
  end if;
  if not exists (select 1 from cron.job where jobname = 'ticket-transfers-expire' and active) then
    raise exception 'migration check: the ticket-transfers job is not scheduled';
  end if;
end;
$$;
