"use client";

import { cn } from "@/components/lib/utils";
import { useToast } from "@/hooks/useToast";
import {
  type StagedAttachment,
  isAcceptableChatImage,
  stageChatImage,
  uploadChatAttachment,
} from "@/messaging/hooks/attachments";
import type { OutboxDraft } from "@/messaging/hooks/useMessageOutbox";
import { MESSAGE_MAX_LENGTH } from "@abonten/types/messagingType";
import type { MessageRow } from "@abonten/types/messagingType";
import { Loader2, Paperclip, SendHorizonal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_ATTACHMENTS = 4;

export function Composer({
  conversationId,
  replyingTo,
  onCancelReply,
  onSend,
  onTyping,
  disabled,
  disabledReason,
}: {
  conversationId: string;
  replyingTo: MessageRow | null;
  onCancelReply: () => void;
  onSend: (draft: OutboxDraft) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Every object URL this composer has minted, so they can all be released
  // when it unmounts (leaving the thread) without revoking ones still on
  // screen — a sent image's preview keeps rendering in its pending bubble.
  const mintedUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = mintedUrls.current;
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, []);

  function autoGrow(ta: HTMLTextAreaElement) {
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }

  const canSend =
    !disabled && !uploading && (text.trim().length > 0 || staged.length > 0);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const f of files.slice(0, MAX_ATTACHMENTS - staged.length)) {
      const reason = isAcceptableChatImage(f);
      if (reason) {
        toast.error(reason);
        continue;
      }
      const s = await stageChatImage(f);
      mintedUrls.current.add(s.previewUrl);
      setStaged((prev) => [...prev, s]);
    }
  }

  async function handleSend() {
    if (!canSend) return;
    const body = text.trim();
    const toUpload = staged;

    setText("");
    setStaged([]);
    onTyping(false);
    if (taRef.current) taRef.current.style.height = "auto";

    let attachments: OutboxDraft["attachments"] = [];
    const localPreviewUrls = toUpload.map((s) => s.previewUrl);
    if (toUpload.length > 0) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          toUpload.map((s) => uploadChatAttachment(conversationId, s)),
        );
      } catch {
        setUploading(false);
        setText(body);
        setStaged(toUpload);
        toast.error("Your image couldn't be uploaded.");
        return;
      }
      setUploading(false);
    }

    onSend({
      content: body.length > 0 ? body : null,
      replyToMessageId: replyingTo?.id ?? null,
      attachments,
      localPreviewUrls,
    });
    onCancelReply();
  }

  if (disabled) {
    return (
      <div className="border-t bg-card px-4 py-4 text-center text-sm text-muted-foreground">
        {disabledReason ?? "You can't send messages in this conversation."}
      </div>
    );
  }

  return (
    <div className="border-t bg-card">
      {replyingTo ? (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          <div className="min-w-0 flex-1">
            <span className="font-semibold">Replying to </span>
            <span className="text-muted-foreground">
              {replyingTo.deleted_at
                ? "Deleted message"
                : replyingTo.message_type === "image"
                  ? "Photo"
                  : (replyingTo.content ?? "Message")}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {staged.length > 0 ? (
        <div className="flex gap-2 px-3 pt-2">
          {staged.map((s, i) => (
            <div key={s.previewUrl} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.previewUrl}
                alt="Selected attachment"
                className="h-14 w-14 rounded-md object-cover"
              />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => {
                  URL.revokeObjectURL(s.previewUrl);
                  setStaged((prev) => prev.filter((_, idx) => idx !== i));
                }}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2 px-3 py-2">
        <button
          type="button"
          aria-label="Attach image"
          disabled={staged.length >= MAX_ATTACHMENTS}
          onClick={() => fileRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent disabled:opacity-40"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={onPick}
        />

        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping(e.target.value.trim().length > 0);
            autoGrow(e.currentTarget);
          }}
          onBlur={() => onTyping(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          rows={1}
          maxLength={MESSAGE_MAX_LENGTH}
          placeholder="Message"
          className="max-h-40 flex-1 resize-none rounded-2xl border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        <button
          type="button"
          aria-label="Send message"
          disabled={!canSend}
          onClick={() => void handleSend()}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition",
            !canSend && "opacity-40",
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
