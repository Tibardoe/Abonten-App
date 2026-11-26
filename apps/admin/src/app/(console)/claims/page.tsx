import { StatusBadge } from "@/components/metrics/StatusBadge";
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
import { loadClaims } from "@/lib/data";
import type { ClaimSituation, ClaimStatus } from "@abonten/types/adminTypes";
import Link from "next/link";

type ClaimsView = ClaimStatus | "all" | "disputes";

const TABS: { key: ClaimsView; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "disputes", label: "Disputes" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const VIEWS = new Set<string>(TABS.map((t) => t.key));

/** What a waiting claim is, in a word (where it stands now). */
function SituationBadge({ situation }: { situation: ClaimSituation | null }) {
  switch (situation) {
    case "dispute":
      return <Badge tone="danger">Ownership dispute</Badge>;
    case "team_member":
      return <Badge tone="danger">Dispute: own team's place</Badge>;
    case "listed_by_abonten":
      return <Badge tone="info">Listed by Abonten</Badge>;
    case "owner_deleted":
      return <Badge tone="info">Owner's account deleted</Badge>;
    case "owner":
      return <Badge>Already the owner</Badge>;
    default:
      return <span className="text-muted-foreground">—</span>;
  }
}

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view = (
    sp.status && VIEWS.has(sp.status) ? sp.status : "pending"
  ) as ClaimsView;
  const res = await loadClaims(
    view === "disputes"
      ? { disputesOnly: true, cursor: sp.cursor ?? null }
      : { status: view, cursor: sp.cursor ?? null },
  );
  const showSituation = view === "pending" || view === "disputes";

  return (
    <div>
      <PageHeader
        title="Place Claims"
        description="People asking to take over a place listing. Approving transfers ownership (the only path that does). A claim on a place someone else runs is an ownership dispute: disputes are listed first and need the place's name typed to approve."
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/claims?status=${t.key}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              view === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load claims."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No claims in this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Place</Th>
              {showSituation ? <Th>Situation</Th> : null}
              <Th>Claimant</Th>
              <Th>Docs</Th>
              <Th>Status</Th>
              <Th>Filed</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((c) => (
              <tr
                key={c.id}
                className={cn(
                  "hover:bg-muted/40",
                  c.isDispute && "bg-destructive/5",
                )}
              >
                <Td>
                  <Link
                    href={`/claims/${c.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.placeName ?? c.placeId.slice(0, 8)}
                  </Link>
                  {c.placeSlug ? (
                    <div className="text-xs text-muted-foreground">
                      /{c.placeSlug}
                    </div>
                  ) : null}
                </Td>
                {showSituation ? (
                  <Td>
                    <SituationBadge situation={c.situation} />
                  </Td>
                ) : null}
                <Td>{c.claimantName ?? c.claimantId.slice(0, 8)}</Td>
                <Td className="tabular-nums">{c.documentCount}</Td>
                <Td>
                  <StatusBadge family="claim" value={c.status} />
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(c.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/claims?status=${view}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
