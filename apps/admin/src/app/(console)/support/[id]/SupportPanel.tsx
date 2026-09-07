"use client";

import { Button, Card, cn } from "@/components/ui";
import {
  addSupportNote,
  assignSupportConversation,
  replySupportConversation,
  setSupportConversationStatus,
} from "@/server/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Msg = { tone: "ok" | "err"; text: string } | null;

export function SupportPanel({
  conversationId,
  status,
  assignedToId,
  assignedToName,
  myUserId,
  canRespond,
}: {
  conversationId: string;
  status: "open" | "closed";
  assignedToId: string | null;
  assignedToName: string | null;
  myUserId: string;
  canRespond: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<Msg>(null);

  const mineAlready = assignedToId === myUserId;

  function run(fn: () => Promise<{ status: number; message?: string }>) {
    setMsg(null);
    start(async () => {
      try {
        const res = await fn();
        if (res.status === 200) {
          setMsg({ tone: "ok", text: res.message ?? "Done." });
          router.refresh();
        } else {
          setMsg({ tone: "err", text: res.message ?? "Action failed." });
        }
      } catch (e) {
        setMsg({
          tone: "err",
          text: e instanceof Error ? e.message : "Action failed.",
        });
      }
    });
  }

  if (!canRespond) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          You have read-only access to the support queue.
        </p>
      </Card>
    );
  }

  return (
    <Card className="sticky top-2 space-y-4 p-4">
      {msg ? (
        <p
          className={cn(
            "text-sm",
            msg.tone === "ok" ? "text-success" : "text-destructive",
          )}
        >
          {msg.text}
        </p>
      ) : null}

      {/* Assignment */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Assignment</h3>
        <p className="text-xs text-muted-foreground">
          {assignedToId
            ? mineAlready
              ? "Assigned to you."
              : `Assigned to ${assignedToName ?? "another agent"}.`
            : "Unassigned. Replying will also claim it for you."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!mineAlready ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(() =>
                  assignSupportConversation({
                    conversationId,
                    assigneeId: myUserId,
                  }),
                )
              }
            >
              {assignedToId ? "Reassign to me" : "Claim"}
            </Button>
          ) : null}
          {assignedToId ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(() =>
                  assignSupportConversation({
                    conversationId,
                    assigneeId: null,
                  }),
                )
              }
            >
              Unassign
            </Button>
          ) : null}
        </div>
      </div>

      {/* Reply */}
      <div className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">Reply as Abonten Support</h3>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type a reply to the requester…"
          rows={4}
          maxLength={4000}
          className="w-full rounded border border-border bg-background p-2 text-sm"
        />
        <Button
          size="sm"
          disabled={pending || reply.trim().length === 0}
          onClick={() =>
            run(async () => {
              const res = await replySupportConversation({
                conversationId,
                body: reply.trim(),
              });
              if (res.status === 200) setReply("");
              return res;
            })
          }
        >
          Send reply
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Sending notifies the requester and re-opens the thread if it was
          closed.
        </p>
      </div>

      {/* Status */}
      <div className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">Status</h3>
        {status === "closed" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() =>
                setSupportConversationStatus({
                  conversationId,
                  status: "open",
                }),
              )
            }
          >
            Reopen
          </Button>
        ) : (
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              run(() =>
                setSupportConversationStatus({
                  conversationId,
                  status: "closed",
                }),
              )
            }
          >
            Close conversation
          </Button>
        )}
      </div>

      {/* Internal note */}
      <div className="space-y-2 border-t border-border pt-3">
        <h3 className="text-sm font-semibold">Add internal note</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Internal only — the requester never sees this."
          rows={2}
          maxLength={4000}
          className="w-full rounded border border-border bg-background p-2 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || note.trim().length === 0}
          onClick={() =>
            run(async () => {
              const res = await addSupportNote({
                targetType: "support_conversation",
                targetId: conversationId,
                body: note.trim(),
              });
              if (res.status === 200) setNote("");
              return res;
            })
          }
        >
          Save note
        </Button>
      </div>
    </Card>
  );
}
