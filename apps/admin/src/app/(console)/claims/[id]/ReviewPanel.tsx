"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { Button, Card, cn } from "@/components/ui";
import { reviewClaim } from "@/server/actions/claims";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ReviewPanel({
  claimId,
  canReview,
  isPending: claimPending,
  canVerify,
  documentCount,
  placeAlreadyVerified,
  isDispute,
  placeName,
  currentOwnerName,
}: {
  claimId: string;
  canReview: boolean;
  /** whether the claim itself is still in "pending" status */
  isPending: boolean;
  /** holds verification.review — may also verify the place */
  canVerify: boolean;
  documentCount: number;
  placeAlreadyVerified: boolean;
  /**
   * Approving takes the place from an account that runs it: the reviewer
   * types the place's name, and the question says who loses it.
   */
  isDispute: boolean;
  placeName: string | null;
  currentOwnerName: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [alsoVerify, setAlsoVerify] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );
  const confirm = useConfirm();
  // The server checks the same (reviewClaimCore's sameName).
  const norm = (v: string) =>
    v.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  const nameMatches = !!placeName && norm(typedName) === norm(placeName);

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
          confirmPlaceName:
            decision === "approve" && isDispute ? typedName : undefined,
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

          {isDispute ? (
            <div className="space-y-1.5 rounded border border-destructive/60 bg-destructive/5 p-2 text-xs">
              <p className="font-medium text-destructive">Ownership dispute</p>
              <p>
                {currentOwnerName ?? "The current owner"} runs this place now
                and loses it the moment you approve. Only approve on strong
                proof, after weighing both sides.
              </p>
              <label className="block space-y-1">
                <span className="text-muted-foreground">
                  Type the place's name to approve
                </span>
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder={placeName ?? ""}
                  className="w-full rounded border border-border bg-background p-1.5 text-sm"
                />
              </label>
            </div>
          ) : null}

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
              disabled={pending || (isDispute && !nameMatches)}
              onClick={async () => {
                const confirmed = await confirm(
                  isDispute
                    ? `Take ${placeName ?? "this place"} from ${currentOwnerName ?? "its current owner"}? They lose the place at once and are not told automatically. The claimant becomes its owner.${alsoVerify ? " The place is also verified." : ""}`
                    : alsoVerify
                      ? "Approve this claim, transfer ownership AND verify the place?"
                      : "Approve this claim and transfer ownership?",
                  {
                    confirmLabel: isDispute
                      ? "Approve the dispute"
                      : alsoVerify
                        ? "Approve and verify"
                        : "Approve",
                    danger: isDispute,
                  },
                );
                if (confirmed) run("approve");
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
