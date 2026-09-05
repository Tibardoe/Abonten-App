-- Notification operations (Admin console): two new permission keys.
--   notifications.view      already exists (Phase 1) - browse / inspect.
--   notifications.send      re-send an existing notification to its recipient.
--   notifications.broadcast send a notification to a segment of users.
--
-- super_admin gets both automatically (resolveAdminContext hard-guarantee;
-- its admin_role_permission rows are immutable - 20260907091600). Only the
-- non-super seed grant is written here: operations may resend; broadcast is
-- left super_admin-only and can be granted later via the matrix editor.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq) then saved
-- here as the source-of-truth copy.

insert into public.admin_permission (key, label, description) values
  ('notifications.send',      'Resend notifications',   'Re-send an existing notification to its recipient.'),
  ('notifications.broadcast', 'Broadcast notifications','Send a notification to a segment of users.')
on conflict (key) do nothing;

insert into public.admin_role_permission (role_key, permission_key) values
  ('operations','notifications.send')
on conflict do nothing;
