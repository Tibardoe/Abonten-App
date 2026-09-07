import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  cn,
  timeAgo,
} from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadSupportConversation } from "@/lib/data";
import type { SupportMessageEntry } from "@abonten/types/adminTypes";
import Link from "next/link";
import { SupportPanel } from "./SupportPanel";

function systemLabel(ev: string | null): string {
  if (ev === "conversation_started") return "Conversation started";
  return ev ? ev.replace(/_/g, " ") : "System event";
}

function Transcript({ messages }: { messages: SupportMessageEntry[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted-foreground">No messages yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {messages.map((m) => {
        if (m.author === "system") {
          return (
            <li
              key={m.id}
              className="text-center text-xs text-muted-foreground"
            >
              {systemLabel(m.systemEvent)} · {timeAgo(m.createdAt)}
            </li>
          );
        }
        const mine = m.author === "support";
        return (
          <li
            key={m.id}
            className={cn("flex", mine ? "justify-end" : "justify-start")}
          >
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                mine
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                {mine ? "Abonten Support" : "Requester"}
              </p>
              {m.deletedAt ? (
                <p className="italic opacity-70">Message deleted</p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              )}
              <p className="mt-1 text-[10px] opacity-60">
                {new Date(m.createdAt).toLocaleString()}
                {m.editedAt ? " · edited" : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function SupportConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const res = await loadSupportConversation(id);

  if (res.status !== 200 || !res.data) {
    return (
      <EmptyState>
        {res.message ?? "Support conversation not found."}
      </EmptyState>
    );
  }
  const c = res.data;
  const requesterName =
    c.requester.fullName ||
    c.requester.username ||
    `${c.requester.id.slice(0, 8)}…`;

  return (
    <div>
      <PageHeader
        title={`Support · ${requesterName}`}
        description={
          <Link href="/support" className="text-primary hover:underline">
            ← Back to the support queue
          </Link>
        }
        actions={
          <Badge tone={c.status === "closed" ? "neutral" : "success"}>
            {c.status}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Requester</h3>
            <p className="text-sm">
              <Link
                href={`/users/${c.requester.id}`}
                className="text-primary hover:underline"
              >
                {requesterName}
              </Link>
              {c.requester.email ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {c.requester.email}
                </span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Opened {timeAgo(c.createdAt)}
              {c.assignedToName
                ? ` · assigned to ${c.assignedToName} ${timeAgo(c.assignedAt)}`
                : " · unassigned"}
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Conversation</h3>
            <Transcript messages={c.messages} />
          </Card>

          {c.notes.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Internal notes</h3>
              <ul className="space-y-2 text-sm">
                {c.notes.map((n) => (
                  <li key={n.id} className="rounded bg-muted/50 p-2">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.authorName ?? "admin"} · {timeAgo(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <SupportPanel
            conversationId={c.id}
            status={c.status}
            assignedToId={c.assignedToId}
            assignedToName={c.assignedToName}
            myUserId={ctx.userId}
            canRespond={ctx.permissions.includes("support.respond")}
          />
        </div>
      </div>
    </div>
  );
}
