"use client";

import { Button, Card } from "@/components/ui";
import { reverseFieldOpsCommission } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

/**
 * Takes a commission back (fieldops.commissions.approve + step-up). The
 * original row is never edited: one that was already paid keeps its row and
 * gains a negative offset beside it, so the money that left is still on
 * record and the payout figures still add up.
 */
export function ReversePanel({ commissionId }: { commissionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await reverseFieldOpsCommission({
        commissionId,
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setConfirming(false);
        setReason("");
        router.refresh();
      }
    });

  return (
    <Card className="space-y-2 p-4">
      <h3 className="text-sm font-semibold">Reverse this commission</h3>
      <p className="text-xs text-muted-foreground">
        For a listing that turned out to be fake, removed, or a duplicate. The
        member is told. This cannot be undone — record a new commission instead
        if you reverse one by mistake.
      </p>
      <input
        className={input}
        placeholder="Reason (the member sees this)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {confirming ? (
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={submit}
            disabled={pending || reason.trim().length < 3}
          >
            Yes, reverse it
          </Button>
          <Button variant="outline" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="danger"
          onClick={() => setConfirming(true)}
          disabled={reason.trim().length < 3}
        >
          Reverse…
        </Button>
      )}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </Card>
  );
}
