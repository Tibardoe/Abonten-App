import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { loadOrganizers } from "@/lib/data";
import Link from "next/link";

function statusTone(s: string) {
  return s === "Banned" ? "danger" : s === "Suspended" ? "warning" : "success";
}

export default async function OrganizersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const res = await loadOrganizers({
    search: q || undefined,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader
        title="Organizers"
        description="Everyone who has published an event or owns a place. Account actions live in Users."
      />

      <form className="mb-3 flex gap-2" action="/organizers">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name / username…"
          className="h-8 w-64 rounded border border-border bg-background px-2 text-sm"
        />
        <button
          type="submit"
          className="h-8 rounded border border-border px-2.5 text-xs hover:bg-muted"
        >
          Search
        </button>
      </form>

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load organizers."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No organizers match.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Account</Th>
              <Th>Events</Th>
              <Th>Places</Th>
              <Th>Reports against</Th>
              <Th>Joined</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((o) => (
              <tr key={o.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/organizers/${o.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {o.fullName || o.username || `${o.id.slice(0, 8)}…`}
                  </Link>
                  {o.username ? (
                    <div className="text-xs text-muted-foreground">
                      @{o.username}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={statusTone(o.accountStatus)}>
                    {o.accountStatus}
                  </Badge>
                </Td>
                <Td className="tabular-nums">{o.eventCount}</Td>
                <Td className="tabular-nums">{o.placeCount}</Td>
                <Td className="tabular-nums">{o.reportsAgainst}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {o.createdAt ? timeAgo(o.createdAt) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/organizers?cursor=${encodeURIComponent(res.nextCursor)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
