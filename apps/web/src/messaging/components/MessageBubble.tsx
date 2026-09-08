"use client";

import { cn } from "@/components/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAttachmentUrl } from "@/messaging/hooks/useAttachmentUrl";
import type { OutboxMessage } from "@/messaging/hooks/useMessageOutbox";
import { clockTime } from "@abonten/core/messagingThread";
import {
  MESSAGE_REACTION_EMOJIS,
  type MessageReactionSummary,
  type MessageRow,
} from "@abonten/types/messagingType";
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Mic,
  MoreHorizontal,
} from "lucide-react";
import { useState } from "react";
import { ChatImageThumb } from "./ChatImageThumb";

function VoiceAttachment({
  attachment,
}: {
  attachment: MessageRow["attachments"][number];
}) {
  const signed = useAttachmentUrl(attachment.storage_path);
  return (
    <div className="flex items-center gap-2 py-0.5">
      <Mic className="h-4 w-4 shrink-0 opacity-70" />
      {signed.data ? (
        // biome-ignore lint/a11y/useMediaCaption: user-generated voice note
        <audio controls src={signed.data} className="h-9 max-w-[16rem]" />
      ) : (
        <span className="text-xs opacity-70">
          {signed.isError
            ? "Voice message unavailable"
            : "Loading voice message…"}
        </span>
      )}
    </div>
  );
}

type Props = {
  message: MessageRow;
  pending?: OutboxMessage;
  isMine: boolean;
  seen: boolean;
  highlighted?: boolean;
  onReply: (m: MessageRow) => void;
  onEdit: (m: MessageRow) => void;
  onDelete: (m: MessageRow) => void;
  onRetry: (clientGeneratedId: string) => void;
  onReact: (messageId: string, emoji: string) => void;
  onReplyQuotePress?: (messageId: string) => void;
  canEdit: boolean;
};

function ReplyQuote({
  reply,
  onPress,
}: {
  reply: NonNullable<MessageRow["reply_to"]>;
  onPress?: () => void;
}) {
  const isVideo =
    reply.message_type === "file" &&
    !!reply.attachment_mime?.startsWith("video/");
  const dur =
    (reply.message_type === "audio" || isVideo) &&
    reply.duration_seconds != null
      ? ` · ${Math.floor(reply.duration_seconds / 60)}:${String(
          Math.round(reply.duration_seconds % 60),
        ).padStart(2, "0")}`
      : "";
  const label = reply.deleted_at
    ? "Deleted message"
    : reply.message_type === "image"
      ? "Photo"
      : isVideo
        ? `Video${dur}`
        : reply.message_type === "audio"
          ? `Voice message${dur}`
          : reply.message_type === "file"
            ? "Attachment"
            : (reply.content ?? "Message");
  const thumb =
    reply.message_type === "image" ? reply.attachment_path : undefined;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!onPress}
      className="mb-1 flex w-full items-center gap-2 border-l-2 border-primary/60 pl-2 text-left text-xs opacity-80 enabled:hover:opacity-100"
    >
      {thumb ? <ReplyThumb path={thumb} /> : null}
      <span className="line-clamp-2 flex-1">{label}</span>
    </button>
  );
}

function ReplyThumb({ path }: { path: string }) {
  const signed = useAttachmentUrl(path);
  if (!signed.data) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={signed.data}
      alt=""
      className="h-7 w-7 shrink-0 rounded object-cover"
    />
  );
}

function Reactions({
  reactions,
  isMine,
  onToggle,
}: {
  reactions: MessageReactionSummary[];
  isMine: boolean;
  onToggle: (emoji: string) => void;
}) {
  if (!reactions.length) return null;
  return (
    <div
      className={cn(
        "mt-1 flex flex-wrap gap-1",
        isMine ? "justify-end" : "justify-start",
      )}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onToggle(r.emoji)}
          aria-pressed={r.reacted_by_me}
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition",
            r.reacted_by_me
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card text-muted-foreground hover:bg-accent",
          )}
        >
          <span>{r.emoji}</span>
          {r.count > 1 ? (
            <span className="font-semibold">{r.count}</span>
          ) : null}
        </button>
      ))}
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
  highlighted,
  onReply,
  onEdit,
  onDelete,
  onRetry,
  onReact,
  onReplyQuotePress,
  canEdit,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const deleted = !!message.deleted_at;
  const hasImages =
    message.message_type === "image" &&
    (message.attachments.length > 0 ||
      (pending?.localPreviewUrls.length ?? 0) > 0);
  const isAudio =
    message.message_type === "audio" && message.attachments.length > 0;
  const actionable = !deleted && !pending;
  const canCopy = message.message_type === "text" && !!message.content;

  return (
    <div
      id={`msg-${message.id}`}
      className={cn(
        "group flex px-3 py-0.5 transition-colors",
        isMine ? "justify-end" : "justify-start",
        highlighted && "rounded-md bg-primary/10",
      )}
    >
      <div
        className={cn(
          "flex items-end gap-1",
          isMine ? "flex-row" : "flex-row-reverse",
        )}
      >
        {actionable ? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
              className="w-40"
            >
              <div className="flex justify-between gap-0.5 px-1 py-1">
                {MESSAGE_REACTION_EMOJIS.map((emoji) => {
                  const active = (message.reactions ?? []).some(
                    (r) => r.emoji === emoji && r.reacted_by_me,
                  );
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact(message.id, emoji);
                        setMenuOpen(false);
                      }}
                      aria-pressed={active}
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-full text-base transition hover:bg-accent",
                        active && "bg-accent",
                      )}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onReply(message)}>
                Reply
              </DropdownMenuItem>
              {canCopy ? (
                <DropdownMenuItem
                  onSelect={() => {
                    void navigator.clipboard?.writeText(message.content ?? "");
                  }}
                >
                  Copy
                </DropdownMenuItem>
              ) : null}
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

        <div className="flex flex-col">
          <div
            onContextMenu={
              actionable
                ? (e) => {
                    e.preventDefault();
                    setMenuOpen(true);
                  }
                : undefined
            }
            className={cn(
              "max-w-[min(75%,32rem)] rounded-2xl px-3 py-2 text-sm",
              isMine
                ? "rounded-br-sm bg-primary text-primary-foreground"
                : "rounded-bl-sm border bg-card",
            )}
          >
            {message.reply_to ? (
              <ReplyQuote
                reply={message.reply_to}
                onPress={
                  onReplyQuotePress && message.reply_to.id
                    ? () => onReplyQuotePress(message.reply_to?.id ?? "")
                    : undefined
                }
              />
            ) : null}

            {deleted ? (
              <span
                className={cn(
                  "italic",
                  isMine
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground",
                )}
              >
                This message was deleted
              </span>
            ) : isAudio ? (
              message.attachments.map((a) => (
                <VoiceAttachment key={a.id} attachment={a} />
              ))
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

          {!deleted && message.reactions && message.reactions.length > 0 ? (
            <Reactions
              reactions={message.reactions}
              isMine={isMine}
              onToggle={(emoji) => onReact(message.id, emoji)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
