import { getFieldOpsLeadPerformance } from "@/actions/fieldOps/getFieldOpsLeadPerformance";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

/** "3 of 4" reads better than "75%" at these volumes. */
const outOf = (part: number, whole: number) =>
  whole === 0 ? "—" : `${part} of ${whole}`;

export default async function FieldLeadPerformancePage() {
  const t = await getTranslations("fieldOps");
  const locale = await getLocale();
  const money = (minor: number, currency: string) =>
    formatMinor(minor, currency, locale);

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current || !current.isLead) notFound();

  const res = await getFieldOpsLeadPerformance({
    campaignId: current.campaign.id,
  });
  const a = res.data;
  if (!a) notFound();
  const { stats, members, territories } = a;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("performance")}</PageTitle>
        <SupportingText>
          {t("howIsGoingEveryFigureIs", { name: a.campaign.name })}
        </SupportingText>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={t("townsCovered")}
          value={`${stats.territories.covered + stats.territories.completed}/${stats.territories.total}`}
          hint={`${stats.territories.coveragePct}%`}
        />
        <StatTile
          label={t("businessesListed")}
          value={stats.onboardings.succeeded}
          hint={t("stillMoving", {
            value: stats.onboardings.submitted + stats.onboardings.verified,
          })}
        />
        <StatTile
          label={t("waitingOnYou")}
          value={stats.onboardings.submitted}
          hint={t("submissionsToReview")}
        />
        <StatTile
          label={t("earnedByTheTeam")}
          value={money(
            stats.money.approved_minor +
              stats.money.in_payout_minor +
              stats.money.paid_minor,
            stats.currency,
          )}
          // "Earned" is confirmed money only. Without the holding figure a
          // lead who just verified a submission sees 0.00 and assumes the
          // verification did nothing.
          hint={t("paidInHolding", {
            money: money(stats.money.paid_minor, stats.currency),
            money2: money(stats.money.pending_minor, stats.currency),
          })}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("yourTeam")}</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">{t("member")}</th>
                <th className="p-3 font-medium">{t("daysOut")}</th>
                <th className="p-3 font-medium">{t("found")}</th>
                <th className="p-3 font-medium">{t("sentIn")}</th>
                <th className="p-3 font-medium">{t("stoodUp")}</th>
                <th className="p-3 font-medium">{t("earned")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.memberId} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="font-medium">
                      {m.fullName ?? t("aMember")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.role.replace(/_/g, " ")}
                      {m.status !== "active" ? ` · ${m.status}` : ""}
                    </div>
                  </td>
                  <td className="p-3 tabular-nums">{m.assignedDays}</td>
                  <td className="p-3 tabular-nums">{m.prospects}</td>
                  <td className="p-3 tabular-nums">{m.submitted}</td>
                  <td className="p-3 tabular-nums">
                    {outOf(m.succeeded, m.submitted)}
                    {m.rejected > 0 ? (
                      <span className="text-muted-foreground">
                        {t("not", { rejected: m.rejected })}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3 tabular-nums">
                    {money(m.earnedMinor, stats.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("stoodUpMeansTheAutomaticCheck")}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("towns")}</h2>
        <ul className="flex flex-col gap-2">
          {territories.map((territory) => (
            <li
              key={territory.territoryId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
            >
              <div>
                <p className="font-medium">{territory.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("foundSpokenToSentInListed", {
                    prospects: territory.prospects,
                    contacted: territory.contacted,
                    submitted: territory.submitted,
                    succeeded: territory.succeeded,
                  })}
                </p>
              </div>
              <StatusChip
                status={
                  territory.status === "completed"
                    ? "completed"
                    : territory.covered
                      ? "covered"
                      : "uncovered"
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
