import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { VideoTrimBar } from "@/components/profile/VideoTrimBar";
import {
  useAttachableEvents,
  useInvalidateContent,
} from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { useContentPublish } from "@/features/content/useContentPublish";
import { useHighlightComposer } from "@/features/profile/useHighlightComposer";
import { CONTENT_RIGHTS_ACKNOWLEDGEMENT } from "@abonten/core/content/copy";
import { MAX_CAPTION_LENGTH } from "@abonten/core/content/limits";
import type { ContentKind } from "@abonten/types/contentType";
import {
  AppText,
  Button,
  Chip,
  Icon,
  KeyboardAwareScrollView,
  useToast,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Create a Spotlight (one photo or video) or a Story (several items that
// disappear after the programme's lifetime). Pick → trim / crop → details →
// publish. Uploads run on this screen with real progress; the server checks
// every limit again.
export default function NewContentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { program, ready } = useContentProgram();
  const invalidate = useInvalidateContent();
  const composer = useHighlightComposer();
  const publish = useContentPublish();

  const kinds = useMemo<ContentKind[]>(
    () => [
      ...(program.spotlightPosting ? (["spotlight"] as const) : []),
      ...(program.storiesPosting ? (["story"] as const) : []),
    ],
    [program.spotlightPosting, program.storiesPosting],
  );
  const [kind, setKind] = useState<ContentKind>(
    params.kind === "story" ? "story" : "spotlight",
  );
  useEffect(() => {
    if (ready && kinds.length > 0 && !kinds.includes(kind)) setKind(kinds[0]);
  }, [ready, kinds, kind]);

  const maxItems = kind === "story" ? program.maxStoryItems : 1;
  const maxSeconds =
    kind === "story"
      ? program.storyVideoMaxSeconds
      : program.spotlightVideoMaxSeconds;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cropOpen, setCropOpen] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [placeId, setPublisherPlace] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [linkedPlaceId, setLinkedPlaceId] = useState<string | null>(null);
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [rights, setRights] = useState(false);

  const events = useAttachableEvents(step === 3);
  const active = composer.activeItem;
  const loadSeq = useRef(0);

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.2;
  });

  // Keep only what this kind can hold, and cap each clip's trim window.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the selection or limits change
  useEffect(() => {
    if (composer.items.length > maxItems) {
      for (const extra of composer.items.slice(maxItems)) {
        composer.remove(extra.id);
      }
      toast.info(
        kind === "story"
          ? `A Story holds up to ${maxItems} items.`
          : "A Spotlight holds one photo or video.",
      );
    }
    for (const item of composer.items) {
      if (item.type !== "video" || item.durationSeconds === null) continue;
      const start = item.startSeconds ?? 0;
      const end = item.endSeconds ?? item.durationSeconds;
      const cappedEnd = Math.min(item.durationSeconds, start + maxSeconds);
      if (end - start > maxSeconds + 0.01) {
        composer.updateTrim(item.id, start, cappedEnd);
      }
    }
  }, [composer.items.length, maxItems, maxSeconds, kind]);

  useEffect(() => {
    if (step > 1 && composer.items.length === 0) setStep(1);
  }, [step, composer.items.length]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the active item
  useEffect(() => {
    setPreviewReady(false);
    if (!active || active.type !== "video") return;
    const seq = ++loadSeq.current;
    (async () => {
      try {
        try {
          player.pause();
        } catch {}
        await player.replaceAsync({ uri: active.uri });
        if (seq !== loadSeq.current) return;
        player.currentTime = active.startSeconds ?? 0;
        player.play();
      } catch {
        if (seq === loadSeq.current) setPreviewReady(true);
      }
    })();
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [active?.id, active?.uri]);

  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") setPreviewReady(true);
    });
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    if (step === 3) {
      try {
        player.pause();
      } catch {}
    }
  }, [step, player]);

  const tooLong = composer.items.some(
    (m) =>
      m.type === "video" &&
      m.durationSeconds !== null &&
      (m.endSeconds ?? m.durationSeconds) - (m.startSeconds ?? 0) >
        maxSeconds + 0.5,
  );
  const busy =
    publish.state.phase === "uploading" || publish.state.phase === "saving";

  async function pick() {
    const ok = await composer.pickFromLibrary();
    if (ok) setStep(2);
  }

  async function submit(asDraft: boolean) {
    if (!rights || busy) return;
    const ok = await publish.run(composer.items, {
      kind,
      publisherPlaceId: placeId,
      caption,
      eventId,
      placeId: linkedPlaceId,
      allowComments,
      allowDownload,
      publish: !asDraft,
    });
    if (!ok) return;
    invalidate();
    toast.success(
      asDraft
        ? "Saved as a draft"
        : kind === "story"
          ? "Your Story is live"
          : "Your Spotlight is live",
    );
    composer.reset();
    router.back();
  }

  if (ready && kinds.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background px-8">
        <AppText variant="sectionTitle">Posting isn't available yet</AppText>
        <AppText variant="muted" className="text-center">
          Spotlight and Stories posting is rolling out to organizers and place
          owners.
        </AppText>
        <Button title="Close" variant="outline" onPress={() => router.back()} />
      </View>
    );
  }

  const title = kind === "story" ? "New Story" : "New Spotlight";

  // ── Step 1: pick ─────────────────────────────────────────────────
  if (step === 1) {
    return (
      <View className="flex-1 bg-black">
        <View
          style={{ paddingTop: insets.top + 6 }}
          className="flex-row items-center justify-between px-4"
        >
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Icon name="close" size={26} color="#fff" />
          </Pressable>
          <AppText className="text-[16px] font-semibold text-white">
            {title}
          </AppText>
          <View style={{ width: 26 }} />
        </View>
        <View className="flex-1 items-center justify-center gap-6 px-8">
          {kinds.length > 1 ? (
            <View className="flex-row gap-2">
              {kinds.map((k) => (
                <Chip
                  key={k}
                  label={k === "story" ? "Story" : "Spotlight"}
                  selected={kind === k}
                  onPress={() => setKind(k)}
                />
              ))}
            </View>
          ) : null}
          <View className="h-24 w-24 items-center justify-center rounded-full bg-white/10">
            <Icon name="images-outline" size={40} color="#fff" />
          </View>
          <AppText className="text-center text-[15px] text-white/80">
            {kind === "story"
              ? `Share up to ${maxItems} photos or videos. Your Story disappears after ${program.storyTtlHours} hours.`
              : `One photo or a video up to ${maxSeconds} seconds about your event or place.`}
          </AppText>
          <Button title="Select from gallery" size="lg" onPress={pick} />
        </View>
      </View>
    );
  }

  // ── Step 2: edit ─────────────────────────────────────────────────
  if (step === 2) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 bg-black">
          <View
            style={{ paddingTop: insets.top + 6 }}
            className="flex-row items-center gap-3 px-4 pb-2"
          >
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Icon name="close" size={26} color="#fff" />
            </Pressable>
            <AppText className="flex-1 text-[15px] font-semibold text-white">
              {composer.items.length > 1
                ? `${composer.activeIndex + 1} / ${composer.items.length}`
                : title}
            </AppText>
            {active?.type === "image" ? (
              <Pressable
                onPress={() => setCropOpen(true)}
                hitSlop={10}
                accessibilityLabel="Crop photo"
              >
                <Icon name="crop-outline" size={22} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setStep(3)}
              disabled={tooLong}
              hitSlop={10}
              accessibilityRole="button"
            >
              <AppText
                className={[
                  "text-[15px] font-bold",
                  tooLong ? "text-white/40" : "text-mint",
                ].join(" ")}
              >
                Next
              </AppText>
            </Pressable>
          </View>

          <View className="flex-1">
            {active ? (
              active.type === "image" ? (
                <Image
                  source={{ uri: active.uri }}
                  style={{ flex: 1 }}
                  contentFit="contain"
                  onLoadEnd={() => setPreviewReady(true)}
                />
              ) : (
                <VideoView
                  player={player}
                  style={{ flex: 1 }}
                  contentFit="contain"
                  nativeControls={false}
                />
              )
            ) : null}
            {!previewReady ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color="#fff" />
              </View>
            ) : null}
          </View>

          {active && active.type === "video" ? (
            <View className="py-3" style={{ minHeight: 84 }}>
              {previewReady ? (
                <VideoTrimBar
                  key={active.id}
                  player={player}
                  item={active}
                  maxSegmentSeconds={maxSeconds}
                  onTrimChange={(s, e) => composer.updateTrim(active.id, s, e)}
                />
              ) : null}
              {tooLong ? (
                <AppText className="px-4 text-center text-[13px] text-white/80">
                  Trim to {maxSeconds} seconds or less.
                </AppText>
              ) : null}
            </View>
          ) : null}

          <View style={{ paddingBottom: insets.bottom + 10 }} className="pt-2">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2 px-4"
            >
              {composer.items.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => composer.select(m.id)}
                  className={[
                    "h-20 w-16 overflow-hidden rounded-lg border-2",
                    m.id === composer.activeId
                      ? "border-mint"
                      : "border-transparent",
                  ].join(" ")}
                >
                  {m.type === "image" ? (
                    <Image
                      source={{ uri: m.uri }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center bg-white/10">
                      <Icon name="videocam" size={18} color="#fff" />
                    </View>
                  )}
                  <Pressable
                    onPress={() => composer.remove(m.id)}
                    hitSlop={6}
                    style={{ position: "absolute", right: 2, top: 2 }}
                    className="h-5 w-5 items-center justify-center rounded-full bg-black/70"
                  >
                    <Icon name="close" size={12} color="#fff" />
                  </Pressable>
                </Pressable>
              ))}
              {composer.items.length < maxItems ? (
                <Pressable
                  onPress={pick}
                  className="h-20 w-16 items-center justify-center rounded-lg border-2 border-dashed border-white/30"
                >
                  <Icon name="add" size={22} color="#fff" />
                </Pressable>
              ) : null}
            </ScrollView>
          </View>

          {active && active.type === "image" ? (
            <ImageCropModal
              visible={cropOpen}
              uri={active.uri}
              sourceWidth={active.width}
              sourceHeight={active.height}
              onCancel={() => setCropOpen(false)}
              onDone={(r) => {
                composer.replaceCropped(active.id, r.uri, r.width, r.height);
                setCropOpen(false);
              }}
            />
          ) : null}
        </View>
      </GestureHandlerRootView>
    );
  }

  // ── Step 3: details ───────────────────────────────────────────────
  const progressText =
    publish.state.phase === "uploading"
      ? `Uploading ${publish.state.index + 1} of ${publish.state.total} · ${Math.round(publish.state.fraction * 100)}%`
      : publish.state.phase === "saving"
        ? "Publishing…"
        : null;

  return (
    <View className="flex-1 bg-background">
      <View
        style={{ paddingTop: insets.top + 6 }}
        className="flex-row items-center gap-3 border-b border-border px-4 pb-3"
      >
        <Pressable onPress={() => !busy && setStep(2)} hitSlop={10}>
          <Icon name="chevron-back" size={24} tone="foreground" />
        </Pressable>
        <AppText variant="sectionHeading" className="flex-1">
          {title}
        </AppText>
      </View>
      <KeyboardAwareScrollView contentContainerClassName="gap-5 p-4">
        {program.publisherPlaces.length > 0 ? (
          <View className="gap-2">
            <AppText variant="label">Post as</AppText>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label="Me"
                selected={placeId === null}
                onPress={() => setPublisherPlace(null)}
              />
              {program.publisherPlaces.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={placeId === p.id}
                  onPress={() => setPublisherPlace(p.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-2">
          <AppText variant="label">Caption</AppText>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            maxLength={MAX_CAPTION_LENGTH}
            multiline
            editable={!busy}
            placeholder="Say something. #hashtags help people find it."
            placeholderTextColor="#8a8a8a"
            className="min-h-[96px] rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] text-foreground"
            textAlignVertical="top"
          />
        </View>

        {(events.data?.length ?? 0) > 0 ? (
          <View className="gap-2">
            <AppText variant="label">Link an event (optional)</AppText>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label="None"
                selected={eventId === null}
                onPress={() => setEventId(null)}
              />
              {events.data?.map((ev) => (
                <Chip
                  key={ev.id}
                  label={ev.title}
                  selected={eventId === ev.id}
                  onPress={() => setEventId(ev.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {program.publisherPlaces.length > 0 ? (
          <View className="gap-2">
            <AppText variant="label">Link a place (optional)</AppText>
            <View className="flex-row flex-wrap gap-2">
              <Chip
                label="None"
                selected={linkedPlaceId === null}
                onPress={() => setLinkedPlaceId(null)}
              />
              {program.publisherPlaces.map((p) => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={linkedPlaceId === p.id}
                  onPress={() => setLinkedPlaceId(p.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <ToggleRow
          label="Allow comments"
          value={allowComments}
          onChange={setAllowComments}
          disabled={busy}
        />
        {kind === "spotlight" && program.spotlightDownloads ? (
          <ToggleRow
            label="Let people download this video"
            value={allowDownload}
            onChange={setAllowDownload}
            disabled={busy}
          />
        ) : null}

        <Pressable
          onPress={() => !busy && setRights((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rights }}
          className="flex-row items-start gap-3 rounded-xl bg-muted p-3"
        >
          <Icon
            name={rights ? "checkbox" : "square-outline"}
            size={22}
            tone={rights ? "primary" : "muted"}
          />
          <AppText variant="small" className="flex-1">
            {CONTENT_RIGHTS_ACKNOWLEDGEMENT}
          </AppText>
        </Pressable>

        {publish.state.phase === "error" ? (
          <View className="rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <AppText variant="small" tone="error">
              {publish.state.message}
            </AppText>
          </View>
        ) : null}
        {progressText ? (
          <AppText variant="meta" className="text-center">
            {progressText}
          </AppText>
        ) : null}

        <View className="gap-2 pb-8">
          <Button
            title={publish.state.phase === "error" ? "Try again" : "Publish"}
            loading={busy}
            loadingTitle="Publishing…"
            disabled={!rights || busy}
            onPress={() => submit(false)}
          />
          <Button
            title="Save draft"
            variant="outline"
            disabled={!rights || busy}
            onPress={() => submit(true)}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText>{label}</AppText>
      <Switch value={value} onValueChange={onChange} disabled={disabled} />
    </View>
  );
}
