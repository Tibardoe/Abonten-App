// Destroying a replaced or abandoned image safely.
//
// Listings, drafts and galleries store a Cloudinary public_id the client
// sent, and nothing ties that id to the account sending it (web flyers and
// covers are uploaded to shared folders). When one of those images is
// replaced or its draft deleted, the old asset used to be destroyed
// outright — so an organizer who put another listing's image id on their
// own event, then replaced it, deleted the other listing's image (reproduced
// in asset-ownership.integration.test.ts). An asset is now destroyed only
// when no other listing, draft, gallery photo or avatar still uses it.

import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { destroyAsset } from "./cloudinaryClient";

type RefTable =
  | "event"
  | "event_drafts"
  | "place"
  | "place_drafts"
  | "place_photo"
  | "user_info";

const REFERENCES: { table: RefTable; column: string }[] = [
  { table: "event", column: "flyer_public_id" },
  { table: "event_drafts", column: "flyer_public_id" },
  { table: "place", column: "cover_public_id" },
  { table: "place_drafts", column: "cover_public_id" },
  { table: "place_photo", column: "public_id" },
  { table: "user_info", column: "avatar_public_id" },
];

/** A row that may still reference the asset and is about to go away. */
export type OwnRow = {
  table: "event_drafts" | "place_drafts";
  draftId: string;
};

/** True when any listing, draft, gallery photo or avatar still uses it. */
export async function isAssetInUse(
  publicId: string,
  except?: OwnRow,
): Promise<boolean> {
  const service = getSupabaseServiceClient();
  for (const ref of REFERENCES) {
    let q = service
      .from(ref.table as never)
      .select(ref.column, { count: "exact", head: true })
      .eq(ref.column, publicId);
    if (except && except.table === ref.table) {
      q = q.neq("draft_id", except.draftId);
    }
    const { count, error } = await q;
    // Unsure means in use: never destroy on a failed check.
    if (error || (count ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Destroys the asset unless something else still uses it. Returns what
 * happened, so a caller that reports Cloudinary's answer can keep doing so.
 */
export async function destroyAssetIfUnused(
  publicId: string,
  options: Parameters<typeof destroyAsset>[1] = {},
  except?: OwnRow,
): Promise<{ result?: string; kept?: true }> {
  if (await isAssetInUse(publicId, except)) {
    logger.warn("Kept a Cloudinary asset another record still uses", {
      publicId,
    });
    return { result: "ok", kept: true };
  }
  return destroyAsset(publicId, options);
}
