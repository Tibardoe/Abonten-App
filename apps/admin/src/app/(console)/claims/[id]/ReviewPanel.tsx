"use client";

import { Button, Card, cn } from "@/components/ui";
import { reviewClaim } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ReviewPanel({
  claimId,
  canReview,
  isPending: claimPending,
}: {
  claimId: string;
  canReview: boolean;
  /** whether the claim itself is still in "pending" status */
  isPending: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  function run(decision: "approve" | "reject") {
    setMsg(null);
    start(async () => {
      try {
        const res = await reviewClaim({
          claimId,
          decision,
          reason: reason.trim() || undefined,
          expectedStatus: "pending",
        });
        if (res.status === 200) {
          setMsg({ tone: "ok", text: res.message ?? "Done." });
          router.refresh();
        } else {
          setMsg({ tone: "err", text: res.message ?? "Action failed." });
          if (res.status === 409) router.refresh();
        }
      } catch (e) {
        setMsg({
          tone: "err",
          text: e instanceof Error ? e.message : "Action failed.",
        });
      }
    });
  }

  return (
    <Card className="sticky top-2 space-y-3 p-4">
      <h3 className="text-sm font-semibold">Review</h3>

      {msg ? (
        <p
          className={cn(
            "text-sm",
            msg.tone === "ok" ? "text-success" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      ) : null}

      {!claimPending ? (
        <p className="text-sm text-muted-foreground">
          This claim has already been reviewed.
        </p>
      ) : !canReview ? (
        <p className="text-sm text-muted-foreground">
          You don't have permission to review claims.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Approving reassigns <strong>place ownership</strong> to the claimant
            and marks the place claimed + verified. This cannot be undone from
            here.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason / notes (optional, kept in the audit log)…"
            rows={2}
            className="w-full rounded border border-border bg-background p-1.5 text-sm"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirm("Approve this claim and transfer ownership?")) {
                  run("approve");
                }
              }}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => run("reject")}
            >
              Reject
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
