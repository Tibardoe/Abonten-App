"use client";

import { cancelTicketPlan } from "@/actions/ticketPlans/cancelTicketPlan";
import { getTicketPlan } from "@/actions/ticketPlans/getTicketPlan";
import verifyPaystackPayment from "@/actions/verifyPaystackPayment";
import PaymentMethodSelector from "@/components/organisms/PaymentMethodSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle, SupportingText } from "@/components/ui/typography";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import PlanProgress from "@/ticketPlans/molecules/PlanProgress";
import PlanStatusBadge from "@/ticketPlans/molecules/PlanStatusBadge";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import type { PaymentMethodCode } from "@abonten/core/market/types";
import { paymentMethodLabel } from "@abonten/core/market/types";
import { currencyMinorFactor } from "@abonten/core/money/currencies";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { toMajor, tryFromMajor } from "@abonten/core/money/money";
import { planMomentText } from "@abonten/core/ticketPlans/display";
import {
  daysUntil,
  isPlanOpen,
  suggestedPartAmounts,
} from "@abonten/core/ticketPlans/rules";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import type {
  TicketPlanDetail,
  TicketPlanEndReason,
} from "@abonten/types/ticketPlanType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

// One Pay small small plan (docs/architecture/ticket-plans.md): what is
// paid and what is left, paying the next part with the same payment step
// as a checkout, the parts so far, and ending the plan. Back from a hosted
// payment page (?attempt=…) the part is confirmed here.

type Envelope = { status: number; message?: string; data?: TicketPlanDetail };

const ENDED_KEY: Record<TicketPlanEndReason, string> = {
  hold_expired: "endedHoldExpired",
  deadline: "endedDeadline",
  buyer: "endedBuyer",
  event_cancelled: "endedEventCancelled",
  account_closed: "endedAccountClosed",
  admin: "endedAdmin",
};

export default function TicketPlanView({ planId }: { planId: string }) {
  const t = useTranslations("ticketPlans");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const params = useSearchParams();
  const returnedAttempt = params.get("attempt");
  const amountId = useId();
  const key = ["ticket-plan", planId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Envelope> =>
      answerOrThrow(await getTicketPlan({ planId })),
    // A finished plan's tickets are being issued: ask again until they are.
    refetchInterval: (q) =>
      q.state.data?.data?.status === "settling" ? 4_000 : false,
  });
  const plan = query.data?.data;

  // Back from the provider's page: confirm that part once.
  const verified = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per return from the provider.
  useEffect(() => {
    if (!returnedAttempt || verified.current) return;
    verified.current = true;
    void verifyPaystackPayment(returnedAttempt)
      .then((res) => {
        if (res.status === 200) toast.success(t("paymentReceived"));
        else if (res.status === 202) toast.info(t("paymentStillConfirming"));
        else if (res.message) toast.error(res.message);
      })
      .catch(actionUnreachable)
      .finally(() => {
        void qc.invalidateQueries({ queryKey: key });
      });
  }, [returnedAttempt]);

  const [amountText, setAmountText] = useState("");
  const [chosenMinor, setChosenMinor] = useState<number | null>(null);

  const checkPending = useMutation({
    mutationFn: (attemptId: string) => verifyPaystackPayment(attemptId),
    onSuccess: (res) => {
      if (res.status === 200) toast.success(t("paymentReceived"));
      else if (res.status === 202) toast.info(t("paymentStillConfirming"));
      else if ("message" in res && res.message) toast.error(res.message);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: () => toast.error(t("networkError")),
  });

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }
  if (query.isError || !plan) {
    return (
      <div className="space-y-3 py-6 text-center text-muted-foreground">
        <p>{query.data?.message ?? t("couldNotLoadPlan")}</p>
        <button
          type="button"
          className="underline font-medium"
          onClick={() => void query.refetch()}
        >
          {t("tryAgain")}
        </button>
      </div>
    );
  }

  const say = (amountMinor: number) =>
    formatMoney({ amountMinor, currency: plan.currency }, { locale });
  const deadline = planMomentText(plan.deadlineAt, plan.timezone, locale);
  const remaining = plan.totalMinor - plan.paidMinor;
  const factor = currencyMinorFactor(plan.currency);
  const typedMinor = amountText.trim()
    ? (tryFromMajor(amountText.trim(), plan.currency)?.amountMinor ??
      Number.NaN)
    : null;
  const selectedMinor = typedMinor ?? chosenMinor;
  const bounds = plan.nextPart;
  const amountProblem =
    selectedMinor == null || !bounds
      ? null
      : !Number.isInteger(selectedMinor) || selectedMinor <= 0
        ? t("enterAValidAmount")
        : selectedMinor < bounds.minMinor
          ? t("payAtLeast", { amount: say(bounds.minMinor) })
          : selectedMinor > bounds.maxMinor
            ? t("onlyLeft", { amount: say(bounds.maxMinor) })
            : null;
  const readyToPay =
    !!bounds &&
    selectedMinor != null &&
    !amountProblem &&
    !plan.pendingAttemptId;

  const endPlan = async () => {
    const ok = await confirm({
      title: t("cancelTitle"),
      message:
        plan.paidMinor === 0
          ? t("cancelBodyNothingPaid")
          : plan.refundIfEnded.keptMinor > 0
            ? t("cancelBodyKeepsFee", {
                refund: say(plan.refundIfEnded.refundMinor),
                kept: say(plan.refundIfEnded.keptMinor),
              })
            : t("cancelBodyFullRefund", {
                refund: say(plan.refundIfEnded.refundMinor),
              }),
      confirmLabel: t("cancelConfirm"),
      cancelLabel: t("keepPaying"),
    });
    if (!ok) return;
    const res = await cancelTicketPlan({ planId }).catch(actionUnreachable);
    if (res.status === 200 && "data" in res && res.data) {
      qc.setQueryData(key, { status: 200, data: res.data });
      toast.success(res.message ?? t("planCancelled"));
      void qc.invalidateQueries({ queryKey: ["balance-overview"] });
    } else {
      toast.error(res.message ?? t("couldNotCancel"));
    }
  };

  const open = isPlanOpen(plan.status);

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold text-balance">
              {plan.eventCode ? (
                <Link
                  href={`/events/${plan.eventCode.toLowerCase()}`}
                  className="hover:underline"
                >
                  {plan.eventTitle}
                </Link>
              ) : (
                plan.eventTitle
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {planMomentText(plan.eventStartsAt, plan.timezone, locale)}
            </p>
          </div>
          <PlanStatusBadge
            status={plan.status}
            refundStatus={plan.refundStatus}
          />
        </div>
        <PlanProgress
          paidMinor={plan.paidMinor}
          totalMinor={plan.totalMinor}
          currency={plan.currency}
        />
        <StatusLine plan={plan} deadline={deadline} say={say} />
      </section>

      {plan.status === "completed" && plan.refundStatus === "none" ? (
        <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5 space-y-3">
          <SectionTitle>{t("ticketsReady")}</SectionTitle>
          <SupportingText>{t("ticketsReadyBody")}</SupportingText>
          <Button asChild>
            <Link href="/manage/my-events">{t("seeMyTickets")}</Link>
          </Button>
        </section>
      ) : null}

      {plan.pendingAttemptId ? (
        <section className="rounded-2xl border border-sky-500/40 bg-sky-500/5 p-5 space-y-3">
          <p className="text-sm">{t("pendingPayment")}</p>
          <Button
            variant="outline"
            disabled={checkPending.isPending}
            onClick={() =>
              plan.pendingAttemptId &&
              checkPending.mutate(plan.pendingAttemptId)
            }
          >
            {t("checkNow")}
          </Button>
        </section>
      ) : null}

      {bounds && !plan.pendingAttemptId ? (
        <section className="rounded-2xl border border-border p-5 space-y-4">
          <div>
            <SectionTitle>
              {plan.paidMinor === 0 ? t("payFirstPart") : t("payMore")}
            </SectionTitle>
            <SupportingText>
              {bounds.minMinor === bounds.maxMinor
                ? t("lastPartIs", { amount: say(bounds.maxMinor) })
                : t("anyAmountBetween", {
                    min: say(bounds.minMinor),
                    max: say(bounds.maxMinor),
                  })}
            </SupportingText>
          </div>

          <div className="flex flex-wrap gap-2">
            {suggestedPartAmounts(bounds, factor).map((minor) => (
              <button
                key={minor}
                type="button"
                onClick={() => {
                  setChosenMinor(minor);
                  setAmountText("");
                }}
                className={`rounded-full border px-4 py-1.5 text-sm ${
                  amountText === "" && chosenMinor === minor
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border"
                }`}
              >
                {minor === bounds.maxMinor
                  ? t("payTheRest", { amount: say(minor) })
                  : say(minor)}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <label htmlFor={amountId} className="text-sm text-muted-foreground">
              {t("orEnterAnAmount", { currency: plan.currency })}
            </label>
            <Input
              id={amountId}
              inputMode="decimal"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              className="max-w-48"
            />
            {amountProblem ? (
              <p className="text-xs text-destructive">{amountProblem}</p>
            ) : null}
          </div>

          {readyToPay && selectedMinor != null ? (
            <PaymentMethodSelector
              key={selectedMinor}
              kind="ticket-plan"
              planId={plan.id}
              amount={toMajor({
                amountMinor: selectedMinor,
                currency: plan.currency,
              })}
              amountMinor={selectedMinor}
              currency={plan.currency}
              onPurchaseSucceeded={() => {
                setChosenMinor(null);
                setAmountText("");
                void qc.invalidateQueries({ queryKey: key });
              }}
            />
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border p-5 space-y-3">
        <SectionTitle>{t("whatYouArePayingFor")}</SectionTitle>
        <dl className="space-y-1 text-sm">
          {plan.lines.map((line) => (
            <div key={line.ticketTypeId} className="flex justify-between gap-3">
              <dt>
                {t("lineTickets", {
                  count: line.quantity,
                  tier: ticketTypeLabel(tc, line.tier),
                })}
              </dt>
              <dd className="tabular-nums">{say(line.amountMinor)}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-3 text-muted-foreground">
            <dt>{t("serviceFee")}</dt>
            <dd className="tabular-nums">{say(plan.feeMinor)}</dd>
          </div>
          {plan.taxMinor > 0 ? (
            <div className="flex justify-between gap-3 text-muted-foreground">
              <dt>{t("tax")}</dt>
              <dd className="tabular-nums">{say(plan.taxMinor)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{say(plan.totalMinor)}</dd>
          </div>
        </dl>
      </section>

      {plan.parts.length > 0 ? (
        <section className="rounded-2xl border border-border p-5 space-y-3">
          <SectionTitle>{t("paymentsSoFar")}</SectionTitle>
          <ul className="divide-y divide-border text-sm">
            {plan.parts.map((part) => (
              <li key={part.id} className="flex justify-between gap-3 py-2">
                <span className="flex flex-col">
                  <span>
                    {planMomentText(part.paidAt, plan.timezone, locale)}
                  </span>
                  {part.method ? (
                    <span className="text-xs text-muted-foreground">
                      {paymentMethodLabel(tc, part.method as PaymentMethodCode)}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-col items-end">
                  <span className="tabular-nums font-medium">
                    {say(part.amountMinor)}
                  </span>
                  {part.refundMinor > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {part.refundStatus === "processed"
                        ? t("partRefunded", { amount: say(part.refundMinor) })
                        : part.refundStatus === "failed"
                          ? t("partRefundProblem")
                          : t("partRefunding", {
                              amount: say(part.refundMinor),
                            })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {open && plan.status !== "settling" ? (
        <section className="space-y-2 text-sm text-muted-foreground">
          <p>
            {plan.keepFeeOnRefund
              ? t("termNotFinishedKeepsFee", { deadline })
              : t("termNotFinishedFullRefund", { deadline })}
          </p>
          <button
            type="button"
            onClick={endPlan}
            className="font-medium text-destructive underline"
          >
            {t("cancelPlan")}
          </button>
        </section>
      ) : null}
    </div>
  );
}

function StatusLine({
  plan,
  deadline,
  say,
}: {
  plan: TicketPlanDetail;
  deadline: string;
  say: (minor: number) => string;
}) {
  const t = useTranslations("ticketPlans");
  const locale = useLocale();
  switch (plan.status) {
    case "awaiting_payment":
      return (
        <p className="text-sm">
          {t("holdUntil", {
            time: planMomentText(plan.holdExpiresAt, plan.timezone, locale),
            deadline,
          })}
        </p>
      );
    case "active":
      return (
        <p className="text-sm">
          {t("finishBy", {
            left: say(plan.totalMinor - plan.paidMinor),
            deadline,
            days: daysUntil(new Date(plan.deadlineAt)),
          })}
        </p>
      );
    case "settling":
      return <p className="text-sm">{t("issuingTickets")}</p>;
    case "completed":
      // The badge already says "Fully paid". A purchase refunded later says
      // how its refund is going.
      return plan.refundMinor > 0 ? (
        <p className="text-sm text-muted-foreground">
          {plan.refundStatus === "refunded"
            ? t("refundDone", { amount: say(plan.refundMinor) })
            : plan.refundStatus === "failed"
              ? t("refundProblem")
              : t("refundOnItsWay", { amount: say(plan.refundMinor) })}
        </p>
      ) : null;
    default: {
      const reason = plan.endedReason ? t(ENDED_KEY[plan.endedReason]) : "";
      return (
        <div className="space-y-1 text-sm">
          <p>{reason}</p>
          {plan.refundMinor > 0 ? (
            <p className="text-muted-foreground">
              {plan.refundStatus === "refunded"
                ? t("refundDone", { amount: say(plan.refundMinor) })
                : plan.refundStatus === "failed"
                  ? t("refundProblem")
                  : t("refundOnItsWay", { amount: say(plan.refundMinor) })}
            </p>
          ) : null}
          {plan.keptMinor > 0 ? (
            <p className="text-muted-foreground">
              {t("feeKept", { amount: say(plan.keptMinor) })}
            </p>
          ) : null}
        </div>
      );
    }
  }
}
