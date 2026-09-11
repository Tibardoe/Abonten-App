import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import {
  bindPendingInvite,
  captureInvite,
} from "@/features/rewards/inviteCapture";
import { api } from "@/lib/api";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { bindResultMessage } from "@abonten/core/rewards/invite";
import type { ReferralBindOutcome } from "@abonten/types/rewards";
import {
  AppText,
  Avatar,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from "@abonten/ui-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

// A friend's invite opened in the app (abontenhub.com/invite/CODE, routed
// here by +native-intent). Signed out: the invite is kept on the device and
// applied right after sign-up. Signed in: it's applied here.
export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<ReferralBindOutcome | null>(null);
  const [binding, setBinding] = useState(false);

  const info = useQuery({
    queryKey: ["mobile", "invite-code", code],
    enabled: !!code,
    queryFn: async () => (await api.rewards.resolveReferral(code)).data ?? null,
    staleTime: 5 * 60_000,
  });

  // Signed in already: apply it now (shared with useInviteBinding, so a
  // launch from the link sends one request, not two).
  useEffect(() => {
    if (!session || !code) return;
    let active = true;
    setBinding(true);
    (async () => {
      await captureInvite(code, "link");
      const result = await bindPendingInvite();
      if (!active) return;
      setOutcome(result);
      setBinding(false);
      if (result?.result === "bound") {
        qc.invalidateQueries({ queryKey: ["mobile", "rewards"] });
      }
    })();
    return () => {
      active = false;
    };
  }, [session, code, qc]);

  const data = info.data;
  const name = data?.referrerName ?? "A friend";
  const offer =
    data?.programOn && data.welcomeMinor
      ? `Get ${formatCredit(data.welcomeMinor)} off your first ticket${
          data.minOrderMinor
            ? ` of ${formatCredit(data.minOrderMinor)} or more`
            : ""
        }.`
      : null;

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title="Invite" backFallback="/(app)/(tabs)" />
      {info.isLoading ? (
        <View className="gap-4 p-4">
          <Skeleton height={200} radius={16} />
        </View>
      ) : !data?.valid ? (
        <EmptyState
          icon="link-outline"
          title="This invite link isn't valid"
          description="Check the link with the person who sent it. You can still explore what's on near you."
        />
      ) : (
        <ScrollView contentContainerClassName="gap-5 p-4 pb-16">
          <Card elevated className="items-center gap-3 py-6">
            <Avatar
              publicId={data.referrerAvatar?.publicId}
              version={data.referrerAvatar?.version}
              size={72}
            />
            <AppText variant="sectionTitle" className="text-center">
              {name} invited you to Abonten
            </AppText>
            <AppText variant="muted" className="text-center">
              Find events and places near you, buy tickets in a few taps, and
              keep them on your phone.
            </AppText>
            {offer ? (
              <View className="mt-1 rounded-xl bg-muted px-4 py-3">
                <AppText variant="bodyStrong" className="text-center">
                  {offer}
                </AppText>
                <AppText variant="caption" className="text-center">
                  Verify your phone number after you sign up to get it.
                </AppText>
              </View>
            ) : null}
          </Card>

          {session ? (
            binding ? (
              <AppText variant="muted" className="text-center">
                Applying the invite…
              </AppText>
            ) : outcome ? (
              <Card className="gap-3">
                <AppText
                  variant="body"
                  tone={
                    bindResultMessage(outcome).tone === "error"
                      ? "error"
                      : undefined
                  }
                >
                  {bindResultMessage(outcome).text}
                </AppText>
                <Button
                  title="Go to Rewards"
                  variant="outline"
                  onPress={() => router.replace("/(app)/rewards")}
                />
              </Card>
            ) : (
              <AppText variant="muted" className="text-center">
                We couldn&apos;t apply the invite right now. It will be tried
                again next time you open the app.
              </AppText>
            )
          ) : (
            <View className="gap-3">
              <Button
                title="Sign up to join"
                size="lg"
                fullWidth
                onPress={() => router.push("/(auth)/sign-in")}
              />
              <AppText variant="caption" className="text-center">
                Invite codes work for new accounts, in their first week.
              </AppText>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
