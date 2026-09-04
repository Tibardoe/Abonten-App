import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadNotificationDetail } from "@/lib/data";
import Link from "next/link";
import { ResendButton } from "../ResendButton";

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, detail } = await loadNotificationDetail(id);
  if (detail.status !== 200 || !detail.data) {
    return (
      <EmptyState>{detail.message ?? "Notification not found."}</EmptyState>
    );
  }
  const n = detail.data;
  const canSend = ctx.permissions.includes("notifications.send");

  return (
    <div className="space-y-4">
      <PageHeader
        title={n.title}
        description={
          <Link href="/notifications" className="text-primary hover:underline">
            ← Back to notifications
          </Link>
        }
        actions={
          n.readAt ? (
            <Badge tone="neutral">read</Badge>
          ) : (
            <Badge tone="info">unread</Badge>
          )
        }
      />

      <Card className="p-4">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Recipient</dt>
          <dd>
            <Link
              href={`/users/${n.userId}`}
              className="text-primary hover:underline"
            >
              {n.recipientName ?? `${n.userId.slice(0, 8)}…`}
            </Link>
            {n.recipientEmail ? (
              <span className="text-muted-foreground">
                {" "}
                · {n.recipientEmail}
              </span>
            ) : null}
          </dd>
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-mono text-xs">{n.type}</dd>
          <dt className="text-muted-foreground">Sent</dt>
          <dd>
            {new Date(n.createdAt).toLocaleString()} · {timeAgo(n.createdAt)}
          </dd>
          <dt className="text-muted-foreground">Read</dt>
          <dd>{n.readAt ? new Date(n.readAt).toLocaleString() : "—"}</dd>
          <dt className="text-muted-foreground">Link</dt>
          <dd>{n.link ?? "—"}</dd>
          <dt className="text-muted-foreground">Thumbnail</dt>
          <dd>{n.hasImage ? n.imagePublicId : "—"}</dd>
        </dl>

        {n.body ? (
          <p className="mt-3 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
            {n.body}
          </p>
        ) : null}

        <pre className="mt-3 overflow-x-auto rounded bg-muted/50 p-2 text-xs">
          {JSON.stringify(n.data ?? {}, null, 2)}
        </pre>
      </Card>

      {canSend ? (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Re-send</h3>
          <p className="mb-2 text-xs text-muted-foreground">
            Writes a fresh copy of this notification to the same user and fires
            a best-effort mobile push. Audited.
          </p>
          <ResendButton id={n.id} />
        </Card>
      ) : null}
    </div>
  );
}
