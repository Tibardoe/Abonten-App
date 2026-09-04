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
import { requireAdmin } from "@/lib/adminGuard";
import { loadNotifications } from "@/lib/data";
import Link from "next/link";
import { BroadcastPanel } from "./BroadcastPanel";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireAdmin();

  const unreadOnly = sp.unread === "1";
  const type = sp.type ?? "";
  const search = sp.q ?? "";
  const userId = sp.user ?? "";

  const { list } = await loadNotifications({
    type: type || null,
    userId: userId || null,
    unreadOnly,
    search: search || null,
    cursor: sp.cursor ?? null,
  });

  const canBroadcast = ctx.permissions.includes("notifications.broadcast");
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (type) p.set("type", type);
    if (userId) p.set("user", userId);
    if (search) p.set("q", search);
    if (unreadOnly) p.set("unread", "1");
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return p.toString();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Every in-app notification sent to a user. Re-send one, or broadcast to a segment."
      />

      {canBroadcast && <BroadcastPanel />}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/notifications"
      >
        <input
          name="q"
          defaultValue={search}
          placeholder="Search title / body"
          className="h-8 w-56 rounded-md border border-border bg-background px-2.5 text-sm"
        />
        <input
          name="type"
          defaultValue={type}
          placeholder="type (exact)"
          className="h-8 w-40 rounded-md border border-border bg-background px-2.5 text-sm"
        />
        <input
          name="user"
          defaultValue={userId}
          placeholder="recipient user id"
          className="h-8 w-64 rounded-md border border-border bg-background px-2.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            name="unread"
            value="1"
            defaultChecked={unreadOnly}
          />
          Unread only
        </label>
        <button
          type="submit"
          className="h-8 rounded-md border border-border px-3 text-sm hover:bg-muted"
        >
          Apply
        </button>
      </form>

      {list.status !== 200 ? (
        <EmptyState>
          {list.message ?? "Couldn't load notifications."}
        </EmptyState>
      ) : list.data.length === 0 ? (
        <EmptyState>No notifications match this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Notification</Th>
              <Th>Recipient</Th>
              <Th>Type</Th>
              <Th>Read</Th>
              <Th>Sent</Th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((n) => (
              <tr key={n.id} className="hover:bg-muted/40">
                <Td className="max-w-[360px]">
                  <Link
                    href={`/notifications/${n.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {n.title}
                  </Link>
                  {n.body ? (
                    <div className="line-clamp-1 text-xs text-muted-foreground">
                      {n.body}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <Link
                    href={`/users/${n.userId}`}
                    className="text-primary hover:underline"
                  >
                    {n.recipientName ?? `${n.userId.slice(0, 8)}…`}
                  </Link>
                </Td>
                <Td>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {n.type}
                  </span>
                </Td>
                <Td>
                  {n.readAt ? (
                    <Badge tone="neutral">read</Badge>
                  ) : (
                    <Badge tone="info">unread</Badge>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(n.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {list.hasNextPage && list.nextCursor ? (
        <Link
          href={`/notifications?${qs({ cursor: list.nextCursor })}`}
          className={cn("text-sm text-primary hover:underline")}
        >
          Next page →
        </Link>
      ) : null}
    </div>
  );
}
