"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { decideIdentity, revokeIdentity } from "@/server/actions/identity";
import type { IdentityVerificationStatus } from "@abonten/types/identityType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// The reviewer's action panel. Which buttons exist follows the rules
// identity_transition enforces: only a check waiting for review can be
// decided, only a live one revoked.

export function IdentityDecisionPanel({
  verificationId,
  status,
  accountActive,
  canReview,
  canRevoke,
  stepUpFresh,
}: {
  verificationId: string;
  status: IdentityVerificationStatus;
  accountActive: boolean;
  canReview: boolean;
  canRevoke: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  const decidable = status === "needs_review";
  const revocable = status === "approved";

  function run(fn: () => Promise<{ status: number; message?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.status === 200) {
        setMsg({ tone: "ok", text: res.message ?? "Done." });
        router.refresh();
      } else {
        setMsg({ tone: "err", text: res.message ?? "Action failed." });
        if (res.status === 409) router.refresh();
      }
    });
  }

  return (
    <Card className="sticky top-2 space-y-3 p-4">
      <h3 className="text-sm font-semibold">Decision</h3>
      {msg ? (
        <p
          role={msg.tone === "ok" ? "status" : "alert"}
          className={cn(
            "text-sm",
            msg.tone === "ok" ? "text-success" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      ) : null}

      {decidable ? (
        canReview ? (
          <>
            <p className="text-xs text-muted-foreground">
              Approving shows an “ID checked” badge beside this person&apos;s
              name and lets them use what needs a checked identity. It says
              Abonten checked a government ID and a live selfie, nothing more.
            </p>
            {!accountActive ? (
              <p className="text-xs text-warning">
                The account is banned or deleted, so it can&apos;t be approved.
              </p>
            ) : null}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason. Required to reject; the person is told the check didn't pass, not this text."
              rows={3}
              className="w-full rounded border border-border bg-background p-1.5 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                disabled={pending || !accountActive}
                onClick={async () => {
                  if (
                    await confirm(
                      "Approve this identity check? The badge shows at once.",
                      { confirmLabel: "Approve" },
                    )
                  ) {
                    run(() =>
                      decideIdentity({
                        verificationId,
                        decision: "approve",
                        reason: reason.trim() || undefined,
                      }).catch(actionUnreachable),
                    );
                  }
                }}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={pending || reason.trim().length < 5}
                onClick={() =>
                  run(() =>
                    decideIdentity({
                      verificationId,
                      decision: "reject",
                      reason: reason.trim(),
                    }).catch(actionUnreachable),
                  )
                }
              >
                Reject
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Deciding needs the “Review identity checks” permission.
          </p>
        )
      ) : null}

      {revocable ? (
        canRevoke ? (
          stepUpFresh ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Revoke</h4>
              <p className="text-xs text-muted-foreground">
                Takes the badge away at once and stops payouts, claims and
                ticket sales that need a checked identity. Use it when the
                document turns out not to be theirs, or for fraud.
              </p>
              <textarea
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Why? Kept in the audit log."
                rows={2}
                className="w-full rounded border border-border bg-background p-1.5 text-sm"
              />
              <Button
                size="sm"
                variant="danger"
                disabled={pending || revokeReason.trim().length < 5}
                onClick={async () => {
                  if (
                    await confirm("Revoke this identity check?", {
                      confirmLabel: "Revoke",
                      danger: true,
                    })
                  ) {
                    run(() =>
                      revokeIdentity({
                        verificationId,
                        reason: revokeReason.trim(),
                      }).catch(actionUnreachable),
                    );
                  }
                }}
              >
                Revoke identity check
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Confirm it&apos;s you to revoke a live check.
              </p>
              <StepUpButton next={`/identity/${verificationId}`} />
            </div>
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            Revoking needs the “Revoke an identity check” permission.
          </p>
        )
      ) : null}

      {!decidable && !revocable ? (
        <p className="text-sm text-muted-foreground">
          Nothing to decide on this check.
        </p>
      ) : null}
    </Card>
  );
}
