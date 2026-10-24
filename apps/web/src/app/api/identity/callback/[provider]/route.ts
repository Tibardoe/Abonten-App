import { logger } from "@abonten/core/logger";
import { handleIdentityCallbackCore } from "@abonten/services/identity/identityCore";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { IdentityProviderKey } from "@abonten/types/identityType";
import { NextResponse } from "next/server";

export const maxDuration = 30;

// POST /api/identity/callback/<provider>
//
// The identity provider's verdict on a check (Smile ID: "smile-id"). The
// provider signs it, but its signature does not cover the body, so the
// service checks the timestamp, that the attempt is one Abonten created,
// and asks the provider's API for the verdict before deciding anything.
// Answers 200 once handled (or when the call is not ours, so the provider
// stops retrying), 401 for a bad signature, 503 to be retried later.

const PROVIDERS: Record<string, IdentityProviderKey> = {
  "smile-id": "smile_id",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const key = PROVIDERS[provider];
  if (!key) return NextResponse.json({ status: 404 }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 2_000_000) {
    logger.warn("identity callback: body too large");
    return NextResponse.json({ status: 413 }, { status: 413 });
  }
  const res = await handleIdentityCallbackCore(
    getSupabaseServiceClient(),
    key,
    req.headers,
    raw,
  );
  return NextResponse.json(res, { status: res.status });
}
