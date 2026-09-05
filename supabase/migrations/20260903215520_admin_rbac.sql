-- Admin Console Phase 1 — Role-Based Access Control.
--
-- Before this migration the entire admin surface was a single boolean,
-- user_info.is_admin (one page: /admin/place-claims). This adds a real
-- least-privilege RBAC model: named roles, granular permissions, a
-- role->permission matrix, and an admin_user registry that is what
-- actually grants access to the separate apps/admin console.
--
-- user_info.is_admin is KEPT as the coarse "is this person staff at all"
-- flag so the existing approve_place_claim RPC and /admin/place-claims
-- page keep working unchanged. A trigger on admin_user keeps it in sync
-- (is_admin = an active admin_user row exists).
--
-- Access model: these tables carry NO anon/authenticated privileges and
-- RLS is enabled with no permissive policy — every read/write goes through
-- @abonten/services/admin/** on the service-role client, gated by
-- resolveAdminContext() in application code. The SECURITY DEFINER helper
-- functions below (is_staff / admin_has_permission / admin_effective_permissions)
-- are the only things authenticated code may call, and they only ever
-- answer for the calling user.
--
-- Applied live via Supabase MCP (project sderrexhawjbmsugndcq) then saved
-- here as the source-of-truth copy.

-- ============================================================
-- 1. Tables
-- ============================================================

create table public.admin_role (
  key         text primary key,
  label       text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.admin_permission (
  key         text primary key,
  label       text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.admin_role_permission (
  role_key       text not null references public.admin_role(key) on delete cascade,
  permission_key text not null references public.admin_permission(key) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create index idx_admin_role_permission_permission
  on public.admin_role_permission (permission_key);

create table public.admin_user (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'disabled')),
  created_by  uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_admin_user_status on public.admin_user (status);

create table public.admin_user_role (
  user_id    uuid not null references public.admin_user(user_id) on delete cascade,
  role_key   text not null references public.admin_role(key) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

create index idx_admin_user_role_role on public.admin_user_role (role_key);

-- ============================================================
-- 2. Privileges + RLS (locked to service_role)
-- ============================================================

revoke all on public.admin_role            from anon, authenticated;
revoke all on public.admin_permission      from anon, authenticated;
revoke all on public.admin_role_permission from anon, authenticated;
revoke all on public.admin_user            from anon, authenticated;
revoke all on public.admin_user_role       from anon, authenticated;

grant all on public.admin_role            to service_role;
grant all on public.admin_permission      to service_role;
grant all on public.admin_role_permission to service_role;
grant all on public.admin_user            to service_role;
grant all on public.admin_user_role       to service_role;

alter table public.admin_role            enable row level security;
alter table public.admin_permission      enable row level security;
alter table public.admin_role_permission enable row level security;
alter table public.admin_user            enable row level security;
alter table public.admin_user_role       enable row level security;

-- No policies on purpose: authenticated/anon get zero rows. service_role
-- bypasses RLS. This is defence-in-depth behind the app-layer guard.

-- ============================================================
-- 3. Keep user_info.is_admin in sync with admin_user
-- ============================================================

create function public.sync_is_admin_from_admin_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $function$
declare
  v_uid    uuid;
  v_active boolean;
begin
  v_uid := coalesce(new.user_id, old.user_id);
  select exists(
    select 1 from public.admin_user au
    where au.user_id = v_uid and au.status = 'active'
  ) into v_active;

  update public.user_info set is_admin = v_active where id = v_uid;
  return null;
end;
$function$;

create trigger trg_admin_user_sync_is_admin
  after insert or update or delete on public.admin_user
  for each row execute function public.sync_is_admin_from_admin_user();

-- ============================================================
-- 4. Authorization helper functions (callable by authenticated,
--    self-answering only)
-- ============================================================

-- Is the given user active platform staff? Defaults to the caller.
create function public.is_staff(p_user_id uuid default auth.uid())
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select exists(
    select 1 from public.admin_user au
    where au.user_id = p_user_id and au.status = 'active'
  );
$function$;

-- Flattened set of permission keys the user holds via all their roles.
create function public.admin_effective_permissions(p_user_id uuid default auth.uid())
  returns text[]
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select coalesce(array_agg(distinct rp.permission_key), array[]::text[])
  from public.admin_user au
  join public.admin_user_role ur on ur.user_id = au.user_id
  join public.admin_role_permission rp on rp.role_key = ur.role_key
  where au.user_id = p_user_id and au.status = 'active';
$function$;

create function public.admin_has_permission(
  p_permission text,
  p_user_id uuid default auth.uid()
)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $function$
  select exists(
    select 1
    from public.admin_user au
    join public.admin_user_role ur on ur.user_id = au.user_id
    join public.admin_role_permission rp on rp.role_key = ur.role_key
    where au.user_id = p_user_id
      and au.status = 'active'
      and rp.permission_key = p_permission
  );
$function$;

revoke execute on function public.is_staff(uuid) from public;
revoke execute on function public.admin_effective_permissions(uuid) from public;
revoke execute on function public.admin_has_permission(text, uuid) from public;
grant execute on function public.is_staff(uuid) to authenticated, service_role;
grant execute on function public.admin_effective_permissions(uuid) to authenticated, service_role;
grant execute on function public.admin_has_permission(text, uuid) to authenticated, service_role;

-- ============================================================
-- 5. Seed roles + permissions + matrix
-- ============================================================

insert into public.admin_role (key, label, description) values
  ('super_admin',   'Super Admin',    'Full platform access, including admin management and settings.'),
  ('operations',    'Operations',     'Users, events, places, reports, moderation, claims and support operations.'),
  ('moderator',     'Moderator',      'Reports, reviews, events, places and content moderation.'),
  ('finance_admin', 'Finance Admin',  'Payments, refunds, earnings, withdrawals and financial investigation.'),
  ('support_admin', 'Support Admin',  'Account, ticket and order investigation without financial privileges.'),
  ('analyst',       'Analyst',        'Read-only access to dashboards and analytics.');

insert into public.admin_permission (key, label, description) values
  ('dashboard.view',        'View dashboard',            'See the operations dashboard.'),
  ('reports.view',          'View reports',              'See the reports & moderation queue.'),
  ('reports.assign',        'Assign reports',            'Assign a report to a moderator.'),
  ('reports.update_status', 'Update report status',      'Move a report through its workflow.'),
  ('reports.request_info',  'Request report info',       'Ask a reporter for more information.'),
  ('reports.escalate',      'Escalate reports',          'Escalate a report to a higher tier.'),
  ('reports.note',          'Add internal notes',        'Leave internal notes on a report or entity.'),
  ('reports.mark_false',    'Mark false report',         'Flag a report as false / abusive.'),
  ('reports.resolve',       'Resolve reports',           'Close a report with a resolution.'),
  ('moderation.hide',       'Hide content',              'Hide reported content from public view.'),
  ('moderation.remove',     'Remove content',            'Remove reported content.'),
  ('moderation.restore',    'Restore content',           'Restore previously hidden/removed content.'),
  ('moderation.restrict',   'Restrict content',          'Restrict content (visible but flagged).'),
  ('users.view',            'View users',                'See the users list and safe user detail.'),
  ('users.view_pii',        'View user PII',             'See user email / phone / sensitive fields.'),
  ('users.suspend',         'Suspend users',             'Suspend / unsuspend a user account.'),
  ('users.ban',             'Ban users',                 'Ban a user account.'),
  ('users.restore',         'Restore users',             'Restore a suspended / banned user.'),
  ('organizers.view',       'View organizers',           'See organizer investigation views.'),
  ('events.view',           'View events',               'See event management views.'),
  ('places.view',           'View places',               'See place management views.'),
  ('tickets.view',          'View tickets',              'See ticket / order investigation views.'),
  ('transactions.view',     'View transactions',         'See the transaction ledger.'),
  ('finance.view',          'View finance',              'See the finance operations centre.'),
  ('finance.refund',        'Issue refunds',             'Perform refund actions.'),
  ('finance.payout',        'Manage payouts',            'Perform withdrawal / payout actions.'),
  ('finance.adjust',        'Financial adjustments',     'Create auditable financial corrections.'),
  ('claims.view',           'View claims',               'See the place-claims queue and documents.'),
  ('claims.review',         'Review claims',             'Approve / reject place claims.'),
  ('reviews.view',          'View reviews',              'See content / review moderation views.'),
  ('notifications.view',    'View notification ops',     'See notification delivery / failures.'),
  ('monitoring.view',       'View monitoring',           'See application health, errors and metrics.'),
  ('monitoring.manage',     'Manage monitoring',         'Acknowledge / resolve error groups.'),
  ('incidents.manage',      'Manage incidents',          'Open and update incidents.'),
  ('analytics.view',        'View analytics',            'See platform analytics.'),
  ('audit.view',            'View audit log',            'See the administrative audit log.'),
  ('settings.view',         'View admin settings',       'See admin configuration.'),
  ('settings.manage',       'Manage admin settings',     'Change admin configuration.'),
  ('admins.manage',         'Manage admins',             'Add admins and grant / revoke roles.');

-- super_admin: everything
insert into public.admin_role_permission (role_key, permission_key)
select 'super_admin', key from public.admin_permission;

-- operations: broad, minus financial mutations / admin management / settings mutation
insert into public.admin_role_permission (role_key, permission_key)
select 'operations', key from public.admin_permission
where key not in ('finance.refund','finance.payout','finance.adjust','admins.manage','settings.manage');

-- moderator: reports + moderation + read context + light user action
insert into public.admin_role_permission (role_key, permission_key) values
  ('moderator','dashboard.view'),
  ('moderator','reports.view'),
  ('moderator','reports.assign'),
  ('moderator','reports.update_status'),
  ('moderator','reports.request_info'),
  ('moderator','reports.escalate'),
  ('moderator','reports.note'),
  ('moderator','reports.mark_false'),
  ('moderator','reports.resolve'),
  ('moderator','moderation.hide'),
  ('moderator','moderation.remove'),
  ('moderator','moderation.restore'),
  ('moderator','moderation.restrict'),
  ('moderator','users.view'),
  ('moderator','users.suspend'),
  ('moderator','organizers.view'),
  ('moderator','events.view'),
  ('moderator','places.view'),
  ('moderator','reviews.view'),
  ('moderator','monitoring.view');

-- finance_admin: money, plus read context + audit
insert into public.admin_role_permission (role_key, permission_key) values
  ('finance_admin','dashboard.view'),
  ('finance_admin','finance.view'),
  ('finance_admin','finance.refund'),
  ('finance_admin','finance.payout'),
  ('finance_admin','finance.adjust'),
  ('finance_admin','transactions.view'),
  ('finance_admin','tickets.view'),
  ('finance_admin','users.view'),
  ('finance_admin','organizers.view'),
  ('finance_admin','events.view'),
  ('finance_admin','reports.view'),
  ('finance_admin','reports.note'),
  ('finance_admin','analytics.view'),
  ('finance_admin','audit.view'),
  ('finance_admin','monitoring.view');

-- support_admin: investigation without financial privileges
insert into public.admin_role_permission (role_key, permission_key) values
  ('support_admin','dashboard.view'),
  ('support_admin','users.view'),
  ('support_admin','users.view_pii'),
  ('support_admin','tickets.view'),
  ('support_admin','transactions.view'),
  ('support_admin','events.view'),
  ('support_admin','places.view'),
  ('support_admin','organizers.view'),
  ('support_admin','reports.view'),
  ('support_admin','reports.note'),
  ('support_admin','claims.view'),
  ('support_admin','reviews.view'),
  ('support_admin','monitoring.view');

-- analyst: read-only
insert into public.admin_role_permission (role_key, permission_key) values
  ('analyst','dashboard.view'),
  ('analyst','users.view'),
  ('analyst','organizers.view'),
  ('analyst','events.view'),
  ('analyst','places.view'),
  ('analyst','tickets.view'),
  ('analyst','transactions.view'),
  ('analyst','finance.view'),
  ('analyst','claims.view'),
  ('analyst','reviews.view'),
  ('analyst','reports.view'),
  ('analyst','notifications.view'),
  ('analyst','analytics.view'),
  ('analyst','monitoring.view'),
  ('analyst','audit.view');
