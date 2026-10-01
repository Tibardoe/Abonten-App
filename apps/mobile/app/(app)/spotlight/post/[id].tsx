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
import { IN_APP_PROMOTION_PURCHASES } from "@/lib/storePolicy";
import { useQueryView } from "@/lib/useQueryView";
import { campaignStatusLabel } from "@abonten/core/content/copy";
import { MAX_CAPTION_LENGTH } from "@abonten/core/content/limits";
import { formatCount } from "@abonten/core/i18n/format";
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
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
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
  const { locale } = useLocale();
  const t = useTranslations("spotlight");
  const tc = useTranslations("core");

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
      title={t("insights")}
      backFallback="/(app)/spotlight/manage"
    />
  );

  if (postView.kind !== "content" && postView.kind !== "empty") {
    return (
      <View className="flex-1 bg-background">
        {header}
        <QueryUnavailable
          view={postView}
          subject={t("thisPost")}
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
          message={t("thisPostIsnTAvailable")}
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
        toast.error(r.message ?? t("couldnTSaveYourChanges"));
        return;
      }
      toast.success(t("saved2"));
      invalidate();
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(t("deleteThisPost"), t("itDisappearsForEveryoneAnActive"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deleteText2"),
        style: "destructive",
        onPress: async () => {
          const r = await api.content.deletePost(post.id);
          if (r.status !== 200) {
            toast.error(r.message ?? t("couldnTDeleteThisPost"));
            return;
          }
          invalidate();
          router.back();
        },
      },
    ]);

  const publishDraft = async () => {
    const r = await api.content.publishPost(post.id);
    if (r.status !== 200) {
      toast.error(r.message ?? t("couldnTPublishThisPost"));
      return;
    }
    toast.success(t("published2"));
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
    IN_APP_PROMOTION_PURCHASES &&
    program.spotlightPromotions &&
    post.kind === "spotlight" &&
    post.status === "published" &&
    post.moderationState === "visible";
  const totals = insights.data?.totals;
  const views = totals?.meaningfulViews ?? 0;
  const tiles: [string, string | number | undefined][] = [
    [t("views"), totals?.meaningfulViews],
    [t("peopleReached"), totals?.uniqueViewers],
    [t("impressions"), totals?.impressions],
    [
      t("watchTime"),
      totals ? formatWatchTime(totals.watchedMsTotal) : undefined,
    ],
    [
      t("avgWatch"),
      totals
        ? formatWatchTime(
            totals.viewStarts > 0
              ? totals.watchedMsTotal / totals.viewStarts
              : 0,
          )
        : undefined,
    ],
    [
      t("completionRate"),
      totals
        ? `${views > 0 ? Math.round((totals.completions / views) * 100) : 0}%`
        : undefined,
    ],
    [t("likes"), totals?.likes],
    [t("comments"), totals?.comments],
    [t("shares"), totals?.shares],
    [t("saves"), totals?.saves],
    [t("profileVisits"), totals?.profileClicks],
    [t("eventTaps"), totals?.eventClicks],
    [t("placeTaps"), totals?.placeClicks],
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
              {post.kind === "story" ? t("story") : t("spotlight")}
            </AppText>
            <AppText variant="meta">
              {post.status === "draft"
                ? t("draft")
                : post.moderationState === "visible"
                  ? t("live")
                  : post.moderationState}
            </AppText>
            {post.moderationState === "hidden" ||
            post.moderationState === "removed" ? (
              <AppText variant="small" tone="error">
                {t("ourModerationTeamThisPostIt", {
                  moderationState: post.moderationState,
                })}
              </AppText>
            ) : null}
            {live ? (
              <Button
                title={t("view")}
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
              <Button title={t("publish")} size="sm" onPress={publishDraft} />
            ) : null}
          </View>
        </View>

        {campaign ? (
          <Pressable
            onPress={() =>
              router.push(`/(app)/spotlight/campaign/${campaign.id}`)
            }
            accessibilityRole="button"
            accessibilityLabel={t("promotionOpen", {
              item: campaignStatusLabel(tc, campaign.status),
            })}
            className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
              <Icon name="megaphone-outline" size={20} tone="primary" />
            </View>
            <View className="flex-1">
              <AppText variant="bodyStrong">{t("promotion")}</AppText>
              <AppText variant="meta">
                {campaignStatusLabel(tc, campaign.status)}
              </AppText>
            </View>
            <Icon name="chevron-forward" size={16} tone="muted" />
          </Pressable>
        ) : promotable ? (
          <Pressable
            onPress={() => router.push(`/(app)/spotlight/promote/${post.id}`)}
            accessibilityRole="button"
            accessibilityLabel={t("promoteThisSpotlight")}
            className="flex-row items-center gap-3 rounded-xl bg-primary p-4 active:opacity-90"
          >
            <Icon name="megaphone-outline" size={22} tone="inverse" />
            <View className="flex-1">
              <AppText className="text-[15px] font-bold text-primary-foreground">
                {t("promoteThisSpotlight")}
              </AppText>
              <AppText className="text-[13px] text-primary-foreground/85">
                {t("showItToMorePeopleNearby")}
              </AppText>
            </View>
            <Icon name="chevron-forward" size={18} tone="inverse" />
          </Pressable>
        ) : null}

        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <AppText variant="sectionHeading">{t("insights")}</AppText>
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
                      : formatCount(value ?? 0, locale)}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" tone="muted">
            {t("countsUpdateAboutOnceAnHour2")}
          </AppText>
        </View>

        <View className="gap-3">
          <AppText variant="sectionHeading">{t("details")}</AppText>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            maxLength={MAX_CAPTION_LENGTH}
            multiline
            placeholder={t("caption")}
            placeholderTextColor="#8a8a8a"
            textAlignVertical="top"
            className="min-h-[88px] rounded-xl border border-input px-3 py-2.5 text-[15px] text-foreground"
          />
          <View className="flex-row items-center justify-between">
            <AppText>{t("allowComments")}</AppText>
            <Switch value={allowComments} onValueChange={setAllowComments} />
          </View>
          {post.kind === "spotlight" ? (
            <View className="flex-row items-center justify-between">
              <AppText>{t("allowDownloads")}</AppText>
              <Switch value={allowDownload} onValueChange={setAllowDownload} />
            </View>
          ) : null}
          <Button
            title={t("saveChanges")}
            disabled={!dirty}
            loading={saving}
            onPress={save}
          />
        </View>

        <Button
          title={t("deleteText2")}
          variant="destructive"
          onPress={remove}
        />
      </KeyboardAwareScrollView>
    </View>
  );
}
