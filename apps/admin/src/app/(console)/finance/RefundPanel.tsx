"use client";

import { Button } from "@/components/ui";
import { refundTransaction } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Money-path action. issueRefundCore is idempotent and refunds ticket
// revenue only (the Abonten fee is retained). Needs finance.refund + a
// fresh step-up; the server re-checks both.
export function RefundPanel({
  transactionId,
  refundableLabel,
  canRefund,
  stepUpFresh,
}: {
  transactionId: string;
  refundableLabel: string;
  canRefund: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!canRefund) return null;

  return (
    <div className="mt-3 space-y-2 rounded border border-warning/40 bg-warning/10 p-3">
      <p className="text-sm font-semibold">Issue a refund</p>
      <p className="text-xs text-muted-foreground">
        Sends {refundableLabel} back via Paystack (ticket revenue only — the
        service fee is retained) and holds it against the organizer&apos;s
        ledger. Idempotent; a retry won&apos;t double-refund.
      </p>
      {!stepUpFresh ? (
        <p className="text-xs text-destructive">
          Confirm your identity in Admin Settings first, then return here.
        </p>
      ) : null}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required, audited)"
        rows={2}
        className="w-full rounded border border-border bg-background p-1.5 text-xs"
      />
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      {!confirm ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!stepUpFresh || !reason.trim() || pending}
          onClick={() => setConfirm(true)}
        >
          Refund this payment…
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              setMsg(null);
              start(async () => {
                const res = await refundTransaction({
                  transactionId,
                  reason: reason.trim(),
                });
                setMsg(res.message ?? null);
                setConfirm(false);
                if (res.status === 200) router.refresh();
              });
            }}
          >
            {pending ? "Requesting…" : "Confirm refund"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirm(false)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
