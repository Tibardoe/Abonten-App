"use client";

import { Button } from "@/components/ui";
import { settlePayout } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// processing -> completed | failed | cancelled. failed/cancelled release the
// held balance back to the organizer (admin_settle_payout). finance.payout +
// step-up, re-checked server-side.
export function PayoutRowActions({
  payoutId,
  canManage,
  stepUpFresh,
}: {
  payoutId: string;
  canManage: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [failureReason, setFailureReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!canManage) return null;

  function run(status: "completed" | "failed" | "cancelled") {
    setMsg(null);
    start(async () => {
      const res = await settlePayout({
        payoutId,
        status,
        failureReason: status === "failed" ? failureReason.trim() : undefined,
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Settle…
      </Button>
    );
  }

  return (
    <div className="min-w-[240px] space-y-1.5 rounded border border-border bg-card p-2">
      {!stepUpFresh ? (
        <p className="text-xs text-destructive">
          Confirm identity in Admin Settings first.
        </p>
      ) : null}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required, audited)"
        rows={2}
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      <input
        value={failureReason}
        onChange={(e) => setFailureReason(e.target.value)}
        placeholder="Failure reason (if marking failed)"
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          disabled={pending || !stepUpFresh || !reason.trim()}
          onClick={() => run("completed")}
        >
          Completed
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !stepUpFresh || !reason.trim()}
          onClick={() => run("failed")}
        >
          Failed
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !stepUpFresh || !reason.trim()}
          onClick={() => run("cancelled")}
        >
          Cancelled
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Close
        </Button>
      </div>
    </div>
  );
}
