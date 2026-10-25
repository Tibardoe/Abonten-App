"use client";

import { getBalanceOverview } from "@/actions/ticketPlans/getBalanceOverview";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTitle, SupportingText } from "@/components/ui/typography";
import PlanProgress from "@/ticketPlans/molecules/PlanProgress";
import PlanStatusBadge from "@/ticketPlans/molecules/PlanStatusBadge";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { planMomentText } from "@abonten/core/ticketPlans/display";
import { isPlanOpen } from "@abonten/core/ticketPlans/rules";
import type { BalanceOverview } from "@abonten/types/ticketPlanType";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

// The Balance page. Two kinds of value, side by side and never added
// together: money put towards tickets on Pay small small plans (the buyer's
// cash, refundable, on its way to a ticket) and Abonten Credit from rewards
// (spend-only, can expire, never cashed out). There is no top-up balance:
// holding people's money for later use is a regulated service.

type Envelope = { status: number; message?: string; data?: BalanceOverview };

export default function BalanceView() {
  const t = useTranslations("ticketPlans");
  const locale = useLocale();
  const query = useQuery({
    queryKey: ["balance-overview"],
    queryFn: async (): Promise<Envelope> =>
      answerOrThrow(await getBalanceOverview()),
  });
  const data = query.data?.data;

  if (query.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (query.isError || !data) {
    return (
      <div className="space-y-3 py-6 text-center text-muted-foreground">
        <p>{t("couldNotLoadBalance")}</p>
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

  const open = data.plans.filter((p) => isPlanOpen(p.status));
  const past = data.plans.filter((p) => !isPlanOpen(p.status));

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border p-5 space-y-2">
        <SectionTitle>{t("savedTowardsTickets")}</SectionTitle>
        {data.savedTowardsTickets.length === 0 ? (
          <p className="text-lg font-semibold">{t("nothingSavedYet")}</p>
        ) : (
          data.savedTowardsTickets.map((s) => (
            <p key={s.currency} className="text-2xl font-semibold tabular-nums">
              {formatMoney(
                { amountMinor: s.amountMinor, currency: s.currency },
                { locale },
              )}
            </p>
          ))
        )}
        <SupportingText>{t("savedTowardsTicketsBody")}</SupportingText>
      </section>

      {data.credit ? (
        <section className="rounded-2xl border border-border p-5 space-y-2">
          <SectionTitle>{t("abontenCredit")}</SectionTitle>
          <p className="text-2xl font-semibold tabular-nums">
            {formatMoney(
              {
                amountMinor: data.credit.availableMinor,
                currency: data.credit.currency,
              },
              { locale },
            )}
          </p>
          <SupportingText>{t("abontenCreditBody")}</SupportingText>
          <Link href="/rewards" className="text-sm font-medium underline">
            {t("seeRewards")}
          </Link>
        </section>
      ) : null}

      <section className="space-y-3">
        <SectionTitle>{t("yourPlans")}</SectionTitle>
        {open.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">{t("noOpenPlans")}</p>
            <p>
              {data.plansEnabled
                ? t("noOpenPlansHowTo")
                : t("noOpenPlansUnavailable")}
            </p>
          </div>
        ) : (
          open.map((plan) => (
            <Link
              key={plan.id}
              href={`/ticket-plans/${plan.id}`}
              className="block rounded-2xl border border-border p-4 space-y-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{plan.eventTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("finishByShort", {
                      deadline: planMomentText(
                        plan.deadlineAt,
                        plan.timezone,
                        locale,
                      ),
                    })}
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
            </Link>
          ))
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-2">
          <SectionTitle>{t("pastPlans")}</SectionTitle>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {past.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/ticket-plans/${plan.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
                >
                  <span className="truncate">{plan.eventTitle}</span>
                  <PlanStatusBadge
                    status={plan.status}
                    refundStatus={plan.refundStatus}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
