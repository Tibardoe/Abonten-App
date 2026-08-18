-- draft_asset_cleanup_queue holds no user-owned data (just Cloudinary
-- public_ids awaiting best-effort deletion), so a per-row ownership policy
-- doesn't apply -- but the linter correctly flags bare GRANTs without RLS
-- as inconsistent with this migration's own "add RLS" stance. Enable it
-- with an explicit permissive policy instead of relying on grants alone.
ALTER TABLE public.draft_asset_cleanup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "draft_asset_cleanup_queue_authenticated_all" ON public.draft_asset_cleanup_queue
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
