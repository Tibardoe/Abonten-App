"use client";

import { Button } from "@/components/ui";
import { decideCreditAdjustment } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Second-approver step for a large credit adjustment. The database refuses
// an approval from the admin who made the request, and the server re-checks
// finance.adjust + a fresh step-up.
export function AdjustmentDecision({
  requestId,
  isOwnRequest,
  canDecide,
  stepUpFresh,
}: {
  requestId: string;
  isOwnRequest: boolean;
  canDecide: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!canDecide) return null;

  const decide = (decision: "approve" | "reject") =>
    start(async () => {
      setMsg(null);
      const res = await decideCreditAdjustment({
        requestId,
        decision,
        note: note.trim() || undefined,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  return (
    <div className="space-y-1.5">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={
          isOwnRequest ? "Why cancel? (required)" : "Note (required to reject)"
        }
        className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
      />
      <div className="flex gap-1.5">
        {!isOwnRequest && (
          <Button
            size="sm"
            disabled={pending || !stepUpFresh}
            onClick={() => decide("approve")}
          >
            Approve
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !stepUpFresh || note.trim().length < 3}
          onClick={() => decide("reject")}
        >
          {isOwnRequest ? "Cancel request" : "Reject"}
        </Button>
      </div>
      {!stepUpFresh ? (
        <p className="text-[11px] text-muted-foreground">
          Confirm your identity to decide.
        </p>
      ) : null}
      {msg ? <p className="text-[11px] text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
