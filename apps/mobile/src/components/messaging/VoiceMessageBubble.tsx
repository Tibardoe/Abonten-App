import { useVoiceBubblePlayer } from "@/features/messaging/useVoicePlayer";
import type { MessageRow } from "@abonten/api-client";
import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";

const BAR_COUNT = 22;
const BAR_W = 2.5;
const BAR_GAP = 2;
const WAVE_W = BAR_COUNT * BAR_W + (BAR_COUNT - 1) * BAR_GAP;

// Deterministic pseudo-waveform from the message id, so a given voice note
// always draws the same bars (we don't ship real per-sample amplitude data).
function seededBars(seed: string, n: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out.push(0.28 + (Math.abs(h) % 1000) / 1000 / 1.4); // 0.28 .. ~1.0
  }
  return out;
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Default export so MessageBubble can pull it in via React.lazy — this
// module (and its useVoicePlayer -> expo-audio dependency) must stay out of
// the synchronous route graph. See features/messaging/voiceSupport.ts.
export default function VoiceMessageBubble({
  message,
  isMine,
}: {
  message: MessageRow;
  isMine: boolean;
}) {
  const c = useThemeColors();
  const att = message.attachments[0];
  const player = useVoiceBubblePlayer(
    message.id,
    att?.storage_path,
    att?.duration_seconds ?? null,
  );
  const bars = useMemo(() => seededBars(message.id, BAR_COUNT), [message.id]);

  const fg = isMine ? c["primary-foreground"] : c.foreground;
  const trackDim = isMine ? "rgba(255,255,255,0.35)" : c.border;
  const played = isMine ? c["primary-foreground"] : c.primary;

  const shownSeconds =
    player.playing || player.positionSeconds > 0
      ? player.positionSeconds
      : player.durationSeconds;

  const a11y = player.loadFailed
    ? "Voice message failed to load"
    : `Voice message, ${clock(player.durationSeconds)}. ${
        player.playing ? "Pause" : "Play"
      }`;

  return (
    <View className="flex-row items-center gap-2.5 py-0.5">
      <Pressable
        onPress={player.toggle}
        disabled={!player.ready && !player.loadFailed}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
        style={{
          flexShrink: 0,
          backgroundColor: isMine ? "rgba(255,255,255,0.2)" : c.muted,
        }}
      >
        {player.loadFailed ? (
          <Icon
            name="alert-circle-outline"
            size={18}
            tone={isMine ? "inverse" : "destructive"}
          />
        ) : !player.ready ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <Icon
            name={player.playing ? "pause" : "play"}
            size={18}
            tone={isMine ? "inverse" : "foreground"}
          />
        )}
      </Pressable>

      <Pressable
        className="flex-row items-center"
        accessibilityRole="adjustable"
        accessibilityLabel="Seek voice message"
        onPress={(e) => {
          // Seek to the tapped fraction of the (fixed) waveform width.
          player.seekToFraction(e.nativeEvent.locationX / WAVE_W);
        }}
        style={{ width: WAVE_W, height: 28, gap: BAR_GAP }}
      >
        {bars.map((v, i) => {
          const filled = i / BAR_COUNT <= player.progress;
          return (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static waveform
              key={i}
              style={{
                width: BAR_W,
                borderRadius: 2,
                height: Math.max(4, v * 24),
                backgroundColor: filled ? played : trackDim,
              }}
            />
          );
        })}
      </Pressable>

      <AppText
        variant="caption"
        numberOfLines={1}
        style={{
          flexShrink: 0,
          minWidth: 34,
          textAlign: "right",
          color: isMine ? "rgba(255,255,255,0.75)" : c["muted-foreground"],
        }}
      >
        {clock(shownSeconds)}
      </AppText>
    </View>
  );
}
