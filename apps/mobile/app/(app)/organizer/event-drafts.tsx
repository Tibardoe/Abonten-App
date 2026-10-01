import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  useDeleteEventDraft,
  useEventDrafts,
} from "@/features/events/useEventDrafts";
import { useQueryView } from "@/lib/useQueryView";
import type { EventDraftListItem } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { AppText, Icon, Refresher, useToast } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  View,
} from "react-native";

// The saved event drafts list — the native mirror of the web DraftsView's
// event tab. Tap a row to resume it in the create wizard; the trash icon
// deletes the draft (and its Cloudinary flyer).

function DraftRow({ draft }: { draft: EventDraftListItem }) {
  const { locale } = useLocale();

  const t = useTranslations("manage");

  const toast = useToast();
  const router = useRouter();
  const del = useDeleteEventDraft();

  const confirmDelete = () => {
    Alert.alert(t("deleteThisDraft"), t("thisCanTBeUndone"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("deleteText"),
        style: "destructive",
        onPress: () =>
          del.mutate(draft.id, {
            onError: () =>
              toast.error(t("couldnTDelete"), {
                description: t("pleaseTryAgainInAMoment"),
              }),
          }),
      },
    ]);
  };

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Pressable
        accessibilityRole="button"
        className="flex-1 flex-row items-center gap-3 active:opacity-80"
        onPress={() => router.push(`/(app)/event/new?draftId=${draft.id}`)}
      >
        {draft.flyerPublicId && draft.flyerVersion ? (
          <Image
            source={{
              uri: buildCloudinaryUrl(draft.flyerPublicId, draft.flyerVersion, {
                width: 120,
                height: 150,
              }),
            }}
            style={{ width: 48, height: 60, borderRadius: 8 }}
            contentFit="cover"
          />
        ) : (
          <View className="h-[60px] w-12 rounded-lg bg-muted" />
        )}
        <View className="flex-1">
          <AppText className="font-medium text-foreground" numberOfLines={1}>
            {draft.title?.trim() || t("untitledDraft")}
          </AppText>
          <AppText variant="muted">
            {t("edited", {
              getRelativeTime: getRelativeTime(
                draft.updatedAt,
                undefined,
                locale,
              ),
            })}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        onPress={confirmDelete}
        hitSlop={10}
        disabled={del.isPending}
        className="active:opacity-60 disabled:opacity-40"
        accessibilityRole="button"
        accessibilityLabel={t("deleteDraft")}
      >
        <Icon name="trash-outline" tone="destructive" size={18} />
      </Pressable>
    </View>
  );
}

export default function EventDraftsScreen() {
  const t = useTranslations("manage");

  const q = useEventDrafts();
  const drafts = q.data?.status === 200 ? q.data.data : [];
  // "No saved drafts" is only ever said for an answer the server gave;
  // loading, offline and failed are told apart.
  const view = useQueryView(q, () => drafts.length === 0);

  return (
    <FlatList
      className="flex-1 bg-background"
      data={drafts}
      keyExtractor={(d) => d.id}
      renderItem={({ item }) => <DraftRow draft={item} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      ListHeaderComponent={
        <AppText variant="screenTitle" className="mb-1">
          {t("eventDrafts")}
        </AppText>
      }
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      ListEmptyComponent={
        view.kind === "empty" ? (
          <AppText className="mt-10 text-center text-sm text-muted-foreground">
            {t("noSavedDraftsStartAnEvent")}
          </AppText>
        ) : (
          <QueryUnavailable
            view={view}
            subject={t("yourDrafts")}
            onRetry={() => q.refetch()}
            loading={<ActivityIndicator className="mt-10" />}
          />
        )
      }
    />
  );
}
