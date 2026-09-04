"use client";

import { Button } from "@/components/ui";
import { createPayout } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Account = {
  id: string;
  provider: string | null;
  accountType: string | null;
  maskedNumber: string | null;
  status: string | null;
};

// Originate a withdrawal for an organizer (support does this when the
// organizer can't). admin_create_payout re-verifies account ownership and
// recomputes the available balance server-side. finance.payout + step-up.
export function CreatePayoutPanel({
  organizerId,
  currency,
  outstandingLabel,
  accounts,
  canCreate,
  stepUpFresh,
}: {
  organizerId: string;
  currency: string;
  outstandingLabel: string;
  accounts: Account[];
  canCreate: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const active = accounts.filter((a) => a.status === "active");
  const [accountId, setAccountId] = useState(active[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!canCreate) return null;

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Originate a payout…
      </Button>
    );
  }

  const amt = Number(amount);
  const disabled =
    pending ||
    !stepUpFresh ||
    !accountId ||
    !reason.trim() ||
    !Number.isFinite(amt) ||
    amt <= 0;

  return (
    <div className="mt-2 space-y-2 rounded border border-border bg-card p-3">
      <p className="text-sm font-semibold">Originate a payout</p>
      <p className="text-xs text-muted-foreground">
        Available to withdraw: {outstandingLabel}. The server recomputes this
        from the ledger and rejects an over-draw. In-app record only — the bank
        transfer is done separately, then mark the payout completed.
      </p>
      {!stepUpFresh ? (
        <p className="text-xs text-destructive">
          Confirm identity in Admin Settings first.
        </p>
      ) : null}
      {active.length === 0 ? (
        <p className="text-xs text-destructive">
          This organizer has no active payout account.
        </p>
      ) : (
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full rounded border border-border bg-background p-1 text-xs"
        >
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {[a.provider, a.accountType, a.maskedNumber]
                .filter(Boolean)
                .join(" · ")}
            </option>
          ))}
        </select>
      )}
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        placeholder={`Amount (${currency})`}
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required, audited)"
        rows={2}
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const res = await createPayout({
                organizerId,
                payoutAccountId: accountId,
                amount: amt,
                currency,
                reason: reason.trim(),
              });
              setMsg(res.message ?? null);
              if (res.status === 200) {
                setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          {pending ? "Creating…" : "Create payout"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
