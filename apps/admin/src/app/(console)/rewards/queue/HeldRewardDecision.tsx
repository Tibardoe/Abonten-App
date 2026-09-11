"use client";

import { Button } from "@/components/ui";
import { decideHeldReward } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Approve (it then unlocks once the event has settled, after the sale is
// re-checked) or reject a reward the risk checks held. The note is audited.
export function HeldRewardDecision({
  rewardEventId,
  canReview,
}: {
  rewardEventId: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!canReview) {
    return (
      <p className="text-xs text-muted-foreground">
        Needs the “Review rewards” permission.
      </p>
    );
  }

  const decide = (approve: boolean) =>
    start(async () => {
      setMsg(null);
      const res = await decideHeldReward({
        rewardEventId,
        approve,
        note: note.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  return (
    <div className="min-w-[220px] space-y-1.5">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you check? (required, audited)"
        rows={2}
        className="w-full rounded border border-border bg-background p-1 text-xs"
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          disabled={pending || note.trim().length < 5}
          onClick={() => decide(true)}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || note.trim().length < 5}
          onClick={() => decide(false)}
        >
          Reject
        </Button>
      </div>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
