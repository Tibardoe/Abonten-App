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
import { loadSupportQueue } from "@/lib/data";
import type { SupportQueueScope } from "@abonten/types/adminTypes";
import Link from "next/link";

const TABS: { key: SupportQueueScope; label: string }[] = [
  { key: "unassigned", label: "Unassigned" },
  { key: "mine", label: "Assigned to me" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

export default async function SupportQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const scope = (sp.scope ?? "unassigned") as SupportQueueScope;
  const res = await loadSupportQueue({ scope, cursor: sp.cursor ?? null });

  return (
    <div>
      <PageHeader
        title="Support queue"
        description="In-app conversations users started with Abonten Support. Claim one to reply — the requester only ever sees “Abonten Support”, never your name."
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/support?scope=${t.key}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              scope === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {res.status !== 200 ? (
        <EmptyState>
          {res.message ?? "Couldn't load the support queue."}
        </EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No support conversations in this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Requester</Th>
              <Th>Status</Th>
              <Th className="text-right">Messages</Th>
              <Th>Last activity</Th>
              <Th>Assigned</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/support/${c.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.requesterName ?? `${c.requesterId.slice(0, 8)}…`}
                  </Link>
                  {c.lastMessagePreview ? (
                    <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {c.lastMessagePreview}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  {c.status === "closed" ? (
                    <Badge tone="neutral">closed</Badge>
                  ) : c.awaitingReply ? (
                    <Badge tone="warning">awaiting reply</Badge>
                  ) : (
                    <Badge tone="success">open</Badge>
                  )}
                </Td>
                <Td className="text-right tabular-nums">{c.messageCount}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(c.lastMessageAt ?? c.createdAt)}
                </Td>
                <Td className="text-muted-foreground">
                  {c.assignedToName ?? (c.assignedToId ? "—" : "unassigned")}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/support?scope=${scope}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
