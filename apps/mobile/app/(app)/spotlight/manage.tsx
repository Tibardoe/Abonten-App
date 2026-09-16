import { AppHeader, HeaderIconButton } from "@/components/app/AppHeader";
import { useOwnCampaigns, useOwnContent } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import { CAMPAIGN_STATUS_LABEL } from "@abonten/core/content/copy";
import { formatStoryAge } from "@abonten/core/content/storyExpiry";
import type {
  ContentCampaign,
  ContentKind,
  ContentOwnPost,
} from "@abonten/types/contentType";
import {
  AppText,
  EmptyState,
  Icon,
  Refresher,
  SegmentedTabs,
  Spinner,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";

type Tab = "spotlight" | "story" | "campaigns";

function postStatus(post: ContentOwnPost): {
  label: string;
  tone: "success" | "muted" | "warning" | "error";
} {
  if (post.moderationState === "removed")
    return { label: "Removed", tone: "error" };
  if (post.moderationState === "hidden")
    return { label: "Hidden", tone: "error" };
  if (post.status === "draft") return { label: "Draft", tone: "muted" };
  if (
    post.kind === "story" &&
    post.expiresAt &&
    Date.parse(post.expiresAt) <= Date.now()
  ) {
    return { label: "Ended", tone: "muted" };
  }
  if (post.moderationState === "restricted")
    return { label: "Limited", tone: "warning" };
  return { label: "Live", tone: "success" };
}

// Creator tools: your Spotlights, Stories and promotions.
export default function ManageContentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { program, ready } = useContentProgram();
  const [tab, setTab] = useState<Tab>(
    params.tab === "story" || params.tab === "campaigns"
      ? params.tab
      : "spotlight",
  );

  const options: { key: Tab; label: string }[] = [
    ...(program.spotlightPosting
      ? [{ key: "spotlight" as const, label: "Spotlights" }]
      : []),
    ...(program.storiesPosting
      ? [{ key: "story" as const, label: "Stories" }]
      : []),
    ...(program.spotlightPromotions
      ? [{ key: "campaigns" as const, label: "Promotions" }]
      : []),
  ];

  const header = (
    <AppHeader
      variant="detail"
      title="Spotlight & Stories"
      backFallback="/(app)"
      rightAccessory={
        program.canPublish ? (
          <HeaderIconButton
            name="add"
            accessibilityLabel="Create"
            onPress={() =>
              router.push(
                `/(app)/spotlight/new?kind=${tab === "story" ? "story" : "spotlight"}`,
              )
            }
          />
        ) : undefined
      }
    />
  );

  if (!ready) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <Spinner />
      </View>
    );
  }
  if (!program.canPublish || options.length === 0) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <EmptyState
          icon="videocam-outline"
          title="Posting isn't available yet"
          description="Spotlight and Stories are rolling out to organizers and place owners."
        />
      </View>
    );
  }

  const current = options.some((o) => o.key === tab) ? tab : options[0].key;

  return (
    <View className="flex-1 bg-background">
      {header}
      <View className="px-4 pb-2 pt-3">
        <SegmentedTabs options={options} value={current} onChange={setTab} />
      </View>
      {current === "campaigns" ? <Campaigns /> : <Posts kind={current} />}
    </View>
  );
}

function Posts({ kind }: { kind: ContentKind }) {
  const router = useRouter();
  const q = useOwnContent(kind);
  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];

  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      contentContainerClassName="pb-16"
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      onEndReached={() =>
        q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()
      }
      ListEmptyComponent={
        q.isLoading ? (
          <Spinner />
        ) : (
          <EmptyState
            icon={q.isError ? "cloud-offline-outline" : "videocam-outline"}
            title={
              q.isError
                ? "Couldn't load your posts"
                : kind === "story"
                  ? "No Stories yet"
                  : "No Spotlights yet"
            }
            description={q.isError ? "Pull down to try again." : undefined}
            actionLabel={q.isError ? undefined : "Create"}
            onAction={() => router.push(`/(app)/spotlight/new?kind=${kind}`)}
          />
        )
      }
      renderItem={({ item }) => {
        const status = postStatus(item);
        const thumb =
          item.cover?.type === "video"
            ? item.cover.thumbnailUrl
            : (item.cover?.thumbnailUrl ?? item.cover?.mediaUrl);
        return (
          <Pressable
            onPress={() => router.push(`/(app)/spotlight/post/${item.id}`)}
            className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:opacity-70"
          >
            <View className="h-20 w-12 overflow-hidden rounded bg-muted">
              {thumb ? (
                <Image
                  source={{ uri: thumb }}
                  style={{ flex: 1 }}
                  contentFit="cover"
                />
              ) : null}
            </View>
            <View className="flex-1 gap-1">
              <View className="flex-row items-center gap-2">
                <AppText
                  variant="caption"
                  tone={status.tone}
                  className="font-semibold"
                >
                  {status.label}
                </AppText>
                {item.campaign ? (
                  <AppText variant="caption" tone="brand">
                    {CAMPAIGN_STATUS_LABEL[item.campaign.status]}
                  </AppText>
                ) : null}
                <AppText variant="caption" tone="muted">
                  {formatStoryAge(item.publishedAt ?? item.createdAt)}
                </AppText>
              </View>
              <AppText numberOfLines={1}>
                {item.caption?.trim() || "No caption"}
              </AppText>
              <AppText variant="caption" tone="muted">
                {item.counts.views.toLocaleString()} views ·{" "}
                {item.counts.likes.toLocaleString()} likes ·{" "}
                {item.counts.comments.toLocaleString()} comments
              </AppText>
            </View>
            <Icon name="chevron-forward" size={16} tone="muted" />
          </Pressable>
        );
      }}
    />
  );
}

function Campaigns() {
  const router = useRouter();
  const q = useOwnCampaigns();
  const rows: ContentCampaign[] = q.data ?? [];
  return (
    <FlatList
      data={rows}
      keyExtractor={(c) => c.id}
      contentContainerClassName="pb-16"
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      ListEmptyComponent={
        q.isLoading ? (
          <Spinner />
        ) : (
          <EmptyState
            icon="megaphone-outline"
            title={q.isError ? "Couldn't load promotions" : "No promotions yet"}
            description={
              q.isError
                ? "Pull down to try again."
                : "Open a live Spotlight and choose Promote."
            }
          />
        )
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/(app)/spotlight/campaign/${item.id}`)}
          className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:opacity-70"
        >
          <View className="h-16 w-10 overflow-hidden rounded bg-muted">
            {item.post?.thumbnailUrl ? (
              <Image
                source={{ uri: item.post.thumbnailUrl }}
                style={{ flex: 1 }}
                contentFit="cover"
              />
            ) : null}
          </View>
          <View className="flex-1 gap-1">
            <AppText variant="caption" tone="brand" className="font-semibold">
              {CAMPAIGN_STATUS_LABEL[item.status]}
            </AppText>
            <AppText numberOfLines={1}>
              {item.post?.caption?.trim() || "Spotlight"}
            </AppText>
            <AppText variant="caption" tone="muted">
              {item.impressions.toLocaleString()} impressions ·{" "}
              {item.clicks.toLocaleString()} taps
            </AppText>
          </View>
          <AppText variant="bodyStrong">
            {formatMinor(item.budgetMinor, item.currency)}
          </AppText>
        </Pressable>
      )}
    />
  );
}
