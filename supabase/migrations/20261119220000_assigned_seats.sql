-- Assigned seats (docs/architecture/assigned-seats.md; Part 3 of
-- docs/specifications/shows-seats-and-pricing.md, decisions Y8, Y9: the
-- founder chose assigned seats, not a seat map, on 2026-11-19).
--
-- An organizer describes a venue once as a seating plan: sections
-- ("Stalls", "Balcony"), each with its rows ("A" to "N") and the seats in
-- each row. An event uses a plan; each of its ticket types sells one
-- section. When a ticket is issued — by any path: a paid checkout, a free
-- registration, a complimentary ticket — a trigger gives it the best seat
-- left in its section: a whole order side by side in one row when a row
-- has room (the run of free seats closest to the middle, front rows first),
-- otherwise the best single seat. The seat is written on the ticket
-- (ticket.seat_number, "Stalls · C12") and kept in ticket_seat, which
-- makes a seat impossible to give twice. A cancelled ticket frees its
-- seat; a ticket sent to a friend keeps it.
--
-- Issuance is never refused for want of a seat: a seated type's stock is
-- held at or below its section's seats (guard below), and a ticket that
-- still finds no seat is issued without one for the organizer to place.

begin;

-- ---------------------------------------------------------------------------
-- 1. Plans, sections, an event's plan, a ticket type's section
-- ---------------------------------------------------------------------------

create table if not exists public.seating_plan (
  id          uuid        primary key default gen_random_uuid(),
  owner_id    uuid        not null references public.user_info(id) on delete cascade,
  name        text        not null check (length(btrim(name)) between 1 and 80),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists seating_plan_owner_idx on public.seating_plan (owner_id);

create table if not exists public.seating_section (
  id        uuid    primary key default gen_random_uuid(),
  plan_id   uuid    not null references public.seating_plan(id) on delete cascade,
  name      text    not null check (length(btrim(name)) between 1 and 60),
  position  integer not null default 0,
  -- [{"label": "A", "seats": 20}, …], front row first.
  rows      jsonb   not null check (
    jsonb_typeof(rows) = 'array'
    and jsonb_array_length(rows) between 1 and 100
  ),
  seat_count integer not null default 0
);

create index if not exists seating_section_plan_idx on public.seating_section (plan_id, position);

create table if not exists public.event_seating (
  event_id  uuid primary key references public.event(id) on delete cascade,
  plan_id   uuid not null references public.seating_plan(id) on delete restrict
);

alter table public.ticket_type
  add column if not exists seating_section_id uuid references public.seating_section(id) on delete set null;

create table if not exists public.ticket_seat (
  event_id     uuid        not null references public.event(id) on delete cascade,
  section_id   uuid        not null references public.seating_section(id) on delete cascade,
  row_label    text        not null,
  seat_number  integer     not null check (seat_number >= 1),
  ticket_id    uuid        not null unique references public.ticket(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  primary key (event_id, section_id, row_label, seat_number)
);

comment on table public.seating_plan is 'A venue''s seats, described once by its organizer (sections of rows). Service role only.';
comment on table public.seating_section is 'One section of a plan: rows front first, each with its number of seats.';
comment on table public.event_seating is 'The seating plan an event uses.';
comment on table public.ticket_seat is 'Which seat a ticket holds; the primary key makes a seat impossible to give twice.';
comment on column public.ticket_type.seating_section_id is 'The section this ticket type sells (its plan must be the event''s); null = unseated.';

alter table public.seating_plan enable row level security;
alter table public.seating_section enable row level security;
alter table public.event_seating enable row level security;
alter table public.ticket_seat enable row level security;
revoke all on table public.seating_plan, public.seating_section, public.event_seating, public.ticket_seat from anon, authenticated;
grant all on table public.seating_plan, public.seating_section, public.event_seating, public.ticket_seat to service_role;

-- A section's rows: labels unique, 1–200 seats each; the count is kept.
create or replace function public.seating_section_rows_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row jsonb;
  v_total integer := 0;
  v_labels text[] := '{}';
  v_label text;
  v_seats integer;
begin
  for v_row in select * from jsonb_array_elements(new.rows)
  loop
    v_label := btrim(coalesce(v_row->>'label', ''));
    v_seats := (v_row->>'seats')::integer;
    if v_label = '' or length(v_label) > 6 or v_seats is null or v_seats < 1 or v_seats > 200 then
      raise exception 'Each row needs a label of up to 6 characters and 1 to 200 seats.'
        using errcode = 'check_violation';
    end if;
    if v_label = any (v_labels) then
      raise exception 'Two rows of a section have the same label.'
        using errcode = 'check_violation';
    end if;
    v_labels := v_labels || v_label;
    v_total := v_total + v_seats;
  end loop;
  new.seat_count := v_total;
  return new;
end;
$$;

drop trigger if exists trg_seating_section_rows on public.seating_section;
create trigger trg_seating_section_rows
  before insert or update of rows on public.seating_section
  for each row execute function public.seating_section_rows_check();

-- A seated ticket type: its section is in the event's plan, it has a
-- stock, and the types selling one section never add up to more places
-- than it has seats (deferred: the services replace types in one go).
create or replace function public.ticket_type_section_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_seats integer;
  v_taken integer;
begin
  if new.seating_section_id is null then
    return null;
  end if;
  if not exists (
    select 1 from public.event_seating es
    join public.seating_section s on s.plan_id = es.plan_id
    where es.event_id = new.event_id and s.id = new.seating_section_id
  ) then
    raise exception 'This section is not in the event''s seating plan.'
      using errcode = 'check_violation';
  end if;
  if new.quantity is null then
    raise exception 'A seated ticket type needs a number of tickets.'
      using errcode = 'check_violation';
  end if;
  select seat_count into v_seats from public.seating_section where id = new.seating_section_id;
  -- Places still for sale plus seats already held.
  select coalesce(sum(t.quantity), 0)
         + (select count(*) from public.ticket_seat ts
            where ts.event_id = new.event_id and ts.section_id = new.seating_section_id)
    into v_taken
  from public.ticket_type t
  where t.event_id = new.event_id and t.seating_section_id = new.seating_section_id;
  if v_taken > v_seats then
    raise exception 'A section has % seats; its ticket types sell %.', v_seats, v_taken
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ticket_type_section on public.ticket_type;
create constraint trigger trg_ticket_type_section
  after insert or update of seating_section_id, quantity on public.ticket_type
  deferrable initially deferred
  for each row execute function public.ticket_type_section_check();

-- ---------------------------------------------------------------------------
-- 2. Giving a ticket its seat
-- ---------------------------------------------------------------------------

create or replace function public.ticket_assign_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section   uuid;
  v_event     uuid;
  v_name      text;
  v_rows      jsonb;
  v_group     integer := 1;
  v_row       record;
  v_taken     integer[];
  v_best_row  text;
  v_best_seat integer;
  v_best_score numeric;
  v_start     integer;
  v_score     numeric;
  v_ok        boolean;
  i           integer;
  v_near      record;
begin
  select tt.seating_section_id, tt.event_id into v_section, v_event
  from public.ticket_type tt where tt.id = new.ticket_type_id;
  if v_section is null then
    return null;
  end if;
  if not exists (
    select 1 from public.event_seating es
    join public.seating_section s on s.plan_id = es.plan_id
    where es.event_id = v_event and s.id = v_section
  ) or exists (select 1 from public.ticket_seat where ticket_id = new.id) then
    return null;
  end if;

  -- One seat chooser per event at a time.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ticket_seat:' || v_event::text, 0)
  );

  select s.name, s.rows into v_name, v_rows from public.seating_section s where s.id = v_section;

  -- 1. Beside a seat this order already holds in the section.
  if new.ticket_checkout_id is not null then
    for v_near in
      select ts.row_label, ts.seat_number
      from public.ticket_seat ts
      join public.ticket t on t.id = ts.ticket_id
      where t.ticket_checkout_id = new.ticket_checkout_id
        and ts.event_id = v_event and ts.section_id = v_section
      order by ts.seat_number desc
    loop
      foreach i in array array[v_near.seat_number + 1, v_near.seat_number - 1]
      loop
        if i >= 1
           and i <= (select (r->>'seats')::integer from jsonb_array_elements(v_rows) r
                     where r->>'label' = v_near.row_label limit 1)
           and not exists (select 1 from public.ticket_seat x
                           where x.event_id = v_event and x.section_id = v_section
                             and x.row_label = v_near.row_label and x.seat_number = i) then
          v_best_row := v_near.row_label;
          v_best_seat := i;
          exit;
        end if;
      end loop;
      exit when v_best_row is not null;
    end loop;

    if v_best_row is null then
      -- The order's tickets of this type still to seat, this one included.
      select greatest(1, tc.quantity - (
               select count(*) from public.ticket_seat ts
               join public.ticket t on t.id = ts.ticket_id
               where t.ticket_checkout_id = tc.id and ts.section_id = v_section))
        into v_group
      from public.ticket_checkout tc where tc.id = new.ticket_checkout_id;
      v_group := coalesce(v_group, 1);
    end if;
  end if;

  -- 2. The best run of free seats for the whole group: front rows first,
  --    then the run closest to the middle of the row. 3. Else one seat.
  if v_best_row is null then
    for v_group in select g from (values (v_group), (1)) v(g) where g >= 1
    loop
      for v_row in
        select r->>'label' as label, (r->>'seats')::integer as seats, ord
        from jsonb_array_elements(v_rows) with ordinality as x(r, ord)
        order by ord
      loop
        select coalesce(array_agg(ts.seat_number), '{}') into v_taken
        from public.ticket_seat ts
        where ts.event_id = v_event and ts.section_id = v_section and ts.row_label = v_row.label;
        v_best_score := null;
        for v_start in 1 .. greatest(v_row.seats - v_group + 1, 0)
        loop
          v_ok := true;
          for i in v_start .. v_start + v_group - 1
          loop
            if i = any (v_taken) then
              v_ok := false;
              exit;
            end if;
          end loop;
          if v_ok then
            v_score := abs((v_start + (v_group - 1) / 2.0) - (v_row.seats + 1) / 2.0);
            if v_best_score is null or v_score < v_best_score then
              v_best_score := v_score;
              v_best_seat := v_start;
            end if;
          end if;
        end loop;
        if v_best_score is not null then
          v_best_row := v_row.label;
          exit;
        end if;
      end loop;
      exit when v_best_row is not null;
    end loop;
  end if;

  if v_best_row is null then
    -- No seat left (stock should have stopped this): issued unseated.
    return null;
  end if;

  insert into public.ticket_seat (event_id, section_id, row_label, seat_number, ticket_id)
  values (v_event, v_section, v_best_row, v_best_seat, new.id);

  update public.ticket
  set seat_number = v_name || ' · ' || v_best_row || v_best_seat::text
  where id = new.id;

  return null;
end;
$$;

revoke all on function public.ticket_assign_seat() from public, anon, authenticated;

drop trigger if exists trg_ticket_assign_seat on public.ticket;
create trigger trg_ticket_assign_seat
  after insert on public.ticket
  for each row execute function public.ticket_assign_seat();

-- A cancelled ticket frees its seat (the label stays on it as history).
create or replace function public.ticket_release_seat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    delete from public.ticket_seat where ticket_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function public.ticket_release_seat() from public, anon, authenticated;

drop trigger if exists trg_ticket_release_seat on public.ticket;
create trigger trg_ticket_release_seat
  after update of status on public.ticket
  for each row execute function public.ticket_release_seat();

-- ---------------------------------------------------------------------------
-- 3. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if has_table_privilege('authenticated', 'public.ticket_seat', 'select')
     or has_table_privilege('authenticated', 'public.seating_plan', 'select') then
    raise exception 'migration check: seating tables are service role only';
  end if;
end;
$$;

commit;
