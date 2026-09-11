import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { loadFieldOpsOnboardings } from "@/lib/data";
import type { FieldOpsOnboardingStatus } from "@abonten/types/fieldOps";
import Link from "next/link";
import { FieldOpsTabs } from "../FieldOpsTabs";

const STATUSES: { key: FieldOpsOnboardingStatus | "all"; label: string }[] = [
  { key: "submitted", label: "Awaiting review" },
  { key: "verified", label: "Verified" },
  { key: "flagged", label: "Flagged" },
  { key: "needs_changes", label: "Returned" },
  { key: "succeeded", label: "Succeeded" },
  { key: "rejected", label: "Rejected" },
  { key: "draft", label: "Drafts" },
  { key: "all", label: "All" },
];

export function onboardingTone(s: string) {
  switch (s) {
    case "submitted":
    case "flagged":
      return "warning" as const;
    case "verified":
    case "succeeded":
      return "success" as const;
    case "rejected":
      return "danger" as const;
    case "needs_changes":
      return "info" as const;
    default:
      return "neutral" as const;
  }
}

export default async function FieldOpsOnboardingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "submitted") as FieldOpsOnboardingStatus | "all";
  const { onboardings, campaigns } = await loadFieldOpsOnboardings({
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
      if (v) q.set(k, v);
    }
    return `/field-ops/onboardings?${q.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Field Ops · Onboardings"
        description="Every business a team member has onboarded, with the team lead's decision and the eligibility checklist."
      />
      <FieldOpsTabs active="/field-ops/onboardings" />

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

      {onboardings.status !== 200 || !onboardings.data ? (
        <EmptyState>
          {onboardings.message ?? "Couldn't load onboardings."}
        </EmptyState>
      ) : onboardings.data.items.length === 0 ? (
        <EmptyState>Nothing in this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Business</Th>
              <Th>Member</Th>
              <Th>Campaign</Th>
              <Th>Mode</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {onboardings.data.items.map((o) => (
              <tr key={o.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/field-ops/onboardings/${o.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {o.businessName ?? "(no name yet)"}
                  </Link>
                  {o.placeSlug ? (
                    <div className="text-xs text-muted-foreground">
                      /{o.placeSlug}
                    </div>
                  ) : null}
                </Td>
                <Td>{o.memberName ?? o.memberUserId.slice(0, 8)}</Td>
                <Td>{o.campaignName}</Td>
                <Td className="capitalize">{o.mode}</Td>
                <Td>
                  <Badge tone={onboardingTone(o.status)}>
                    {o.status.replace("_", " ")}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(o.updatedAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {onboardings.status === 200 && onboardings.data?.nextCursor ? (
        <div className="mt-3">
          <Link
            href={qs({ cursor: onboardings.data.nextCursor })}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
