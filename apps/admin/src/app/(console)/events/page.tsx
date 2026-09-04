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
import { loadEvents } from "@/lib/data";
import Link from "next/link";

const STATE_TABS = [
  { key: "", label: "All" },
  { key: "actioned", label: "Moderated" },
  { key: "hidden", label: "Hidden" },
  { key: "removed", label: "Removed" },
];

function modTone(s: string | null) {
  return s === "removed"
    ? "danger"
    : s === "hidden"
      ? "warning"
      : s === "restricted"
        ? "info"
        : "neutral";
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const modState = sp.mod ?? "";
  const q = sp.q ?? "";
  const res = await loadEvents({
    // biome-ignore lint/suspicious/noExplicitAny: validated against STATE_TABS keys
    moderationState: (modState || undefined) as any,
    search: q || undefined,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader
        title="Events"
        description="Read-only catalog view. Moderate from the Content tab or a report; act on an organizer from Users."
      />

      <form className="mb-3 flex gap-2" action="/events">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title…"
          className="h-8 w-64 rounded border border-border bg-background px-2 text-sm"
        />
        {modState ? <input type="hidden" name="mod" value={modState} /> : null}
        <button
          type="submit"
          className="h-8 rounded border border-border px-2.5 text-xs hover:bg-muted"
        >
          Search
        </button>
      </form>

      <div className="mb-3 flex flex-wrap gap-1">
        {STATE_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/events?mod=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              modState === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load events."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No events match.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Organizer</Th>
              <Th>Status</Th>
              <Th>Moderation</Th>
              <Th>Reports</Th>
              <Th>Starts</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((e) => (
              <tr key={e.id} className="hover:bg-muted/40">
                <Td className="max-w-[280px]">
                  <Link
                    href={`/events/${e.id}`}
                    className="font-medium text-primary hover:underline line-clamp-1"
                  >
                    {e.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {e.eventCode ?? e.id.slice(0, 8)}
                    {e.featured ? " · featured" : ""}
                  </div>
                </Td>
                <Td>
                  <Link
                    href={`/organizers/${e.organizerId}`}
                    className="text-primary hover:underline"
                  >
                    {e.organizerName ?? `${e.organizerId.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td>{e.status}</Td>
                <Td>
                  {e.moderationState ? (
                    <Badge tone={modTone(e.moderationState)}>
                      {e.moderationState}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>
                <Td className="tabular-nums">{e.reportCount}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {e.startsAt ? timeAgo(e.startsAt) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/events?mod=${modState}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
