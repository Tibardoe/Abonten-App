-- Places feature Phase 2, Milestone 1: in-app notifications. Zero
-- notification infrastructure existed before this (confirmed via research
-- across the whole schema/codebase) -- this is genuinely new, not an
-- extension of something existing. One general-purpose table rather than a
-- family of type-specific tables since this phase's trigger list is short.
--
-- No RLS, no partitioning -- matches the confirmed convention from the
-- Places Phase 1 migration (every other new table follows the same
-- app-layer-only security model already used throughout this schema).
CREATE TABLE public.notification (
  id         uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  user_id    uuid                     NOT NULL,
  type       text                     NOT NULL,
  title      text                     NOT NULL,
  body       text,
  link       text,
  read_at    timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.notification ADD CONSTRAINT notification_pkey PRIMARY KEY (id);
ALTER TABLE public.notification ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_info(id) ON DELETE CASCADE;

GRANT ALL ON public.notification TO anon;
GRANT ALL ON public.notification TO authenticated;
GRANT ALL ON public.notification TO service_role;

CREATE INDEX idx_notification_user_id ON public.notification (user_id, created_at DESC);
CREATE INDEX idx_notification_user_unread ON public.notification (user_id) WHERE read_at IS NULL;
