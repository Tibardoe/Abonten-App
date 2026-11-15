import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { accountArg } from "../teams/accountArg";
import type { ActingAccount } from "../teams/actingAccount";
import {
  recordTeamMoneyEvent,
  requireTeamMoneyIdentity,
} from "../teams/teamMoney";

// Post-auth body of requestOrganizerPayout, shared by the Server Action
// (cookie session) and the mobile HTTP route (Bearer session). All
// authorization + balance validation lives inside the request_organizer_payout
// RPC (it re-verifies payout-account ownership against auth.uid() and
// recomputes the available balance from the ledger), so this helper never
// trusts a client-supplied balance and only shape-checks the amount.
// `revalidatePath` is Next-specific and stays in the action wrapper.

export type RequestOrganizerPayoutResult =
  | {
      status: 400 | 401 | 403 | 409 | 500;
      message: string;
      balanceStale?: boolean;
    }
  | { status: 200; data: { payoutId: string; reference: string } };

export async function requestOrganizerPayoutCore(
  supabase: SupabaseClient<Database>,
  input: {
    payoutAccountId: string;
    amount: number;
    currency: string;
  },
  /** The member asking, when it is for a team (stage 3). */
  actor?: ActingAccount | null,
): Promise<RequestOrganizerPayoutResult> {
  const { payoutAccountId, amount, currency } = input;
  const accountId = actor?.role ? actor.accountId : null;

  // Owners and Finance moving a team's money are ID-checked (X5).
  if (actor?.role) {
    const blocked = await requireTeamMoneyIdentity(
      getSupabaseServiceClient(),
      actor,
    );
    if (blocked) return blocked;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      status: 400,
      message: tr("enterAnAmountGreaterThanZero"),
    };
  }

  const { data, error } = await supabase
    .rpc("request_organizer_payout", {
      p_payout_account_id: payoutAccountId,
      p_amount: amount,
      p_currency: currency,
      ...accountArg(accountId),
    })
    .single();

  if (error) {
    logger.error(`Failed requesting payout: ${error.message}`);
    const balanceStale = error.message.includes("exceeds available balance");
    const message = balanceStale
      ? tr("yourAvailableBalanceHasChangedPlease")
      : error.message.includes("Invalid payout account currency")
        ? tr("chooseAPayoutAccountThatReceives", {
            currency: currency.toUpperCase(),
          })
        : error.message.includes("Payout account too new")
          ? tr("teamPayoutAccountTooNew")
          : error.message.includes("Not allowed for this account")
            ? tr("teamRoleCannot")
            : error.message.includes("Invalid payout account")
              ? tr("selectAValidPayoutAccount")
              : error.message.includes("precision")
                ? tr("thatAmountHasTooManyDecimal", {
                    currency: currency.toUpperCase(),
                  })
                : error.message.includes("Account restricted")
                  ? tr("yourAccountIsRestrictedContactSupport")
                  : tr("somethingWentWrongPleaseTryAgain2");

    return { status: 400, message, balanceStale };
  }

  const result = data as { payout_id: string; reference: string };
  if (actor?.role) {
    await recordTeamMoneyEvent(getSupabaseServiceClient(), actor, {
      kind: "payout_requested",
      amount,
      currency: currency.toUpperCase(),
    });
  }

  return {
    status: 200,
    data: { payoutId: result.payout_id, reference: result.reference },
  };
}
