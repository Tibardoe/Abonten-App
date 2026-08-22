-- Extends the drafts system (see 20260818090000_add_drafts.sql) with a
-- third draft_type, 'place', mirroring event_drafts exactly (jsonb payload
-- + cover-photo asset columns instead of flyer columns). No changes needed
-- to the generic `drafts` base table or its touch_draft() trigger — only
-- the draft_type CHECK constraint needs the new value added.

ALTER TABLE public.drafts DROP CONSTRAINT drafts_draft_type_check;
ALTER TABLE public.drafts ADD CONSTRAINT drafts_draft_type_check
  CHECK (draft_type IN ('event', 'review', 'place'));

CREATE TABLE public.place_drafts (
  draft_id uuid PRIMARY KEY REFERENCES public.drafts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  cover_public_id text,
  cover_version text
);

ALTER TABLE public.place_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "place_drafts_owner_all" ON public.place_drafts
  FOR ALL
  USING (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = draft_id AND d.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.drafts d WHERE d.id = draft_id AND d.user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.place_drafts TO authenticated;
GRANT ALL ON public.place_drafts TO service_role;
