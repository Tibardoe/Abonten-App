"use client";

import { Button } from "@/components/ui";
import { buildFieldOpsPayoutBatch } from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input = "rounded border border-border bg-background px-2 py-1.5 text-sm";

/** Groups everything ready to pay into one draft batch. Step-up re-auth. */
export function BuildBatchForm({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(() => {
    // A sensible default: the week number, which is how the team is paid.
    const d = new Date();
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((d.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7,
    );
    return `Week ${week}`;
  });
  const [reason, setReason] = useState("Weekly payout run");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await buildFieldOpsPayoutBatch({
        campaignId,
        label: label.trim(),
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={input}
        placeholder="Batch name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <input
        className={`${input} min-w-48 flex-1`}
        placeholder="Reason (audit log)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Button
        onClick={submit}
        disabled={
          pending || label.trim().length < 2 || reason.trim().length < 3
        }
      >
        Build batch
      </Button>
      {msg ? (
        <p className="w-full text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </div>
  );
}
