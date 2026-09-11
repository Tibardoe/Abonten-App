"use client";

import { Button, Card } from "@/components/ui";
import { decideFieldOpsOnboarding } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

/** Admin decision on a submitted onboarding (fieldops.verify). */
export function DecisionPanel({ onboardingId }: { onboardingId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [decision, setDecision] = useState<
    "verified" | "needs_changes" | "rejected"
  >("verified");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await decideFieldOpsOnboarding({
        onboardingId,
        decision,
        note: note.trim(),
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  return (
    <Card className="space-y-2 p-4">
      <h3 className="text-sm font-semibold">Decide in the lead's place</h3>
      <p className="text-xs text-muted-foreground">
        Normally the team lead decides. Use this to unblock a stuck review or
        overrule one; it is audited.
      </p>
      <select
        value={decision}
        onChange={(e) => setDecision(e.target.value as typeof decision)}
        className={input}
      >
        <option value="verified">Verify (start the holding period)</option>
        <option value="needs_changes">Return to the member</option>
        <option value="rejected">Reject</option>
      </select>
      <textarea
        className={input}
        rows={2}
        placeholder="Note the member sees"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <input
        className={input}
        placeholder="Reason (audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        onClick={submit}
        disabled={pending || note.trim().length < 3 || reason.trim().length < 3}
      >
        Record decision
      </Button>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </Card>
  );
}
