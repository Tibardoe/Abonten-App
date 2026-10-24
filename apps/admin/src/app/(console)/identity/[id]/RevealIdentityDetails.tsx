"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { revealIdentityPii } from "@/server/actions/identity";
import type { IdentityAdminPii } from "@abonten/types/identityType";
import { useState, useTransition } from "react";

// The person's name, date of birth and document details, one check at a
// time: identity.view_pii, a fresh re-auth and a reason, all in the audit
// log. Shown on this page only; never cached or listed.

export function RevealIdentityDetails({
  verificationId,
  canView,
  stepUpFresh,
  next,
}: {
  verificationId: string;
  canView: boolean;
  stepUpFresh: boolean;
  next: string;
}) {
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [pii, setPii] = useState<IdentityAdminPii | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canView) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        The name and document details are hidden. Seeing them needs the “See
        identity details” permission.
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold">Identity details</h3>
      {pii ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Name on the document</dt>
          <dd>{pii.legalName ?? "—"}</dd>
          <dt className="text-muted-foreground">Name on the profile</dt>
          <dd>{pii.profileName ?? "—"}</dd>
          <dt className="text-muted-foreground">Date of birth</dt>
          <dd>{pii.dateOfBirth ?? "—"}</dd>
          <dt className="text-muted-foreground">Document number ends</dt>
          <dd className="font-mono">
            {pii.idNumberLast4 ? `…${pii.idNumberLast4}` : "—"}
          </dd>
          <dt className="text-muted-foreground">Document expires</dt>
          <dd>{pii.documentExpiresOn ?? "—"}</dd>
        </dl>
      ) : stepUpFresh ? (
        <>
          <p className="text-xs text-muted-foreground">
            Hidden by default. Say why you need them (a duplicate to settle, a
            request from the police); it goes in the audit log.
          </p>
          <input
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || reason.trim().length < 5}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await revealIdentityPii({
                  verificationId,
                  reason: reason.trim(),
                }).catch(actionUnreachable);
                if (res.status === 200 && "data" in res && res.data) {
                  setPii(res.data);
                } else {
                  setError(res.message ?? "Couldn't load the details.");
                }
              })
            }
          >
            Show identity details
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          Seeing the details needs a fresh identity check.
          <StepUpButton next={next} />
        </div>
      )}
    </Card>
  );
}
