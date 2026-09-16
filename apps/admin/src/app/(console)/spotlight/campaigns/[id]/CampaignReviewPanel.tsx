"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card } from "@/components/ui";
import { contentCampaignAction, refundContentCampaign } from "@/server/actions";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import {
  campaignActionNeedsReason,
  canTransitionCampaign,
} from "@abonten/core/content/campaignStateMachine";
import type { AdminPermissionKey } from "@abonten/types/adminTypes";
import type { ContentCampaign } from "@abonten/types/contentType";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Action = "approve" | "reject" | "pause" | "resume" | "cancel";

const TARGET: Record<Action, ContentCampaign["status"]> = {
  approve: "active",
  reject: "rejected",
  pause: "paused",
  resume: "active",
  cancel: "cancelled",
};

const LABEL: Record<Action, string> = {
  approve: "Approve",
  reject: "Reject and refund",
  pause: "Pause",
  resume: "Resume",
  cancel: "Cancel",
};

export function CampaignReviewPanel({
  campaign,
  permissions,
  stepUpFresh,
}: {
  campaign: ContentCampaign;
  permissions: AdminPermissionKey[];
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const canReview = permissions.includes("spotlight.campaigns.review");
  const canRefund = canReview && permissions.includes("finance.refund");
  const available = (Object.keys(TARGET) as Action[]).filter((a) => {
    if (a === "approve" && campaign.status !== "pending_review") return false;
    if (a === "resume" && campaign.status !== "paused") return false;
    return canTransitionCampaign(campaign.status, TARGET[a], "admin");
  });
  const refundable = campaign.refundableMinor > 0;

  if (!canReview) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        You can view this promotion. Reviewing it needs the “Review Spotlight
        promotions” permission.
      </Card>
    );
  }

  if (!stepUpFresh) {
    return (
      <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
        Reviewing promotions and refunds needs a fresh identity check.
        <StepUpButton next={`/spotlight/campaigns/${campaign.id}`} />
      </Card>
    );
  }

  const run = (action: Action) =>
    start(async () => {
      setMsg(null);
      if (
        campaignActionNeedsReason(TARGET[action]) &&
        reason.trim().length < 5
      ) {
        setMsg({
          ok: false,
          text: "Give a short reason (at least 5 characters).",
        });
        return;
      }
      if (
        action === "reject" &&
        !window.confirm(
          "Reject this promotion? The advertiser is told why and refunded in full.",
        )
      ) {
        return;
      }
      const res = await contentCampaignAction({
        campaignId: campaign.id,
        expectedVersion: campaign.version,
        action,
        reason: reason.trim() || undefined,
      });
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Done." : "Action failed."),
      });
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  const refund = () =>
    start(async () => {
      setMsg(null);
      if (reason.trim().length < 5) {
        setMsg({ ok: false, text: "Give a short reason for the refund." });
        return;
      }
      if (
        !window.confirm(
          `Refund ${formatMinor(campaign.refundableMinor, campaign.currency)} to the advertiser's original payment method through Paystack?`,
        )
      ) {
        return;
      }
      const res = await refundContentCampaign({
        campaignId: campaign.id,
        expectedVersion: campaign.version,
        reason: reason.trim(),
      });
      setMsg({
        ok: res.status === 200,
        text:
          res.message ??
          (res.status === 200 ? "Refund started." : "Refund failed."),
      });
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  if (available.length === 0 && !(refundable && canRefund)) {
    return (
      <Card className="p-3 text-sm text-muted-foreground">
        No actions are available in this state.
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold">Review</p>
      <label htmlFor="campaign-reason" className="sr-only">
        Reason
      </label>
      <textarea
        id="campaign-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Reason (required to reject, pause, cancel or refund; shown to the advertiser)"
        className="w-full rounded border border-border bg-background p-2 text-sm"
      />
      <div className="flex flex-wrap gap-2">
        {available.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={
              a === "approve" || a === "resume"
                ? "primary"
                : a === "reject" || a === "cancel"
                  ? "danger"
                  : "outline"
            }
            disabled={pending}
            onClick={() => run(a)}
          >
            {LABEL[a]}
          </Button>
        ))}
        {refundable && canRefund ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={refund}
          >
            Refund {formatMinor(campaign.refundableMinor, campaign.currency)}
          </Button>
        ) : null}
      </div>
      {msg ? (
        <p
          className={
            msg.ok ? "text-sm text-success" : "text-sm text-destructive"
          }
        >
          {msg.text}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Approve before the start date and it runs from the start date. Spend is
        recognised only per delivered sponsored impression; the unused budget of
        a completed, cancelled or rejected promotion is refundable.
      </p>
    </Card>
  );
}
