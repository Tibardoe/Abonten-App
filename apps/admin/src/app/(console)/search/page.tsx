import { Card, EmptyState, PageHeader } from "@/components/ui";
import { loadSearch } from "@/lib/data";
import type { GlobalSearchHit } from "@abonten/types/adminTypes";
import Link from "next/link";

function Group({
  title,
  hits,
}: {
  title: string;
  hits: GlobalSearchHit[];
}) {
  if (hits.length === 0) return null;
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="space-y-1 text-sm">
        {hits.map((h) => (
          <li key={h.href}>
            <Link href={h.href} className="text-primary hover:underline">
              {h.label}
            </Link>
            {h.sublabel ? (
              <span className="text-xs text-muted-foreground">
                {" "}
                · {h.sublabel}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const res = q.length >= 2 ? await loadSearch(q) : null;

  const total = res?.data
    ? res.data.users.length +
      res.data.events.length +
      res.data.places.length +
      res.data.transactions.length +
      res.data.reports.length
    : 0;

  return (
    <div>
      <PageHeader
        title="Search"
        description={
          q
            ? `Results for “${q}”`
            : "Type at least 2 characters in the top bar."
        }
      />

      {!res ? (
        <EmptyState>Enter a search term.</EmptyState>
      ) : res.status !== 200 || !res.data ? (
        <EmptyState>{res.message ?? "Search failed."}</EmptyState>
      ) : total === 0 ? (
        <EmptyState>
          Nothing matched. Try a name, an event code, a Paystack reference, or
          an exact id.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Group title="Users" hits={res.data.users} />
          <Group title="Events" hits={res.data.events} />
          <Group title="Places" hits={res.data.places} />
          <Group title="Transactions" hits={res.data.transactions} />
          <Group title="Reports" hits={res.data.reports} />
        </div>
      )}
    </div>
  );
}
