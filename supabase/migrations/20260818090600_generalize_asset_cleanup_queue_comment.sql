-- Documentation-only: draft_asset_cleanup_queue's schema (public_id,
-- resource_type, queued_at) was already generic with no FK to drafts. It's
-- now also fed by uploadHighlight.ts when a highlight's Cloudinary upload
-- succeeds but the matching DB insert fails, so this comment stops implying
-- the table is draft-specific. No schema change.
COMMENT ON TABLE public.draft_asset_cleanup_queue IS
  'Best-effort queue of Cloudinary public_ids awaiting destroy(), fed by any '
  'upload flow that needs to reclaim an orphaned asset after a downstream '
  'failure (not draft-specific despite the name) -- drained opportunistically '
  'by cleanupOrphanedDraftAssets.';
