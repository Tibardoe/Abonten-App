-- DATA-005 (docs/audit/01-limitations-register.md): log_user_changes()
-- inserts into `audit_log`, which does not exist and is attached to no
-- trigger anywhere (confirmed live: zero rows in pg_trigger reference this
-- function). Dead code that would error if ever wired up. admin_audit_log
-- + the moderation tables already cover user-change/action history for the
-- admin console, so there is no need to build `audit_log` out instead.
drop function if exists public.log_user_changes();
