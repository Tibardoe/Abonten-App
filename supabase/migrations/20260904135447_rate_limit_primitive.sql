-- Phase 3 (API-001, OBS-001): a small, durable, reusable rate-limit
-- primitive.
--
-- On closer inspection most write paths already have *some* protection in
-- the codebase's own established style — a plain COUNT query against the
-- domain table itself, scoped to the last hour (submitReportCore's
-- MAX_REPORTS_PER_HOUR, requestPhoneVerification's MAX_SENDS_PER_IP_PER_HOUR,
-- phoneAuthCore's OTP attempt cap). That pattern doesn't generalize to an
-- unauthenticated proxy endpoint with no domain table to count against
-- (/api/geocode, currently an in-memory per-instance counter that resets on
-- every cold start and doesn't share state across replicas — OBS-001), or
-- to an endpoint where the abuse signal is *attempts*, not successes
-- (promo code guessing — getPromoCodeCore has no log of failed lookups to
-- count). This is a fixed-window counter for exactly those cases, kept
-- deliberately simple (one table, one upsert) rather than reaching for
-- Redis or a queue.
create table if not exists public.rate_limit_bucket (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limit_bucket enable row level security;
-- Service-role only, same as the other internal-bookkeeping tables in this
-- schema (platform_fee_entry, admin_audit_log, ...) — no policy needed
-- since RLS with no policy already denies anon/authenticated entirely.

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_bucket (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limit_bucket.count + 1
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer)
  to service_role;

-- Buckets are only ever relevant for the current + immediately preceding
-- window; without this the table grows forever.
create or replace function public.cleanup_rate_limit_buckets()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.rate_limit_bucket where window_start < now() - interval '1 day';
$$;

revoke execute on function public.cleanup_rate_limit_buckets()
  from public, anon, authenticated;
grant execute on function public.cleanup_rate_limit_buckets() to service_role;

select cron.schedule(
  'cleanup-rate-limit-buckets',
  '0 4 * * *',
  $$select public.cleanup_rate_limit_buckets();$$
);
