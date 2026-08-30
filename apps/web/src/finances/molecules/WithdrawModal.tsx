"use client";

import getOrganizerPayoutAccounts from "@/actions/getOrganizerPayoutAccounts";
import requestOrganizerPayout from "@/actions/requestOrganizerPayout";
import { BottomSheet } from "@/components/atoms/BottomSheet";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { buildWithdrawAmountSchema } from "@abonten/validation/payoutSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import PayoutAccountCard from "./PayoutAccountCard";

type WithdrawModalProps = {
  availableBalance: number;
  currency: string;
  onClose: () => void;
  onSuccess: () => void;
  /** Called when the server rejects a withdrawal because the available
   * balance changed since this modal opened (e.g. a refund was requested in
   * the meantime) — refetches the figures shown above so a retry uses the
   * current balance instead of the stale one this modal was opened with. */
  onBalanceStale: () => void;
};

type Step = "form" | "confirm" | "success";

/**
 * The one place organizers withdraw from — never per-event. Available
 * balance/payout accounts are re-fetched here (not trusted from a stale
 * prop), and the server (request_organizer_payout RPC) is the actual
 * authority on whether the amount is valid; this is UX-level validation
 * only, matching this codebase's "server never trusts the client" rule for
 * every other financial action.
 */
export default function WithdrawModal({
  availableBalance,
  currency,
  onClose,
  onSuccess,
  onBalanceStale,
}: WithdrawModalProps) {
  const [step, setStep] = useState<Step>("form");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const { data: accountsResponse, isPending: accountsPending } = useQuery({
    queryKey: ["payout-accounts"],
    queryFn: getOrganizerPayoutAccounts,
    staleTime: 20_000,
  });

  const accounts =
    accountsResponse?.status === 200 ? accountsResponse.data : [];

  const schema = useMemo(
    () => buildWithdrawAmountSchema(availableBalance),
    [availableBalance],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: undefined as unknown as number,
      payoutAccountId: accounts.find((a) => a.is_default)?.id ?? "",
    },
  });
  const { control, handleSubmit, watch } = form;

  const amount = watch("amount");
  const payoutAccountId = watch("payoutAccountId");
  const selectedAccount = accounts.find((a) => a.id === payoutAccountId);

  const goToConfirm = handleSubmit(() => setStep("confirm"));

  const submitWithdrawal = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setServerError(null);

    const response = await requestOrganizerPayout(
      payoutAccountId,
      Number(amount),
      currency,
    );

    setIsSubmitting(false);

    if (response.status !== 200) {
      setServerError(response.message);
      if (response.balanceStale) {
        onBalanceStale();
      }
      return;
    }

    setReference(response.data.reference);
    setStep("success");
    onSuccess();
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={step === "success" ? "Withdrawal requested" : "Withdraw funds"}
      className="md:w-[28rem]"
    >
      <div className="space-y-5">
        {step === "form" && (
          <Form {...form}>
            <form onSubmit={goToConfirm} className="flex flex-col gap-5">
              <div className="rounded-md bg-muted p-3 text-sm">
                Available:{" "}
                <span className="font-semibold">
                  {currency} {availableBalance.toLocaleString()}
                </span>
              </div>

              <FormField
                control={control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2 space-y-0">
                    <label htmlFor="amount" className="text-sm">
                      Amount
                    </label>
                    <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                      <span className="text-muted-foreground text-sm">
                        {currency}
                      </span>
                      <FormControl>
                        <input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
                          placeholder="0.00"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="payoutAccountId"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2 space-y-0">
                    <p className="text-sm">Send to</p>

                    {accountsPending ? (
                      <p className="text-sm text-muted-foreground">
                        Loading accounts…
                      </p>
                    ) : accounts.length === 0 ? (
                      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground space-y-2">
                        <p>You haven't added a payout account yet.</p>
                        <Link
                          href="/finances/payout-accounts"
                          className="font-medium text-primary hover:underline"
                        >
                          Add a payout account
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {accounts.map((account) => (
                          <PayoutAccountCard
                            key={account.id}
                            account={account}
                            selected={field.value === account.id}
                            onSelect={() => field.onChange(account.id)}
                          />
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={accounts.length === 0}
                className="font-semibold md:self-end rounded-md py-6 text-lg md:text-sm"
              >
                Continue
              </Button>
            </form>
          </Form>
        )}

        {step === "confirm" && selectedAccount && (
          <div className="flex flex-col gap-5">
            <div className="rounded-md border border-border p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">
                  {currency} {Number(amount).toLocaleString()}
                </span>
              </div>
              <hr className="border-border" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Send to</span>
                <span className="font-semibold">
                  {selectedAccount.account_type === "mobile_money"
                    ? selectedAccount.provider
                    : "Bank Account"}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Your withdrawal will move to "Processing" while it's reviewed — it
              won't be marked complete until it's actually paid out.
            </p>

            {serverError && (
              <p className="text-sm text-destructive">{serverError}</p>
            )}

            <div className="flex flex-col md:flex-row gap-3 md:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setStep("form")}
                className="rounded-md py-6 text-lg md:py-2 md:text-sm"
              >
                Back
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={submitWithdrawal}
                className="font-semibold rounded-md py-6 text-lg md:py-2 md:text-sm"
              >
                {isSubmitting
                  ? "Submitting…"
                  : `Withdraw ${currency} ${Number(amount).toLocaleString()}`}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col gap-4 items-center text-center py-6">
            <p className="text-sm text-muted-foreground">
              We've received your withdrawal request. Reference:{" "}
              <span className="font-mono">{reference}</span>
            </p>
            <p className="text-sm">
              Track its status any time on the Payouts page.
            </p>
            <Button
              type="button"
              onClick={onClose}
              className="rounded-md py-6 text-lg md:py-2 md:text-sm"
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
