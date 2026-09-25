-- Full-system audit 2026-09-25: a customer could write their own booking
-- straight to 'accepted' (the venue's decision) — on insert or by update —
-- and either party could rewrite its time, party size or place. Clients now
-- make only the transitions the service offers:
--   customer: insert as 'pending'; pending/accepted -> cancelled
--   place owner: pending -> accepted / declined
-- Nothing else about a booking changes after it is made.

create or replace function public.guard_place_booking_client_write()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if current_user = 'authenticated' and public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then
      raise exception 'A booking starts as a request' using errcode = '42501';
    end if;
    return new;
  end if;

  if to_jsonb(new) - array['updated_at'] = to_jsonb(old) - array['updated_at'] then
    return new;
  end if;
  if (to_jsonb(new) - array['status', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'updated_at']) then
    raise exception 'Only a booking''s status can change' using errcode = '42501';
  end if;

  select owner_id into v_owner from public.place where id = new.place_id;

  if v_uid = old.customer_id
     and old.status in ('pending', 'accepted') and new.status = 'cancelled' then
    return new;
  end if;
  if v_uid = v_owner
     and old.status = 'pending' and new.status in ('accepted', 'declined') then
    return new;
  end if;

  raise exception 'That booking change is not allowed' using errcode = '42501';
end;
$function$;

drop trigger if exists place_booking_client_write_guard on public.place_booking;
create trigger place_booking_client_write_guard
  before insert or update on public.place_booking
  for each row execute function public.guard_place_booking_client_write();
