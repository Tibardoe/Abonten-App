-- Full-system audit 2026-09-25: a place owner could review their own place
-- from the app. The web action refused it, but the app writes place reviews
-- straight to the table (RLS: reviewer_id = auth.uid()), so the rule only
-- held on one of the two clients. The database now refuses it for every
-- client, the way enforce_event_review_eligibility refuses an organizer
-- reviewing their own event.

create or replace function public.guard_place_review_not_own_place()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Service role and maintenance run without a JWT and stay trusted.
  if (select auth.uid()) is null then
    return new;
  end if;
  if exists (
    select 1 from public.place p
    where p.id = new.place_id and p.owner_id = new.reviewer_id
  ) then
    raise exception 'You cannot review your own place'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_place_review_not_own_place()
  from public, anon, authenticated;

drop trigger if exists place_review_not_own_place on public.place_review;
create trigger place_review_not_own_place
  before insert on public.place_review
  for each row execute function public.guard_place_review_not_own_place();
