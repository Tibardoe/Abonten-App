"use client";

import { Button, Card, cn } from "@/components/ui";
import { reviewClaim } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ReviewPanel({
  claimId,
  canReview,
  isPending: claimPending,
  canVerify,
  documentCount,
  placeAlreadyVerified,
}: {
  claimId: string;
  canReview: boolean;
  /** whether the claim itself is still in "pending" status */
  isPending: boolean;
  /** holds verification.review — may also verify the place */
  canVerify: boolean;
  documentCount: number;
  placeAlreadyVerified: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [alsoVerify, setAlsoVerify] = useState(false);
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
          alsoVerify: decision === "approve" ? alsoVerify : undefined,
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
            and marks the place claimed. It no longer verifies the place —
            verification is its own reviewed step. This cannot be undone from
            here.
          </p>

          {canVerify && !placeAlreadyVerified ? (
            <label className="flex items-start gap-2 rounded border border-border p-2 text-xs">
              <input
                type="checkbox"
                checked={alsoVerify}
                onChange={(e) => setAlsoVerify(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">
                  Also mark this place verified
                </span>
                <span className="block text-muted-foreground">
                  {documentCount > 0
                    ? `Only if the ${documentCount} attached document${
                        documentCount === 1 ? "" : "s"
                      } genuinely prove the business and the claimant's link to it.`
                    : "No documents were attached — leave this unticked and let the owner apply for verification separately."}
                </span>
              </span>
            </label>
          ) : null}
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
                if (
                  confirm(
                    alsoVerify
                      ? "Approve this claim, transfer ownership AND verify the place?"
                      : "Approve this claim and transfer ownership?",
                  )
                ) {
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
