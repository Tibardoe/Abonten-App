import { getFieldOpsLeadPerformance } from "@/actions/fieldOps/getFieldOpsLeadPerformance";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatTile from "@/fieldOps/atoms/StatTile";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

/** "3 of 4" reads better than "75%" at these volumes. */
const outOf = (part: number, whole: number) =>
  whole === 0 ? "—" : `${part} of ${whole}`;

export default async function FieldLeadPerformancePage() {
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
        <PageTitle>Performance</PageTitle>
        <SupportingText>
          How {a.campaign.name} is going. Every figure is counted from the work
          itself, so nothing here can be typed in.
        </SupportingText>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Towns covered"
          value={`${stats.territories.covered + stats.territories.completed}/${stats.territories.total}`}
          hint={`${stats.territories.coveragePct}%`}
        />
        <StatTile
          label="Businesses listed"
          value={stats.onboardings.succeeded}
          hint={`${stats.onboardings.submitted + stats.onboardings.verified} still moving`}
        />
        <StatTile
          label="Waiting on you"
          value={stats.onboardings.submitted}
          hint="submissions to review"
        />
        <StatTile
          label="Earned by the team"
          value={money(
            stats.money.approved_minor +
              stats.money.in_payout_minor +
              stats.money.paid_minor,
            stats.currency,
          )}
          // "Earned" is confirmed money only. Without the holding figure a
          // lead who just verified a submission sees 0.00 and assumes the
          // verification did nothing.
          hint={`${money(stats.money.paid_minor, stats.currency)} paid · ${money(
            stats.money.pending_minor,
            stats.currency,
          )} in holding`}
        />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your team</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Member</th>
                <th className="p-3 font-medium">Days out</th>
                <th className="p-3 font-medium">Found</th>
                <th className="p-3 font-medium">Sent in</th>
                <th className="p-3 font-medium">Stood up</th>
                <th className="p-3 font-medium">Earned</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.memberId} className="border-b last:border-0">
                  <td className="p-3">
                    <div className="font-medium">
                      {m.fullName ?? "a member"}
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
                        {" "}
                        · {m.rejected} not
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
          &quot;Stood up&quot; means the automatic check after the holding
          period passed. A member whose work keeps failing it usually needs
          help, not a telling-off — open one and see which check it was.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Towns</h2>
        <ul className="flex flex-col gap-2">
          {territories.map((t) => (
            <li
              key={t.territoryId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
            >
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.prospects} found · {t.contacted} spoken to · {t.submitted}{" "}
                  sent in · {t.succeeded} listed
                </p>
              </div>
              <StatusChip
                status={
                  t.status === "completed"
                    ? "completed"
                    : t.covered
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
