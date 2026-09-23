import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { RowListSkeleton } from "@/components/skeletons";
import { useBlockedAccounts } from "@/features/profile/useBlockedAccounts";
import { useSetUserBlock } from "@/features/reviews/useReviews";
import { useQueryView } from "@/lib/useQueryView";
import {
  type BlockedAccount,
  blockedAccountName,
} from "@abonten/core/blockedAccounts";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import {
  AppText,
  Avatar,
  Button,
  EmptyState,
  Refresher,
  useToast,
} from "@abonten/ui-native";
import { useState } from "react";
import { FlatList, View } from "react-native";

// Everyone you blocked, and the way back. A block made from a review, a
// Spotlight or anywhere else is account-wide: they can't message you (or you
// them), their reviews and posts are hidden from you, and any follow between
// you ended. Unblocking lifts the block from now on; it doesn't restore a
// follow.

function BlockedRow({ account }: { account: BlockedAccount }) {
  const toast = useToast();
  const unblock = useSetUserBlock();
  const [done, setDone] = useState(false);
  const name = blockedAccountName(account);

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Avatar
        publicId={account.avatarPublicId ?? undefined}
        version={account.avatarVersion ?? undefined}
        size={40}
      />
      <View className="flex-1">
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {account.fullName && account.username
            ? `@${account.username} · `
            : ""}
          Blocked {getRelativeTime(account.blockedAt)}
        </AppText>
      </View>
      <Button
        title={done ? "Unblocked" : "Unblock"}
        variant="outline"
        size="sm"
        disabled={done}
        loading={unblock.isPending}
        accessibilityLabel={`Unblock ${name}`}
        onPress={() =>
          unblock.mutate(
            { userId: account.userId, block: false },
            {
              onSuccess: () => {
                setDone(true);
                toast.success(`${name} is unblocked`);
              },
              onError: () =>
                toast.error("Couldn't unblock", {
                  description: "Check your connection and try again.",
                }),
            },
          )
        }
      />
    </View>
  );
}

export default function BlockedAccountsScreen() {
  const query = useBlockedAccounts();
  const view = useQueryView(query, (d) => d.length === 0);

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title="Blocked accounts"
        backFallback="/(app)/settings"
      />
      {view.kind === "content" || view.kind === "empty" ? (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(a) => a.userId}
          contentContainerClassName="gap-2 p-4"
          refreshControl={<Refresher onRefresh={() => query.refetch()} />}
          ListHeaderComponent={
            <AppText variant="muted" className="pb-2">
              People you block can't message you, and you won't see their
              reviews, Spotlights or comments. They aren't told.
            </AppText>
          }
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title="You haven't blocked anyone"
              description="You can block someone from their review, message or Spotlight."
            />
          }
          renderItem={({ item }) => <BlockedRow account={item} />}
        />
      ) : (
        <QueryUnavailable
          view={view}
          subject="your blocked accounts"
          onRetry={() => query.refetch()}
          loading={<RowListSkeleton />}
          className="flex-1 justify-center"
        />
      )}
    </View>
  );
}
