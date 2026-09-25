-- Full-system audit 2026-09-25: columns a listing owner must not write
-- directly.
--
-- Organizers and place owners hold UPDATE on their own rows (RLS), and the
-- table grants cover every column, so a signed-in owner could PATCH
-- straight through the Data API (verified against the local stack):
--   * event.featured = true — the Featured banner without paying for a
--     promotion (nothing in the apps sets it; production has none);
--   * event.currency / country_code — the docs promise both are fixed at
--     creation; changing them broke "orders never mix markets" and moved a
--     listing in or out of a live market's discovery;
--   * event/place timezone and place.country_code — forged zones shift
--     every displayed time; a forged country put a listing from a market
--     that is not live into a live one's discovery;
--   * published_at / archived_at — faking "just published" ranking, or
--     un-archiving an event the system archived;
--   * ticket_type.price finer than its currency (0.001 GHS).
-- The service still sets timezone / country_code after resolving them from
-- the coordinates itself — now with the service role (updateEventCore,
-- updatePlaceCore), which this guard does not restrict. Staff (is_admin) and
-- SECURITY DEFINER paths are unaffected, as in guard_staff_managed_columns.

create or replace function public.guard_listing_market_columns()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if current_user = 'authenticated' and public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Listings are created through the service (create_event /
    -- create_place), which resolves the market from the coordinates.
    raise exception 'Listings are created through Abonten, not directly'
      using errcode = '42501';
  end if;

  if new.country_code is distinct from old.country_code
     or new.timezone is distinct from old.timezone
     or new.published_at is distinct from old.published_at then
    raise exception 'A listing''s country, time zone and publish date are set by Abonten'
      using errcode = '42501';
  end if;

  if tg_table_name = 'event' then
    if new.currency is distinct from old.currency
       or new.featured is distinct from old.featured
       or new.archived_at is distinct from old.archived_at
       or new.client_request_id is distinct from old.client_request_id then
      raise exception 'That field of an event is set by Abonten'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- Named to fire after guard_staff_columns (BEFORE triggers run in name
-- order) so its existing, more specific messages still win.
drop trigger if exists listing_market_columns_guard on public.event;
create trigger listing_market_columns_guard
  before insert or update on public.event
  for each row execute function public.guard_listing_market_columns();

drop trigger if exists listing_market_columns_guard on public.place;
create trigger listing_market_columns_guard
  before insert or update on public.place
  for each row execute function public.guard_listing_market_columns();

create or replace function public.ticket_type_price_precision()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.price is not null and new.currency is not null
     and public.money_round(new.price, new.currency) <> new.price then
    raise exception 'A % price can''t have more than % decimal places',
      new.currency, public.currency_minor_units(new.currency)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- After trg_ticket_type_currency (name order), which fills the currency.
drop trigger if exists trg_ticket_type_zz_price_precision on public.ticket_type;
create trigger trg_ticket_type_zz_price_precision
  before insert or update of price, currency on public.ticket_type
  for each row execute function public.ticket_type_price_precision();

-- create_event / create_place run as their caller and take the owner,
-- country, time zone, currency — and `featured` — as parameters, and both
-- were executable by every signed-in account (and anon). Called directly
-- they skipped every check the service makes (market open for listings,
-- dates, capacity, prices) and could set `featured`. The service calls
-- them with the service role after resolving all of that itself.
revoke execute on function public.create_event(
  uuid, uuid, text, text, text, text, text, text[], double precision,
  double precision, jsonb, integer, text, text, text, timestamptz,
  timestamptz, boolean, boolean, jsonb, jsonb, jsonb, jsonb, uuid, text,
  text, text
) from public, anon, authenticated;
grant execute on function public.create_event(
  uuid, uuid, text, text, text, text, text, text[], double precision,
  double precision, jsonb, integer, text, text, text, timestamptz,
  timestamptz, boolean, boolean, jsonb, jsonb, jsonb, jsonb, uuid, text,
  text, text
) to service_role;

revoke execute on function public.create_place(
  uuid, uuid, text, text, text, smallint, double precision,
  double precision, jsonb, text, text, text, jsonb, text, text, jsonb,
  jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.create_place(
  uuid, uuid, text, text, text, smallint, double precision,
  double precision, jsonb, text, text, text, jsonb, text, text, jsonb,
  jsonb, text, text
) to service_role;
