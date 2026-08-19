import { z } from "zod";

// The server (request_organizer_payout RPC) is the actual authority on
// available balance — this schema only gives the withdraw form fast,
// friendly client-side feedback before that server-side check runs.
export function buildWithdrawAmountSchema(availableBalance: number) {
  return z.object({
    amount: z.coerce
      .number({ invalid_type_error: "Enter an amount" })
      .positive("Enter an amount greater than zero")
      .max(availableBalance, "Amount cannot exceed your available balance"),
    payoutAccountId: z.string().min(1, "Select a payout account"),
  });
}

export type WithdrawFormInput = {
  amount: number;
  payoutAccountId: string;
};
