"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  keysetOlderThan,
  splitPage,
} from "@abonten/core/pagination";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { PlaceClaimRequest } from "@abonten/types/placeType";

/**
 * Admin-only, cursor-paginated list of claim requests, defaulting to
 * 'pending'. Re-checks user_info.is_admin server-side itself -- never
 * trusts a client-side claim, same defense-in-depth reasoning as
 * approve_place_claim's own internal is_admin check. Mirrors
 * getPlaceReviews.ts's cursor-pagination shape (SimpleCursor on
 * created_at/id) exactly.
 */
export async function getPlaceClaimRequests(options?: {
  status?: "pending" | "approved" | "rejected";
  cursor?: string | null;
  pageSize?: number;
}): Promise<PaginatedResult<PlaceClaimRequest>> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not authenticated",
    };
  }

  const { data: userInfo, error: userInfoError } = await supabase
    .from("user_info")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (userInfoError) {
    logger.error(`Error checking admin status: ${userInfoError.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  if (!userInfo?.is_admin) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Not authorized",
    };
  }

  const status = options?.status ?? "pending";
  const pageSize = options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  let query = supabase
    .from("place_claim_request")
    .select(
      "*, place(name, slug), user_info!claimant_id(username), place_claim_document(count)",
    )
    .eq("status", status)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    query = query.or(keysetOlderThan("created_at", "id", cursor));
  }

  const { data, error } = await query;

  if (error) {
    logger.error(`Failed fetching place claim requests: ${error.message}`);

    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  // PostgREST returns the `place_claim_document(count)` embed as
  // `[{ count: N }]` — flatten it to a plain number.
  const normalised = (data ?? []).map((row) => {
    const embed = (row as { place_claim_document?: { count: number }[] })
      .place_claim_document;
    const { place_claim_document, ...rest } = row as Record<string, unknown>;
    return {
      ...rest,
      document_count: Array.isArray(embed) ? (embed[0]?.count ?? 0) : 0,
    };
  }) as unknown as PlaceClaimRequest[];

  const { page, hasNextPage } = splitPage<PlaceClaimRequest>(
    normalised,
    pageSize,
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.created_at),
          id: last.id,
        })
      : null;

  return { status: 200, data: page, nextCursor, hasNextPage };
}
