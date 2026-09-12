"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { decideVerification, revokeVerification } from "@/server/actions";
import type {
  VerificationStatus,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// The reviewer's action panel. Which buttons exist is driven by the same
// rules the verification_transition RPC enforces, so nothing offered here
// can be refused by the database for being the wrong transition.

export function DecisionPanel({
  caseId,
  status,
  subjectType,
  canReview,
  canRevoke,
  stepUpFresh,
  ownerChanged,
  evidenceCount,
}: {
  caseId: string;
  status: VerificationStatus;
  subjectType: VerificationSubjectType;
  canReview: boolean;
  canRevoke: boolean;
  stepUpFresh: boolean;
  ownerChanged: boolean;
  evidenceCount: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  const decidable = status === "pending_review" || status === "needs_info";
  const revocable = status === "approved";

  function run(fn: () => Promise<{ status: number; message?: string }>) {
    setMsg(null);
    start(async () => {
      try {
        const res = await fn();
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
      <h3 className="text-sm font-semibold">Decision</h3>

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

      {!canReview && !canRevoke ? (
        <p className="text-sm text-muted-foreground">
          You don't have permission to review verification requests.
        </p>
      ) : null}

      {decidable && canReview ? (
        <>
          <p className="text-xs text-muted-foreground">
            Approving shows a Verified badge on this {subjectType}. It says
            Abonten reviewed documents supporting the link between the account
            and the business — nothing about the quality of the business itself.
          </p>
          {evidenceCount === 0 ? (
            <p className="text-xs text-warning">
              No documents are attached. Ask for what you need instead of
              rejecting outright.
            </p>
          ) : null}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason — the applicant is shown this. Required to reject or ask for more."
            rows={3}
            className="w-full rounded border border-border bg-background p-1.5 text-sm"
          />
          <div className="space-y-2">
            <Button
              size="sm"
              disabled={pending || ownerChanged}
              onClick={() => {
                if (
                  confirm(
                    `Approve verification for this ${subjectType}? The badge goes live immediately.`,
                  )
                ) {
                  run(() =>
                    decideVerification({
                      caseId,
                      decision: "approve",
                      reason: reason.trim() || undefined,
                      expectedStatus: status,
                    }),
                  );
                }
              }}
            >
              Approve
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !reason.trim() || status === "needs_info"}
                onClick={() =>
                  run(() =>
                    decideVerification({
                      caseId,
                      decision: "request_info",
                      reason: reason.trim(),
                      expectedStatus: status,
                    }),
                  )
                }
              >
                Ask for more
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={pending || !reason.trim()}
                onClick={() =>
                  run(() =>
                    decideVerification({
                      caseId,
                      decision: "reject",
                      reason: reason.trim(),
                      expectedStatus: status,
                    }),
                  )
                }
              >
                Reject
              </Button>
            </div>
            {!reason.trim() ? (
              <p className="text-xs text-muted-foreground">
                Rejecting or asking for more needs a reason — the applicant
                reads it.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {revocable ? (
        canRevoke ? (
          stepUpFresh ? (
            <div className="space-y-2 border-t border-border pt-3">
              <h4 className="text-sm font-semibold">Revoke</h4>
              <p className="text-xs text-muted-foreground">
                Removes the Verified badge immediately and tells the owner why.
                Use it when evidence turns out to be false or the business has
                changed hands.
              </p>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Why is this being revoked? The owner is shown this."
                rows={2}
                className="w-full rounded border border-border bg-background p-1.5 text-sm"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={pending || !revokeReason.trim()}
                onClick={() => {
                  if (confirm("Remove this Verified badge?")) {
                    run(() =>
                      revokeVerification({
                        caseId,
                        reason: revokeReason.trim(),
                      }),
                    );
                  }
                }}
              >
                Revoke verification
              </Button>
            </div>
          ) : (
            <div className="space-y-2 border-t border-border pt-3">
              <h4 className="text-sm font-semibold">Revoke</h4>
              <p className="text-xs text-muted-foreground">
                Confirm your identity to remove a live badge.
              </p>
              <StepUpButton />
            </div>
          )
        ) : (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            Revoking a live badge needs the revoke permission.
          </p>
        )
      ) : null}

      {!decidable && !revocable ? (
        <p className="text-sm text-muted-foreground">
          This request is closed. Nothing left to decide.
        </p>
      ) : null}
    </Card>
  );
}
