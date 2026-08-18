-- Drafts system: base table + type-specific child tables (event/review).
-- See PROJECT.md and the drafts feature plan for the architecture rationale.
--
-- Deliberately deviates from this schema's usual "GRANT ALL ... TO anon"
-- convention: drafts are never touched by signed-out users, so anon gets no
-- grant at all here. This is also the first use of Row Level Security in
-- this project -- scoped only to these three new tables, as defense-in-depth
-- on top of (not instead of) the Server Action ownership checks that every
-- draft action performs.

CREATE TABLE public.drafts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.user_info(id) ON DELETE CASCADE,
  draft_type varchar(20) NOT NULL CHECK (draft_type IN ('event', 'review')),
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours')
);

CREATE INDEX drafts_user_type_idx ON public.drafts (user_id, draft_type, expires_at);
CREATE INDEX drafts_expires_at_idx ON public.drafts (expires_at);

-- Keeps updated_at/expires_at authoritative in the database rather than the
-- client -- every save rolls the 48-hour expiry window forward from "now",
-- so an organizer actively iterating on a draft over several days never has
-- it vanish mid-edit.
CREATE FUNCTION public.touch_draft() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.expires_at := now() + interval '48 hours';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER drafts_touch
  BEFORE UPDATE ON public.drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_draft();

CREATE TABLE public.event_drafts (
  draft_id uuid PRIMARY KEY REFERENCES public.drafts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  flyer_public_id text,
  flyer_version text
);

CREATE TABLE public.review_drafts (
  draft_id uuid PRIMARY KEY REFERENCES public.drafts(id) ON DELETE CASCADE,
  reviewed_id uuid NOT NULL REFERENCES public.user_info(id) ON DELETE CASCADE,
  title text,
  comment text,
  rating smallint CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX review_drafts_reviewed_id_idx ON public.review_drafts (reviewed_id);

ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drafts_owner_all" ON public.drafts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "event_drafts_owner_all" ON public.event_drafts
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = draft_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = draft_id AND d.user_id = auth.uid()));

CREATE POLICY "review_drafts_owner_all" ON public.review_drafts
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = draft_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = draft_id AND d.user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_drafts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_drafts TO authenticated;

GRANT ALL ON public.drafts TO service_role;
GRANT ALL ON public.event_drafts TO service_role;
GRANT ALL ON public.review_drafts TO service_role;
