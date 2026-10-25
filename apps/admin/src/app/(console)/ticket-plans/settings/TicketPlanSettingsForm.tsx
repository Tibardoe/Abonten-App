"use client";

import { useConfirm } from "@/components/ConfirmProvider";
import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { actionUnreachable } from "@/lib/actionUnreachable";
import { updateTicketPlanSettings } from "@/server/actions/ticketPlans";
import type {
  TicketPlanAdminSettings,
  TicketPlanAudience,
} from "@abonten/types/ticketPlanType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

type NumberKey =
  | "firstPartMinPct"
  | "partMinPct"
  | "deadlineHoursBeforeStart"
  | "minDaysToDeadline"
  | "holdMinutes"
  | "maxTicketsPerPlan";

const NUMBERS: {
  key: NumberKey;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "firstPartMinPct",
    label: "First part, at least % of the total",
    hint: "The first part holds the seats, so it is the larger one.",
    min: 5,
    max: 100,
  },
  {
    key: "partMinPct",
    label: "Every later part, at least % of the total",
    hint: "The last part may be whatever is left. Also caps how many charges a plan makes.",
    min: 1,
    max: 100,
  },
  {
    key: "deadlineHoursBeforeStart",
    label: "Finish paying this many hours before the event",
    hint: "Seats from plans that lapse go back on sale with this much time left.",
    min: 1,
    max: 720,
  },
  {
    key: "minDaysToDeadline",
    label: "Offer plans only when the deadline is at least this many days away",
    hint: "Closer than this, a plan is a normal purchase with extra steps.",
    min: 1,
    max: 60,
  },
  {
    key: "holdMinutes",
    label: "Hold the seats this many minutes for the first part",
    hint: "Like a checkout's hold. A plan with no first part ends after this.",
    min: 10,
    max: 240,
  },
  {
    key: "maxTicketsPerPlan",
    label: "Tickets per plan, at most",
    hint: "Bounds how many seats one person can hold for weeks.",
    min: 1,
    max: 20,
  },
];

export function TicketPlanSettingsForm({
  settings,
  killSwitch,
  canConfigure,
  stepUpFresh,
}: {
  settings: TicketPlanAdminSettings;
  killSwitch: boolean;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [audience, setAudience] = useState<TicketPlanAudience>(
    settings.audience,
  );
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [keepFee, setKeepFee] = useState(settings.keepFeeOnRefund);
  const [reminders, setReminders] = useState(settings.reminderDays.join(", "));
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>({
    firstPartMinPct: String(settings.firstPartMinBps / 100),
    partMinPct: String(settings.partMinBps / 100),
    deadlineHoursBeforeStart: String(settings.deadlineHoursBeforeStart),
    minDaysToDeadline: String(settings.minDaysToDeadline),
    holdMinutes: String(settings.holdMinutes),
    maxTicketsPerPlan: String(settings.maxTicketsPerPlan),
  });
  const [reason, setReason] = useState("");
  const editable = canConfigure && stepUpFresh;

  const save = () =>
    start(async () => {
      setMsg(null);
      if (
        enabled &&
        audience === "all" &&
        (!settings.enabled || settings.audience !== "all") &&
        !(await confirm(
          "Open Pay small small to everyone? Before this, legal items M1 to M4 and decisions T1 to T6 must be Decided, the Terms updated and live Paystack keys in place.",
          { confirmLabel: "Open to everyone" },
        ))
      ) {
        return;
      }
      const reminderDays = reminders
        .split(/[\s,]+/)
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v) && v > 0);
      const res = await updateTicketPlanSettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          enabled,
          audience,
          betaUserIds: beta
            .split(/[\s,]+/)
            .map((v) => v.trim())
            .filter(Boolean),
          keepFeeOnRefund: keepFee,
          reminderDays,
          firstPartMinBps: Math.round(Number(numbers.firstPartMinPct) * 100),
          partMinBps: Math.round(Number(numbers.partMinPct) * 100),
          deadlineHoursBeforeStart: Number(numbers.deadlineHoursBeforeStart),
          minDaysToDeadline: Number(numbers.minDaysToDeadline),
          holdMinutes: Number(numbers.holdMinutes),
          maxTicketsPerPlan: Number(numbers.maxTicketsPerPlan),
        },
      }).catch(actionUnreachable);
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  return (
    <div className="max-w-3xl space-y-4">
      {killSwitch ? (
        <Card className="border-destructive/40 p-3 text-sm">
          TICKET_PLANS_KILL_SWITCH is set on the web deployment. Nobody can
          start a plan or pay a part until it is removed, whatever these
          settings say. Running plans can still be cancelled, and the job keeps
          ending and refunding them.
        </Card>
      ) : null}
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing these settings needs a fresh identity check.
          <StepUpButton next="/ticket-plans/settings" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure Pay
          small small” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Who can pay small small</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={enabled}
            disabled={!editable}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block">Pay small small switched on</span>
            <span className="block text-xs text-muted-foreground">
              Off stops new plans and organizers switching it on. Plans already
              running carry on: their parts, cancelling and refunds still work.
            </span>
          </span>
        </label>
        <div className="text-sm">
          <label htmlFor="plans-audience" className="block font-medium">
            Audience
          </label>
          <select
            id="plans-audience"
            value={audience}
            disabled={!editable}
            onChange={(e) => setAudience(e.target.value as TicketPlanAudience)}
            className={cn(input, "mt-1 w-64")}
          >
            <option value="staff">Staff only (active admins)</option>
            <option value="beta">Staff + beta users</option>
            <option value="all">Everyone</option>
          </select>
          <span className="mt-1 block text-xs text-muted-foreground">
            Both the organizer and the buyer must be in it. With “Everyone”
            signed-out visitors see the offer too.
          </span>
        </div>
        {audience === "beta" ? (
          <label className="block text-sm">
            <span className="font-medium">Beta user ids</span>
            <span className="block text-xs text-muted-foreground">
              One user id per line (copy it from the user&apos;s admin page).
            </span>
            <textarea
              value={beta}
              disabled={!editable}
              rows={4}
              onChange={(e) => setBeta(e.target.value)}
              className={cn(input, "mt-1 font-mono text-xs")}
            />
          </label>
        ) : null}
      </Card>

      <Card className="grid gap-4 p-4 md:grid-cols-2">
        {NUMBERS.map((n) => (
          <label key={n.key} className="block text-sm">
            <span className="font-medium">{n.label}</span>
            <input
              type="number"
              min={n.min}
              max={n.max}
              value={numbers[n.key]}
              disabled={!editable}
              onChange={(e) =>
                setNumbers((prev) => ({ ...prev, [n.key]: e.target.value }))
              }
              className={cn(input, "mt-1")}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {n.hint}
            </span>
          </label>
        ))}
        <label className="block text-sm">
          <span className="font-medium">
            Reminders, days before the deadline
          </span>
          <input
            value={reminders}
            disabled={!editable}
            onChange={(e) => setReminders(e.target.value)}
            className={cn(input, "mt-1")}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Comma-separated, at most five. Sent only while something is left to
            pay.
          </span>
        </label>
      </Card>

      <Card className="space-y-2 p-4">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={keepFee}
            disabled={!editable}
            onChange={(e) => setKeepFee(e.target.checked)}
          />
          <span>
            <span className="block">
              Keep the service-fee share when a plan ends unfinished
            </span>
            <span className="block text-xs text-muted-foreground">
              The rule for every refund on Abonten (decision T2). Off returns
              everything paid. Applies to plans started after the change; a
              running plan keeps the terms it was started with.
            </span>
          </span>
        </label>
      </Card>

      {editable ? (
        <Card className="space-y-2 p-4">
          <label className="block text-sm">
            <span className="font-medium">Reason for this change</span>
            <input
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              className={cn(input, "mt-1")}
            />
          </label>
          <div className="flex items-center gap-2">
            <Button
              disabled={pending || reason.trim().length < 5}
              onClick={save}
            >
              {pending ? "Saving…" : "Save settings"}
            </Button>
            {msg ? (
              <span
                role={msg.ok ? "status" : "alert"}
                className={cn(
                  "text-sm",
                  msg.ok ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {msg.text}
              </span>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
