import {
  Badge,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { loadFieldOpsCommissions } from "@/lib/data";
import type { FieldOpsCommissionStatus } from "@abonten/types/fieldOps";
import Link from "next/link";
import { FieldOpsTabs } from "../FieldOpsTabs";

const STATUSES: { key: FieldOpsCommissionStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "In holding" },
  { key: "approved", label: "Ready to pay" },
  { key: "in_payout", label: "In a batch" },
  { key: "paid", label: "Paid" },
  { key: "rejected", label: "Rejected" },
  { key: "reversed", label: "Reversed" },
];

export const commissionMoney = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

export function commissionTone(s: string) {
  switch (s) {
    case "approved":
    case "paid":
      return "success" as const;
    case "pending":
    case "in_payout":
      return "info" as const;
    case "rejected":
    case "reversed":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export default async function FieldOpsCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "all") as FieldOpsCommissionStatus | "all";
  const { commissions, campaigns } = await loadFieldOpsCommissions({
    status: status === "all" ? undefined : status,
    campaignId: sp.campaign || undefined,
    cursor: sp.cursor || undefined,
  });
  const qs = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({
      status,
      campaign: sp.campaign,
      ...extra,
    })) {
      if (v && v !== "all") q.set(k, v);
    }
    return `/field-ops/commissions?${q.toString()}`;
  };
  const totals = commissions.status === 200 ? commissions.data?.totals : null;
  const currency = commissions.data?.items[0]?.currency ?? "GHS";

  return (
    <div>
      <PageHeader
        title="Field Ops · Commissions"
        description="What the programme owes and has paid. Amounts are frozen from the rule version in force when the team lead verified the onboarding; only a reversal can change a commission after that."
      />
      <FieldOpsTabs active="/field-ops/commissions" />

      {totals ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="In holding"
            value={commissionMoney(totals.pending, currency)}
            hint="Verified, waiting for the sweep"
          />
          <Stat
            label="Ready to pay"
            value={commissionMoney(totals.approved, currency)}
            hint="Confirmed by the sweep"
          />
          <Stat
            label="In a payout batch"
            value={commissionMoney(totals.in_payout, currency)}
            hint="Built into a batch, not yet sent"
          />
          <Stat
            label="Paid"
            value={commissionMoney(totals.paid, currency)}
            hint="Net of reversal offsets"
          />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {STATUSES.map((t) => (
          <Link
            key={t.key}
            href={qs({ status: t.key, cursor: undefined })}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              status === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
        {campaigns.status === 200 &&
        campaigns.data &&
        campaigns.data.length > 1 ? (
          <form className="ml-auto flex items-center gap-1 text-xs">
            <input type="hidden" name="status" value={status} />
            <select
              name="campaign"
              defaultValue={sp.campaign ?? ""}
              className="rounded border border-border bg-background px-2 py-1"
            >
              <option value="">All campaigns</option>
              {campaigns.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded border border-border px-2 py-1 hover:bg-muted"
            >
              Filter
            </button>
          </form>
        ) : null}
      </div>

      {commissions.status !== 200 || !commissions.data ? (
        <EmptyState>
          {commissions.message ?? "Couldn't load commissions."}
        </EmptyState>
      ) : commissions.data.items.length === 0 ? (
        <EmptyState>Nothing in this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Member</Th>
              <Th>Earned on</Th>
              <Th>Campaign</Th>
              <Th>Rule</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Earned</Th>
            </tr>
          </thead>
          <tbody>
            {commissions.data.items.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/field-ops/commissions/${c.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.memberName ?? c.memberUserId.slice(0, 8)}
                  </Link>
                </Td>
                <Td>
                  {c.reversesCommissionId ? (
                    <span className="text-muted-foreground">
                      Reversal offset
                    </span>
                  ) : c.onboardingId ? (
                    <Link
                      href={`/field-ops/onboardings/${c.onboardingId}`}
                      className="text-primary hover:underline"
                    >
                      {c.businessName ?? "onboarding"}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td>{c.campaignName}</Td>
                <Td className="text-xs text-muted-foreground">
                  {c.activityKey.replace(/_/g, " ")}
                  {c.ruleVersion ? ` · v${c.ruleVersion}` : ""}
                </Td>
                <Td
                  className={cn(
                    "whitespace-nowrap tabular-nums",
                    c.amountMinor < 0 && "text-destructive",
                    c.status === "reversed" && "line-through",
                  )}
                >
                  {commissionMoney(c.amountMinor, c.currency)}
                </Td>
                <Td>
                  <Badge tone={commissionTone(c.status)}>
                    {c.status.replace("_", " ")}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(c.earnedAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {commissions.status === 200 && commissions.data?.nextCursor ? (
        <div className="mt-3">
          <Link
            href={qs({ cursor: commissions.data.nextCursor })}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
