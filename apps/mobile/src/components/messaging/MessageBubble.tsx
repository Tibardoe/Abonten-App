import { clockTime } from "@/features/messaging/messagingTime";
import type { OutboxMessage } from "@/features/messaging/useMessageOutbox";
import type { MessageRow } from "@abonten/api-client";
import { AppText, Icon } from "@abonten/ui-native";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { ChatImage } from "./ChatImage";

type Props = {
  message: MessageRow;
  pending?: OutboxMessage;
  isMine: boolean;
  isGroupStart: boolean;
  // For my own messages: the other side has read at least up to this message.
  seen: boolean;
  onPressImage: (uri: string) => void;
  onLongPress: (message: MessageRow) => void;
  onRetry: (clientGeneratedId: string) => void;
};

function ReplyQuote({ reply }: { reply: NonNullable<MessageRow["reply_to"]> }) {
  const label = reply.deleted_at
    ? "Deleted message"
    : reply.message_type === "image"
      ? "Photo"
      : (reply.content ?? "Message");
  return (
    <View className="mb-1 border-l-2 border-primary/60 pl-2">
      <AppText variant="caption" numberOfLines={2} className="opacity-80">
        {label}
      </AppText>
    </View>
  );
}

function StatusTicks({
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
      <Pressable
        onPress={onRetry}
        hitSlop={8}
        className="flex-row items-center gap-1"
      >
        <Icon name="alert-circle" size={13} tone="destructive" />
        <AppText variant="caption" tone="error" className="font-semibold">
          Tap to retry
        </AppText>
      </Pressable>
    );
  }
  if (pending?.status === "sending") {
    return <Icon name="time-outline" size={13} tone="muted" />;
  }
  return (
    <Icon
      name={seen ? "checkmark-done" : "checkmark"}
      size={14}
      tone={seen ? "primary" : "muted"}
    />
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  pending,
  isMine,
  isGroupStart,
  seen,
  onPressImage,
  onLongPress,
  onRetry,
}: Props) {
  const deleted = !!message.deleted_at;
  const hasImages =
    message.message_type === "image" &&
    (message.attachments.length > 0 ||
      (pending?.localPreviewUris.length ?? 0) > 0);
  const canActOn = isMine && !deleted && !pending;

  return (
    <View
      className={`px-3 ${isGroupStart ? "mt-2" : "mt-0.5"} ${
        isMine ? "items-end" : "items-start"
      }`}
    >
      <Pressable
        onLongPress={canActOn ? () => onLongPress(message) : undefined}
        delayLongPress={300}
        className={`max-w-[80%] rounded-2xl px-3 py-2 ${
          isMine
            ? "rounded-br-md bg-primary"
            : "rounded-bl-md border border-border bg-card"
        }`}
      >
        {message.reply_to ? <ReplyQuote reply={message.reply_to} /> : null}

        {deleted ? (
          <AppText
            variant="body"
            className={`italic ${isMine ? "text-primary-foreground/80" : "text-muted-foreground"}`}
          >
            This message was deleted
          </AppText>
        ) : (
          <>
            {hasImages ? (
              <View className="gap-1.5">
                {pending && pending.localPreviewUris.length > 0
                  ? pending.localPreviewUris.map((uri) => (
                      <ChatImage
                        key={uri}
                        localUri={uri}
                        onPress={onPressImage}
                      />
                    ))
                  : message.attachments.map((a) => (
                      <ChatImage
                        key={a.id}
                        storagePath={a.storage_path}
                        width={a.width}
                        height={a.height}
                        onPress={onPressImage}
                      />
                    ))}
              </View>
            ) : null}

            {message.content ? (
              <AppText
                variant="body"
                className={
                  isMine
                    ? `text-primary-foreground ${hasImages ? "mt-1.5" : ""}`
                    : hasImages
                      ? "mt-1.5"
                      : undefined
                }
              >
                {message.content}
              </AppText>
            ) : null}
          </>
        )}

        <View className="mt-1 flex-row items-center justify-end gap-1">
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
            <StatusTicks
              pending={pending}
              seen={seen}
              onRetry={() => onRetry(message.client_generated_id ?? message.id)}
            />
          ) : null}
        </View>
      </Pressable>
    </View>
  );
});
