"use client";

import { Button, Card } from "@/components/ui";
import {
  approveFieldOpsPayoutBatch,
  cancelFieldOpsPayoutBatch,
  exportFieldOpsPayoutBatch,
  markFieldOpsPayoutItem,
} from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input = "rounded border border-border bg-background px-2 py-1.5 text-sm";

/** Approve, export or cancel a whole batch. */
export function BatchActions({
  batchId,
  status,
  canApprove,
  canCancel,
  canExport,
}: {
  batchId: string;
  status: string;
  canApprove: boolean;
  canCancel: boolean;
  canExport: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const approve = () =>
    start(async () => {
      setMsg(null);
      const res = await approveFieldOpsPayoutBatch({
        batchId,
        reason: reason.trim() || "Approved for this week's payout run",
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  const cancel = () =>
    start(async () => {
      setMsg(null);
      const res = await cancelFieldOpsPayoutBatch({
        batchId,
        reason: reason.trim(),
      });
      setMsg(res.message ?? null);
      if (res.status === 200) router.refresh();
    });

  // The browser download is built here rather than served as a file: the
  // CSV carries full mobile money numbers and never becomes a URL.
  const exportCsv = () =>
    start(async () => {
      setMsg(null);
      const res = await exportFieldOpsPayoutBatch(batchId);
      if (res.status !== 200 || !res.data) {
        setMsg(res.message ?? "Could not export.");
        return;
      }
      const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.filename;
      a.click();
      URL.revokeObjectURL(url);
      setMsg("Downloaded.");
    });

  return (
    <Card className="flex flex-wrap items-center gap-2 p-4">
      {status === "draft" || status === "approved" ? (
        <input
          className={`${input} min-w-56 flex-1`}
          placeholder={
            status === "draft"
              ? "Reason (audit log)"
              : "Reason, needed to cancel"
          }
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      {status === "draft" && canApprove ? (
        <Button onClick={approve} disabled={pending}>
          Approve for payment
        </Button>
      ) : null}
      {status === "draft" && !canApprove ? (
        <p className="text-xs text-muted-foreground">
          A different admin has to approve this batch — you built it.
        </p>
      ) : null}
      {status === "approved" && canExport ? (
        <Button variant="outline" onClick={exportCsv} disabled={pending}>
          Export CSV
        </Button>
      ) : null}
      {(status === "draft" || status === "approved") && canCancel ? (
        <Button
          variant="danger"
          onClick={cancel}
          disabled={pending || reason.trim().length < 3}
        >
          Cancel batch
        </Button>
      ) : null}
      {msg ? (
        <p className="w-full text-xs text-muted-foreground">{msg}</p>
      ) : null}
    </Card>
  );
}

/** Record one transfer's outcome against its own item. */
export function ItemActions({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"paid" | "failed">("paid");
  const [msg, setMsg] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setMsg(null);
      const res = await markFieldOpsPayoutItem({
        itemId,
        status: mode,
        reference: mode === "paid" ? value.trim() : null,
        failureReason: mode === "failed" ? value.trim() : null,
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setValue("");
        router.refresh();
      }
    });

  return (
    <div className="flex min-w-56 flex-col gap-1">
      <div className="flex gap-1">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          className="rounded border border-border bg-background px-1 py-1 text-xs"
        >
          <option value="paid">Paid</option>
          <option value="failed">Failed</option>
        </select>
        <input
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
          placeholder={mode === "paid" ? "Transfer reference" : "What happened"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button
        size="sm"
        variant={mode === "failed" ? "danger" : "primary"}
        onClick={submit}
        disabled={pending || value.trim().length < 3}
      >
        Record
      </Button>
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
