import { AttachmentPermissionError } from "@/features/messaging/attachments";
import type { OutboxDraft } from "@/features/messaging/useMessageOutbox";
import { uploadVoiceNote, useVoiceRecorder } from "@/features/messaging/voice";
import { hapticLight } from "@/lib/haptics";
import { Icon, useToast } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import * as Linking from "expo-linking";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { VoiceRecorderBar } from "./VoiceRecorderBar";

const CANCEL_SLIDE = -80;
const LOCK_SLIDE = -70;
const LOCK_TRAVEL = 46; // px the lock glyph rises as the finger drags to lock

// The mic button + hold-to-record UI. Lazy-loaded by Composer only when the
// native audio module is present — this file is the composer's single
// `expo-audio` entry point.
//
// Interaction: press-and-hold the mic to record, release to send, drag left
// past a threshold to cancel, drag up to lock (hands-free). The recorder bar
// also always shows an explicit ✕ so a janky gesture can never trap the user
// in a recording state.

export default function VoiceComposer({
  conversationId,
  replyingTo,
  onSend,
  onCancelReply,
}: {
  conversationId: string;
  replyingTo: { id: string } | null;
  onSend: (draft: OutboxDraft) => void;
  onCancelReply: () => void;
}) {
  const toast = useToast();
  const c = useThemeColors();
  const rec = useVoiceRecorder();
  const recRef = useRef(rec);
  recRef.current = rec;

  const [cancelArmed, setCancelArmed] = useState(false);
  const [uploading, setUploading] = useState(false);

  const cancelArmedRef = useRef(false);
  cancelArmedRef.current = cancelArmed;
  const gestureHeldRef = useRef(false);

  // 0 → 1 as the finger drags from rest toward the lock threshold; drives the
  // floating lock affordance (WhatsApp-style) instead of a text hint.
  const lockProgress = useSharedValue(0);

  const finishAndSendVoice = useCallback(async () => {
    const r = recRef.current;
    if (r.phase !== "recording" && r.phase !== "locked") {
      void r.cancel();
      setCancelArmed(false);
      return;
    }
    const result = await r.stop();
    setCancelArmed(false);
    if (!result) return;
    setUploading(true);
    try {
      const descriptor = await uploadVoiceNote(conversationId, result);
      onSend({
        content: null,
        replyToMessageId: replyingTo?.id ?? null,
        attachments: [descriptor],
        messageType: "audio",
      });
      onCancelReply();
    } catch (e) {
      toast.error("Couldn't send voice message", {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setUploading(false);
    }
  }, [conversationId, replyingTo, onSend, onCancelReply, toast]);

  const discard = useCallback(() => {
    setCancelArmed(false);
    void recRef.current.cancel();
  }, []);

  const beginRecording = useCallback(async () => {
    gestureHeldRef.current = true;
    setCancelArmed(false);
    hapticLight();
    try {
      const res = await recRef.current.start();
      if (res === "permission-requested") {
        toast.success("Microphone enabled", {
          description:
            "Press and hold the mic again to record a voice message.",
        });
        return;
      }
      if (res === "denied") {
        Alert.alert(
          "Microphone needed",
          "Enable microphone access for Abonten to record voice messages.",
          [
            { text: "Not now", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ],
        );
        return;
      }
      // Started — but if the finger already lifted (and we're not locked),
      // don't leave an orphan recording running.
      if (!gestureHeldRef.current && !recRef.current.isLocked) {
        void recRef.current.cancel();
      }
    } catch (e) {
      if (e instanceof AttachmentPermissionError) {
        Alert.alert("Microphone needed", e.message, [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]);
      } else {
        toast.error("Can't record", {
          description: e instanceof Error ? e.message : "Please try again.",
        });
      }
    }
  }, [toast]);

  const releaseGesture = useCallback(() => {
    gestureHeldRef.current = false;
    if (recRef.current.isLocked) return; // hands-free -> bar buttons decide
    if (cancelArmedRef.current) {
      discard();
    } else {
      void finishAndSendVoice();
    }
  }, [discard, finishAndSendVoice]);

  // Stable references so the composed gesture object never has to be rebuilt
  // (it re-renders ~10×/s while recording).
  const fns = useRef({ beginRecording, releaseGesture, lock: rec.lock });
  fns.current = { beginRecording, releaseGesture, lock: rec.lock };
  const gBegin = useCallback(() => void fns.current.beginRecording(), []);
  const gRelease = useCallback(() => fns.current.releaseGesture(), []);
  const gLock = useCallback(() => fns.current.lock(), []);

  const gesture = useMemo(() => {
    // Hold = record; release = the source of truth for send / cancel.
    const hold = Gesture.LongPress()
      .minDuration(180)
      .maxDistance(10_000) // allow the finger to slide without failing
      .shouldCancelWhenOutside(false)
      .onStart(() => {
        runOnJS(gBegin)();
      })
      .onEnd(() => {
        runOnJS(gRelease)();
      });

    // Runs alongside the hold; observes the drag for the slide-to-cancel /
    // drag-to-lock affordances.
    const drag = Gesture.Pan()
      .minDistance(0)
      .onUpdate((e) => {
        lockProgress.value =
          e.translationY < 0 ? Math.min(1, e.translationY / LOCK_SLIDE) : 0;
        runOnJS(setCancelArmed)(e.translationX < CANCEL_SLIDE);
        if (e.translationY < LOCK_SLIDE) runOnJS(gLock)();
      })
      .onFinalize(() => {
        lockProgress.value = withTiming(0, { duration: 120 });
      });

    return Gesture.Simultaneous(hold, drag);
  }, [gBegin, gRelease, gLock, lockProgress]);

  const lockCapsuleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lockProgress.value, [0, 0.06], [0, 1]),
    transform: [{ scale: interpolate(lockProgress.value, [0, 1], [0.9, 1]) }],
  }));
  const lockGlyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lockProgress.value, [0, 0.15, 1], [0.4, 1, 1]),
    transform: [
      {
        translateY: interpolate(lockProgress.value, [0, 1], [0, -LOCK_TRAVEL]),
      },
    ],
  }));

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View
          className="items-center justify-center"
          style={{ width: 44, height: 44 }}
          accessibilityRole="button"
          accessibilityLabel="Hold to record a voice message"
          accessibilityHint="Press and hold to record, release to send, slide left to cancel, slide up to lock"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary">
            {uploading ? (
              <ActivityIndicator color={c["primary-foreground"]} size="small" />
            ) : (
              <Icon name="mic" size={19} tone="inverse" />
            )}
          </View>
        </View>
      </GestureDetector>

      {/* WhatsApp-style slide-up-to-lock affordance: a floating capsule above
          the mic whose lock glyph rises with the drag and latches when the
          recording locks. */}
      {rec.isActive && !rec.isLocked ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              right: 4,
              bottom: 50,
              width: 38,
              alignItems: "center",
              gap: 8,
              paddingVertical: 10,
              borderRadius: 19,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
            },
            lockCapsuleStyle,
          ]}
        >
          <Animated.View style={lockGlyphStyle}>
            <Icon name="lock-closed" size={15} tone="primary" />
          </Animated.View>
          <Icon name="chevron-up" size={13} tone="muted" />
        </Animated.View>
      ) : null}

      {rec.isActive ? (
        <View className="absolute inset-0 justify-center bg-card">
          <VoiceRecorderBar
            durationMs={rec.durationMs}
            samples={rec.samples}
            isLocked={rec.isLocked}
            cancelArmed={cancelArmed}
            onCancel={discard}
            onSend={finishAndSendVoice}
          />
        </View>
      ) : null}
    </>
  );
}
