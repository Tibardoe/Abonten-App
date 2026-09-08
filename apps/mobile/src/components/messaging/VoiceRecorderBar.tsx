import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";

// The composer row while a voice note is being recorded (task §6). Two
// states:
//   • holding  — red pulse + timer + live waveform + "slide to cancel"
//     hint. Releasing the mic sends; sliding left past the threshold
//     cancels; sliding up locks.
//   • locked   — hands-free: an explicit trash (cancel) and send button.

function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function Waveform({ samples, color }: { samples: number[]; color: string }) {
  return (
    <View className="flex-1 flex-row items-center justify-end gap-[2px]">
      {samples.slice(-40).map((v, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: rolling fixed-width meter
          key={i}
          style={{
            width: 2.5,
            borderRadius: 2,
            height: Math.max(3, v * 24),
            backgroundColor: color,
            opacity: 0.4 + v * 0.6,
          }}
        />
      ))}
    </View>
  );
}

export function VoiceRecorderBar({
  durationMs,
  samples,
  isLocked,
  cancelArmed,
  onCancel,
  onSend,
}: {
  durationMs: number;
  samples: number[];
  isLocked: boolean;
  cancelArmed: boolean;
  onCancel: () => void;
  onSend: () => void;
}) {
  const c = useThemeColors();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      className="flex-row items-center gap-2.5 px-3 py-2"
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Recording voice message, ${clock(durationMs)}`}
    >
      {/* Always tappable — the escape hatch if the hold gesture misbehaves. */}
      <Pressable
        onPress={onCancel}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
      >
        <Icon name="trash-outline" size={20} tone="destructive" />
      </Pressable>

      {!isLocked ? (
        <Animated.View
          style={{ opacity: pulse }}
          className="h-2.5 w-2.5 rounded-full bg-destructive"
        />
      ) : null}

      <AppText
        variant="caption"
        className="tabular-nums"
        style={{ minWidth: 38 }}
      >
        {clock(durationMs)}
      </AppText>

      <Waveform samples={samples} color={c.primary} />

      {isLocked ? (
        <Pressable
          onPress={onSend}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Send voice message"
          className="h-9 w-9 items-center justify-center rounded-full bg-primary active:opacity-80"
        >
          <Icon name="arrow-up" size={20} tone="inverse" />
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-1 pr-1">
          <Icon
            name="chevron-back"
            size={13}
            tone={cancelArmed ? "destructive" : "muted"}
          />
          <AppText
            variant="caption"
            tone={cancelArmed ? "error" : "muted"}
            className="font-medium"
          >
            {cancelArmed ? "Release to cancel" : "Slide to cancel"}
          </AppText>
        </View>
      )}
    </View>
  );
}
