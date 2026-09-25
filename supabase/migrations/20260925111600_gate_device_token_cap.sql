-- Production gate 2026-09-25, banned-account review. Registering a push
-- token is one of the three things a banned account's still-valid token can
-- do (with saving a favourite and blocking someone), because they only touch
-- the account's own rows. Reviewing it for indirect effects found one: any
-- account can insert device_token rows directly (owner policy), unbounded
-- and in any format, and every push to that account fans out to every one
-- of its tokens — a cheap way to make each notification cost thousands of
-- Expo requests.
--
--   * a token must look like an Expo push token (every production row does);
--   * an account keeps its 10 most recently seen devices: registering an
--     11th drops the oldest (a person re-installing or changing phones never
--     notices; a script stops amplifying).
-- The push sender also reads at most 10 tokens (sendPushNotification.ts).

alter table public.device_token
  add constraint device_token_expo_format
    check (length(token) <= 200 and token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$')
    not valid;
alter table public.device_token validate constraint device_token_expo_format;

create or replace function public.device_token_keep_recent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.device_token d
   where d.user_id = new.user_id
     and d.id in (
       select x.id from public.device_token x
        where x.user_id = new.user_id
        order by coalesce(x.last_seen_at, x.created_at) desc, x.created_at desc
        offset 10
     );
  return null;
end;
$$;
revoke execute on function public.device_token_keep_recent() from public, anon, authenticated;

drop trigger if exists device_token_keep_recent on public.device_token;
create trigger device_token_keep_recent
  after insert on public.device_token
  for each row execute function public.device_token_keep_recent();
