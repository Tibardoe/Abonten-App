import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  WeeklyEditionDocument,
  WeeklyEditionStatus,
} from "@abonten/types/weeklyType";
import {
  deriveSigningKey,
  hmacBase64Url,
  signaturesMatch,
} from "../security/signing";
import { mapWeeklyDocument } from "./weeklyDocument";

// Preview links for unpublished editions. The admin console signs
// `<editionId>.<expiresAtMs>` with a key derived from the service-role key
// (already a secret in both the admin and web deployments, so no new
// variable is needed); the web /weekly/preview/[token] page verifies it and
// renders the draft exactly as the public would see it. A link works for 30
// minutes, grants read access to that one edition only, and is never cached
// or indexed.

const PURPOSE = "weekly-preview:v1";
export const WEEKLY_PREVIEW_TTL_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createWeeklyPreviewToken(
  editionId: string,
  now: number = Date.now(),
  key: Buffer = deriveSigningKey(PURPOSE),
): string {
  const expiresAt = now + WEEKLY_PREVIEW_TTL_MS;
  const payload = `${editionId}.${expiresAt}`;
  return `${payload}.${hmacBase64Url(key, payload)}`;
}

/** The edition id, or null for a malformed, tampered or expired token. */
export function readWeeklyPreviewToken(
  token: string | null | undefined,
  now: number = Date.now(),
  key: Buffer = deriveSigningKey(PURPOSE),
): string | null {
  if (!token || token.length > 200) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [editionId, expiresRaw, signature] = parts;
  if (!UUID.test(editionId) || !/^\d{10,16}$/.test(expiresRaw)) return null;
  const expected = hmacBase64Url(key, `${editionId}.${expiresRaw}`);
  if (!signaturesMatch(signature, expected)) return null;
  if (Number(expiresRaw) < now) return null;
  return editionId;
}

export async function getWeeklyPreviewCore(
  supabase: ServiceRoleClient,
  token: string,
): Promise<{
  status: number;
  message?: string;
  data?: {
    edition: WeeklyEditionDocument;
    status: WeeklyEditionStatus;
    expiresAt: string;
  };
}> {
  const editionId = readWeeklyPreviewToken(token);
  if (!editionId) {
    return { status: 403, message: "This preview link has expired." };
  }
  try {
    const [{ data: doc, error }, { data: row }] = await Promise.all([
      supabase.rpc("weekly_edition_document", {
        p_edition_id: editionId,
        p_admin: false,
      }),
      supabase
        .from("weekly_edition")
        .select("status")
        .eq("id", editionId)
        .maybeSingle(),
    ]);
    if (error) {
      logger.error(`weekly preview failed: ${error.message}`);
      return { status: 500, message: "Couldn't load the preview." };
    }
    const edition = mapWeeklyDocument(doc);
    if (!edition || !row) {
      return { status: 404, message: "This edition no longer exists." };
    }
    return {
      status: 200,
      data: {
        edition,
        status: row.status as WeeklyEditionStatus,
        expiresAt: new Date(Number(token.split(".")[1])).toISOString(),
      },
    };
  } catch (error) {
    logger.error("getWeeklyPreviewCore failed", error);
    return { status: 500, message: "Couldn't load the preview." };
  }
}
