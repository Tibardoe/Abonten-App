import { AccountSetupChecklist } from "@/components/account/AccountSetupChecklist";
import { EmailVerificationForm } from "@/components/account/EmailVerificationForm";
import { PhoneVerificationForm } from "@/components/account/PhoneVerificationForm";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { FormSkeleton } from "@/components/skeletons";
import { useProfileCompletion } from "@/features/profile/useProfileCompletion";
import { useQueryView } from "@/lib/useQueryView";
import type { ProfileCompletionItem } from "@abonten/core/profileCompletion";
import {
  AppText,
  Icon,
  ProgressBar,
  Refresher,
  Sheet,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

// Account setup, in one place: the five steps (name, username, photo,
// verified email, verified phone), which are done, why each one helps, and
// a direct way to finish each. Profile steps open Edit Profile; the email
// and phone steps are finished right here in a sheet with a one-time code,
// so nobody is sent hunting through Settings › Security.
//
// Nothing here is required to use Abonten — the copy says what each step is
// for (an email is what paying for tickets needs), never that it's
// mandatory.

export default function AccountSetupScreen() {
  const t = useTranslations("settings");

  const router = useRouter();
  const toast = useToast();
  const completion = useProfileCompletion();
  const view = useQueryView(completion);
  const [sheet, setSheet] = useState<"email" | "phone" | null>(null);

  const onItemPress = (item: ProfileCompletionItem) => {
    if (item.group === "profile") {
      router.push("/(app)/settings/edit-profile");
      return;
    }
    setSheet(item.key === "email" ? "email" : "phone");
  };

  const done = (message: string) => {
    setSheet(null);
    toast.success(message);
  };

  const c = completion.data;

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("accountSetup")}
        backFallback="/(app)/settings"
      />
      {c ? (
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-6 p-4 pb-12"
          refreshControl={<Refresher onRefresh={() => completion.refetch()} />}
        >
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            {c.isComplete ? (
              <View className="flex-row items-center gap-3">
                <Icon name="checkmark-circle" size={28} tone="success" />
                <View className="flex-1">
                  <AppText variant="bodyStrong">{t("youReAllSet")}</AppText>
                  <AppText variant="meta">
                    {t("yourProfileIsCompleteAndYou")}
                  </AppText>
                </View>
              </View>
            ) : (
              <>
                <AppText variant="bodyStrong">
                  {c.total - c.completedCount === 1
                    ? t("oneStepLeft")
                    : t("stepsLeft2", { value: c.total - c.completedCount })}
                </AppText>
                <AppText variant="meta">
                  {t("noneOfTheseAreRequiredTo")}
                </AppText>
              </>
            )}
            <ProgressBar
              value={c.completedCount / c.total}
              label={t("ofStepsDone", {
                completedCount: c.completedCount,
                total: c.total,
              })}
            />
          </View>

          <AccountSetupChecklist completion={c} onItemPress={onItemPress} />
        </ScrollView>
      ) : (
        <QueryUnavailable
          view={view}
          subject="your account setup"
          onRetry={() => completion.refetch()}
          loading={<FormSkeleton fields={5} />}
          className="flex-1 justify-center"
        />
      )}

      <Sheet
        open={sheet === "email"}
        onClose={() => setSheet(null)}
        title={t("yourEmail")}
      >
        <View className="gap-3">
          <AppText variant="meta">{t("neededToPayForTicketsAnd")}</AppText>
          {sheet === "email" ? (
            <EmailVerificationForm
              onDone={done}
              onCancel={() => setSheet(null)}
            />
          ) : null}
        </View>
      </Sheet>

      <Sheet
        open={sheet === "phone"}
        onClose={() => setSheet(null)}
        title={t("yourPhoneNumber")}
      >
        <View className="gap-3">
          <AppText variant="meta">{t("letsYouSignInWithA")}</AppText>
          {sheet === "phone" ? (
            <PhoneVerificationForm
              onDone={done}
              onCancel={() => setSheet(null)}
            />
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
