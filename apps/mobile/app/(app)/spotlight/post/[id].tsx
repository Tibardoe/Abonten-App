import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  useContentPost,
  useInsights,
  useInvalidateContent,
  useOwnCampaigns,
} from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { api } from "@/lib/api";
import { useQueryView } from "@/lib/useQueryView";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/content/copy";
import { MAX_CAPTION_LENGTH } from "@abonten/core/content/limits";
import {
  AppText,
  Button,
  Chip,
  Icon,
  KeyboardAwareScrollView,
  ScreenError,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, Switch, TextInput, View } from "react-native";

const RANGES = [7, 28, 90] as const;

function formatWatchTime(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// One of your own posts: insights, promotion, edits, delete. Reached from
// the Insights button on your own Spotlight, your profile's grid, and
// Spotlight & Stories in the menu.
export default function ManagePostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateContent();
  const { program } = useContentProgram();
  const query = useContentPost(id);
  const [days, setDays] = useState<(typeof RANGES)[number]>(28);
  const insights = useInsights(id, days);
  // Your own promotions only (the list is the signed-in advertiser's).
  const campaigns = useOwnCampaigns();

  const res = query.data;
  const post =
    res && res.status === 200 && res.data && "post" in res.data
      ? res.data.post
      : null;
  // Loading, offline and failed are told apart from "no such post".
  const postView = useQueryView(query);

  const [caption, setCaption] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!post) return;
    setCaption(post.caption ?? "");
    setAllowComments(post.allowComments);
    setAllowDownload(post.allowDownload);
  }, [post]);

  const header = (
    <AppHeader
      variant="detail"
      title="Insights"
      backFallback="/(app)/spotlight/manage"
    />
  );

  if (postView.kind !== "content" && postView.kind !== "empty") {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={postView}
          subject="this post"
          onRetry={() => query.refetch()}
          loading={<Spinner />}
        />
      </View>
    );
  }
  if (!post || !post.viewer.isAuthor) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message="This post isn't available."
          onRetry={() => query.refetch()}
        />
      </View>
    );
  }

  const dirty =
    caption !== (post.caption ?? "") ||
    allowComments !== post.allowComments ||
    allowDownload !== post.allowDownload;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.content.updatePost(post.id, {
        caption: caption.trim() || null,
        allowComments,
        ...(post.kind === "spotlight" ? { allowDownload } : {}),
      });
      if (r.status !== 200) {
        toast.error(r.message ?? "Couldn't save your changes.");
        return;
      }
      toast.success("Saved");
      invalidate();
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(
      "Delete this post?",
      "It disappears for everyone. An active promotion is cancelled.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const r = await api.content.deletePost(post.id);
            if (r.status !== 200) {
              toast.error(r.message ?? "Couldn't delete this post.");
              return;
            }
            invalidate();
            router.back();
          },
        },
      ],
    );

  const publishDraft = async () => {
    const r = await api.content.publishPost(post.id);
    if (r.status !== 200) {
      toast.error(r.message ?? "Couldn't publish this post.");
      return;
    }
    toast.success("Published");
    invalidate();
  };

  const media = post.media[0];
  const thumb =
    media?.type === "video"
      ? (media.posterUrl ?? media.thumbnailUrl)
      : (media?.thumbnailUrl ?? media?.mediaUrl);
  const live =
    post.status === "published" &&
    (post.moderationState === "visible" ||
      post.moderationState === "restricted");
  const promotable =
    program.spotlightPromotions &&
    post.kind === "spotlight" &&
    post.status === "published" &&
    post.moderationState === "visible";
  const t = insights.data?.totals;
  const views = t?.meaningfulViews ?? 0;
  const tiles: [string, string | number | undefined][] = [
    ["Views", t?.meaningfulViews],
    ["People reached", t?.uniqueViewers],
    ["Impressions", t?.impressions],
    ["Watch time", t ? formatWatchTime(t.watchedMsTotal) : undefined],
    [
      "Avg. watch",
      t
        ? formatWatchTime(
            t.viewStarts > 0 ? t.watchedMsTotal / t.viewStarts : 0,
          )
        : undefined,
    ],
    [
      "Completion rate",
      t
        ? `${views > 0 ? Math.round((t.completions / views) * 100) : 0}%`
        : undefined,
    ],
    ["Likes", t?.likes],
    ["Comments", t?.comments],
    ["Shares", t?.shares],
    ["Saves", t?.saves],
    ["Profile visits", t?.profileClicks],
    ["Event taps", t?.eventClicks],
    ["Place taps", t?.placeClicks],
  ];
  const campaign = (campaigns.data ?? [])
    .filter((c) => c.postId === post.id)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];

  return (
    <View className="flex-1 bg-background">
      {header}
      <KeyboardAwareScrollView contentContainerClassName="gap-5 p-4 pb-16">
        <View className="flex-row gap-4">
          <View className="h-40 w-24 overflow-hidden rounded-xl bg-muted">
            {thumb ? (
              <Image
                source={{ uri: thumb }}
                style={{ flex: 1 }}
                contentFit="cover"
              />
            ) : null}
          </View>
          <View className="flex-1 gap-2">
            <AppText variant="bodyStrong">
              {post.kind === "story" ? "Story" : "Spotlight"}
            </AppText>
            <AppText variant="meta">
              {post.status === "draft"
                ? "Draft"
                : post.moderationState === "visible"
                  ? "Live"
                  : post.moderationState}
            </AppText>
            {post.moderationState === "hidden" ||
            post.moderationState === "removed" ? (
              <AppText variant="small" tone="error">
                Our moderation team {post.moderationState} this post. It isn't
                shown to anyone else.
              </AppText>
            ) : null}
            {live ? (
              <Button
                title="View"
                size="sm"
                variant="outline"
                onPress={() =>
                  router.push(
                    post.kind === "story"
                      ? `/(app)/story/${post.id}`
                      : `/(app)/spotlight/${post.id}`,
                  )
                }
              />
            ) : post.status === "draft" ? (
              <Button title="Publish" size="sm" onPress={publishDraft} />
            ) : null}
          </View>
        </View>

        {campaign ? (
          <Pressable
            onPress={() =>
              router.push(`/(app)/spotlight/campaign/${campaign.id}`)
            }
            accessibilityRole="button"
            accessibilityLabel={`Promotion: ${CAMPAIGN_STATUS_LABEL[campaign.status]}. Open`}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
              <Icon name="megaphone-outline" size={20} tone="primary" />
            </View>
            <View className="flex-1">
              <AppText variant="bodyStrong">Promotion</AppText>
              <AppText variant="meta">
                {CAMPAIGN_STATUS_LABEL[campaign.status]}
              </AppText>
            </View>
            <Icon name="chevron-forward" size={16} tone="muted" />
          </Pressable>
        ) : promotable ? (
          <Pressable
            onPress={() => router.push(`/(app)/spotlight/promote/${post.id}`)}
            accessibilityRole="button"
            accessibilityLabel="Promote this Spotlight"
            className="flex-row items-center gap-3 rounded-xl bg-primary p-4 active:opacity-90"
          >
            <Icon name="megaphone-outline" size={22} tone="inverse" />
            <View className="flex-1">
              <AppText className="text-[15px] font-bold text-primary-foreground">
                Promote this Spotlight
              </AppText>
              <AppText className="text-[13px] text-primary-foreground/85">
                Show it to more people nearby
              </AppText>
            </View>
            <Icon name="chevron-forward" size={18} tone="inverse" />
          </Pressable>
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <AppText variant="sectionHeading">Insights</AppText>
            <View className="flex-row gap-1">
              {RANGES.map((r) => (
                <Chip
                  key={r}
                  label={`${r}d`}
                  selected={days === r}
                  onPress={() => setDays(r)}
                />
              ))}
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {tiles.map(([label, value]) => (
              <View
                key={label}
                className="w-[48%] rounded-xl border border-border bg-card p-3"
              >
                <AppText variant="caption" tone="muted">
                  {label}
                </AppText>
                <AppText variant="cardTitle">
                  {insights.isLoading
                    ? "…"
                    : typeof value === "string"
                      ? value
                      : (value ?? 0).toLocaleString()}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" tone="muted">
            Counts update about once an hour. A view counts after two seconds of
            watching.
          </AppText>
        </View>

        <View className="gap-3">
          <AppText variant="sectionHeading">Details</AppText>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            maxLength={MAX_CAPTION_LENGTH}
            multiline
            placeholder="Caption"
            placeholderTextColor="#8a8a8a"
            textAlignVertical="top"
            className="min-h-[88px] rounded-xl border border-input px-3 py-2.5 text-[15px] text-foreground"
          />
          <View className="flex-row items-center justify-between">
            <AppText>Allow comments</AppText>
            <Switch value={allowComments} onValueChange={setAllowComments} />
          </View>
          {post.kind === "spotlight" ? (
            <View className="flex-row items-center justify-between">
              <AppText>Allow downloads</AppText>
              <Switch value={allowDownload} onValueChange={setAllowDownload} />
            </View>
          ) : null}
          <Button
            title="Save changes"
            disabled={!dirty}
            loading={saving}
            onPress={save}
          />
        </View>

        <Button title="Delete" variant="destructive" onPress={remove} />
      </KeyboardAwareScrollView>
    </View>
  );
}
