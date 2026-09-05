-- Admin Console Phase 1 — give user_info a real created_at.
--
-- user_info only had updated_at (which changes on every profile edit), so
-- there was no stable "date joined" to sort / filter the admin Users list
-- by without paging through the Auth admin API. Add created_at and backfill
-- it from auth.users.created_at (the account's true creation time).
--
-- Going forward the column's `default now()` is stamped when
-- create_user_info_if_not_exists() inserts the row — which happens in the
-- same request as the auth.users insert, so the value is accurate to the
-- second without needing to modify that SECURITY DEFINER trigger function.
--
-- Purely additive; no existing behaviour changes. Applied live via Supabase
-- MCP (project sderrexhawjbmsugndcq).

alter table public.user_info
  add column if not exists created_at timestamptz not null default now();

update public.user_info ui
set created_at = au.created_at
from auth.users au
where au.id = ui.id
  and au.created_at is not null;

create index if not exists idx_user_info_created_at on public.user_info (created_at desc);
