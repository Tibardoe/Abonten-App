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
import { loadPlaces } from "@/lib/data";
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

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const modState = sp.mod ?? "";
  const q = sp.q ?? "";
  const res = await loadPlaces({
    // biome-ignore lint/suspicious/noExplicitAny: validated against STATE_TABS keys
    moderationState: (modState || undefined) as any,
    search: q || undefined,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader
        title="Places"
        description="Read-only catalog view. Moderate from the Content tab; ownership changes only through Claims."
      />

      <form className="mb-3 flex gap-2" action="/places">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name…"
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
            href={`/places?mod=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
        <EmptyState>{res.message ?? "Couldn't load places."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No places match.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Owner</Th>
              <Th>Status</Th>
              <Th>Moderation</Th>
              <Th>Reports</Th>
              <Th>Added</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((p) => (
              <tr key={p.id} className="hover:bg-muted/40">
                <Td className="max-w-[280px]">
                  <Link
                    href={`/places/${p.id}`}
                    className="font-medium text-primary hover:underline line-clamp-1"
                  >
                    {p.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {p.claimed ? "claimed" : "unclaimed"}
                    {p.verified ? " · verified" : ""}
                  </div>
                </Td>
                <Td>
                  {p.ownerId ? (
                    <Link
                      href={`/organizers/${p.ownerId}`}
                      className="text-primary hover:underline"
                    >
                      {p.ownerName ?? `${p.ownerId.slice(0, 8)}…`}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>{p.status}</Td>
                <Td>
                  {p.moderationState ? (
                    <Badge tone={modTone(p.moderationState)}>
                      {p.moderationState}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>
                <Td className="tabular-nums">{p.reportCount}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(p.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/places?mod=${modState}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
