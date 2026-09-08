import {
  classifyEmojiOnly,
  emojiOnlyFontSize,
} from "@/features/messaging/emojiOnly";
import { clockTime } from "@/features/messaging/messagingTime";
import type { MessageRow } from "@abonten/api-client";
import { AppText, Icon } from "@abonten/ui-native";
import { View } from "react-native";
import { ChatImage } from "../ChatImage";
import { FileAttachmentCard } from "../FileAttachmentCard";
import { ReplyQuote } from "../ReplyQuote";

// A gesture-free, playback-free clone of a message bubble, shown "lifted" in
// the contextual overlay (spec §3–4). Mirrors MessageBubble's shape/colour so
// the transition reads as the same object rising out of the thread. It shows
// the bubble ONLY — the reaction pills stay on the real bubble underneath so
// the clone's height matches the measured anchor exactly (no menu overlap).

function AudioPreview({ isMine }: { isMine: boolean }) {
  return (
    <View
      className="flex-row items-center gap-2 py-1"
      style={{ minWidth: 168 }}
    >
      <Icon name="mic" size={18} tone={isMine ? "inverse" : "muted"} />
      <View className="flex-row items-center" style={{ gap: 2 }}>
        {Array.from({ length: 14 }).map((_, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: static decorative waveform
            key={i}
            style={{
              width: 2.5,
              borderRadius: 2,
              height: 6 + ((i * 7) % 16),
              backgroundColor: isMine
                ? "rgba(255,255,255,0.55)"
                : "rgba(0,0,0,0.25)",
            }}
          />
        ))}
      </View>
      <AppText
        variant="caption"
        className={isMine ? "text-primary-foreground/80" : undefined}
      >
        Voice message
      </AppText>
    </View>
  );
}

const noop = () => {};

export function MessagePreviewCard({
  message,
  isMine,
  seen = false,
}: {
  message: MessageRow;
  isMine: boolean;
  /** Mirrors the bubble's read state so the clone shows the same tick. */
  seen?: boolean;
}) {
  const deleted = !!message.deleted_at;
  const isAudio = message.message_type === "audio";
  const isImage =
    message.message_type === "image" && message.attachments.length > 0;
  const isFile =
    message.message_type === "file" && message.attachments.length > 0;

  // Mirror MessageBubble: an emoji-only message lifts out chrome-free.
  const emoji =
    !deleted && !message.reply_to && message.message_type === "text"
      ? classifyEmojiOnly(message.content)
      : { emojiOnly: false as const, count: 0 };
  if (emoji.emojiOnly) {
    return (
      <View className={isMine ? "items-end" : "items-start"}>
        <AppText
          style={{
            fontSize: emojiOnlyFontSize(emoji.count),
            lineHeight: Math.round(emojiOnlyFontSize(emoji.count) * 1.18),
          }}
        >
          {message.content}
        </AppText>
      </View>
    );
  }

  return (
    <View className={isMine ? "items-end" : "items-start"}>
      <View
        className={`min-w-[52px] max-w-full rounded-[18px] px-3.5 py-2 ${
          isMine
            ? "rounded-br-[5px] bg-primary"
            : "rounded-bl-[5px] bg-secondary"
        }`}
      >
        {message.reply_to ? (
          <ReplyQuote reply={message.reply_to} onPrimary={isMine} />
        ) : null}

        {deleted ? (
          <AppText
            variant="body"
            className={`italic ${isMine ? "text-primary-foreground/80" : "text-muted-foreground"}`}
          >
            This message was deleted
          </AppText>
        ) : isAudio ? (
          <AudioPreview isMine={isMine} />
        ) : isImage ? (
          // The SAME component the bubble uses, so the lifted clone has
          // byte-identical geometry (ChatImage's fittedSize) and hits the
          // already-warm signed-URL cache -- the picture does not resize,
          // reload or flash as the message lifts out. The overlay renders
          // this tree with pointerEvents="none", so its Pressable is inert.
          <View className="gap-1.5">
            {message.attachments.map((a) => (
              <ChatImage
                key={a.id}
                storagePath={a.storage_path}
                width={a.width}
                height={a.height}
                onPress={noop}
              />
            ))}
          </View>
        ) : isFile ? (
          <View className="gap-1.5">
            {message.attachments.map((a) => (
              <FileAttachmentCard key={a.id} attachment={a} isMine={isMine} />
            ))}
          </View>
        ) : null}

        {message.content && !deleted ? (
          <AppText
            variant="body"
            className={`text-[16px] leading-[22px] ${
              isMine ? "text-primary-foreground" : ""
            }`}
          >
            {message.content}
          </AppText>
        ) : null}

        {/* Same footer the bubble draws, ticks included. Dropping them made
            the lifted clone a few px narrower than the message it replaced,
            so the bubble visibly re-flowed on long-press and again on
            dismiss. */}
        <View className="mt-0.5 flex-row items-center justify-end gap-1">
          {message.edited_at && !deleted ? (
            <AppText
              variant="caption"
              className={isMine ? "text-primary-foreground/70" : undefined}
            >
              edited
            </AppText>
          ) : null}
          <AppText
            variant="caption"
            className={isMine ? "text-primary-foreground/70" : undefined}
          >
            {clockTime(message.created_at)}
          </AppText>
          {isMine && !deleted ? (
            <Icon
              name={seen ? "checkmark-done" : "checkmark"}
              size={14}
              tone={seen ? "primary" : "muted"}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
