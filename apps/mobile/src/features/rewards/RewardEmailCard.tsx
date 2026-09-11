import { api } from "@/lib/api";
import type { RewardEmailPreference } from "@abonten/types/rewards";
import { AppText, Card, useToast } from "@abonten/ui-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch, View } from "react-native";

const KEY = ["mobile", "rewards", "reward-emails"] as const;

// "Email me when credit is ready" on the Rewards screen, the native echo of
// the web toggle. The same choice the unsubscribe link in a reward email
// changes. Phone-only accounts have no email address, so it's shown off
// and disabled with a note.
export function RewardEmailCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await api.notifications.rewardEmails();
      return res.status === 200 ? (res.data ?? null) : null;
    },
    staleTime: 60_000,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      api.notifications.setRewardEmails(enabled),
    onMutate: (enabled) => {
      const previous = qc.getQueryData<RewardEmailPreference | null>(KEY);
      if (previous)
        qc.setQueryData(KEY, { ...previous, rewardEmails: enabled });
      return { previous };
    },
    onSuccess: (res, _enabled, context) => {
      if (res.status === 200 && res.data) {
        qc.setQueryData(KEY, res.data);
        toast.success(res.message ?? "Saved");
      } else {
        qc.setQueryData(KEY, context?.previous ?? null);
        toast.error("Couldn't save that", {
          description: res.message ?? "Please try again.",
        });
      }
    },
    onError: (_e, _enabled, context) => {
      qc.setQueryData(KEY, context?.previous ?? null);
      toast.error("Couldn't save that", { description: "Please try again." });
    },
  });

  if (!data) return null;
  const hasEmail = !!data.email;

  return (
    <Card className="gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-1">
          <AppText variant="cardTitle">Email me when credit is ready</AppText>
          <AppText variant="small" tone="muted">
            {hasEmail
              ? `To ${data.email}. At most one email every 12 hours.`
              : "Your account has no email address, so you'll get these in the app only."}
          </AppText>
        </View>
        <Switch
          accessibilityLabel="Email me when credit is ready"
          value={hasEmail && data.rewardEmails}
          disabled={!hasEmail || save.isPending}
          onValueChange={(v) => save.mutate(v)}
        />
      </View>
    </Card>
  );
}
