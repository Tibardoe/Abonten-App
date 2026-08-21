-- Places feature Phase 2, Milestone 2: Claim / Verification. Confirmed
-- during research: this schema has NO admin/moderator role anywhere (no
-- is_admin column, no moderation table). A real "claim this place" flow
-- needs some gate against anyone claiming any business, so this migration
-- adds the minimal admin surface required -- nothing broader.
--
-- Claiming never auto-transfers ownership: it creates a pending
-- place_claim_request row, and only an explicit admin-reviewed approval
-- (via the approve_place_claim RPC below) reassigns place.owner_id. This
-- was a confirmed decision with the user, not an assumption.

ALTER TABLE public.user_info ADD COLUMN is_admin boolean DEFAULT false NOT NULL;

CREATE TABLE public.place_claim_request (
  id             uuid                     DEFAULT extensions.uuid_generate_v4() NOT NULL,
  place_id       uuid                     NOT NULL,
  claimant_id    uuid                     NOT NULL,
  note           text,
  contact_phone  text,
  contact_email  text,
  status         text                     DEFAULT 'pending' NOT NULL,
  reviewed_by    uuid,
  reviewed_at    timestamp with time zone,
  created_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.place_claim_request ADD CONSTRAINT place_claim_request_pkey PRIMARY KEY (id);
ALTER TABLE public.place_claim_request ADD CONSTRAINT place_claim_request_place_id_fkey FOREIGN KEY (place_id) REFERENCES public.place(id) ON DELETE CASCADE;
ALTER TABLE public.place_claim_request ADD CONSTRAINT place_claim_request_claimant_id_fkey FOREIGN KEY (claimant_id) REFERENCES public.user_info(id) ON DELETE CASCADE;
ALTER TABLE public.place_claim_request ADD CONSTRAINT place_claim_request_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.user_info(id);
ALTER TABLE public.place_claim_request ADD CONSTRAINT place_claim_request_status_check
  CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected']));

GRANT ALL ON public.place_claim_request TO anon;
GRANT ALL ON public.place_claim_request TO authenticated;
GRANT ALL ON public.place_claim_request TO service_role;

CREATE INDEX idx_place_claim_request_place_id ON public.place_claim_request (place_id);
CREATE INDEX idx_place_claim_request_status ON public.place_claim_request (status, created_at);

-- Only one pending request per (place, claimant) at a time -- prevents a
-- claimant from spamming duplicate requests for the same place while one is
-- already awaiting review. Approved/rejected rows are exempt (a claimant
-- can re-request after a rejection), enforced via a partial unique index
-- rather than a table-wide UNIQUE constraint.
CREATE UNIQUE INDEX idx_place_claim_request_one_pending
  ON public.place_claim_request (place_id, claimant_id)
  WHERE status = 'pending';

-- approve_place_claim: the only path that ever reassigns place.owner_id.
-- Atomic (place update + request update in one transaction) and admin-gated
-- -- callers pass p_admin_id, and the function verifies that user actually
-- has is_admin = true before doing anything, so this can't be invoked
-- successfully by a non-admin even if a Server Action's own check were ever
-- bypassed (defense in depth, matching this schema's existing pattern of
-- re-checking things server-side that the app layer already checked).
CREATE FUNCTION public.approve_place_claim (
  p_request_id uuid,
  p_admin_id   uuid
)
  RETURNS void
  LANGUAGE plpgsql
  AS $function$
DECLARE
  v_is_admin  boolean;
  v_place_id  uuid;
  v_claimant  uuid;
  v_status    text;
BEGIN
  SELECT is_admin INTO v_is_admin FROM user_info WHERE id = p_admin_id;
  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized: caller is not an admin';
  END IF;

  SELECT place_id, claimant_id, status
    INTO v_place_id, v_claimant, v_status
  FROM place_claim_request
  WHERE id = p_request_id
  FOR UPDATE;

  IF v_place_id IS NULL THEN
    RAISE EXCEPTION 'Claim request not found';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Claim request already reviewed';
  END IF;

  UPDATE place
  SET owner_id = v_claimant,
      claimed = true,
      verified = true,
      updated_at = now()
  WHERE id = v_place_id;

  UPDATE place_claim_request
  SET status = 'approved',
      reviewed_by = p_admin_id,
      reviewed_at = now()
  WHERE id = p_request_id;
END;
$function$;

GRANT ALL ON FUNCTION public.approve_place_claim(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.approve_place_claim(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_place_claim(uuid, uuid) TO service_role;
