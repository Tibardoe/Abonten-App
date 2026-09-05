-- LOW-009 (docs/audit/01-limitations-register.md): these tables are RLS
-- enabled but intentionally have no policy -- they're written/read only by
-- service-role code (admin services, observability ingest, OTP store,
-- rate limiter, fee ledger), which bypasses RLS entirely regardless of any
-- policy defined here. An explicit `USING (false)` policy changes nothing
-- about actual access -- it only makes the "deny everyone but service_role"
-- intent legible and stops the security advisor from re-flagging
-- `rls_enabled_no_policy` on these tables every run.
--
-- Excludes every table the advisor also flags that is actually a partition
-- of a table with real policies (review_*, event_media_p*, favorite_p*,
-- wallet_p*, event_share_default, media_audit_default, story_default,
-- user_image_history_*) -- Postgres applies a partitioned table's own
-- policies to all its partitions automatically when queried through the
-- parent (confirmed: their parents each already have real policies), so
-- those are advisor false positives, not gaps -- adding a deny policy
-- directly on a partition would do nothing extra and risks confusion later.

do $$
declare
  t text;
  tables text[] := array[
    'admin_audit_log', 'admin_note', 'admin_permission', 'admin_role',
    'admin_role_permission', 'admin_user', 'admin_user_role',
    'app_error_event', 'app_error_group', 'app_request_metric',
    'health_check_result', 'incident', 'moderation_action',
    'observability_config', 'phone_otp_send_log', 'phone_otp_state',
    'platform_fee_entry', 'rate_limit_bucket', 'report_event'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy service_role_only on public.%I for all to public using (false) with check (false)',
      t
    );
    execute format(
      'comment on policy service_role_only on public.%I is '
      || $c$'Deliberate deny-all for anon/authenticated -- this table is '$c$
      || $c$'read/written only by service-role code, which bypasses RLS '$c$
      || $c$'entirely and is unaffected by this policy. See LOW-009 in '$c$
      || $c$'docs/audit/01-limitations-register.md.'$c$,
      t
    );
  end loop;
end $$;
