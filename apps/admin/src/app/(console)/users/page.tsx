import { Badge, EmptyState, PageHeader, Table, Td, Th, timeAgo } from "@/components/ui";
import { loadUsers } from "@/lib/data";
import type { UserAccountStatus } from "@abonten/types/adminTypes";
import Link from "next/link";

const STATUS_TONE: Record<UserAccountStatus, "success" | "warning" | "danger"> = {
  Active: "success",
  Suspended: "warning",
  Banned: "danger",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const res = await loadUsers({
    search: sp.q,
    status: sp.status as UserAccountStatus | undefined,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader title="Users" description="Search accounts and take account actions." />

      <form className="mb-3 flex gap-2" action="/users">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search username or name…"
          className="h-9 w-64 rounded-md border border-border bg-background px-3 text-sm"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="Active">Active</option>
          <option value="Suspended">Suspended</option>
          <option value="Banned">Banned</option>
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          Search
        </button>
      </form>

      {res.status !== 200 ? (
        <EmptyState>{res.message ?? "Couldn't load users."}</EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>No users match.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>User</Th>
              <Th>Status</Th>
              <Th>Events</Th>
              <Th>Reports against</Th>
              <Th>Joined</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((u) => (
              <tr key={u.id} className="hover:bg-muted/40">
                <Td>
                  <Link href={`/users/${u.id}`} className="font-medium text-primary hover:underline">
                    {u.username ?? u.fullName ?? `${u.id.slice(0, 8)}…`}
                  </Link>
                  {u.isAdmin ? <Badge tone="info" className="ml-1.5">staff</Badge> : null}
                  {u.email ? (
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[u.status]}>{u.status}</Badge>
                </Td>
                <Td className="tabular-nums">{u.eventCount}</Td>
                <Td className="tabular-nums">{u.reportsAgainstCount}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{timeAgo(u.createdAt)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/users?q=${encodeURIComponent(sp.q ?? "")}&cursor=${encodeURIComponent(res.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
