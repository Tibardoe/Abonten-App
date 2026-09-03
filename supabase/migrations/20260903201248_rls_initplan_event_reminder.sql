-- Perf advisor 0003_auth_rls_initplan: event_reminder_owner_all re-evaluated
-- auth.uid() once per row. Every other table's owner policy already uses the
-- (select auth.uid()) form so Postgres evaluates it once as an initplan.
-- Semantically identical — same value, same rows — just the scalar form.

alter policy event_reminder_owner_all on public.event_reminder
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
