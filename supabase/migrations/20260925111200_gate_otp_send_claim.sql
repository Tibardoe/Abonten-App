-- Production gate 2026-09-25: one atomic claim before every text-message
-- code.
--
-- The per-number resend cooldown (phone_otp_state.last_sent_at) and the
-- per-address cap (phone_otp_send_log) were read, then the code was sent,
-- then the send was recorded. Requests arriving together all passed the
-- read: 20 simultaneous requests for one number sent 20 texts (reproduced
-- in otp-send-limits.integration.test.ts), and the cooldown was per
-- purpose, so sign-in and phone-change codes could alternate. A text costs
-- money and lands on someone's phone, so both are now claimed under a lock
-- in one statement, before the provider is called:
--   * one code per number per cooldown, whatever the purpose;
--   * at most p_per_number_hour / p_per_number_day codes per number;
--   * at most p_per_ip_hour codes per caller address (when known).
-- The claim inserts the send-log row itself, so a claim in flight already
-- counts against every later one (and against the country's hourly
-- ceiling, which reads the same log).

create or replace function public.phone_otp_claim_send(
  p_phone_e164 text,
  p_ip_address text,
  p_cooldown_seconds integer,
  p_per_number_hour integer,
  p_per_number_day integer,
  p_per_ip_hour integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
  v_count integer;
  v_id bigint;
begin
  if p_phone_e164 is null or p_phone_e164 !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone_otp_claim_send: invalid number' using errcode = '22023';
  end if;

  -- Number first, then address: every caller takes them in this order.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('otp-send-number:' || p_phone_e164, 0));
  if p_ip_address is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('otp-send-ip:' || p_ip_address, 0));
  end if;

  select max(l.created_at) into v_last
  from public.phone_otp_send_log l
  where l.phone_e164 = p_phone_e164;
  if v_last is not null
     and v_last > now() - pg_catalog.make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch from
        (v_last + pg_catalog.make_interval(secs => p_cooldown_seconds) - now())))::integer)
    );
  end if;

  select count(*) into v_count
  from public.phone_otp_send_log l
  where l.phone_e164 = p_phone_e164
    and l.created_at > now() - interval '1 hour';
  if v_count >= p_per_number_hour then
    return jsonb_build_object('ok', false, 'reason', 'number_hour');
  end if;

  select count(*) into v_count
  from public.phone_otp_send_log l
  where l.phone_e164 = p_phone_e164
    and l.created_at > now() - interval '1 day';
  if v_count >= p_per_number_day then
    return jsonb_build_object('ok', false, 'reason', 'number_day');
  end if;

  if p_ip_address is not null then
    select count(*) into v_count
    from public.phone_otp_send_log l
    where l.ip_address = p_ip_address
      and l.created_at > now() - interval '1 hour';
    if v_count >= p_per_ip_hour then
      return jsonb_build_object('ok', false, 'reason', 'ip_hour');
    end if;
  end if;

  insert into public.phone_otp_send_log (phone_e164, ip_address)
  values (p_phone_e164, p_ip_address)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'claim_id', v_id);
end;
$$;

revoke all on function public.phone_otp_claim_send(text, text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.phone_otp_claim_send(text, text, integer, integer, integer, integer)
  to service_role;

-- The per-number counts read by number and time.
create index if not exists phone_otp_send_log_phone_created_idx
  on public.phone_otp_send_log (phone_e164, created_at);

-- The verify-attempt budget had the same read-then-write shape: its comment
-- assumed a race cost "one extra guess", but N simultaneous guesses all read
-- the same count, so a burst of requests could try far more than five codes
-- against one 4-digit code. The increment is now one conditional UPDATE: a
-- guess is allowed only if it takes one of the remaining attempts.
create or replace function public.phone_otp_take_attempt(
  p_purpose text,
  p_phone_e164 text,
  p_max_attempts integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  update public.phone_otp_state s
     set attempts = s.attempts + 1
   where s.purpose = p_purpose
     and s.phone_e164 = p_phone_e164
     and s.attempts < p_max_attempts
  returning s.attempts into v_attempts;
  if v_attempts is null then
    -- No code pending, or its budget is spent: a fresh code is needed.
    delete from public.phone_otp_state s
     where s.purpose = p_purpose and s.phone_e164 = p_phone_e164;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.phone_otp_take_attempt(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.phone_otp_take_attempt(text, text, integer)
  to service_role;
