"use client";

import { Button } from "@/components/ui";
import { decideFieldOpsFlag } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Resolves one flag (fieldops.verify). Approving pays the pending
 * commission with this admin recorded as the approver; rejecting rejects
 * both the onboarding and the commission. The database refuses an admin who
 * verified the same row.
 */
export function FlagDecision({ onboardingId }: { onboardingId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const decide = (decision: "succeeded" | "rejected") =>
    start(async () => {
      setMsg(null);
      const res = await decideFieldOpsFlag({
        onboardingId,
        decision,
        note: note.trim() || null,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-sm"
        placeholder="Note (required to reject)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button size="sm" onClick={() => decide("succeeded")} disabled={pending}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => decide("rejected")}
        disabled={pending || note.trim().length < 3}
      >
        Reject
      </Button>
      {msg ? (
        <p className="w-full text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </div>
  );
}
