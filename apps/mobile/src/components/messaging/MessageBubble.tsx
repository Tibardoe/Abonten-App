import {
  classifyEmojiOnly,
  emojiOnlyFontSize,
} from "@/features/messaging/emojiOnly";
import { clockTime } from "@/features/messaging/messagingTime";
import type { OutboxMessage } from "@/features/messaging/useMessageOutbox";
import { VOICE_SUPPORTED } from "@/features/messaging/voiceSupport";
import { hapticLight, hapticMedium } from "@/lib/haptics";
import type { MessageRow } from "@abonten/api-client";
import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Suspense, lazy, memo, useCallback, useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { ChatImage } from "./ChatImage";
import { FileAttachmentCard } from "./FileAttachmentCard";
import { MessageReactions } from "./MessageReactions";
import { ReplyQuote } from "./ReplyQuote";
import type VoiceMessageBubbleComponent from "./VoiceMessageBubble";
import type { Rect } from "./contextMenu/menuPlacement";
import { useAnchorMeasure } from "./contextMenu/useAnchorMeasure";

// Loaded only when the native audio module is present — VoiceMessageBubble
// pulls in `expo-audio` via useVoicePlayer. The `require` inside the lazy
// factory runs only when this actually renders (never, without a rebuild),
// so `expo-audio` never enters the synchronous route graph. `import type`
// is erased at compile time.
const LazyVoiceMessageBubble = lazy(async () => ({
  default: (
    require("./VoiceMessageBubble") as {
      default: typeof VoiceMessageBubbleComponent;
    }
  ).default,
}));

// Swipe-to-reply: how far the finger travels for a release to fire Reply,
// and the hard cap the bubble can be dragged (with resistance past it).
// Kept short so it never feels like a chore (spec §8, "no huge swipe").
const REPLY_THRESHOLD = 44;
const REPLY_MAX_DRAG = 64;

type Props = {
  message: MessageRow;
  pending?: OutboxMessage;
  isMine: boolean;
  isGroupStart: boolean;
  // For my own messages: the other side has read at least up to this message.
  seen: boolean;
  /** Briefly wash the bubble — used when a reply reference jumps to it. */
  highlighted?: boolean;
  /** Its lifted clone is showing in the action overlay — hide the original
   *  so there's no ghost behind the lift-out (iMessage does the same). */
  hiddenForMenu?: boolean;
  onPressImage: (uri: string) => void;
  /** Long-press → contextual action overlay. `rect` is the bubble's window frame. */
  onLongPress: (message: MessageRow, rect: Rect) => void;
  /** Swipe-to-reply, or the overlay's Reply action. */
  onReply: (message: MessageRow) => void;
  /** Tap the "replying to" quote → jump to the referenced message. */
  onReplyQuotePress?: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onRetry: (clientGeneratedId: string) => void;
};

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

// Exposed to assistive tech as the accessible equivalent of a long press.
// Deliberately the standard "longpress" action rather than "activate": VoiceOver
// / TalkBack fire "activate" on a double tap, which must stay free to open an
// image bubble's viewer.
const A11Y_ACTIONS = [{ name: "longpress", label: "Message actions" }];

export const MessageBubble = memo(function MessageBubble({
  message,
  pending,
  isMine,
  isGroupStart,
  seen,
  highlighted,
  hiddenForMenu,
  onPressImage,
  onLongPress,
  onReply,
  onReplyQuotePress,
  onToggleReaction,
  onRetry,
}: Props) {
  const c = useThemeColors();
  const deleted = !!message.deleted_at;
  const isAudio =
    message.message_type === "audio" || pending?.messageType === "audio";
  const hasImages =
    message.message_type === "image" &&
    (message.attachments.length > 0 ||
      (pending?.localPreviewUris.length ?? 0) > 0);
  const isFile =
    message.message_type === "file" && message.attachments.length > 0;

  // A message that is nothing but emoji renders large and chrome-free
  // (spec §13) — but only plain text with no reply quote / attachments.
  const emoji =
    !deleted &&
    !message.reply_to &&
    message.message_type === "text" &&
    !hasImages &&
    !isFile &&
    !isAudio
      ? classifyEmojiOnly(message.content)
      : { emojiOnly: false as const, count: 0 };

  // Long-press / swipe are available for any real (not optimistic), not
  // soft-deleted message — Reply / Copy / React apply to incoming messages
  // too; Edit / Delete are filtered by ownership inside the overlay.
  const interactive = !pending && !deleted;

  const { ref: bubbleRef, measure } = useAnchorMeasure();

  const tx = useSharedValue(0);
  const pressScale = useSharedValue(1);
  const hl = useSharedValue(0);
  const replyArmed = useSharedValue(0);

  useEffect(() => {
    if (highlighted) {
      hl.value = withSequence(
        withTiming(1, { duration: 180 }),
        withDelay(1000, withTiming(0, { duration: 500 })),
      );
    }
  }, [highlighted, hl]);

  const fireLongPress = useCallback(() => {
    hapticMedium();
    measure().then((rect) => {
      if (rect) onLongPress(message, rect);
    });
  }, [measure, onLongPress, message]);

  const fireReply = useCallback(() => onReply(message), [onReply, message]);

  // Screen-reader route into the same contextual menu the long press opens.
  const onA11yAction = useCallback(
    (e: { nativeEvent: { actionName: string } }) => {
      if (e.nativeEvent.actionName === "longpress") fireLongPress();
    },
    [fireLongPress],
  );

  // What VoiceOver / TalkBack reads for the bubble. Attachment-only messages
  // have no text, so name the kind instead of announcing an empty bubble.
  const a11yLabel = deleted
    ? "Deleted message"
    : `${isMine ? "You" : "Them"}: ${
        message.content ||
        (isAudio
          ? "Voice message"
          : hasImages
            ? "Photo"
            : isFile
              ? "Attachment"
              : "Message")
      }, ${clockTime(message.created_at)}`;

  const longPress = Gesture.LongPress()
    .minDuration(260)
    .maxDistance(18)
    .enabled(interactive)
    .onBegin(() => {
      pressScale.value = withTiming(0.98, { duration: 160 });
    })
    .onStart(() => {
      runOnJS(fireLongPress)();
    })
    .onFinalize(() => {
      pressScale.value = withTiming(1, { duration: 160 });
    });

  // Reply direction: incoming bubbles drag right, own bubbles drag left —
  // toward the centre of the screen, like every mature messenger.
  const pan = Gesture.Pan()
    .enabled(interactive)
    .activeOffsetX(isMine ? [-14, 10000] : [-10000, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const raw = e.translationX;
      // Only track motion in the reply direction; clamp with resistance.
      const dir = isMine ? Math.min(0, raw) : Math.max(0, raw);
      const mag = Math.min(Math.abs(dir), REPLY_MAX_DRAG);
      const resisted =
        mag <= REPLY_THRESHOLD
          ? mag
          : REPLY_THRESHOLD + (mag - REPLY_THRESHOLD) * 0.35;
      tx.value = isMine ? -resisted : resisted;
      if (Math.abs(tx.value) >= REPLY_THRESHOLD && replyArmed.value === 0) {
        replyArmed.value = 1;
        runOnJS(hapticLight)();
      } else if (
        Math.abs(tx.value) < REPLY_THRESHOLD &&
        replyArmed.value === 1
      ) {
        replyArmed.value = 0;
      }
    })
    .onEnd(() => {
      if (Math.abs(tx.value) >= REPLY_THRESHOLD) {
        runOnJS(fireReply)();
      }
      replyArmed.value = 0;
      tx.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const gesture = Gesture.Race(pan, longPress);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { scale: pressScale.value }],
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      hl.value,
      [0, 1],
      ["rgba(0,0,0,0)", c.accent],
    ),
  }));

  const replyIconStyle = useAnimatedStyle(() => {
    const p = Math.min(Math.abs(tx.value) / REPLY_THRESHOLD, 1);
    return {
      opacity: p,
      transform: [{ scale: 0.6 + p * 0.5 }],
    };
  });

  const bubbleBody = (
    <>
      {message.reply_to ? (
        <ReplyQuote
          reply={message.reply_to}
          onPrimary={isMine}
          onPress={
            onReplyQuotePress
              ? () => onReplyQuotePress(message.reply_to?.id ?? "")
              : undefined
          }
        />
      ) : null}

      {deleted ? (
        <AppText
          variant="body"
          className={`italic ${isMine ? "text-primary-foreground/80" : "text-muted-foreground"}`}
        >
          This message was deleted
        </AppText>
      ) : isAudio ? (
        pending ? (
          <View
            className="flex-row items-center gap-2 py-1"
            style={{ minWidth: 168 }}
          >
            <Icon
              name="mic-outline"
              size={18}
              tone={isMine ? "inverse" : "muted"}
            />
            <AppText
              variant="caption"
              className={isMine ? "text-primary-foreground/80" : undefined}
            >
              Voice message
            </AppText>
            <ActivityIndicator size="small" />
          </View>
        ) : VOICE_SUPPORTED ? (
          <Suspense
            fallback={
              <View
                className="flex-row items-center gap-2 py-1"
                style={{ minWidth: 168 }}
              >
                <Icon
                  name="mic-outline"
                  size={18}
                  tone={isMine ? "inverse" : "muted"}
                />
                <ActivityIndicator size="small" />
              </View>
            }
          >
            <LazyVoiceMessageBubble message={message} isMine={isMine} />
          </Suspense>
        ) : (
          <View
            className="flex-row items-center gap-2 py-1"
            style={{ minWidth: 180 }}
          >
            <Icon
              name="mic-outline"
              size={18}
              tone={isMine ? "inverse" : "muted"}
            />
            <AppText
              variant="caption"
              className={isMine ? "text-primary-foreground/80" : undefined}
            >
              Voice message · update the app to play
            </AppText>
          </View>
        )
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
          ) : isFile ? (
            <View className="gap-1.5">
              {message.attachments.map((a) => (
                <FileAttachmentCard key={a.id} attachment={a} isMine={isMine} />
              ))}
            </View>
          ) : null}

          {message.content ? (
            <AppText
              variant="body"
              className={`text-[16px] leading-[22px] ${
                isMine ? "text-primary-foreground " : ""
              }${hasImages ? "mt-1.5" : ""}`}
            >
              {message.content}
            </AppText>
          ) : null}
        </>
      )}

      {/*
        flex-wrap: the failed-send state replaces the tick with a "Tap to
        retry" action, which on a short bubble is wider than the space left
        beside the timestamp — without wrapping it clipped to "Tap to", hiding
        the one instruction that recovers the message.
      */}
      <View className="mt-0.5 flex-row flex-wrap items-center justify-end gap-1">
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
    </>
  );

  const emojiBody = (
    <View className={isMine ? "items-end" : "items-start"}>
      <AppText
        style={{
          fontSize: emojiOnlyFontSize(emoji.count),
          lineHeight: Math.round(emojiOnlyFontSize(emoji.count) * 1.18),
        }}
      >
        {message.content}
      </AppText>
      {/* Same wrap reason as the standard bubble footer above. */}
      <View className="mt-0.5 flex-row flex-wrap items-center gap-1 px-1">
        <AppText variant="caption" tone="muted">
          {clockTime(message.created_at)}
        </AppText>
        {isMine ? (
          <StatusTicks
            pending={pending}
            seen={seen}
            onRetry={() => onRetry(message.client_generated_id ?? message.id)}
          />
        ) : null}
      </View>
    </View>
  );

  // iMessage bubble geometry: continuous ~18px corners, a small 5px "tail"
  // corner on the sender's side, ~14/8 padding, and — for incoming — a flat
  // grey fill with NO border and NO shadow.
  const bubbleClassName = emoji.emojiOnly
    ? "max-w-[88%] px-1 py-0.5"
    : `min-w-[52px] max-w-[85%] rounded-[18px] px-3.5 py-2 ${
        isMine ? "rounded-br-[5px] bg-primary" : "rounded-bl-[5px] bg-secondary"
      }`;

  const body = emoji.emojiOnly ? emojiBody : bubbleBody;

  return (
    <Animated.View
      style={highlightStyle}
      className={`px-3 ${isGroupStart ? "mt-3" : "mt-[2px]"} ${
        isMine ? "items-end" : "items-start"
      }`}
    >
      {/* swipe-to-reply arrow, revealed from the leading edge */}
      <Animated.View
        pointerEvents="none"
        style={[
          replyIconStyle,
          {
            position: "absolute",
            top: 6,
            [isMine ? "right" : "left"]: 6,
          },
        ]}
      >
        <View
          className="h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: c.accent }}
        >
          <Icon name="arrow-undo" size={15} tone="primary" />
        </View>
      </Animated.View>

      {interactive ? (
        <GestureDetector gesture={gesture}>
          <Animated.View
            ref={bubbleRef}
            // A screen reader can't perform a gesture-handler long press, and
            // long press is the only route to Reply / React / Copy / Delete —
            // so expose them as an explicit accessibility action too.
            accessible
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityHint="Reply, react, and more are available as actions"
            accessibilityActions={A11Y_ACTIONS}
            onAccessibilityAction={onA11yAction}
            style={[bubbleStyle, hiddenForMenu ? { opacity: 0 } : null]}
            className={bubbleClassName}
          >
            {body}
          </Animated.View>
        </GestureDetector>
      ) : (
        <View
          style={hiddenForMenu ? { opacity: 0 } : undefined}
          className={bubbleClassName}
        >
          {body}
        </View>
      )}

      {message.reactions && message.reactions.length > 0 ? (
        <MessageReactions
          reactions={message.reactions}
          isMine={isMine}
          onToggle={(emoji) => onToggleReaction(message.id, emoji)}
        />
      ) : null}
    </Animated.View>
  );
});
