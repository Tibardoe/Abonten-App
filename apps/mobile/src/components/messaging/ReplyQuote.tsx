import { useAttachmentUrl } from "@/features/messaging/useAttachmentUrl";
import type { MessageReplyPreview } from "@abonten/types/messagingType";
import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { Pressable, View, useWindowDimensions } from "react-native";

// The quoted "replying to …" panel shown inside a message bubble and cloned
// into the contextual-menu preview. Modelled on WhatsApp's reply quote
// (spec §11–12): a rounded inset panel with a coloured leading rail, a
// bright accent title, the referenced text/label under it, and — for a
// photo or video — a real thumbnail on the trailing edge. Compact enough
// never to dominate the reply itself.

// The quote panel's height, and the side of its square thumbnail. One
// constant so the two can never drift apart (the thumb must have a DEFINITE
// height — see the note where it is rendered).
const QUOTE_H = 46;

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function MiniWave({ tint }: { tint: string }) {
  const bars = [5, 10, 15, 8, 13, 6, 11];
  return (
    <View className="flex-row items-end" style={{ gap: 2, height: 15 }}>
      {bars.map((h, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
          key={i}
          style={{
            width: 2.5,
            borderRadius: 2,
            height: h,
            backgroundColor: tint,
          }}
        />
      ))}
    </View>
  );
}

export function ReplyQuote({
  reply,
  onPress,
  onPrimary = false,
}: {
  reply: MessageReplyPreview;
  onPress?: () => void;
  /** Rendered inside an own (primary-coloured) bubble — lighten rail/text. */
  onPrimary?: boolean;
}) {
  const c = useThemeColors();
  const { width: screenW } = useWindowDimensions();
  const deleted = !!reply.deleted_at;
  const isImage = reply.message_type === "image";
  const isAudio = reply.message_type === "audio";
  const isVideo =
    reply.message_type === "file" &&
    !!reply.attachment_mime?.startsWith("video/");
  const isFile = reply.message_type === "file" && !isVideo;
  const thumb = useAttachmentUrl(
    isImage || isVideo ? (reply.attachment_path ?? undefined) : undefined,
  );
  const durLabel =
    reply.duration_seconds != null ? mmss(reply.duration_seconds) : null;

  const rail = onPrimary ? "rgba(255,255,255,0.75)" : c.primary;
  const surface = onPrimary ? "rgba(255,255,255,0.16)" : c.accent;
  const titleClass = onPrimary ? "text-primary-foreground" : "text-primary";
  const bodyClass = onPrimary
    ? "text-primary-foreground/85"
    : "text-muted-foreground";
  const glyphColor = onPrimary ? "rgba(255,255,255,0.92)" : c.primary;

  const kind = deleted
    ? "Deleted message"
    : isImage
      ? "Photo"
      : isVideo
        ? "Video"
        : isAudio
          ? "Voice message"
          : isFile
            ? "Attachment"
            : "Message";

  const showThumb = (isImage || isVideo) && !!thumb.data && !deleted;
  const inlineGlyph =
    !showThumb && !deleted
      ? isAudio
        ? "mic"
        : isVideo
          ? "videocam"
          : isFile
            ? "document"
            : isImage
              ? "image"
              : null
      : null;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={
        onPress ? `Replying to ${kind}. Tap to go to it.` : undefined
      }
      className="mb-1.5 flex-row items-stretch self-stretch overflow-hidden rounded-[10px]"
      // A bubble sizes to its widest child, and this panel's children are all
      // flex, so with no intrinsic width a SHORT reply ("T", "Slick") used to
      // squeeze the quote until its label truncated to "P…" / "Voice me…".
      // Claiming a minimum makes the bubble open up to fit the quote instead.
      // Screen-relative rather than a fixed number so it holds on small and
      // large phones; the ceiling keeps it inside the bubble's own max-w-[85%]
      // (85% of the screen, less this panel's horizontal padding) on tablets.
      style={{
        backgroundColor: surface,
        minHeight: 44,
        minWidth: Math.min(screenW * 0.55, screenW * 0.85 - 32),
      }}
    >
      <View style={{ width: 4, backgroundColor: rail }} />

      <View className="flex-1 justify-center gap-[3px] py-1.5 pl-2.5 pr-2">
        <View className="flex-row items-center gap-1.5">
          {inlineGlyph ? (
            <Icon name={inlineGlyph} size={13} color={glyphColor} />
          ) : null}
          <AppText
            numberOfLines={1}
            className={`flex-1 text-[13px] font-semibold leading-[16px] ${titleClass}`}
          >
            {kind}
            {durLabel ? ` · ${durLabel}` : ""}
          </AppText>
        </View>

        {isAudio && !deleted ? (
          <MiniWave tint={glyphColor} />
        ) : (isImage || isVideo || isFile) && !deleted ? null : (
          <AppText
            numberOfLines={2}
            className={`text-[13.5px] leading-[18px] ${bodyClass}`}
          >
            {reply.content ?? "Message"}
          </AppText>
        )}
      </View>

      {showThumb ? (
        <View
          // A DEFINITE square, deliberately not `alignSelf: "stretch"` with a
          // `height: "100%"` child: inside this auto-height row that percentage
          // resolves against an undefined height, so expo-image fell back to
          // the photo's intrinsic size and stretched the whole quote panel to
          // the full height of the image. It only ever showed once a signed
          // thumbnail URL actually resolved, which is why it survived review.
          style={{
            width: QUOTE_H,
            height: QUOTE_H,
            alignSelf: "center",
            backgroundColor: "rgba(0,0,0,0.06)",
          }}
        >
          <Image
            source={{ uri: thumb.data as string }}
            style={{ width: QUOTE_H, height: QUOTE_H }}
            contentFit="cover"
          />
          {isVideo ? (
            <View className="absolute inset-0 items-center justify-center">
              <View
                className="items-center justify-center rounded-full"
                style={{
                  width: 20,
                  height: 20,
                  backgroundColor: "rgba(0,0,0,0.5)",
                }}
              >
                <Icon name="play" size={11} color="#fff" />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
