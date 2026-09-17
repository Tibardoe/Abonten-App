import { useSession } from "@/auth/SessionProvider";
import { ReportSheet } from "@/components/ReportSheet";
import {
  contentShareUrl,
  publisherLabel,
} from "@/features/content/contentLinks";
import { useInvalidateContent } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { copyText } from "@/features/messaging/clipboardSupport";
import { api } from "@/lib/api";
import { hapticSelection } from "@/lib/haptics";
import type { ContentPostDocument } from "@abonten/types/contentType";
import {
  AppText,
  Icon,
  type IoniconName,
  Sheet,
  useModalHandoff,
  useToast,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Fragment, useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";

type Row = {
  key: string;
  icon: IoniconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
};

/**
 * The "More" sheet for a Spotlight. Three tiers, top to bottom:
 *   1. what you are acting on (thumbnail, publisher, caption),
 *   2. the everyday actions as a row of large tiles (save, share, copy link,
 *      download when the author allows it),
 *   3. grouped lists — creator tools on your own post; "Not interested";
 *      then Report / Delete in their own group, in red, apart from the rest.
 * Only what this person can actually do is shown. Follow-up sheets and
 * dialogs open once this one has fully closed (useModalHandoff).
 */
export function ContentOptionsSheet({
  post,
  open,
  onClose,
  saved,
  onToggleSave,
  onShare,
  onNotInterested,
  onDeleted,
}: {
  post: ContentPostDocument;
  open: boolean;
  onClose: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
  onShare?: () => void;
  onNotInterested?: () => void;
  onDeleted?: () => void;
}) {
  const { session } = useSession();
  const { program } = useContentProgram();
  const router = useRouter();
  const toast = useToast();
  const invalidate = useInvalidateContent();
  const handoff = useModalHandoff();
  const [reportOpen, setReportOpen] = useState(false);
  const noun = post.kind === "story" ? "Story" : "Spotlight";
  const isAuthor = post.viewer.isAuthor;
  const canDownload =
    post.kind === "spotlight" &&
    post.allowDownload &&
    program.spotlightDownloads &&
    !!session;
  const promotable =
    isAuthor &&
    program.spotlightPromotions &&
    post.kind === "spotlight" &&
    post.status === "published" &&
    post.moderationState === "visible";

  const then = (fn: () => void) => {
    hapticSelection();
    handoff.after(fn);
    onClose();
  };

  const confirmDelete = () =>
    Alert.alert(`Delete this ${noun}?`, "It disappears for everyone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const res = await api.content.deletePost(post.id);
          if (res.status !== 200) {
            toast.error(res.message ?? `Couldn't delete this ${noun}.`);
            return;
          }
          toast.success(`${noun} deleted`);
          invalidate();
          onDeleted?.();
        },
      },
    ]);

  const tiles: Row[] = [];
  if (onToggleSave && session) {
    tiles.push({
      key: "save",
      icon: saved ? "bookmark" : "bookmark-outline",
      title: saved ? "Saved" : "Save",
      onPress: () => then(onToggleSave),
    });
  }
  if (onShare) {
    tiles.push({
      key: "share",
      icon: "paper-plane-outline",
      title: "Share",
      onPress: () => then(onShare),
    });
  }
  tiles.push({
    key: "copy",
    icon: "link-outline",
    title: "Copy link",
    onPress: () =>
      then(async () => {
        const ok = await copyText(contentShareUrl(post.kind, post.id));
        if (ok) toast.success("Link copied");
        else toast.error("Couldn't copy the link");
      }),
  });
  if (canDownload) {
    tiles.push({
      key: "download",
      icon: "download-outline",
      title: "Download",
      onPress: () =>
        then(async () => {
          const res = await api.content.download(post.id);
          if (res.status !== 200 || !res.data) {
            toast.error(res.message ?? "This can't be downloaded.");
            return;
          }
          await Linking.openURL(res.data.url);
        }),
    });
  }

  const creator: Row[] = isAuthor
    ? [
        {
          key: "insights",
          icon: "stats-chart-outline",
          title: "Insights & manage",
          subtitle: "Views, watch time, edits",
          onPress: () =>
            then(() => router.push(`/(app)/spotlight/post/${post.id}`)),
        },
        ...(promotable
          ? [
              {
                key: "promote",
                icon: "megaphone-outline" as const,
                title: "Promote",
                subtitle: "Reach more people nearby",
                onPress: () =>
                  then(() =>
                    router.push(`/(app)/spotlight/promote/${post.id}`),
                  ),
              },
            ]
          : []),
      ]
    : [];

  const general: Row[] = [];
  if (!isAuthor && session && post.kind === "spotlight" && onNotInterested) {
    general.push({
      key: "not-interested",
      icon: "eye-off-outline",
      title: "Not interested",
      subtitle: "See fewer posts like this",
      onPress: () => then(onNotInterested),
    });
  }

  const destructive: Row[] = [];
  if (!isAuthor && session) {
    destructive.push({
      key: "report",
      icon: "flag-outline",
      title: `Report ${noun}`,
      destructive: true,
      onPress: () => then(() => setReportOpen(true)),
    });
  }
  if (isAuthor) {
    destructive.push({
      key: "delete",
      icon: "trash-outline",
      title: `Delete ${noun}`,
      destructive: true,
      onPress: () => then(confirmDelete),
    });
  }

  const media = post.media[0];
  const thumb =
    media?.type === "video"
      ? (media.thumbnailUrl ?? media.posterUrl)
      : (media?.thumbnailUrl ?? media?.mediaUrl);

  return (
    <>
      <Sheet open={open} onClose={onClose} onDismiss={handoff.onDismiss}>
        <View className="gap-5 pb-3">
          <View className="flex-row items-center gap-3">
            <View className="h-14 w-10 overflow-hidden rounded-lg bg-muted">
              {thumb ? (
                <Image
                  source={{ uri: thumb }}
                  style={{ flex: 1 }}
                  contentFit="cover"
                />
              ) : null}
            </View>
            <View className="flex-1">
              <AppText variant="bodyStrong" numberOfLines={1}>
                {noun} by {publisherLabel(post.publisher)}
              </AppText>
              {post.caption ? (
                <AppText variant="meta" numberOfLines={1}>
                  {post.caption}
                </AppText>
              ) : null}
            </View>
          </View>

          <View className="flex-row justify-between">
            {tiles.map((tile) => (
              <Pressable
                key={tile.key}
                onPress={tile.onPress}
                accessibilityRole="button"
                accessibilityLabel={tile.title}
                className="w-[23%] items-center gap-1.5 active:opacity-70"
              >
                <View className="h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Icon name={tile.icon} size={24} tone="foreground" />
                </View>
                <AppText
                  variant="caption"
                  numberOfLines={1}
                  className="font-medium"
                >
                  {tile.title}
                </AppText>
              </Pressable>
            ))}
            {Array.from({ length: Math.max(0, 4 - tiles.length) }, (_, i) => (
              <View key={`spacer-${i.toString()}`} className="w-[23%]" />
            ))}
          </View>

          <RowGroup rows={creator} />
          <RowGroup rows={general} />
          <RowGroup rows={destructive} />
        </View>
      </Sheet>
      {reportOpen ? (
        <ReportSheet
          open
          onClose={() => setReportOpen(false)}
          targetType={post.kind}
          targetId={post.id}
          label={post.caption?.slice(0, 80) || noun}
        />
      ) : null}
    </>
  );
}

function RowGroup({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map((row, i) => (
        <Fragment key={row.key}>
          {i > 0 ? <View className="ml-14 h-px bg-border" /> : null}
          <Pressable
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            accessibilityHint={row.subtitle}
            className="min-h-[54px] flex-row items-center gap-3 px-4 py-3 active:bg-muted"
          >
            <Icon
              name={row.icon}
              size={22}
              tone={row.destructive ? "destructive" : "foreground"}
            />
            <View className="flex-1">
              <AppText
                variant="bodyStrong"
                tone={row.destructive ? "error" : undefined}
              >
                {row.title}
              </AppText>
              {row.subtitle ? (
                <AppText variant="meta">{row.subtitle}</AppText>
              ) : null}
            </View>
            {row.destructive ? null : (
              <Icon name="chevron-forward" size={16} tone="muted" />
            )}
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}
