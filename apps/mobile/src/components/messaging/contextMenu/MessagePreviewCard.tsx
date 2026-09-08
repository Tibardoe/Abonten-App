import {
  classifyEmojiOnly,
  emojiOnlyFontSize,
} from "@/features/messaging/emojiOnly";
import { clockTime } from "@/features/messaging/messagingTime";
import { useAttachmentUrl } from "@/features/messaging/useAttachmentUrl";
import type { MessageRow } from "@abonten/api-client";
import { AppText, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { View } from "react-native";
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

function ImagePreview({ message }: { message: MessageRow }) {
  const a = message.attachments[0];
  const signed = useAttachmentUrl(a?.storage_path);
  const ratio = a?.width && a?.height ? a.width / a.height : 1;
  return (
    <View
      style={{
        width: 200,
        aspectRatio: Math.min(Math.max(ratio, 0.6), 1.8),
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "rgba(0,0,0,0.06)",
      }}
    >
      {signed.data ? (
        <Image
          source={{ uri: signed.data }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      ) : null}
    </View>
  );
}

export function MessagePreviewCard({
  message,
  isMine,
}: {
  message: MessageRow;
  isMine: boolean;
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
          <ImagePreview message={message} />
        ) : isFile ? (
          <View
            className="flex-row items-center gap-2 py-1"
            style={{ minWidth: 168 }}
          >
            <Icon
              name="document"
              size={18}
              tone={isMine ? "inverse" : "muted"}
            />
            <AppText
              variant="caption"
              numberOfLines={1}
              className={isMine ? "text-primary-foreground/80" : undefined}
            >
              {message.attachments[0]?.file_name ?? "Attachment"}
            </AppText>
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

        <View className="mt-1 flex-row items-center justify-end">
          <AppText
            variant="caption"
            className={isMine ? "text-primary-foreground/70" : undefined}
          >
            {clockTime(message.created_at)}
          </AppText>
        </View>
      </View>
    </View>
  );
}
