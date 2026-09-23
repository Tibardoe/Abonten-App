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
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

// Native echo of the web settings/security page (SecurityInputFields):
// add / change / confirm the email and add / change the phone number, each
// with a one-time code and without signing out (EmailVerificationForm,
// PhoneVerificationForm — shared with Account setup and checkout). Linked
// Google identity is shown read-only.

function VerifiedTag({ verified }: { verified: boolean }) {
  return verified ? (
    <View className="flex-row items-center gap-1">
      <Icon name="checkmark-circle" size={16} tone="success" />
      <AppText variant="caption" tone="success" className="font-semibold">
        Verified
      </AppText>
    </View>
  ) : (
    <AppText variant="caption">Unverified</AppText>
  );
}

export default function Security() {
  const toast = useToast();
  const { session, signOut } = useSession();
  const user = session?.user;
  const google = (user?.identities ?? []).some((i) => i.provider === "google");

  // ---- delete account ---------------------------------------------------
  const [deleteBusy, setDeleteBusy] = useState(false);

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This permanently removes your account and can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "Your profile, favourites and saved payment details are removed and you are signed out everywhere. Tickets you bought and payment records are kept for accounting. Places you own stay listed, unclaimed.",
              [
                { text: "Keep my account", style: "cancel" },
                {
                  text: "Delete forever",
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
        toast.error("Couldn't delete", {
          description: res.message ?? "Please try again.",
        });
        return;
      }
      await unregisterPushToken();
      await signOut();
    } catch {
      toast.error("Network error", { description: "Please try again." });
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
        title="Security"
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
              <AppText variant="caption">Email</AppText>
              <AppText variant="body">
                {user?.email || "No email added"}
              </AppText>
            </View>
            {user?.email ? (
              <VerifiedTag verified={!!user.email_confirmed_at} />
            ) : null}
          </View>

          {pendingEmail && !emailOpen ? (
            <AppText variant="small" className="pb-2">
              Waiting for the code sent to {maskEmail(pendingEmail)}.
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
                  ? "Enter the code"
                  : user?.email && !user.email_confirmed_at
                    ? "Verify email"
                    : user?.email
                      ? "Change email"
                      : "Add email"
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
              <AppText variant="caption">Phone</AppText>
              <AppText variant="body">
                {user?.phone || "No phone number added"}
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
              title={user?.phone ? "Change phone number" : "Add phone number"}
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
                {google ? "Linked" : "Not linked"}
              </AppText>
            </View>
          </View>
        </Card>

        <Divider />
        <AppText variant="caption">
          Email and phone changes are each confirmed with a one-time code. You
          stay signed in.
        </AppText>

        {/* Danger zone */}
        <Card padded className="mt-4 border-destructive/40">
          <View className="gap-1 py-1">
            <AppText variant="bodyStrong" tone="error">
              Delete account
            </AppText>
            <AppText variant="caption">
              Permanently delete your account and all of its data. This can't be
              undone.
            </AppText>
          </View>
          <Button
            title={deleteBusy ? "Deleting…" : "Delete account"}
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
