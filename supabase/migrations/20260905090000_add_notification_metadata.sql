-- Notification thumbnails + typed deep-linking.
--
-- The notification row only carried type/title/body/link (a web path string).
-- Mobile has to translate that string to a native route, and the list can't
-- show an event flyer / place cover next to the text. This adds:
--   data           jsonb  — { kind, eventId?, placeId?, placeSlug?, ticketId?, reviewId? }
--                            the structured target, preferred over parsing `link`
--   image_public_id text   — Cloudinary id of the row's thumbnail (flyer / cover)
--   image_version   varchar(10)
--
-- Forward-only: existing rows get data = '{}' and null images; producers are
-- updated to populate these going forward. No RLS change — the table stays
-- app-layer only (mobile reads it through /api/mobile/notifications on the
-- authed client, never directly).
--
-- Applied live via the Supabase MCP (project sderrexhawjbmsugndcq); this file
-- is the repo record.

ALTER TABLE public.notification
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS image_public_id text,
  ADD COLUMN IF NOT EXISTS image_version varchar(10);
