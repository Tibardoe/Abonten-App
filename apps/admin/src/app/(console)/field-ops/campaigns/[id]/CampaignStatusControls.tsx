"use client";

import { Button, Card } from "@/components/ui";
import { setFieldOpsCampaignStatus } from "@/server/actions";
import {
  CAMPAIGN_ACTION_LABEL,
  availableCampaignActions,
  campaignCapabilities,
} from "@abonten/core/fieldOps/campaignLifecycle";
import type {
  FieldOpsCampaignAction,
  FieldOpsCampaignStatus,
} from "@abonten/types/fieldOps";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

const CONSEQUENCE: Record<FieldOpsCampaignAction, string> = {
  activate:
    "Members can start work and submit onboardings. Needs at least one territory and an active team lead.",
  pause:
    "No new assignments or submissions; reviews continue; no commissions are approved while paused.",
  resume: "Work resumes as before.",
  wind_down:
    "No new submissions. Work already submitted is reviewed and paid; members may resubmit once.",
  complete:
    "The campaign is over. Open reviews close after the grace period; verified work still in its holding period is still paid.",
  archive: "Read-only history. Blocked while approved commissions are unpaid.",
};

export function CampaignStatusControls({
  campaignId,
  status,
  editable,
}: {
  campaignId: string;
  status: FieldOpsCampaignStatus;
  editable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [action, setAction] = useState<FieldOpsCampaignAction | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const actions = availableCampaignActions(status);
  const caps = campaignCapabilities(status);

  return (
    <Card className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">
        Right now: assignments {caps.newAssignments ? "open" : "closed"} ·
        submissions {caps.newSubmissions ? "open" : "closed"} · reviews{" "}
        {caps.reviews ? "on" : "off"} · commissions{" "}
        {caps.commissionGeneration ? "generated" : "paused"} · payouts{" "}
        {caps.payouts ? "allowed" : "blocked"}.
      </p>
      {!editable || actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {actions.length === 0
            ? "No further status changes are possible."
            : "Changing the status needs the “Manage Field Ops” permission and a fresh identity check."}
        </p>
      ) : action === null ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={
                a === "archive" || a === "complete" ? "outline" : "primary"
              }
              onClick={() => {
                setAction(a);
                setMsg(null);
              }}
            >
              {CAMPAIGN_ACTION_LABEL[a]}
            </Button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">
            <span className="font-medium">
              {CAMPAIGN_ACTION_LABEL[action]}:
            </span>{" "}
            {CONSEQUENCE[action]}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why? (required, audited)"
            rows={2}
            className={input}
          />
          <div className="flex gap-1">
            <Button
              size="sm"
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                start(async () => {
                  const res = await setFieldOpsCampaignStatus({
                    campaignId,
                    action,
                    reason: reason.trim(),
                  });
                  setMsg(res.message ?? null);
                  if (res.status === 200) {
                    setAction(null);
                    setReason("");
                    router.refresh();
                  }
                })
              }
            >
              {pending
                ? "Saving…"
                : `Confirm: ${CAMPAIGN_ACTION_LABEL[action]}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAction(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </Card>
  );
}
