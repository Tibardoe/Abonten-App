-- Scheduled cleanup for expired drafts, following the same claim-and-delete
-- pg_cron pattern already used by expire_stale_ticket_checkouts() /
-- expire_stale_subscription_checkouts().
--
-- Cloudinary assets can't be deleted from pure SQL (no outbound HTTPS call
-- from plpgsql without a dedicated pg_net + Edge Function setup, which this
-- migration deliberately does not add). Instead, expired event drafts'
-- flyer identifiers are queued here and drained opportunistically by the
-- cleanupOrphanedDraftAssets Server Action -- see the drafts feature report
-- for the documented limitation this implies (eventual, not guaranteed-
-- immediate, cleanup of expired drafts' images).

CREATE TABLE public.draft_asset_cleanup_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id text NOT NULL,
  resource_type text NOT NULL DEFAULT 'image',
  queued_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.draft_asset_cleanup_queue TO authenticated;
GRANT ALL ON public.draft_asset_cleanup_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.draft_asset_cleanup_queue_id_seq TO authenticated;

CREATE FUNCTION public.cleanup_expired_drafts() RETURNS void AS $$
BEGIN
  INSERT INTO public.draft_asset_cleanup_queue (public_id, resource_type)
  SELECT ed.flyer_public_id, 'image'
  FROM public.event_drafts ed
  JOIN public.drafts d ON d.id = ed.draft_id
  WHERE d.expires_at < now() AND ed.flyer_public_id IS NOT NULL;

  -- Cascades to event_drafts/review_drafts via their FK ON DELETE CASCADE.
  DELETE FROM public.drafts WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT cron.schedule(
  'cleanup-expired-drafts',
  '*/30 * * * *',
  $$SELECT public.cleanup_expired_drafts();$$
);
