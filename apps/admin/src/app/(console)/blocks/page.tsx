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
import { loadBlocks } from "@/lib/data";
import Link from "next/link";

type Scope = "all" | "global" | "scoped";
const TABS: { key: Scope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "global", label: "Global" },
  { key: "scoped", label: "Per-conversation" },
];

export default async function BlocksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const scope = (sp.scope ?? "all") as Scope;
  const userId = sp.user ?? null;
  const res = await loadBlocks({
    scope,
    userId,
    cursor: sp.cursor ?? null,
  });

  const hrefWith = (over: { scope?: Scope; cursor?: string }) => {
    const p = new URLSearchParams();
    const s = over.scope ?? scope;
    if (s !== "all") p.set("scope", s);
    if (userId) p.set("user", userId);
    if (over.cursor) p.set("cursor", over.cursor);
    const q = p.toString();
    return q ? `/blocks?${q}` : "/blocks";
  };

  return (
    <div>
      <PageHeader
        title="Blocked users"
        description="Rows from the in-app “Block” action. Blocks stop messaging in both directions and are enforced server-side. This view is read-only — a block is the user's own choice to make and undo."
      />

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={hrefWith({ scope: t.key })}
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
        {userId ? (
          <Link
            href={`/blocks${scope !== "all" ? `?scope=${scope}` : ""}`}
            className="ml-2 rounded border border-border px-2.5 py-1 text-xs hover:bg-muted"
          >
            Clear user filter ✕
          </Link>
        ) : null}
      </div>

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load blocks."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No blocks in this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Blocker</Th>
              <Th>Blocked</Th>
              <Th>Scope</Th>
              <Th>When</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((b) => (
              <tr key={b.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/users/${b.blockerId}`}
                    className="text-primary hover:underline"
                  >
                    {b.blockerName ?? `${b.blockerId.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td>
                  <Link
                    href={`/users/${b.blockedId}`}
                    className="text-primary hover:underline"
                  >
                    {b.blockedName ?? `${b.blockedId.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td>
                  {b.conversationId ? (
                    <Badge tone="info">
                      {b.conversationType ?? "conversation"}
                    </Badge>
                  ) : (
                    <Badge tone="warning">global</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(b.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={hrefWith({ cursor: res.nextCursor })}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
