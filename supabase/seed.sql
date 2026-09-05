-- Reference data seeded after every local `supabase db reset` (see
-- supabase/config.toml's [db.seed] -> sql_paths). This has never existed
-- in the repo before (2026-09-05) -- until now, no migration or seed file
-- inserted these rows anywhere, so a from-scratch local database had an
-- empty public.user_status and every single signup failed:
-- create_user_info_if_not_exists() (the trigger that fires on every
-- auth.users insert -- see supabase/migrations/20260823194629_phone_auth_
-- and_profile_completion.sql) hard-codes status_id = 1 on the new
-- public.user_info row, which fails its FK to user_status the moment that
-- table is empty. Values below match production exactly (confirmed via
-- execute_sql against the live project, 2026-09-05) -- this seeds the
-- SAME data live already has, it doesn't invent new categories.
--
-- Safe to run against an already-seeded database: ON CONFLICT DO NOTHING,
-- and the sequence is only advanced to at least 3, never rewound.
INSERT INTO public.user_status (id, name) VALUES
  (1, 'Active'),
  (2, 'Suspended'),
  (3, 'Banned')
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  'public.user_status_id_seq',
  GREATEST(3, (SELECT COALESCE(MAX(id), 0) FROM public.user_status)),
  true
);
