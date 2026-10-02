import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  bindPendingInvite,
  captureInvite,
} from "@/features/rewards/inviteCapture";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { useQueryView } from "@/lib/useQueryView";
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
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

// A friend's invite opened in the app (abontenhub.com/invite/CODE, routed
// here by +native-intent). Signed out: the invite is kept on the device and
// applied right after sign-up. Signed in: it's applied here.
export default function InviteScreen() {
  const { locale } = useLocale();
  const t = useTranslations("rewards");
  const tc = useTranslations("core");

  const { code } = useLocalSearchParams<{ code: string }>();
  const { session } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [outcome, setOutcome] = useState<ReferralBindOutcome | null>(null);
  const [binding, setBinding] = useState(false);

  const info = useQuery({
    queryKey: ["mobile", "invite-code", code],
    enabled: !!code,
    queryFn: async () =>
      settleEnvelope(await api.rewards.resolveReferral(code)).data ?? null,
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
  // "This invite isn't valid" is only ever said for an answer the server
  // gave; loading, offline and failed are told apart.
  const infoView = useQueryView(info);
  const name = data?.referrerName ?? "A friend";
  const offer =
    data?.programOn && data.welcomeMinor
      ? data.minOrderMinor
        ? t("getOffYourFirstTicketOfOrMore", {
            formatCredit: formatCredit(
              data.welcomeMinor,
              data.currency,
              locale,
            ),
            min: formatCredit(data.minOrderMinor, data.currency, locale),
          })
        : t("getOffYourFirstTicket", {
            formatCredit: formatCredit(
              data.welcomeMinor,
              data.currency,
              locale,
            ),
          })
      : null;

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("invite")}
        backFallback="/(app)/(tabs)"
      />
      {infoView.kind !== "content" && infoView.kind !== "empty" ? (
        <QueryUnavailable
          view={infoView}
          subject={t("thisInvite")}
          onRetry={() => info.refetch()}
          loading={
            <View className="gap-4 p-4">
              <Skeleton height={200} radius={16} />
            </View>
          }
        />
      ) : !data?.valid ? (
        <EmptyState
          icon="link-outline"
          title={t("thisInviteLinkIsnTValid")}
          description={t("checkTheLinkWithThePerson")}
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
              {t("invitedYouToAbonten", { name: name })}
            </AppText>
            <AppText variant="muted" className="text-center">
              {t("findEventsAndPlacesNearYou")}
            </AppText>
            {offer ? (
              <View className="mt-1 rounded-xl bg-muted px-4 py-3">
                <AppText variant="bodyStrong" className="text-center">
                  {offer}
                </AppText>
                <AppText variant="caption" className="text-center">
                  {t("verifyYourPhoneNumberAfterYou")}
                </AppText>
              </View>
            ) : null}
          </Card>

          {session ? (
            binding ? (
              <AppText variant="muted" className="text-center">
                {t("applyingTheInvite")}
              </AppText>
            ) : outcome ? (
              <Card className="gap-3">
                <AppText
                  variant="body"
                  tone={
                    bindResultMessage(tc, outcome).tone === "error"
                      ? "error"
                      : undefined
                  }
                >
                  {bindResultMessage(tc, outcome).text}
                </AppText>
                <Button
                  title={t("goToRewards")}
                  variant="outline"
                  onPress={() => router.replace("/(app)/rewards")}
                />
              </Card>
            ) : (
              <AppText variant="muted" className="text-center">
                {t("weCouldnTApplyTheInvite2")}
              </AppText>
            )
          ) : (
            <View className="gap-3">
              <Button
                title={t("signUpToJoin")}
                size="lg"
                fullWidth
                onPress={() => router.push("/(auth)/sign-in")}
              />
              <AppText variant="caption" className="text-center">
                {t("inviteCodesWorkForNewAccounts")}
              </AppText>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
