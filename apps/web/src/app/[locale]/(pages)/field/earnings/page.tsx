import { getFieldOpsPayoutDestination } from "@/actions/fieldOps/getFieldOpsPayoutDestination";
import { getMyFieldOpsEarnings } from "@/actions/fieldOps/getMyFieldOpsEarnings";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import PayoutDestinationForm from "@/fieldOps/organisms/PayoutDestinationForm";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import type { FieldOpsCommission } from "@abonten/types/fieldOps";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  pending: "inHolding",
  approved: "readyToPay",
  in_payout: "inAPayout",
  paid: "paid",
  rejected: "notEligible",
  reversed: "takenBack2",
};

export default async function FieldEarningsPage() {
  const t = await getTranslations("fieldOps");
  const locale = await getLocale();
  const money = (minor: number, currency: string) =>
    formatMinor(minor, currency, locale);
  const format = await getFormatter();

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();

  const [res, destination] = await Promise.all([
    getMyFieldOpsEarnings({ campaignId: current.campaign.id }),
    getFieldOpsPayoutDestination({ campaignId: current.campaign.id }),
  ]);
  const earnings = res.data;
  if (!earnings) notFound();

  const { totals, commissions } = earnings;
  // A reversal offset is shown beside the row it cancels, not on its own.
  const reversedIds = new Set(
    commissions
      .map((c) => c.reversesCommissionId)
      .filter((id): id is string => Boolean(id)),
  );
  const lines = commissions.filter((c) => !c.reversesCommissionId);

  const row = (c: FieldOpsCommission) => {
    const cancelled = c.status === "reversed" || reversedIds.has(c.id);
    return (
      <li key={c.id} className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            {c.onboardingId ? (
              <Link
                href={`/field/submissions/${c.onboardingId}`}
                className="font-medium hover:underline"
              >
                {c.businessName ?? t("anOnboarding")}
              </Link>
            ) : (
              <span className="font-medium">
                {c.activityKey.replace(/_/g, " ")}
              </span>
            )}
            <p className="text-sm text-muted-foreground">
              {STATUS_COPY[c.status] ? t(STATUS_COPY[c.status]) : c.status} ·{" "}
              {format.dateTime(new Date(c.earnedAt), { dateStyle: "medium" })}
            </p>
          </div>
          <span
            className={`tabular-nums font-semibold ${cancelled ? "text-muted-foreground line-through" : ""}`}
          >
            {money(c.amountMinor, c.currency)}
          </span>
        </div>
        {c.status === "rejected" && c.rejectionReason ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {c.rejectionReason}
          </p>
        ) : null}
        {c.status === "reversed" && c.reversalReason ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("takenBack", { reversalReason: c.reversalReason })}
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("earnings")}</PageTitle>
        <SupportingText>
          {t("whatYouHaveEarnedOn", { name: earnings.campaign.name })}
          {earnings.liveRate
            ? ` ${t("youEarnForEachBusinessThat", {
                money: money(
                  earnings.liveRate.amountMinor,
                  earnings.liveRate.currency,
                ),
              })}`
            : ""}
        </SupportingText>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={t("inHolding")}
          value={money(totals.pendingMinor, totals.currency)}
          hint={
            earnings.nextReleaseAt
              ? t("next2", {
                  date: format.dateTime(new Date(earnings.nextReleaseAt), {
                    dateStyle: "medium",
                  }),
                })
              : undefined
          }
        />
        <StatTile
          label={t("readyToPay")}
          value={money(totals.approvedMinor, totals.currency)}
        />
        <StatTile
          label={t("inAPayout")}
          value={money(totals.inPayoutMinor, totals.currency)}
        />
        <StatTile
          label={t("paid")}
          value={money(totals.paidMinor, totals.currency)}
        />
      </div>

      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        {t("aCommissionIsConfirmedAfterThe")}
      </p>

      <PayoutDestinationForm
        campaignId={current.campaign.id}
        current={destination.data ?? null}
      />

      {earnings.payouts.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("payments")}</h2>
          <ul className="flex flex-col gap-3">
            {earnings.payouts.map((p) => (
              <li key={p.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {p.batchLabel ?? t("payment")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {p.status === "paid"
                        ? t("sent2", {
                            date: p.paidAt
                              ? format.dateTime(new Date(p.paidAt), {
                                  dateStyle: "medium",
                                })
                              : "",
                          })
                        : p.status === "failed"
                          ? t("didNotGoThroughItIs")
                          : t("beingPrepared")}
                      {p.commissionCount > 0
                        ? ` – ${t("commissionsCount", { count: p.commissionCount })}`
                        : ""}
                    </p>
                    {p.paymentReference ? (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {p.paymentReference}
                      </p>
                    ) : null}
                  </div>
                  <span className="font-semibold tabular-nums">
                    {money(p.amountMinor, p.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("yourCommissions")}</h2>
        {lines.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {t("nothingYetACommissionAppearsHere")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">{lines.map(row)}</ul>
        )}
      </section>
    </div>
  );
}
