"use client";

import { cn } from "@/components/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { OutboxMessage } from "@/messaging/hooks/useMessageOutbox";
import { clockTime } from "@abonten/core/messagingThread";
import type { MessageRow } from "@abonten/types/messagingType";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  MoreHorizontal,
} from "lucide-react";
import { ChatImageThumb } from "./ChatImageThumb";

type Props = {
  message: MessageRow;
  pending?: OutboxMessage;
  isMine: boolean;
  seen: boolean;
  onReply: (m: MessageRow) => void;
  onEdit: (m: MessageRow) => void;
  onDelete: (m: MessageRow) => void;
  onRetry: (clientGeneratedId: string) => void;
  canEdit: boolean;
};

function ReplyQuote({ reply }: { reply: NonNullable<MessageRow["reply_to"]> }) {
  const label = reply.deleted_at
    ? "Deleted message"
    : reply.message_type === "image"
      ? "Photo"
      : (reply.content ?? "Message");
  return (
    <div className="mb-1 border-l-2 border-primary/60 pl-2 text-xs opacity-80">
      <span className="line-clamp-2">{label}</span>
    </div>
  );
}

function Ticks({
  pending,
  seen,
  onRetry,
}: {
  pending?: OutboxMessage;
  seen: boolean;
  onRetry: () => void;
}) {
  if (pending?.status === "failed") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1 text-destructive"
      >
        <AlertCircle className="h-3 w-3" />
        <span className="text-[11px] font-semibold">Retry</span>
      </button>
    );
  }
  if (pending?.status === "sending") {
    return <Clock className="h-3 w-3 opacity-70" />;
  }
  return seen ? (
    <CheckCheck className="h-3.5 w-3.5 text-sky-400" />
  ) : (
    <Check className="h-3.5 w-3.5 opacity-70" />
  );
}

export function MessageBubble({
  message,
  pending,
  isMine,
  seen,
  onReply,
  onEdit,
  onDelete,
  onRetry,
  canEdit,
}: Props) {
  const deleted = !!message.deleted_at;
  const hasImages =
    message.message_type === "image" &&
    (message.attachments.length > 0 ||
      (pending?.localPreviewUrls.length ?? 0) > 0);
  const actionable = !deleted && !pending;

  return (
    <div
      className={cn(
        "group flex px-3 py-0.5",
        isMine ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "flex items-end gap-1",
          isMine ? "flex-row" : "flex-row-reverse",
        )}
      >
        {actionable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Message actions"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition hover:bg-accent focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={isMine ? "end" : "start"}
              className="w-32"
            >
              <DropdownMenuItem onSelect={() => onReply(message)}>
                Reply
              </DropdownMenuItem>
              {isMine && canEdit ? (
                <DropdownMenuItem onSelect={() => onEdit(message)}>
                  Edit
                </DropdownMenuItem>
              ) : null}
              {isMine ? (
                <DropdownMenuItem
                  onSelect={() => onDelete(message)}
                  className="text-destructive"
                >
                  Delete
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <div
          className={cn(
            "max-w-[min(75%,32rem)] rounded-2xl px-3 py-2 text-sm",
            isMine
              ? "rounded-br-sm bg-primary text-primary-foreground"
              : "rounded-bl-sm border bg-card",
          )}
        >
          {message.reply_to ? <ReplyQuote reply={message.reply_to} /> : null}

          {deleted ? (
            <span
              className={cn(
                "italic",
                isMine ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              This message was deleted
            </span>
          ) : (
            <>
              {hasImages ? (
                <div className="flex flex-col gap-1.5">
                  {pending && pending.localPreviewUrls.length > 0
                    ? pending.localPreviewUrls.map((u) => (
                        <ChatImageThumb key={u} localUrl={u} />
                      ))
                    : message.attachments.map((a) => (
                        <ChatImageThumb
                          key={a.id}
                          storagePath={a.storage_path}
                          width={a.width}
                          height={a.height}
                        />
                      ))}
                </div>
              ) : null}
              {message.content ? (
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words",
                    hasImages && "mt-1.5",
                  )}
                >
                  {message.content}
                </p>
              ) : null}
            </>
          )}

          <div className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-80">
            {message.edited_at && !deleted ? <span>edited</span> : null}
            <span>{clockTime(message.created_at)}</span>
            {isMine && !deleted ? (
              <Ticks
                pending={pending}
                seen={seen}
                onRetry={() =>
                  onRetry(message.client_generated_id ?? message.id)
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
