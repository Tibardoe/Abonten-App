"use client";

import { advertiserCampaignAction } from "@/actions/content/advertiserCampaignAction";
import { getOwnCampaign } from "@/actions/content/getOwnCampaign";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useToast } from "@/hooks/useToast";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { canTransitionCampaign } from "@abonten/core/content/campaignStateMachine";
import {
  PROMOTION_ESTIMATE_NOTE_KEY,
  campaignObjectiveLabel,
  campaignStatusLabel,
  isCampaignStatus,
  promotionEndReasonLabel,
} from "@abonten/core/content/copy";
import { formatReachRange } from "@abonten/core/content/promotionEstimate";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { dataOf, messageOf } from "../lib/result";
import { CampaignStatusPill } from "../molecules/ContentStatusBadge";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function ManageCampaign({ campaignId }: { campaignId: string }) {
  const t = useTranslations("spotlight");
  const tc = useTranslations("core");
  const format = useFormatter();

  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<"pause" | "resume" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const query = useQuery({
    queryKey: ["content", "campaigns", campaignId],
    queryFn: async () => {
      const res = await getOwnCampaign({ campaignId });
      const data = dataOf(res);
      if (!data) throw new Error(messageOf(res));
      return data;
    },
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        {t("thisPromotionIsnTAvailable")}
      </p>
    );
  }

  const { campaign: c, events } = query.data;

  const act = async (action: "pause" | "resume" | "cancel") => {
    setBusy(action);
    const res = await advertiserCampaignAction({ campaignId: c.id, action });
    setBusy(null);
    setConfirmCancel(false);
    if (res.status !== 200) {
      toast.error(messageOf(res, t("couldnTUpdateThisPromotion")));
      return;
    }
    toast.success(
      action === "pause"
        ? t("promotionPaused")
        : action === "resume"
          ? t("promotionResumed")
          : t("promotionCancelled"),
    );
    qc.invalidateQueries({ queryKey: ["content", "campaigns"] });
  };

  const canPause = canTransitionCampaign(c.status, "paused", "advertiser");
  // Only the advertiser's own pause can be undone here; a pause by our team
  // or by the system stays until they lift it.
  const canResume =
    canTransitionCampaign(c.status, "active", "advertiser") &&
    c.pauseSource === "advertiser";
  const canCancel = canTransitionCampaign(c.status, "cancelled", "advertiser");

  const m = c.metrics;
  const n = (v: number | undefined) => format.number(v ?? 0);
  const unused = Math.max(0, c.paidMinor - c.spentMinor - c.refundedMinor);
  const budget: [string, string][] = [
    [t("budget"), formatMinor(c.budgetMinor, c.currency)],
    [t("usedSoFar"), formatMinor(c.spentMinor, c.currency)],
    [t("unused"), formatMinor(unused, c.currency)],
    [t("refunded"), formatMinor(c.refundedMinor, c.currency)],
    [t("goal"), campaignObjectiveLabel(tc, c.objective)],
    [
      t("runsForUpTo"),
      tc("promotionSummary.duration.days", { count: c.durationDays }),
    ],
    [t("starts"), when(c.startsAt)],
    [t("endsBy"), when(c.endsAt)],
  ];
  // Reach is people; impressions are times shown. Kept apart on purpose.
  const delivery: [string, string][] = [
    [
      t("estimatedReach"),
      formatReachRange(tc, {
        reachLow: c.estimatedReachLow,
        reachHigh: c.estimatedReachHigh,
      }),
    ],
    [t("peopleReached"), n(m?.reach ?? c.reach)],
    [
      t("sponsoredImpressions"),
      `${n(m?.impressions ?? c.impressions)} of ${n(c.impressionGoal)}`,
    ],
    [t("meaningfulViews"), n(m?.meaningfulViews ?? c.views)],
    [t("completedViews"), n(m?.completions ?? c.completions)],
    [t("profileVisits"), n(m?.clicks.profile)],
    [t("eventTaps"), n(m?.clicks.event)],
    [t("placeTaps"), n(m?.clicks.place)],
    [t("newFollowers"), n(m?.follows)],
    [
      "Tickets / reservations",
      `${n(m?.conversions.ticketPurchases)} / ${n(m?.conversions.reservations)}`,
    ],
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/manage/spotlight?tab=campaigns"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {t("promotions2")}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("spotlightPromotion")}</h1>
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {c.post?.caption?.trim() || t("spotlight")}
          </p>
        </div>
        <CampaignStatusPill status={c.status} />
      </div>

      {c.status === "pending_payment" && c.checkoutId ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          {t("waitingForPayment")}
          <Link
            href={`/checkout/${c.checkoutId}?type=spotlight-promotion`}
            className="font-semibold underline"
          >
            {t("finishPaying")}
          </Link>
        </div>
      ) : null}
      {c.status === "pending_review" ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          {t("paymentReceivedOurTeamReviewsEvery")}
        </p>
      ) : null}
      {c.status === "rejected" && c.reviewReason ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {t("notApproved", { reviewReason: c.reviewReason })}
        </p>
      ) : null}
      {c.status === "paused" && c.pauseSource !== "advertiser" ? (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm">
          {t("pausedByAbonten")}
          {c.pauseReason ? `: ${c.pauseReason}` : "."}
        </p>
      ) : null}

      {c.status === "completed" && c.endReason ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          {promotionEndReasonLabel(tc, c.endReason)}.
          {unused > 0
            ? ` ${t("ofTheBudgetWasnTUsed", {
                amount: formatMinor(unused, c.currency),
              })}`
            : ""}
        </p>
      ) : null}

      {[
        { title: t("budget"), rows: budget },
        { title: t("delivery"), rows: delivery },
      ].map((group) => (
        <section key={group.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{group.title}</h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {group.rows.map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        {tc(PROMOTION_ESTIMATE_NOTE_KEY)}
      </p>

      <div className="flex flex-wrap gap-2">
        {canPause ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("pause")}
            className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
          >
            {busy === "pause" ? t("pausing") : t("pause")}
          </button>
        ) : null}
        {canResume ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => act("resume")}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy === "resume" ? t("resuming") : t("resume")}
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setConfirmCancel(true)}
            className="rounded-md border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {t("cancelPromotion")}
          </button>
        ) : null}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("history")}</h2>
        <ol className="space-y-2 border-l pl-4">
          {events.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="font-medium">
                {isCampaignStatus(e.toStatus)
                  ? campaignStatusLabel(tc, e.toStatus)
                  : e.toStatus}
              </span>
              <span className="text-muted-foreground">
                {" "}
                · {new Date(e.createdAt).toLocaleString()}
              </span>
              {e.reason ? (
                <p className="text-xs text-muted-foreground">{e.reason}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {confirmCancel ? (
        <ConfirmDeleteModal
          title={t("cancelThisPromotion")}
          message={t("itStopsShowingStraightAwayAny")}
          confirmLabel={t("cancelPromotion")}
          cancelLabel={t("keepIt")}
          loadingLabel={t("cancelling")}
          isLoading={busy === "cancel"}
          onConfirm={() => act("cancel")}
          onCancel={() => setConfirmCancel(false)}
        />
      ) : null}
    </div>
  );
}
