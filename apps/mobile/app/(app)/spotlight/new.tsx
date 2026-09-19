import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { VideoTrimBar } from "@/components/profile/VideoTrimBar";
import {
  useAttachableEvents,
  useInvalidateContent,
} from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import {
  type PublishState,
  useContentPublish,
} from "@/features/content/useContentPublish";
import {
  type EditableMedia,
  useHighlightComposer,
} from "@/features/profile/useHighlightComposer";
import { CONTENT_RIGHTS_ACKNOWLEDGEMENT } from "@abonten/core/content/copy";
import { MAX_CAPTION_LENGTH } from "@abonten/core/content/limits";
import type { ContentKind } from "@abonten/types/contentType";
import {
  AppText,
  Button,
  Chip,
  Icon,
  KeyboardAwareScrollView,
  ProgressBar,
  useToast,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type VideoThumbnail, VideoView, useVideoPlayer } from "expo-video";
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
  const [previewFailed, setPreviewFailed] = useState(false);
  // A still of each picked video (from the trim bar's first frame): the
  // filmstrip and the publish card show it instead of a blank tile.
  const [posters, setPosters] = useState<Record<string, VideoThumbnail>>({});
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
    setPreviewFailed(false);
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
        if (seq === loadSeq.current) setPreviewFailed(true);
      }
    })();
    return () => {
      try {
        player.pause();
      } catch {}
    };
  }, [active?.id, active?.uri]);

  // Ready = a frame of THIS clip is on screen (onFirstFrameRender below),
  // not merely "loaded": the player reports readyToPlay before the surface
  // has drawn anything, which is what left a black box behind the spinner.
  // A clip the device cannot decode says so instead of spinning forever.
  useEffect(() => {
    const subs = [
      player.addListener("statusChange", ({ status }) => {
        if (status === "error") setPreviewFailed(true);
      }),
      // Backstop for surfaces that never report a first frame: a clip that
      // is actually advancing is on screen.
      player.addListener("timeUpdate", ({ currentTime }) => {
        if (currentTime > 0.1) setPreviewReady(true);
      }),
    ];
    return () => {
      for (const s of subs) s.remove();
    };
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
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            hitSlop={10}
          >
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
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              hitSlop={10}
            >
              <Icon name="close" size={26} color="#fff" />
            </Pressable>
            <AppText className="flex-1 text-[15px] font-semibold text-white">
              {composer.items.length > 1
                ? `${composer.activeIndex + 1} / ${composer.items.length}`
                : title}
            </AppText>
            {active?.type === "image" ? (
              <Pressable
                accessibilityRole="button"
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
                  onFirstFrameRender={() => setPreviewReady(true)}
                />
              )
            ) : null}
            {!previewReady && active ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* The clip's own still (once we have one) under the
                    status, so the wait shows the video, not a black box. */}
                {active.type === "video" && posters[active.id] ? (
                  <Image
                    source={posters[active.id]}
                    style={{ position: "absolute", inset: 0, opacity: 0.6 }}
                    contentFit="contain"
                  />
                ) : null}
                {previewFailed ? (
                  <View className="items-center gap-2 px-8">
                    <Icon name="alert-circle-outline" size={28} color="#fff" />
                    <AppText className="text-center text-[14px] text-white">
                      This video can't be previewed on this phone.
                    </AppText>
                    <AppText className="text-center text-[12px] text-white/70">
                      You can still post it; we'll check it when it uploads.
                    </AppText>
                  </View>
                ) : (
                  <View className="items-center gap-3">
                    <ActivityIndicator color="#fff" />
                    <AppText className="text-[13px] text-white/80">
                      {active.type === "video"
                        ? "Preparing preview…"
                        : "Loading photo…"}
                    </AppText>
                  </View>
                )}
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
                  onPoster={(thumb) =>
                    setPosters((p) =>
                      p[active.id] ? p : { ...p, [active.id]: thumb },
                    )
                  }
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
                  accessibilityRole="button"
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
                  ) : posters[m.id] ? (
                    <View className="flex-1">
                      <Image
                        source={posters[m.id]}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                      <View className="absolute bottom-1 left-1">
                        <Icon name="videocam" size={12} color="#fff" />
                      </View>
                    </View>
                  ) : (
                    <View className="flex-1 items-center justify-center bg-white/10">
                      <Icon name="videocam" size={18} color="#fff" />
                    </View>
                  )}
                  <Pressable
                    accessibilityRole="button"
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
                  accessibilityRole="button"
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

  return (
    <View className="flex-1 bg-background">
      <View
        style={{ paddingTop: insets.top + 6 }}
        className="flex-row items-center gap-3 border-b border-border px-4 pb-3"
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => !busy && setStep(2)}
          hitSlop={10}
        >
          <Icon name="chevron-back" size={24} tone="foreground" />
        </Pressable>
        <AppText variant="sectionHeading" className="flex-1">
          {title}
        </AppText>
      </View>
      <KeyboardAwareScrollView contentContainerClassName="gap-5 p-4">
        <PublishPreview
          items={composer.items}
          posters={posters}
          state={publish.state}
        />
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

/**
 * What is being posted and where it is in the pipeline, always with the
 * media itself in view: the stage (uploading n of N with real bytes-sent
 * progress, checking the file on the server, publishing), or the failure
 * with what went wrong — never an unexplained spinner or a black box.
 */
function PublishPreview({
  items,
  posters,
  state,
}: {
  items: EditableMedia[];
  posters: Record<string, VideoThumbnail>;
  state: PublishState;
}) {
  const first = items[0];
  if (!first) return null;
  const still =
    first.type === "image" ? { uri: first.uri } : (posters[first.id] ?? null);

  let label: string | null = null;
  let value = 0;
  let indeterminate = false;
  if (state.phase === "uploading") {
    label =
      state.total > 1
        ? `Uploading ${state.index + 1} of ${state.total}`
        : "Uploading";
    value = (state.index + state.fraction) / state.total;
    // Bytes are all sent; the server is checking the file.
    if (state.fraction >= 1) {
      label = "Checking your file…";
      indeterminate = true;
    }
  } else if (state.phase === "saving") {
    label = "Publishing…";
    indeterminate = true;
  }

  return (
    <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
      <View className="h-24 w-16 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {still ? (
          <Image
            source={still}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <Icon
            name={first.type === "video" ? "videocam-outline" : "image-outline"}
            size={22}
            tone="muted"
          />
        )}
        {items.length > 1 ? (
          <View className="absolute right-1 top-1 rounded-md bg-black/60 px-1">
            <AppText className="text-[11px] font-semibold text-white">
              {items.length}
            </AppText>
          </View>
        ) : null}
      </View>
      <View className="flex-1 justify-center gap-2">
        {state.phase === "error" ? (
          <>
            <AppText variant="bodyStrong" tone="error">
              Not posted yet
            </AppText>
            <AppText variant="small">{state.message}</AppText>
            <AppText variant="caption" tone="muted">
              Anything already uploaded is kept — Try again picks up from there.
            </AppText>
          </>
        ) : label ? (
          <ProgressBar
            label={label}
            value={value}
            showPercent={!indeterminate}
            indeterminate={indeterminate}
          />
        ) : (
          <>
            <AppText variant="bodyStrong">
              {items.length > 1
                ? `${items.length} items ready`
                : first.type === "video"
                  ? "Video ready to post"
                  : "Photo ready to post"}
            </AppText>
            <AppText variant="caption" tone="muted">
              It uploads when you publish. Keep the app open until it's done.
            </AppText>
          </>
        )}
      </View>
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
