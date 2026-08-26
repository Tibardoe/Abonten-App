-- A canceled event previously became invisible to anonymous visitors the
-- moment it was canceled (event_public_select only allowed
-- status = 'published'), so a stale link to a now-canceled event rendered
-- "No event found" instead of showing the cancellation. Widening to also
-- allow 'canceled' fixes that while keeping 'draft' events fully private
-- (never published, must never leak). Mirrors the same condition on the two
-- child tables whose own public-select policies gate on the parent event's
-- status, needed for the event detail page's public query (dates, ticket
-- pricing) to still resolve for a canceled event.
alter policy event_public_select on event
  using (status::text = any (array['published', 'canceled']));

alter policy event_occurrence_public_select on event_occurrence
  using (
    exists (
      select 1 from event e
      where e.id = event_occurrence.event_id
        and e.status::text = any (array['published', 'canceled'])
    )
  );

alter policy ticket_type_public_select on ticket_type
  using (
    exists (
      select 1 from event e
      where e.id = ticket_type.event_id
        and e.status::text = any (array['published', 'canceled'])
    )
  );
