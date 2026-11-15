-- Team accounts, stage 3: a team's money (Tickets, entry and teams plan,
-- Part 2; docs/architecture/team-accounts.md §4b; decisions X5 and X6).
--
-- Owners and Finance see the team's sales, earnings, balance, ledger and
-- payouts; they request payouts to the team's payout account; Owners
-- (events and refunds together) cancel an event with its refunds. Every
-- organizer money function takes the account it reports on
-- (p_account, null = the signed-in person) and checks that the signed-in
-- person acts for it in a role that covers the request. They are SECURITY
-- DEFINER now: the check is theirs, and the rows they read (the team's
-- ledger, its buyers' payments) are not the caller's own.
--
-- A team's first payout to a payout account added less than 48 hours ago is
-- refused (X6): every Owner is told when an account is added, so a change
-- nobody asked for can be stopped before money moves.
--
-- Notices addressed to a team reach its members: a copy for each active
-- member whose role covers the notice (bookings to the front desk,
-- reviews to content, money to Finance; Owners always).
--
-- Nothing here is reachable until a team exists, and teams ship switched
-- off (team_program_setting).

-- ---------------------------------------------------------------------------
-- 1. Finance may request payouts
-- ---------------------------------------------------------------------------

create or replace function public.team_role_can(p_role text, p_capability text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then true
    when 'finance' then p_capability in (
      'money.view', 'refunds.issue', 'payout.view', 'payout.request'
    )
    when 'manager' then p_capability in (
      'events.manage', 'places.manage', 'promo.manage', 'bookings.manage',
      'attendees.view', 'checkin.scan'
    )
    when 'content' then p_capability in ('messages.reply', 'content.post', 'reviews.reply')
    when 'door' then p_capability in ('checkin.scan')
    when 'front_desk' then p_capability in ('bookings.manage', 'visit.show')
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The account a money request is for
-- ---------------------------------------------------------------------------

-- The signed-in person's own account (p_account null or their own id), or
-- the named team when their role there covers every capability in p_caps.
-- Anything else is refused: a money function never answers for an account
-- the caller cannot act for.
create or replace function public.acting_account_for(p_account uuid, p_caps text[])
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c text;
begin
  if p_account is null or p_account = auth.uid() then
    return auth.uid();
  end if;
  foreach c in array p_caps loop
    if not (p_account = any (public.acting_accounts(array[c]))) then
      raise exception 'Not allowed for this account' using errcode = '42501';
    end if;
  end loop;
  return p_account;
end;
$$;

revoke all on function public.acting_account_for(uuid, text[]) from public, anon;
grant execute on function public.acting_account_for(uuid, text[]) to authenticated, service_role;

-- Who asked for a payout (a team's member, or the organizer themselves).
alter table public.payout
  add column if not exists requested_by uuid references public.user_info(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 3. The organizer money functions act for an account
-- ---------------------------------------------------------------------------

drop function public.cancel_event_and_release_tickets(p_event_id uuid);
drop function public.get_event_cancellation_impact(p_event_id uuid);
drop function public.get_event_date_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone);
drop function public.get_event_overview_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone);
drop function public.get_event_promo_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone);
drop function public.get_event_refund_breakdown(p_event_id uuid);
drop function public.get_event_returning_attendee_stats(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone);
drop function public.get_event_sales_timeline(p_event_id uuid);
drop function public.get_event_ticket_type_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone);
drop function public.get_organizer_dashboard_overview(p_start timestamp with time zone, p_end timestamp with time zone);
drop function public.get_organizer_event_performance(p_start timestamp with time zone, p_end timestamp with time zone, p_sort text, p_limit integer);
drop function public.get_organizer_finance_overview();
drop function public.get_organizer_ledger_transactions(p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer);
drop function public.get_organizer_needs_attention(p_days_soon integer);
drop function public.get_organizer_pending_earnings();
drop function public.get_organizer_recent_activity(p_limit integer);
drop function public.get_organizer_refund_breakdown();
drop function public.get_organizer_sales_timeline(p_start timestamp with time zone, p_end timestamp with time zone, p_bucket text, p_currency text, p_timezone text);
drop function public.get_organizer_upcoming_events(p_limit integer);
drop function public.request_organizer_payout(p_payout_account_id uuid, p_amount numeric, p_currency text);
drop function public.get_organizer_dashboard(p_start timestamp with time zone, p_end timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_bucket text, p_timezone text);

CREATE OR REPLACE FUNCTION public.cancel_event_and_release_tickets(p_event_id uuid, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(refund_transaction_id uuid, attendee_user_id uuid, provider text, provider_reference text, transaction_amount numeric, transaction_currency character varying, event_title text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event_id uuid;
  v_event_title text;
  v_current_status text;
begin
  update public.event
     set status = 'canceled'
   where id = p_event_id
     and organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['events.manage', 'refunds.issue']))
     and status in ('draft', 'published')
  returning id, title into v_event_id, v_event_title;

  if v_event_id is null then
    select status into v_current_status
      from public.event
     where id = p_event_id and organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['events.manage', 'refunds.issue']));

    if v_current_status is null then
      raise exception 'Event not found or not owned by caller';
    elsif v_current_status = 'canceled' then
      raise exception 'Event is already cancelled';
    else
      raise exception 'Event cannot be cancelled from its current status';
    end if;
  end if;

  return query
  with cancelled_tickets as (
    update public.ticket t
       set status = 'cancelled', updated_at = now()
      from public.ticket_type tt
     where t.ticket_type_id = tt.id
       and tt.event_id = v_event_id
       and t.status in ('active', 'used')
    returning t.id as ticket_id, t.user_id, t.transaction_id
  ),
  cancel_attendance as (
    update public.attendance
       set status = 'cancelled'
     where event_id = v_event_id
       and status = 'attending'
    returning id
  ),
  cancel_checkouts as (
    update public.ticket_checkout
       set status = 'cancelled', updated_at = now()
     where event_id = v_event_id
       and status = 'paid'
    returning id
  ),
  refundable as (
    select
      ct.user_id,
      ct.transaction_id,
      tr.amount,
      coalesce(tr.amount, 0) + coalesce(tr.credit_amount, 0) as paid_total,
      tr.currency,
      tr.provider,
      tr.provider_reference
    from cancelled_tickets ct
    left join public.transaction tr on tr.id = ct.transaction_id
  ),
  notify as (
    insert into public.notification (user_id, type, title, body, link)
    select distinct on (r.user_id)
      r.user_id,
      'event_cancelled',
      'Event cancelled',
      case
        when r.paid_total > 0 then format(
          'The organizer has cancelled %s. Your ticket is no longer valid. A refund will be issued to the payment method used for your ticket.',
          v_event_title
        )
        else format(
          'The organizer has cancelled %s. Your registration has been cancelled.',
          v_event_title
        )
      end,
      case when r.paid_total > 0 then '/manage/my-events?tab=refunds' else '/manage/my-events?tab=cancelled' end
    from refundable r
    order by r.user_id, (r.paid_total > 0) desc nulls last
    returning id
  )
  select distinct
    r.transaction_id, r.user_id, r.provider, r.provider_reference, r.paid_total, r.currency, v_event_title
    from refundable r
   where r.transaction_id is not null and r.paid_total > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_cancellation_impact(p_event_id uuid, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(paid_ticket_count integer, free_ticket_count integer, attendee_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_owns_event boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.event
     WHERE id = p_event_id AND organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['events.manage', 'refunds.issue']))
  ) INTO v_owns_event;

  IF NOT v_owns_event THEN
    RAISE EXCEPTION 'Event not found or not owned by caller';
  END IF;

  RETURN QUERY
  SELECT
    count(*) FILTER (WHERE t.transaction_id IS NOT NULL AND tr.amount > 0)::integer,
    count(*) FILTER (WHERE t.transaction_id IS NULL OR tr.amount IS NULL OR tr.amount = 0)::integer,
    count(DISTINCT t.user_id)::integer
  FROM public.ticket t
  JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
  LEFT JOIN public.transaction tr ON tr.id = t.transaction_id
  WHERE tt.event_id = p_event_id
    AND t.status IN ('active', 'used');
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_date_analytics(p_event_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(occurrence_id uuid, starts_at timestamp with time zone, ends_at timestamp with time zone, tickets_sold bigint, tickets_cancelled bigint, revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ticket_counts AS (
    SELECT
      t.occurrence_id,
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
      AND (p_start_date IS NULL OR t.issued_at >= p_start_date)
      AND (p_end_date IS NULL OR t.issued_at <= p_end_date)
    GROUP BY t.occurrence_id
  ),
  revenue_totals AS (
    SELECT
      tc.occurrence_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
      AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
    GROUP BY tc.occurrence_id
  )
  SELECT
    eo.id,
    eo.starts_at,
    eo.ends_at,
    COALESCE(ticket_counts.sold, 0),
    COALESCE(ticket_counts.cancelled, 0),
    COALESCE(revenue_totals.revenue, 0)
  FROM public.event_occurrence eo
  LEFT JOIN ticket_counts ON ticket_counts.occurrence_id = eo.id
  LEFT JOIN revenue_totals ON revenue_totals.occurrence_id = eo.id
  WHERE eo.event_id = p_event_id

  UNION ALL

  SELECT
    NULL::uuid,
    NULL::timestamp with time zone,
    NULL::timestamp with time zone,
    COALESCE(ticket_counts.sold, 0),
    COALESCE(ticket_counts.cancelled, 0),
    COALESCE(revenue_totals.revenue, 0)
  FROM ticket_counts
  FULL JOIN revenue_totals ON revenue_totals.occurrence_id = ticket_counts.occurrence_id
  WHERE COALESCE(ticket_counts.occurrence_id, revenue_totals.occurrence_id) IS NULL
    AND (COALESCE(ticket_counts.sold, 0) > 0
      OR COALESCE(ticket_counts.cancelled, 0) > 0
      OR COALESCE(revenue_totals.revenue, 0) > 0)

  ORDER BY starts_at NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_overview_analytics(p_event_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_title text, starts_at timestamp with time zone, ends_at timestamp with time zone, require_registration boolean, capacity integer, currency text, tickets_sold bigint, tickets_cancelled bigint, gross_sales numeric, total_discount numeric, promo_purchase_count bigint, distinct_attendees bigint, capacity_remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH ticket_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE tt.event_id = p_event_id
      AND (p_start_date IS NULL OR t.issued_at >= p_start_date)
      AND (p_end_date IS NULL OR t.issued_at <= p_end_date)
  ),
  checkout_totals AS (
    SELECT
      COALESCE(SUM(tc.total_price), 0)                   AS gross,
      COALESCE(SUM(tc.discount), 0)                       AS discount,
      COUNT(*) FILTER (WHERE tc.promo_code IS NOT NULL)   AS promo_orders
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
      AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
  ),
  attendee_count AS (
    SELECT COUNT(DISTINCT a.user_id) AS distinct_users
    FROM public.attendance a
    WHERE a.event_id = p_event_id AND a.status = 'attending'
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
  ),
  currency_pick AS (
    SELECT tt.currency
    FROM public.ticket_type tt
    WHERE tt.event_id = p_event_id AND tt.currency IS NOT NULL
    LIMIT 1
  )
  SELECT
    e.title,
    e.starts_at,
    e.ends_at,
    e.require_registration,
    e.capacity,
    currency_pick.currency,
    ticket_counts.sold,
    ticket_counts.cancelled,
    checkout_totals.gross,
    checkout_totals.discount,
    checkout_totals.promo_orders,
    attendee_count.distinct_users,
    CASE WHEN e.capacity IS NOT NULL THEN e.capacity - ticket_counts.sold::integer ELSE NULL END
  FROM public.event e
  CROSS JOIN ticket_counts
  CROSS JOIN checkout_totals
  CROSS JOIN attendee_count
  LEFT JOIN currency_pick ON true
  WHERE e.id = p_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_promo_analytics(p_event_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(promo_code text, orders bigint, units_discounted bigint, total_discount numeric, total_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    tc.promo_code,
    COUNT(*),
    COALESCE(SUM(tc.discounted_units), 0),
    COALESCE(SUM(tc.discount), 0),
    COALESCE(SUM(tc.total_price), 0)
  FROM public.ticket_checkout tc
  WHERE tc.event_id = p_event_id
    AND tc.status = 'paid'
    AND tc.promo_code IS NOT NULL
    AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
    AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
  GROUP BY tc.promo_code
  ORDER BY COALESCE(SUM(tc.discount), 0) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_refund_breakdown(p_event_id uuid, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(currency text, refund_request_count bigint, pending_refund_amount numeric, completed_refund_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    le.currency::text,
    COUNT(DISTINCT le.transaction_id),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refund_pending'), 0),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refunded'), 0)
  FROM public.organizer_ledger_entry le
  JOIN public.transaction t ON t.id = le.transaction_id
  WHERE le.event_id = p_event_id
    AND le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
    AND le.entry_type = 'refund_hold'
  GROUP BY le.currency;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_returning_attendee_stats(p_event_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(returning_count bigint, first_time_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_organizer_id uuid;
BEGIN
  SELECT e.organizer_id INTO v_organizer_id
  FROM public.event e
  WHERE e.id = p_event_id AND e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']));

  IF v_organizer_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH current_attendees AS (
    SELECT DISTINCT a.user_id
    FROM public.attendance a
    WHERE a.event_id = p_event_id AND a.status = 'attending'
      AND (p_start_date IS NULL OR a.created_at >= p_start_date)
      AND (p_end_date IS NULL OR a.created_at <= p_end_date)
  ),
  returning_attendees AS (
    SELECT ca.user_id
    FROM current_attendees ca
    WHERE EXISTS (
      SELECT 1
      FROM public.attendance a2
      JOIN public.event e2 ON e2.id = a2.event_id
      WHERE a2.user_id = ca.user_id
        AND a2.event_id <> p_event_id
        AND a2.status = 'attending'
        AND e2.organizer_id = v_organizer_id
    )
  )
  SELECT
    (SELECT COUNT(*) FROM returning_attendees),
    (SELECT COUNT(*) FROM current_attendees) - (SELECT COUNT(*) FROM returning_attendees);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_sales_timeline(p_event_id uuid, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(sale_date date, gross numeric, orders bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    DATE(COALESCE(tc.completed_at, tc.created_at)) AS sale_date,
    COALESCE(SUM(tc.total_price), 0),
    COUNT(*)
  FROM public.ticket_checkout tc
  WHERE tc.event_id = p_event_id AND tc.status = 'paid'
  GROUP BY DATE(COALESCE(tc.completed_at, tc.created_at))
  ORDER BY sale_date;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_event_ticket_type_analytics(p_event_id uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(ticket_type_id uuid, type text, price numeric, currency text, quantity_capacity integer, sold bigint, cancelled bigint, percent_sold numeric, revenue numeric, discount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.event e
    WHERE e.id = p_event_id AND e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH sold_counts AS (
    SELECT
      t.ticket_type_id,
      COUNT(*) FILTER (WHERE t.status = 'active')    AS sold,
      COUNT(*) FILTER (WHERE t.status = 'cancelled') AS cancelled
    FROM public.ticket t
    WHERE t.ticket_type_id IN (SELECT id FROM public.ticket_type WHERE event_id = p_event_id)
      AND (p_start_date IS NULL OR t.issued_at >= p_start_date)
      AND (p_end_date IS NULL OR t.issued_at <= p_end_date)
    GROUP BY t.ticket_type_id
  ),
  revenue_totals AS (
    SELECT
      tc.ticket_type_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue,
      COALESCE(SUM(tc.discount), 0)    AS discount
    FROM public.ticket_checkout tc
    WHERE tc.event_id = p_event_id AND tc.status = 'paid'
      AND (p_start_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start_date)
      AND (p_end_date IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end_date)
    GROUP BY tc.ticket_type_id
  )
  SELECT
    tt.id,
    tt.type,
    tt.price,
    tt.currency,
    tt.quantity,
    COALESCE(sold_counts.sold, 0),
    COALESCE(sold_counts.cancelled, 0),
    CASE WHEN tt.quantity IS NOT NULL AND tt.quantity > 0
      THEN ROUND(100.0 * COALESCE(sold_counts.sold, 0) / tt.quantity, 1)
      ELSE NULL
    END,
    COALESCE(revenue_totals.revenue, 0),
    COALESCE(revenue_totals.discount, 0)
  FROM public.ticket_type tt
  LEFT JOIN sold_counts ON sold_counts.ticket_type_id = tt.id
  LEFT JOIN revenue_totals ON revenue_totals.ticket_type_id = tt.id
  WHERE tt.event_id = p_event_id
  ORDER BY tt.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_dashboard_overview(p_start timestamp with time zone, p_end timestamp with time zone, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(currency text, gross_sales numeric, total_discount numeric, distinct_purchasers bigint, paid_orders bigint, tickets_sold bigint, tickets_cancelled bigint, registrations bigint, active_events_count bigint, upcoming_events_count bigint, total_events_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.starts_at, e.ends_at
    FROM public.event e
    WHERE e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts,
      COALESCE(MAX(eo.ends_at), oe.ends_at)      AS max_ends
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.starts_at, oe.ends_at
  ),
  event_status_counts AS (
    SELECT
      COUNT(*) FILTER (
        WHERE min_starts IS NOT NULL AND now() >= min_starts AND now() <= max_ends
      ) AS ongoing_count,
      COUNT(*) FILTER (
        WHERE min_starts IS NOT NULL AND min_starts > now()
      ) AS upcoming_count,
      COUNT(*) AS total_count
    FROM occurrence_bounds
  ),
  paid_checkouts AS (
    SELECT tc.*
    FROM public.ticket_checkout tc
    JOIN organizer_events oe ON oe.id = tc.event_id
    WHERE tc.status = 'paid'
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
  ),
  money_by_currency AS (
    SELECT
      tt.currency AS currency,
      COALESCE(SUM(pc.total_price), 0) AS gross,
      COALESCE(SUM(pc.discount), 0)    AS discount,
      COUNT(DISTINCT pc.user_id)       AS purchasers,
      COUNT(*)                         AS orders
    FROM paid_checkouts pc
    JOIN public.ticket_type tt ON tt.id = pc.ticket_type_id
    GROUP BY tt.currency
  ),
  money_rows AS (
    SELECT * FROM money_by_currency
    UNION ALL
    SELECT NULL::text, 0::numeric, 0::numeric, 0::bigint, 0::bigint
    WHERE NOT EXISTS (SELECT 1 FROM money_by_currency)
  ),
  organizer_tickets AS (
    SELECT t.*, tt.price
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    JOIN organizer_events oe ON oe.id = tt.event_id
  ),
  ticket_counts_overall AS (
    SELECT
      COUNT(*) FILTER (
        WHERE ot.status = 'active' AND ot.price > 0
          AND (p_start IS NULL OR ot.created_at >= p_start)
          AND (p_end IS NULL OR ot.created_at <= p_end)
      ) AS sold,
      COUNT(*) FILTER (
        WHERE ot.status = 'cancelled'
          AND (p_start IS NULL OR ot.updated_at >= p_start)
          AND (p_end IS NULL OR ot.updated_at <= p_end)
      ) AS cancelled,
      COUNT(*) FILTER (
        WHERE ot.status = 'active' AND ot.price = 0
          AND (p_start IS NULL OR ot.created_at >= p_start)
          AND (p_end IS NULL OR ot.created_at <= p_end)
      ) AS registrations
    FROM organizer_tickets ot
  )
  SELECT
    mr.currency,
    mr.gross,
    mr.discount,
    mr.purchasers,
    mr.orders,
    tco.sold,
    tco.cancelled,
    tco.registrations,
    esc.ongoing_count + esc.upcoming_count,
    esc.upcoming_count,
    esc.total_count
  FROM money_rows mr
  CROSS JOIN ticket_counts_overall tco
  CROSS JOIN event_status_counts esc
  ORDER BY mr.orders DESC, mr.currency;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_event_performance(p_start timestamp with time zone, p_end timestamp with time zone, p_sort text, p_limit integer, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_id uuid, title text, status text, starts_at timestamp with time zone, currency text, tickets_sold bigint, revenue numeric, capacity_remaining integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_sort text := CASE WHEN p_sort IN ('revenue', 'tickets') THEN p_sort ELSE 'revenue' END;
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.title, e.starts_at, e.ends_at
    FROM public.event e
    WHERE e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts,
      COALESCE(MAX(eo.ends_at), oe.ends_at)      AS max_ends
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.starts_at, oe.ends_at
  ),
  sold_counts AS (
    SELECT tt.event_id, COUNT(*) AS sold
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE t.status = 'active'
      AND tt.event_id IN (SELECT id FROM organizer_events)
      AND (p_start IS NULL OR t.created_at >= p_start)
      AND (p_end IS NULL OR t.created_at <= p_end)
    GROUP BY tt.event_id
  ),
  revenue_totals AS (
    SELECT
      tc.event_id,
      COALESCE(SUM(tc.total_price), 0) AS revenue,
      MIN(tt.currency)                 AS currency
    FROM public.ticket_checkout tc
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE tc.status = 'paid'
      AND tc.event_id IN (SELECT id FROM organizer_events)
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
    GROUP BY tc.event_id
  ),
  capacity_totals AS (
    SELECT tt.event_id, SUM(tt.quantity) AS total_capacity
    FROM public.ticket_type tt
    WHERE tt.event_id IN (SELECT id FROM organizer_events)
    GROUP BY tt.event_id
  )
  SELECT
    oe.id,
    oe.title,
    CASE
      WHEN ob.min_starts IS NULL THEN NULL
      WHEN now() >= ob.min_starts AND now() <= ob.max_ends THEN 'ongoing'
      WHEN ob.min_starts > now() THEN 'upcoming'
      ELSE 'ended'
    END,
    oe.starts_at,
    revenue_totals.currency,
    COALESCE(sold_counts.sold, 0),
    COALESCE(revenue_totals.revenue, 0),
    CASE WHEN capacity_totals.total_capacity IS NOT NULL
      THEN (capacity_totals.total_capacity - COALESCE(sold_counts.sold, 0))::integer
      ELSE NULL
    END
  FROM organizer_events oe
  JOIN occurrence_bounds ob ON ob.id = oe.id
  LEFT JOIN sold_counts ON sold_counts.event_id = oe.id
  LEFT JOIN revenue_totals ON revenue_totals.event_id = oe.id
  LEFT JOIN capacity_totals ON capacity_totals.event_id = oe.id
  ORDER BY
    CASE WHEN v_sort = 'tickets' THEN COALESCE(sold_counts.sold, 0) END DESC NULLS LAST,
    CASE WHEN v_sort = 'revenue' THEN COALESCE(revenue_totals.revenue, 0) END DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_finance_overview(p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(currency text, pending_balance numeric, available_balance numeric, total_earnings numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH earning_rows AS (
    SELECT
      le.currency::text AS cur,
      le.amount         AS amt,
      public.is_event_settled(le.event_id) AS settled
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
      AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                            'promoter_commission', 'promoter_commission_reversal')
  ),
  earning_totals AS (
    SELECT
      er.cur,
      COALESCE(SUM(er.amt) FILTER (WHERE NOT er.settled), 0) AS pending,
      COALESCE(SUM(er.amt) FILTER (WHERE er.settled), 0)     AS settled_net,
      COALESCE(SUM(er.amt), 0)                               AS total
    FROM earning_rows er
    GROUP BY er.cur
  ),
  payout_totals AS (
    SELECT le.currency::text AS cur, COALESCE(SUM(le.amount), 0) AS net
    FROM public.organizer_ledger_entry le
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
      AND le.entry_type IN ('payout_hold', 'payout_release')
    GROUP BY le.currency::text
  ),
  currencies AS (
    SELECT cur FROM earning_totals
    UNION
    SELECT cur FROM payout_totals
  )
  SELECT
    c.cur,
    COALESCE(et.pending, 0)::numeric,
    (COALESCE(et.settled_net, 0) + COALESCE(pt.net, 0))::numeric,
    COALESCE(et.total, 0)::numeric
  FROM currencies c
  LEFT JOIN earning_totals et ON et.cur = c.cur
  LEFT JOIN payout_totals pt ON pt.cur = c.cur;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_ledger_transactions(p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(entry_id uuid, line text, event_id uuid, event_title text, amount numeric, currency text, status text, reference text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH unified AS (
    SELECT le.id, 'ticket_sale'::text, le.event_id, e.title,
           le.gross_amount, le.currency::text, 'successful'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'earning'

    UNION ALL

    SELECT le.id, 'platform_fee'::text, le.event_id, e.title,
           -1 * le.fee_amount, le.currency::text, 'completed'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'earning'
      AND COALESCE(le.fee_amount, 0) <> 0

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'processed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'refund_adjustment'

    UNION ALL

    SELECT le.id, 'refund'::text, le.event_id, e.title,
           le.amount, le.currency::text,
           CASE t.status WHEN 'refunded' THEN 'processed' ELSE 'processing' END,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    JOIN public.transaction t ON t.id = le.transaction_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'refund_hold'

    UNION ALL

    SELECT le.id, 'refund_release'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'completed'::text,
           le.transaction_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'refund_release'

    UNION ALL

    SELECT le.id, 'promoter_commission'::text, le.event_id, e.title,
           le.amount, le.currency::text,
           CASE WHEN public.is_event_settled(le.event_id) THEN 'completed' ELSE 'pending' END,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'promoter_commission'

    UNION ALL

    SELECT le.id, 'promoter_commission_reversal'::text, le.event_id, e.title,
           le.amount, le.currency::text, 'completed'::text,
           le.ticket_checkout_id::text, le.created_at
    FROM public.organizer_ledger_entry le
    LEFT JOIN public.event e ON e.id = le.event_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'promoter_commission_reversal'

    UNION ALL

    SELECT le.id, 'payout'::text, le.event_id, NULL::text,
           le.amount, le.currency::text, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'payout_hold'

    UNION ALL

    SELECT le.id, 'payout_release'::text, le.event_id, NULL::text,
           le.amount, le.currency::text, p.status,
           p.reference, le.created_at
    FROM public.organizer_ledger_entry le
    JOIN public.payout p ON p.id = le.payout_id
    WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND le.entry_type = 'payout_release'
  )
  SELECT * FROM unified u
  WHERE p_cursor_created_at IS NULL
     OR u.created_at < p_cursor_created_at
     OR (u.created_at = p_cursor_created_at AND u.id < p_cursor_id)
  ORDER BY u.created_at DESC, u.id DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_needs_attention(p_days_soon integer DEFAULT 7, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_id uuid, event_title text, rule_type text, message text, starts_at timestamp with time zone, timezone text, sold integer, remaining integer, ticket_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with organizer_events as (
    select e.id, e.title, e.starts_at, e.timezone
    from public.event e
    where e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) and e.status = 'published'
  ),
  occurrence_bounds as (
    select
      oe.id,
      oe.title,
      oe.timezone,
      coalesce(min(eo.starts_at), oe.starts_at) as min_starts
    from organizer_events oe
    left join public.event_occurrence eo on eo.event_id = oe.id
    group by oe.id, oe.title, oe.timezone, oe.starts_at
  ),
  starting_soon as (
    select * from occurrence_bounds ob
    where ob.min_starts is not null
      and ob.min_starts > now()
      and ob.min_starts <= now() + (p_days_soon || ' days')::interval
  ),
  sold_counts as (
    select tt.event_id, count(t.id) as sold, sum(tt.quantity) as capacity
    from public.ticket_type tt
    left join public.ticket t on t.ticket_type_id = tt.id and t.status = 'active'
    where tt.event_id in (select ss.id from starting_soon ss)
    group by tt.event_id
  ),
  no_sales as (
    select
      ss.id as event_id, ss.title as event_title,
      'no_sales_yet'::text as rule_type,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' with no sales yet.' as message,
      ss.min_starts as starts_at,
      ss.timezone as timezone,
      0 as sold,
      null::integer as remaining,
      null::text as ticket_type
    from starting_soon ss
    left join sold_counts sc on sc.event_id = ss.id
    where coalesce(sc.sold, 0) = 0
  ),
  low_registrations as (
    select
      ss.id as event_id, ss.title as event_title,
      'low_registrations'::text as rule_type,
      'Starts ' || to_char(ss.min_starts, 'Mon DD') || ' but only ' || sc.sold || ' sold so far.' as message,
      ss.min_starts as starts_at,
      ss.timezone as timezone,
      sc.sold::integer as sold,
      null::integer as remaining,
      null::text as ticket_type
    from starting_soon ss
    join sold_counts sc on sc.event_id = ss.id
    where sc.sold > 0
      and (
        (sc.capacity is not null and sc.capacity > 0 and sc.sold::numeric / sc.capacity < 0.2)
        or (sc.capacity is null and sc.sold < 5)
      )
  ),
  nearly_sold_out as (
    select
      tt.event_id as event_id,
      oe.title as event_title,
      'nearly_sold_out'::text as rule_type,
      tt.type || ' tickets are almost sold out (' ||
        greatest(tt.quantity - coalesce(tts.sold, 0), 0) || ' left).' as message,
      null::timestamptz as starts_at,
      oe.timezone as timezone,
      coalesce(tts.sold, 0)::integer as sold,
      greatest(tt.quantity - coalesce(tts.sold, 0), 0)::integer as remaining,
      tt.type::text as ticket_type
    from public.ticket_type tt
    join organizer_events oe on oe.id = tt.event_id
    left join (
      select t2.ticket_type_id, count(*) as sold
      from public.ticket t2
      where t2.status = 'active'
      group by t2.ticket_type_id
    ) tts on tts.ticket_type_id = tt.id
    where tt.quantity is not null and tt.quantity > 0
      and (tt.quantity - coalesce(tts.sold, 0))::numeric / tt.quantity <= 0.10
      and (tt.quantity - coalesce(tts.sold, 0)) > 0
  )
  select * from no_sales
  union all
  select * from low_registrations
  union all
  select * from nearly_sold_out
  order by rule_type;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_pending_earnings(p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_id uuid, event_title text, currency text, amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.title,
    le.currency::text,
    SUM(le.amount)
  FROM public.organizer_ledger_entry le
  JOIN public.event e ON e.id = le.event_id
  WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
    AND le.entry_type IN ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                          'promoter_commission', 'promoter_commission_reversal')
    AND NOT public.is_event_settled(le.event_id)
  GROUP BY e.id, e.title, le.currency
  HAVING SUM(le.amount) <> 0
  ORDER BY SUM(le.amount) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_recent_activity(p_limit integer, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(activity_type text, event_id uuid, event_title text, occurred_at timestamp with time zone, detail text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.title
    FROM public.event e
    WHERE e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND e.status = 'published'
  ),
  sales AS (
    SELECT
      'ticket_sold'::text AS activity_type,
      tc.event_id,
      oe.title AS event_title,
      COALESCE(tc.completed_at, tc.created_at) AS occurred_at,
      tc.quantity || ' ticket(s) sold' AS detail
    FROM public.ticket_checkout tc
    JOIN organizer_events oe ON oe.id = tc.event_id
    WHERE tc.status = 'paid'
    ORDER BY COALESCE(tc.completed_at, tc.created_at) DESC
    LIMIT p_limit
  ),
  cancellations AS (
    SELECT
      'ticket_cancelled'::text,
      tt.event_id,
      oe.title,
      t.updated_at,
      'Ticket cancelled'::text
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    JOIN organizer_events oe ON oe.id = tt.event_id
    WHERE t.status = 'cancelled'
    ORDER BY t.updated_at DESC
    LIMIT p_limit
  ),
  registrations AS (
    SELECT
      'registration'::text,
      tt.event_id,
      oe.title,
      t.created_at,
      'New free registration'::text
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    JOIN organizer_events oe ON oe.id = tt.event_id
    WHERE t.status = 'active' AND tt.price = 0
    ORDER BY t.created_at DESC
    LIMIT p_limit
  )
  SELECT * FROM sales
  UNION ALL
  SELECT * FROM cancellations
  UNION ALL
  SELECT * FROM registrations
  ORDER BY occurred_at DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_refund_breakdown(p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(currency text, refund_request_count bigint, pending_refund_amount numeric, completed_refund_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    le.currency::text,
    COUNT(DISTINCT le.transaction_id),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refund_pending'), 0),
    COALESCE(SUM(-1 * le.amount) FILTER (WHERE t.status = 'refunded'), 0)
  FROM public.organizer_ledger_entry le
  JOIN public.transaction t ON t.id = le.transaction_id
  WHERE le.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
    AND le.entry_type = 'refund_hold'
  GROUP BY le.currency;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_sales_timeline(p_start timestamp with time zone, p_end timestamp with time zone, p_bucket text, p_currency text DEFAULT NULL::text, p_timezone text DEFAULT NULL::text, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(bucket_start timestamp with time zone, gross numeric, orders bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  -- One currency per series: an organizer selling in two markets never sees
  -- cedis and pounds added together. Default: the currency they sell most in.
  v_currency text := upper(coalesce(p_currency, (
    select tt.currency::text
    from public.ticket_checkout tc
    join public.ticket_type tt on tt.id = tc.ticket_type_id
    join public.event e on e.id = tc.event_id
    where e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) and tc.status = 'paid'
    group by tt.currency
    order by count(*) filter (
               where (p_start is null or coalesce(tc.completed_at, tc.created_at) >= p_start)
                 and (p_end is null or coalesce(tc.completed_at, tc.created_at) <= p_end)) desc,
             count(*) desc, tt.currency
    limit 1
  ), public.default_market_currency()::text));
  -- Buckets follow the viewer's calendar: an hour, day or month starts at
  -- local midnight / the local hour, not UTC's.
  v_zone text := public.calendar_zone(p_timezone);
BEGIN
  IF p_bucket NOT IN ('hour', 'day', 'month') THEN
    RAISE EXCEPTION 'invalid bucket: %', p_bucket;
  END IF;

  -- Open-ended window: nothing to generate a series between, so return only
  -- the buckets that have data (the original behaviour).
  IF p_start IS NULL OR p_end IS NULL THEN
    RETURN QUERY
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0),
      COUNT(*)
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
      AND tt.currency = v_currency
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND (p_start IS NULL OR COALESCE(tc.completed_at, tc.created_at) >= p_start)
      AND (p_end IS NULL OR COALESCE(tc.completed_at, tc.created_at) <= p_end)
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone)
    ORDER BY bucket_start;

    RETURN;
  END IF;

  RETURN QUERY
  WITH buckets AS (
    -- The series is generated on the local clock and converted back, so a
    -- day is always one calendar day even where it lasts 23 or 25 hours.
    SELECT (g AT TIME ZONE v_zone) AS bucket_start
    FROM generate_series(
      date_trunc(p_bucket, p_start AT TIME ZONE v_zone),
      date_trunc(p_bucket, p_end AT TIME ZONE v_zone),
      ('1 ' || p_bucket)::interval
    ) AS g
  ),
  sales AS (
    SELECT
      date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone) AS bucket_start,
      COALESCE(SUM(tc.total_price), 0) AS gross,
      COUNT(*) AS orders
    FROM public.ticket_checkout tc
    JOIN public.event e ON e.id = tc.event_id
    JOIN public.ticket_type tt ON tt.id = tc.ticket_type_id
    WHERE e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view']))
      AND tt.currency = v_currency
      AND e.status = 'published'
      AND tc.status = 'paid'
      AND COALESCE(tc.completed_at, tc.created_at) >= p_start
      AND COALESCE(tc.completed_at, tc.created_at) <= p_end
    GROUP BY date_trunc(p_bucket, COALESCE(tc.completed_at, tc.created_at), v_zone)
  )
  SELECT
    b.bucket_start,
    COALESCE(s.gross, 0)::numeric,
    COALESCE(s.orders, 0)::bigint
  FROM buckets b
  LEFT JOIN sales s ON s.bucket_start = b.bucket_start
  ORDER BY b.bucket_start;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_upcoming_events(p_limit integer, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(event_id uuid, title text, next_occurrence_starts_at timestamp with time zone, status text, tickets_sold bigint, capacity integer, min_ticket_type_percent_remaining numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
  WITH organizer_events AS (
    SELECT e.id, e.title, e.starts_at, e.ends_at
    FROM public.event e
    WHERE e.organizer_id = (SELECT public.acting_account_for(p_account, ARRAY['money.view'])) AND e.status = 'published'
  ),
  occurrence_bounds AS (
    SELECT
      oe.id,
      oe.title,
      COALESCE(MIN(eo.starts_at), oe.starts_at) AS min_starts,
      COALESCE(MAX(eo.ends_at), oe.ends_at)      AS max_ends,
      COALESCE(MIN(eo.starts_at) FILTER (WHERE eo.starts_at >= now()), oe.starts_at) AS next_starts
    FROM organizer_events oe
    LEFT JOIN public.event_occurrence eo ON eo.event_id = oe.id
    GROUP BY oe.id, oe.title, oe.starts_at, oe.ends_at
  ),
  eligible AS (
    SELECT * FROM occurrence_bounds
    WHERE min_starts IS NOT NULL AND max_ends >= now()
  ),
  sold_counts AS (
    SELECT tt.event_id, COUNT(*) AS sold
    FROM public.ticket t
    JOIN public.ticket_type tt ON tt.id = t.ticket_type_id
    WHERE t.status = 'active' AND tt.event_id IN (SELECT id FROM eligible)
    GROUP BY tt.event_id
  ),
  capacity_totals AS (
    SELECT tt.event_id, SUM(tt.quantity) AS total_capacity
    FROM public.ticket_type tt
    WHERE tt.event_id IN (SELECT id FROM eligible)
    GROUP BY tt.event_id
  ),
  ticket_type_sold AS (
    SELECT t2.ticket_type_id, COUNT(*) AS sold
    FROM public.ticket t2
    WHERE t2.status = 'active'
    GROUP BY t2.ticket_type_id
  ),
  ticket_type_remaining AS (
    SELECT
      tt.event_id,
      MIN(
        CASE WHEN tt.quantity IS NOT NULL AND tt.quantity > 0
          THEN 100.0 * GREATEST(tt.quantity - COALESCE(tts.sold, 0), 0) / tt.quantity
          ELSE NULL
        END
      ) AS min_percent_remaining
    FROM public.ticket_type tt
    LEFT JOIN ticket_type_sold tts ON tts.ticket_type_id = tt.id
    WHERE tt.event_id IN (SELECT id FROM eligible)
    GROUP BY tt.event_id
  )
  SELECT
    el.id,
    el.title,
    COALESCE(el.next_starts, el.min_starts),
    CASE WHEN now() >= el.min_starts AND now() <= el.max_ends THEN 'ongoing' ELSE 'upcoming' END,
    COALESCE(sold_counts.sold, 0),
    capacity_totals.total_capacity::integer,
    ticket_type_remaining.min_percent_remaining
  FROM eligible el
  LEFT JOIN sold_counts ON sold_counts.event_id = el.id
  LEFT JOIN capacity_totals ON capacity_totals.event_id = el.id
  LEFT JOIN ticket_type_remaining ON ticket_type_remaining.event_id = el.id
  ORDER BY COALESCE(el.next_starts, el.min_starts) ASC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.request_organizer_payout(p_payout_account_id uuid, p_amount numeric, p_currency text, p_account uuid DEFAULT NULL::uuid)
 RETURNS TABLE(payout_id uuid, reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_organizer_id    uuid := public.acting_account_for(p_account, ARRAY['payout.request']);
  v_currency        text := upper(trim(p_currency));
  v_available       numeric;
  v_account_owner   uuid;
  v_account_status  text;
  v_account_currency text;
  v_status_id       smallint;
  v_payout_id       uuid;
  v_reference       text;
  v_account_added   timestamptz;
begin
  if v_organizer_id is null then
    raise exception 'Not authenticated';
  end if;

  select status_id into v_status_id
  from public.user_info where id = v_organizer_id;
  if v_status_id in (2, 3, 4) then
    raise exception 'Account restricted' using errcode = '42501';
  end if;
  -- Acting for a team: the member's own account must be in good standing too.
  if v_organizer_id <> auth.uid() then
    select status_id into v_status_id
    from public.user_info where id = auth.uid();
    if v_status_id in (2, 3, 4) then
      raise exception 'Account restricted' using errcode = '42501';
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Invalid payout amount';
  end if;
  -- An unknown code raises inside money_round (currency_minor_units).
  if public.money_round(p_amount, v_currency) <> p_amount then
    raise exception 'Invalid payout amount precision for %', v_currency;
  end if;

  select organizer_id, status, currency, created_at
    into v_account_owner, v_account_status, v_account_currency, v_account_added
  from public.payout_account
  where id = p_payout_account_id;

  if v_account_owner is null or v_account_owner <> v_organizer_id or v_account_status <> 'active' then
    raise exception 'Invalid payout account';
  end if;
  if upper(v_account_currency) <> v_currency then
    raise exception 'Invalid payout account currency';
  end if;
  -- A team's payout account takes payouts 48 hours after it was added (X6);
  -- every Owner was told when it was added.
  if exists (select 1 from public.team t where t.account_id = v_organizer_id)
     and v_account_added > now() - interval '48 hours' then
    raise exception 'Payout account too new' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_organizer_id::text || ':' || v_currency, 0));

  select
    coalesce(sum(le.amount) filter (
      where le.entry_type in ('earning', 'refund_adjustment', 'refund_hold', 'refund_release',
                              'promoter_commission', 'promoter_commission_reversal')
        and public.is_event_settled(le.event_id)
    ), 0)
    + coalesce(sum(le.amount) filter (where le.entry_type in ('payout_hold', 'payout_release')), 0)
  into v_available
  from public.organizer_ledger_entry le
  where le.organizer_id = v_organizer_id and le.currency = v_currency;

  if p_amount > v_available then
    raise exception 'Payout amount exceeds available balance';
  end if;

  v_reference := 'PYT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.payout (organizer_id, payout_account_id, amount, currency, reference, requested_by)
  values (v_organizer_id, p_payout_account_id, p_amount, v_currency, v_reference, auth.uid())
  returning id into v_payout_id;

  insert into public.organizer_ledger_entry (organizer_id, payout_id, entry_type, amount, currency)
  values (v_organizer_id, v_payout_id, 'payout_hold', -1 * p_amount, v_currency);

  return query select v_payout_id, v_reference;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_organizer_dashboard(p_start timestamp with time zone, p_end timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_bucket text, p_timezone text DEFAULT NULL::text, p_account uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'overview_current',
      (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
       FROM public.get_organizer_dashboard_overview(p_start, p_end, p_account => p_account) o),
    'overview_previous',
      CASE WHEN p_prev_start IS NULL OR p_prev_end IS NULL THEN NULL
      ELSE (SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
            FROM public.get_organizer_dashboard_overview(p_prev_start, p_prev_end, p_account => p_account) o)
      END,
    'timeline',
      (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.bucket_start), '[]'::jsonb)
       FROM public.get_organizer_sales_timeline(p_start, p_end, p_bucket, null, p_timezone, p_account => p_account) t),
    'performance',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_event_performance(p_start, p_end, 'revenue', 10, p_account => p_account) r),
    'upcoming',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_upcoming_events(5, p_account => p_account) r),
    'attention',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_needs_attention(7, p_account => p_account) r),
    'activity',
      (SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
       FROM public.get_organizer_recent_activity(8, p_account => p_account) r)
  );
$function$;

revoke all on function public.cancel_event_and_release_tickets(p_event_id uuid, uuid) from public, anon;
grant execute on function public.cancel_event_and_release_tickets(p_event_id uuid, uuid) to authenticated, service_role;
revoke all on function public.get_event_cancellation_impact(p_event_id uuid, uuid) from public, anon;
grant execute on function public.get_event_cancellation_impact(p_event_id uuid, uuid) to authenticated, service_role;
revoke all on function public.get_event_date_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) from public, anon;
grant execute on function public.get_event_date_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.get_event_overview_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) from public, anon;
grant execute on function public.get_event_overview_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.get_event_promo_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) from public, anon;
grant execute on function public.get_event_promo_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.get_event_refund_breakdown(p_event_id uuid, uuid) from public, anon;
grant execute on function public.get_event_refund_breakdown(p_event_id uuid, uuid) to authenticated, service_role;
revoke all on function public.get_event_returning_attendee_stats(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) from public, anon;
grant execute on function public.get_event_returning_attendee_stats(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.get_event_sales_timeline(p_event_id uuid, uuid) from public, anon;
grant execute on function public.get_event_sales_timeline(p_event_id uuid, uuid) to authenticated, service_role;
revoke all on function public.get_event_ticket_type_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) from public, anon;
grant execute on function public.get_event_ticket_type_analytics(p_event_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_dashboard_overview(p_start timestamp with time zone, p_end timestamp with time zone, uuid) from public, anon;
grant execute on function public.get_organizer_dashboard_overview(p_start timestamp with time zone, p_end timestamp with time zone, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_event_performance(p_start timestamp with time zone, p_end timestamp with time zone, p_sort text, p_limit integer, uuid) from public, anon;
grant execute on function public.get_organizer_event_performance(p_start timestamp with time zone, p_end timestamp with time zone, p_sort text, p_limit integer, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_finance_overview(uuid) from public, anon;
grant execute on function public.get_organizer_finance_overview(uuid) to authenticated, service_role;
revoke all on function public.get_organizer_ledger_transactions(p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer, uuid) from public, anon;
grant execute on function public.get_organizer_ledger_transactions(p_cursor_created_at timestamp with time zone, p_cursor_id uuid, p_limit integer, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_needs_attention(p_days_soon integer, uuid) from public, anon;
grant execute on function public.get_organizer_needs_attention(p_days_soon integer, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_pending_earnings(uuid) from public, anon;
grant execute on function public.get_organizer_pending_earnings(uuid) to authenticated, service_role;
revoke all on function public.get_organizer_recent_activity(p_limit integer, uuid) from public, anon;
grant execute on function public.get_organizer_recent_activity(p_limit integer, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_refund_breakdown(uuid) from public, anon;
grant execute on function public.get_organizer_refund_breakdown(uuid) to authenticated, service_role;
revoke all on function public.get_organizer_sales_timeline(p_start timestamp with time zone, p_end timestamp with time zone, p_bucket text, p_currency text, p_timezone text, uuid) from public, anon;
grant execute on function public.get_organizer_sales_timeline(p_start timestamp with time zone, p_end timestamp with time zone, p_bucket text, p_currency text, p_timezone text, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_upcoming_events(p_limit integer, uuid) from public, anon;
grant execute on function public.get_organizer_upcoming_events(p_limit integer, uuid) to authenticated, service_role;
revoke all on function public.request_organizer_payout(p_payout_account_id uuid, p_amount numeric, p_currency text, uuid) from public, anon;
grant execute on function public.request_organizer_payout(p_payout_account_id uuid, p_amount numeric, p_currency text, uuid) to authenticated, service_role;
revoke all on function public.get_organizer_dashboard(p_start timestamp with time zone, p_end timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_bucket text, p_timezone text, uuid) from public, anon;
grant execute on function public.get_organizer_dashboard(p_start timestamp with time zone, p_end timestamp with time zone, p_prev_start timestamp with time zone, p_prev_end timestamp with time zone, p_bucket text, p_timezone text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Reading the team's ledger, payouts and payout accounts
-- ---------------------------------------------------------------------------

drop policy if exists organizer_ledger_entry_owner_select on public.organizer_ledger_entry;
create policy organizer_ledger_entry_owner_select on public.organizer_ledger_entry
  for select
  using (organizer_id = any ((select public.acting_accounts(array['money.view']))::uuid[]));

drop policy if exists payout_owner_select on public.payout;
create policy payout_owner_select on public.payout
  for select
  using (organizer_id = any ((select public.acting_accounts(array['payout.view']))::uuid[]));

drop policy if exists payout_account_owner_select on public.payout_account;
create policy payout_account_owner_select on public.payout_account
  for select
  using (organizer_id = any ((select public.acting_accounts(array['payout.view']))::uuid[]));

-- Finance reads the team's events (drafts included) for its reports.
alter policy event_select on public.event
  using (
    organizer_id = any ((select public.acting_accounts(array[
      'events.manage', 'attendees.view', 'checkin.scan', 'money.view'
    ]))::uuid[])
    or (
      status::text = any (array['published', 'canceled'])
      and moderation_state is distinct from 'hidden'
      and moderation_state is distinct from 'removed'
    )
  );

alter policy event_occurrence_select on public.event_occurrence
  using (
    exists (
      select 1 from public.event e
      where e.id = event_occurrence.event_id
        and e.organizer_id = any ((select public.acting_accounts(array[
          'events.manage', 'attendees.view', 'checkin.scan', 'money.view'
        ]))::uuid[])
    )
    or exists (
      select 1 from public.event e
      where e.id = event_occurrence.event_id
        and e.status::text = any (array['published', 'canceled'])
    )
  );

alter policy ticket_type_select on public.ticket_type
  using (
    exists (
      select 1 from public.event e
      where e.id = ticket_type.event_id
        and e.organizer_id = any ((select public.acting_accounts(array[
          'events.manage', 'attendees.view', 'checkin.scan', 'promo.manage',
          'money.view'
        ]))::uuid[])
    )
    or exists (
      select 1 from public.event e
      where e.id = ticket_type.event_id
        and e.status::text = any (array['published', 'canceled'])
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Notices addressed to a team reach its members
-- ---------------------------------------------------------------------------

-- Which capability a notice is about, so it reaches the members whose role
-- covers it. Owners hold every capability; 'team.profile' is theirs alone.
create or replace function public.team_notice_capability(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type like 'place_booking_%' then 'bookings.manage'
    when p_type in ('review_received', 'review_reply') then 'reviews.reply'
    when p_type = 'message' then 'messages.reply'
    when p_type like 'content_%' then 'content.post'
    when p_type like 'refund_%' then 'refunds.issue'
    when p_type like 'payout_%' then 'payout.view'
    when p_type like 'ticket_plan_%' then 'money.view'
    when p_type in (
      'promotion_credit_earned', 'milestone_reached', 'loyalty_reward',
      'reward_available', 'reward_pending', 'reward_reversed',
      'commission_pending', 'welcome_credit'
    ) then 'money.view'
    else 'team.profile'
  end;
$$;

-- A team cannot sign in, so a notice written to it would never be seen:
-- each member whose role covers it gets their own copy (which also takes
-- the push path the notice would have taken). The copy names the team, so
-- the app and the website can open it managing as the team.
create or replace function public.notification_fan_out_to_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap text;
  v_name text;
  v_username text;
begin
  if not exists (
    select 1 from public.team t
    where t.account_id = new.user_id and t.status = 'active'
  ) then
    return null;
  end if;

  v_cap := public.team_notice_capability(new.type);
  select full_name, username into v_name, v_username
  from public.user_info where id = new.user_id;

  insert into public.notification
    (user_id, type, title, body, link, data, image_public_id, image_version)
  select m.user_id, new.type, new.title, new.body, new.link,
         new.data || jsonb_build_object(
           'team_id', new.user_id,
           'team_name', coalesce(v_name, v_username)
         ),
         new.image_public_id, new.image_version
  from public.team_member m
  where m.team_id = new.user_id
    and m.status = 'active'
    and public.team_role_can(m.role, v_cap);

  return null;
end;
$$;

revoke all on function public.notification_fan_out_to_team() from public, anon, authenticated;

drop trigger if exists trg_notification_fan_out_to_team on public.notification;
create trigger trg_notification_fan_out_to_team
  after insert on public.notification
  for each row execute function public.notification_fan_out_to_team();

-- ---------------------------------------------------------------------------
-- 6. Checks
-- ---------------------------------------------------------------------------

do $$
begin
  if not public.team_role_can('finance', 'payout.request')
     or public.team_role_can('manager', 'payout.request')
     or public.team_role_can('finance', 'payout.manage')
     or not public.team_role_can('owner', 'payout.manage') then
    raise exception 'migration check: team_role_can does not match the role table';
  end if;
  if public.team_notice_capability('place_booking_requested') <> 'bookings.manage'
     or public.team_notice_capability('verification_approved') <> 'team.profile' then
    raise exception 'migration check: team_notice_capability is wrong';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_organizer_finance_overview',
        'get_organizer_dashboard_overview', 'cancel_event_and_release_tickets',
        'get_event_overview_analytics', 'get_organizer_ledger_transactions'
      )
      and (not p.prosecdef or p.prosrc ~ 'auth\.uid\(\)')
  ) then
    raise exception 'migration check: a money function still reads auth.uid() or runs as the caller';
  end if;
  if has_function_privilege('anon', 'public.get_organizer_finance_overview(uuid)', 'execute') then
    raise exception 'migration check: anon may run a money function';
  end if;
  if (select enabled from public.team_program_setting where id = 1) then
    raise exception 'migration check: teams must ship switched off';
  end if;
end;
$$;
