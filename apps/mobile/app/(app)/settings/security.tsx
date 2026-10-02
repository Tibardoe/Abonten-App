import { useSession } from "@/auth/SessionProvider";
import { EmailVerificationForm } from "@/components/account/EmailVerificationForm";
import { PhoneVerificationForm } from "@/components/account/PhoneVerificationForm";
import { AppHeader } from "@/components/app/AppHeader";
import { unregisterPushToken } from "@/features/notifications/usePushRegistration";
import { api } from "@/lib/api";
import { maskEmail } from "@abonten/core/emailOtp";
import {
  AppText,
  Button,
  Card,
  Divider,
  Icon,
  useToast,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

// Native echo of the web settings/security page (SecurityInputFields):
// add / change / confirm the email and add / change the phone number, each
// with a one-time code and without signing out (EmailVerificationForm,
// PhoneVerificationForm — shared with Account setup and checkout). Linked
// Google identity is shown read-only.

function VerifiedTag({ verified }: { verified: boolean }) {
  const t = useTranslations("settings");

  return verified ? (
    <View className="flex-row items-center gap-1">
      <Icon name="checkmark-circle" size={16} tone="success" />
      <AppText variant="caption" tone="success" className="font-semibold">
        {t("verified")}
      </AppText>
    </View>
  ) : (
    <AppText variant="caption">{t("unverified")}</AppText>
  );
}

export default function Security() {
  const t = useTranslations("settings");

  const toast = useToast();
  const { session, signOut } = useSession();
  const user = session?.user;
  const google = (user?.identities ?? []).some((i) => i.provider === "google");

  // ---- delete account ---------------------------------------------------
  const [deleteBusy, setDeleteBusy] = useState(false);

  function confirmDelete() {
    Alert.alert(
      t("deleteYourAccount"),
      t("thisPermanentlyRemovesYourAccountAnd"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("deleteAccount"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t("areYouSure"),
              t("yourProfileFavouritesAndSavedPayment"),
              [
                { text: t("keepMyAccount"), style: "cancel" },
                {
                  text: t("deleteForever"),
                  style: "destructive",
                  onPress: runDelete,
                },
              ],
            );
          },
        },
      ],
    );
  }

  async function runDelete() {
    setDeleteBusy(true);
    try {
      const res = await api.account.deleteAccount();
      if (res.status !== 200) {
        toast.error(t("couldnTDelete"), {
          description: res.message ?? t("pleaseTryAgain"),
        });
        return;
      }
      await unregisterPushToken();
      await signOut();
    } catch {
      toast.error(t("networkError"), { description: t("pleaseTryAgain") });
    } finally {
      setDeleteBusy(false);
    }
  }

  // ---- email / phone -------------------------------------------------------
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const pendingEmail = (user as { new_email?: string | null } | undefined)
    ?.new_email;

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("securityTitle")}
        backFallback="/(app)/settings"
      />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-3 p-4"
      >
        {/* Email */}
        <Card padded>
          <View className="flex-row items-center justify-between py-1">
            <View className="flex-1">
              <AppText variant="caption">{t("email")}</AppText>
              <AppText variant="body">
                {user?.email || t("noEmailAdded")}
              </AppText>
            </View>
            {user?.email ? (
              <VerifiedTag verified={!!user.email_confirmed_at} />
            ) : null}
          </View>

          {pendingEmail && !emailOpen ? (
            <AppText variant="small" className="pb-2">
              {t("waitingForTheCodeSentTo", {
                maskEmail: maskEmail(pendingEmail),
              })}
            </AppText>
          ) : null}
          {emailOpen ? (
            <View className="pt-2">
              <EmailVerificationForm
                onDone={(message) => {
                  setEmailOpen(false);
                  setEmailMsg(message);
                }}
                onCancel={() => setEmailOpen(false)}
              />
            </View>
          ) : (
            <Button
              title={
                pendingEmail
                  ? t("enterTheCode")
                  : user?.email && !user.email_confirmed_at
                    ? t("verifyEmail")
                    : user?.email
                      ? t("changeEmail")
                      : t("addEmail")
              }
              variant="outline"
              onPress={() => {
                setEmailOpen(true);
                setEmailMsg(null);
              }}
            />
          )}

          {emailMsg ? (
            <AppText variant="small" tone="brand" className="pt-2">
              {emailMsg}
            </AppText>
          ) : null}
        </Card>

        {/* Phone */}
        <Card padded>
          <View className="flex-row items-center justify-between py-1">
            <View className="flex-1">
              <AppText variant="caption">{t("phone")}</AppText>
              <AppText variant="body">
                {user?.phone || t("noPhoneNumberAdded")}
              </AppText>
            </View>
            {user?.phone ? (
              <VerifiedTag verified={!!user.phone_confirmed_at} />
            ) : null}
          </View>

          {phoneOpen ? (
            <View className="pt-2">
              <PhoneVerificationForm
                onDone={(message) => {
                  setPhoneOpen(false);
                  setPhoneMsg(message);
                }}
                onCancel={() => setPhoneOpen(false)}
              />
            </View>
          ) : (
            <Button
              title={user?.phone ? t("changePhoneNumber") : t("addPhoneNumber")}
              variant="outline"
              onPress={() => {
                setPhoneOpen(true);
                setPhoneMsg(null);
              }}
            />
          )}

          {phoneMsg ? (
            <AppText variant="small" tone="brand" className="pt-2">
              {phoneMsg}
            </AppText>
          ) : null}
        </Card>

        {/* Google */}
        <Card padded>
          <View className="flex-row items-center justify-between py-1">
            <View className="flex-1">
              <AppText variant="caption">Google</AppText>
              <AppText variant="body">
                {google ? t("linked") : t("notLinked")}
              </AppText>
            </View>
          </View>
        </Card>

        <Divider />
        <AppText variant="caption">{t("emailAndPhoneChangesAreEach")}</AppText>

        {/* Danger zone */}
        <Card padded className="mt-4 border-destructive/40">
          <View className="gap-1 py-1">
            <AppText variant="bodyStrong" tone="error">
              {t("deleteAccount")}
            </AppText>
            <AppText variant="caption">
              {t("permanentlyDeleteYourAccountAndAll")}
            </AppText>
          </View>
          <Button
            title={deleteBusy ? t("deleting") : t("deleteAccount")}
            variant="outline"
            className="border-destructive"
            disabled={deleteBusy}
            onPress={confirmDelete}
          />
        </Card>
      </ScrollView>
    </View>
  );
}
