import { logger } from "@abonten/core/logger";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import {
  type CreditActivityRow,
  toCreditActivityItem,
} from "@abonten/core/rewards/creditActivityCopy";
import type { Database } from "@abonten/types/database.types";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type {
  CreditAccountStatus,
  CreditActivityItem,
  CreditSpendScope,
  CreditSummary,
} from "@abonten/types/rewards";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRewardsProgramCore } from "./rewardsProgramQuery";

// The signed-in user's own credit balance and activity. Both reads run on
// the CALLER's client (cookie session on web, Bearer on mobile): the
// get_my_credit_* functions scope themselves to auth.uid(), so a user can
// only ever see their own account -- the userId argument is only used for
// logging and to refuse a missing session early.

type SummaryJson = {
  status?: CreditAccountStatus;
  available_minor?: number;
  pending_minor?: number;
  on_hold_minor?: number;
  in_debt?: boolean;
  withdrawable_minor?: number;
  by_scope?: Partial<Record<CreditSpendScope, number>>;
  lifetime?: {
    earned_minor?: number;
    spent_minor?: number;
    withdrawn_minor?: number;
    expired_minor?: number;
    reversed_minor?: number;
  };
  expiring_soon?: { amount_minor: number; expires_at: string } | null;
  next_release?: {
    amount_minor: number;
    release_at: string;
    label: string | null;
  } | null;
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function mapCreditSummary(
  json: SummaryJson | null,
  enabled: boolean,
): CreditSummary {
  const byScope: Partial<Record<CreditSpendScope, number>> = {};
  for (const [scope, value] of Object.entries(json?.by_scope ?? {})) {
    byScope[scope as CreditSpendScope] = num(value);
  }

  return {
    enabled,
    currency: "GHS",
    status: json?.status ?? "active",
    availableMinor: num(json?.available_minor),
    pendingMinor: num(json?.pending_minor),
    onHoldMinor: num(json?.on_hold_minor),
    inDebt: json?.in_debt === true,
    withdrawableMinor: num(json?.withdrawable_minor),
    bySpendScope: byScope,
    lifetime: {
      earnedMinor: num(json?.lifetime?.earned_minor),
      spentMinor: num(json?.lifetime?.spent_minor),
      withdrawnMinor: num(json?.lifetime?.withdrawn_minor),
      expiredMinor: num(json?.lifetime?.expired_minor),
      reversedMinor: num(json?.lifetime?.reversed_minor),
    },
    expiringSoon: json?.expiring_soon
      ? {
          amountMinor: num(json.expiring_soon.amount_minor),
          expiresAt: json.expiring_soon.expires_at,
        }
      : null,
    nextRelease: json?.next_release
      ? {
          amountMinor: num(json.next_release.amount_minor),
          releaseAt: json.next_release.release_at,
          label: json.next_release.label ?? null,
        }
      : null,
  };
}

export async function getCreditSummaryCore(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{
  status: 200 | 401 | 500;
  message?: string;
  data?: CreditSummary;
}> {
  if (!userId) {
    return { status: 401, message: "User not logged in" };
  }

  const [summary, program] = await Promise.all([
    supabase.rpc("get_my_credit_summary"),
    getRewardsProgramCore(supabase),
  ]);

  if (summary.error) {
    logger.error(
      `getCreditSummaryCore failed for ${userId}: ${summary.error.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    data: mapCreditSummary(
      summary.data as SummaryJson | null,
      program.data.enabled,
    ),
  };
}

export async function getCreditActivityCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  options?: { cursor?: string | null; pageSize?: number },
): Promise<PaginatedResult<CreditActivityItem>> {
  if (!userId) {
    return {
      status: 401,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "User not logged in",
    };
  }

  const pageSize = Math.min(options?.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE, 50);
  const cursor = decodeCursor<SimpleCursor>(options?.cursor);

  const { data, error } = await supabase.rpc("get_my_credit_activity", {
    p_cursor_created_at: cursor?.sortValue ?? undefined,
    p_cursor_id: cursor?.id ?? undefined,
    p_limit: pageSize + 1,
  });

  if (error) {
    logger.error(
      `getCreditActivityCore failed for ${userId}: ${error.message}`,
    );
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong!",
    };
  }

  const { page, hasNextPage } = splitPage<CreditActivityRow>(
    (data ?? []) as unknown as CreditActivityRow[],
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

  return {
    status: 200,
    data: page.map(toCreditActivityItem),
    nextCursor,
    hasNextPage,
  };
}
