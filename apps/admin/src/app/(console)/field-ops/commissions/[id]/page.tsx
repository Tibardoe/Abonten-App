import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { loadFieldOpsCommission } from "@/lib/data";
import Link from "next/link";
import { FieldOpsTabs } from "../../FieldOpsTabs";
import { commissionMoney, commissionTone } from "../page";
import { ReversePanel } from "./ReversePanel";

export default async function FieldOpsCommissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, detail } = await loadFieldOpsCommission(id);

  if (detail.status !== 200 || !detail.data) {
    return (
      <div>
        <PageHeader title="Field Ops · Commission" />
        <FieldOpsTabs active="/field-ops/commissions" />
        <EmptyState>{detail.message ?? "Commission not found."}</EmptyState>
      </div>
    );
  }
  const { commission: c, timeline } = detail.data;
  const canReverse = ctx.permissions.includes("fieldops.commissions.approve");
  const reversible =
    !c.reversesCommissionId &&
    ["approved", "in_payout", "paid"].includes(c.status);

  return (
    <div>
      <PageHeader
        title={`${commissionMoney(c.amountMinor, c.currency)} · ${c.memberName ?? c.memberUserId.slice(0, 8)}`}
        description={
          c.reversesCommissionId
            ? "A reversal offset. It records money that had already been paid out being taken back; the original row is left untouched."
            : "One earned commission. The amount was frozen from the rule version in force when the team lead verified the onboarding."
        }
      />
      <FieldOpsTabs active="/field-ops/commissions" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <Badge tone={commissionTone(c.status)}>
                  {c.status.replace("_", " ")}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Amount
              </dt>
              <dd
                className={cn(
                  "mt-1 tabular-nums",
                  c.amountMinor < 0 && "text-destructive",
                )}
              >
                {commissionMoney(c.amountMinor, c.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Activity
              </dt>
              <dd className="mt-1">
                {c.activityKey.replace(/_/g, " ")}
                {c.ruleVersion ? ` · rule v${c.ruleVersion}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Earned on
              </dt>
              <dd className="mt-1">
                {c.onboardingId ? (
                  <Link
                    href={`/field-ops/onboardings/${c.onboardingId}`}
                    className="text-primary hover:underline"
                  >
                    {c.businessName ?? "the onboarding"}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            {c.rejectionReason ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Why it was rejected
                </dt>
                <dd className="mt-1">{c.rejectionReason}</dd>
              </div>
            ) : null}
            {c.reversalReason ? (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Why it was reversed
                </dt>
                <dd className="mt-1">{c.reversalReason}</dd>
              </div>
            ) : null}
          </dl>

          <h2 className="mt-6 mb-2 text-sm font-medium">History</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {timeline.map((e) => (
                <li
                  key={e.id}
                  className="border-l-2 border-border pl-3 leading-snug"
                >
                  <span className="font-medium">
                    {e.fromStatus ? `${e.fromStatus} → ` : ""}
                    {e.toStatus}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {e.actorName ?? e.actorKind}
                    {" · "}
                    {new Date(e.createdAt).toLocaleString()}
                  </span>
                  {e.reason ? (
                    <div className="text-muted-foreground">{e.reason}</div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div>
          {canReverse && reversible ? (
            <ReversePanel commissionId={c.id} />
          ) : (
            <Card className="p-4 text-sm text-muted-foreground">
              {c.reversesCommissionId
                ? "A reversal offset cannot itself be reversed."
                : reversible
                  ? "You need the commissions-approve permission to reverse this."
                  : `A commission that is "${c.status}" cannot be reversed.`}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
