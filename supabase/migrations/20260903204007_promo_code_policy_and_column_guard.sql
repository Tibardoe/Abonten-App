-- promo_code: clears the last 2 multiple_permissive_policies warnings by
-- collapsing the 3 overlapping policies (organizer FOR ALL + authenticated
-- SELECT + authenticated UPDATE) into one policy per command:
--   * SELECT  — any signed-in user (buyers apply codes)
--   * INSERT / DELETE — organizer of the code's event (via the event join)
--   * UPDATE  — authenticated (claimPromoUsage's times_used CAS needs it)
--
-- NOTE: column-level protection on that open UPDATE was already in place via
-- the pre-existing SECURITY DEFINER trigger protect_promo_code_privileged_columns()
-- (rejects a non-organizer changing anything but times_used) — verified still
-- attached and working. The guard trigger added below turned out to be a
-- duplicate and is removed again in 20260903204143.

drop policy if exists promo_code_organizer_all on public.promo_code;
drop policy if exists promo_code_authenticated_select on public.promo_code;
drop policy if exists promo_code_authenticated_usage_update on public.promo_code;

create policy promo_code_select on public.promo_code
  for select to authenticated using (true);

create policy promo_code_organizer_insert on public.promo_code
  for insert with check (
    exists (select 1 from event e where e.id = promo_code.event_id and e.organizer_id = (select auth.uid()))
  );

create policy promo_code_organizer_delete on public.promo_code
  for delete using (
    exists (select 1 from event e where e.id = promo_code.event_id and e.organizer_id = (select auth.uid()))
  );

create policy promo_code_update on public.promo_code
  for update to authenticated using (true) with check (true);

create or replace function public.guard_promo_code_update()
returns trigger
language plpgsql
as $$
begin
  -- the organizer of the code's event may change anything
  if exists (
    select 1 from public.event e
    where e.id = new.event_id and e.organizer_id = (select auth.uid())
  ) then
    return new;
  end if;

  -- anyone else may only ever move times_used (claimPromoUsage / release /
  -- adjust) — never the code's terms
  if new.event_id            is distinct from old.event_id
     or new.promo_code       is distinct from old.promo_code
     or new.discount_percentage is distinct from old.discount_percentage
     or new.max_uses         is distinct from old.max_uses
     or new.expires_at       is distinct from old.expires_at
     or new.is_active        is distinct from old.is_active
     or new.created_at       is distinct from old.created_at
  then
    raise exception 'only the event organizer may modify promo code terms'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger trg_promo_code_update_guard
  before update on public.promo_code
  for each row
  execute function public.guard_promo_code_update();
