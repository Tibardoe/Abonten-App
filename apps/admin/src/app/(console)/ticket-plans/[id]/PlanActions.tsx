"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import {
  endTicketPlanAdmin,
  ticketPlanPartRefundAdmin,
} from "@/server/actions/ticketPlans";
import { formatMoney } from "@abonten/core/money/formatMoney";
import type { TicketPlanAdminPart } from "@abonten/types/ticketPlanType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

// Staff actions on one plan. Each moves money, so each needs plans.manage,
// a fresh re-auth and a reason, and is audited. A refund share is asked of
// the provider again only after checking its dashboard: a provider accepts
// several partial refunds of one charge, so asking twice can refund twice.

export function PlanActions({
  planId,
  open,
  parts,
  currency,
  canManage,
  stepUpFresh,
}: {
  planId: string;
  open: boolean;
  parts: TicketPlanAdminPart[];
  currency: string;
  canManage: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stuck = parts.filter(
    (p) => p.refundStatus === "failed" || p.refundStatus === "requesting",
  );

  if (!open && stuck.length === 0) return null;

  if (!canManage) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        Ending a plan or handling its refund needs the “Manage Pay small small
        plans” permission.
      </Card>
    );
  }
  if (!stepUpFresh) {
    return (
      <Card className="flex items-center gap-2 p-3 text-sm">
        These actions move money and need a fresh identity check.
        <StepUpButton next={`/ticket-plans/${planId}`} />
      </Card>
    );
  }

  const run = (work: () => Promise<{ status: number; message?: string }>) =>
    start(async () => {
      setMsg(null);
      const res = await work();
      setMsg({
        ok: res.status === 200,
        text:
          res.message ?? (res.status === 200 ? "Done." : "Couldn't do that."),
      });
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  const say = (amountMinor: number) =>
    formatMoney({ amountMinor, currency }, { locale: "en" });

  return (
    <Card className="space-y-4 p-4">
      <label className="block text-sm">
        <span className="font-medium">Reason (kept in the audit log)</span>
        <input
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded border border-border bg-background px-2 py-1.5 text-sm"
        />
      </label>

      {open ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold">End this plan</p>
          <p className="text-xs text-muted-foreground">
            The seats go back on sale and what was paid is refunded on the
            plan&apos;s own terms. The buyer is told.
          </p>
          <Button
            size="sm"
            variant="danger"
            disabled={pending || reason.trim().length < 5}
            onClick={async () => {
              if (
                await confirm(
                  "End this plan? The seats go back on sale and the refund starts at once.",
                  { confirmLabel: "End plan", danger: true },
                )
              ) {
                run(() =>
                  endTicketPlanAdmin({ planId, reason: reason.trim() }).catch(
                    actionUnreachable,
                  ),
                );
              }
            }}
          >
            End plan
          </Button>
        </div>
      ) : null}

      {stuck.map((p) => (
        <div key={p.id} className="space-y-1 border-t border-border pt-3">
          <p className="text-sm font-semibold">
            Refund of {say(p.refundMinor)} on {p.provider} ·{" "}
            <span className="font-mono">{p.providerReference}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {p.refundFailure ?? "No answer from the provider."} Check the
            provider&apos;s dashboard first.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending || reason.trim().length < 5}
              onClick={async () => {
                if (
                  await confirm(
                    "Ask the provider again? Only if its dashboard shows no refund for this charge yet.",
                    { confirmLabel: "Ask again" },
                  )
                ) {
                  run(() =>
                    ticketPlanPartRefundAdmin(planId, {
                      paymentId: p.id,
                      action: "retry",
                      reason: reason.trim(),
                    }).catch(actionUnreachable),
                  );
                }
              }}
            >
              Ask the provider again
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending || reason.trim().length < 5}
              onClick={async () => {
                if (
                  await confirm(
                    "Record this share as refunded? Only once the money has reached the buyer another way.",
                    { confirmLabel: "Record as refunded" },
                  )
                ) {
                  run(() =>
                    ticketPlanPartRefundAdmin(planId, {
                      paymentId: p.id,
                      action: "mark_done",
                      reason: reason.trim(),
                    }).catch(actionUnreachable),
                  );
                }
              }}
            >
              Record as refunded
            </Button>
          </div>
        </div>
      ))}

      {msg ? (
        <p
          role={msg.ok ? "status" : "alert"}
          className={cn(
            "text-sm",
            msg.ok ? "text-muted-foreground" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      ) : null}
    </Card>
  );
}
