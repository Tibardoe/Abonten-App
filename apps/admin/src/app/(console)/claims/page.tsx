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
import type { ClaimStatus } from "@abonten/types/adminTypes";
import Link from "next/link";

const TABS: { key: ClaimStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function claimTone(s: ClaimStatus) {
  return s === "pending" ? "warning" : s === "approved" ? "success" : "neutral";
}

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "pending") as ClaimStatus | "all";
  const res = await loadClaims({ status, cursor: sp.cursor ?? null });

  return (
    <div>
      <PageHeader
        title="Place Claims"
        description="Businesses asking to take over an unclaimed place listing. Approving transfers ownership — the only path that does."
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/claims?status=${t.key}`}
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
              <Th>Claimant</Th>
              <Th>Docs</Th>
              <Th>Status</Th>
              <Th>Filed</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
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
                <Td>{c.claimantName ?? c.claimantId.slice(0, 8)}</Td>
                <Td className="tabular-nums">{c.documentCount}</Td>
                <Td>
                  <Badge tone={claimTone(c.status)}>{c.status}</Badge>
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
            href={`/claims?status=${status}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
