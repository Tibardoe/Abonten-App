import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { unregisterPushToken } from "@/features/notifications/usePushRegistration";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  EMAIL_OTP_CODE_LENGTH,
  isLikelyEmail,
  maskEmail,
} from "@abonten/core/emailOtp";
import { HUBTEL_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import {
  AppText,
  Button,
  Card,
  Divider,
  Field,
  Icon,
  Input,
  OtpInput,
  useToast,
} from "@abonten/ui-native";
import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";

// Native echo of the web settings/security page (SecurityInputFields):
// change/add email (Supabase 6-digit code, verifyOtp type "email_change" —
// runs on the current session, no sign-out) and change/add phone (Hubtel
// OTP -> Admin API, via /api/mobile/account/phone/*). Linked Google identity
// is shown read-only.

const DEFAULT_DIAL_CODE = "+233";

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
              "Your tickets, places, reviews and bookings will be gone for good.",
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

  // ---- email --------------------------------------------------------------
  // emailPhase: "new" = enter the code sent to the NEW address;
  //             "current" = (Secure email change only) also enter the code
  //             Supabase sent to the CURRENT address — the change only
  //             completes once both are confirmed.
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailPhase, setEmailPhase] = useState<"new" | "current">("new");
  const [changeFromEmail, setChangeFromEmail] = useState<string | null>(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  function resetEmail() {
    setEmailOpen(false);
    setEmail("");
    setPendingEmail(null);
    setEmailPhase("new");
    setChangeFromEmail(null);
    setEmailOtp("");
    setEmailErr(null);
  }

  async function sendEmailCode() {
    setEmailErr(null);
    setEmailMsg(null);
    const next = email.trim().toLowerCase();
    if (!isLikelyEmail(next)) {
      setEmailErr("Enter a valid email address.");
      return;
    }
    if (next === user?.email) {
      setEmailErr("That's already your email address.");
      return;
    }
    setEmailBusy(true);
    try {
      // Supabase emails a 6-digit code (the "Confirm email change" template
      // must carry {{ .Token }} — see docs/architecture/email-auth.md).
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) {
        const conflict =
          error.status === 422 ||
          /already.*(registered|exists|in use)/i.test(error.message);
        setEmailErr(
          conflict
            ? "That email can't be used."
            : "Couldn't send a code. Please try again.",
        );
        return;
      }
      setPendingEmail(next);
      setChangeFromEmail(user?.email ?? null);
      setEmailPhase("new");
      setEmailOtp("");
    } catch {
      setEmailErr("Network error. Please try again.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function verifyEmailCode(value?: string) {
    if (!pendingEmail) return;
    const token = (value ?? emailOtp).trim();
    if (token.length < EMAIL_OTP_CODE_LENGTH) return;

    // Which address this code was sent to.
    const target = emailPhase === "current" ? changeFromEmail : pendingEmail;
    if (!target) return;

    setEmailErr(null);
    setEmailBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: target,
        token,
        type: "email_change",
      });
      if (error) {
        setEmailErr(
          /expired/i.test(error.message)
            ? "That code has expired. Request a new one."
            : "That code isn't correct.",
        );
        return;
      }

      // Secure email change ON: the address only flips once BOTH codes are
      // in. After the NEW-address code, if it's not confirmed yet, collect
      // the CURRENT-address code. Otherwise we're done.
      if (emailPhase === "new" && !data.user?.email_confirmed_at) {
        setEmailOtp("");
        setEmailPhase("current");
        return;
      }

      await supabase.auth.refreshSession();
      setEmailMsg("Email updated.");
      resetEmail();
    } catch {
      setEmailErr("Network error. Please try again.");
    } finally {
      setEmailBusy(false);
    }
  }

  // ---- phone --------------------------------------------------------------
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [dialCode, setDialCode] = useState(DEFAULT_DIAL_CODE);
  const [rawPhone, setRawPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);

  function resetPhone() {
    setPhoneOpen(false);
    setRawPhone("");
    setPhoneE164(null);
    setOtp("");
    setPhoneErr(null);
  }

  async function sendCode() {
    setPhoneErr(null);
    setPhoneMsg(null);
    if (rawPhone.trim().length < 6) {
      setPhoneErr("Enter your phone number.");
      return;
    }
    setPhoneBusy(true);
    try {
      const res = await api.account.requestPhoneChange({
        dialCode: dialCode.trim(),
        rawPhone: rawPhone.trim(),
      });
      if (res.status !== 200 || !res.data) {
        setPhoneErr(res.message ?? "Couldn't send a code. Try again.");
        return;
      }
      setPhoneE164(res.data.phoneE164);
    } catch {
      setPhoneErr("Network error. Please try again.");
    } finally {
      setPhoneBusy(false);
    }
  }

  // `code` is passed by OtpInput's onComplete (the state update from the
  // final digit hasn't flushed yet when it fires); the Verify button falls
  // back to the `otp` state.
  async function verifyCode(code?: string) {
    if (!phoneE164) return;
    const value = (code ?? otp).trim();
    if (value.length < HUBTEL_OTP_CODE_LENGTH) return;
    setPhoneErr(null);
    setPhoneBusy(true);
    try {
      const res = await api.account.verifyPhoneChange({
        phoneE164,
        code: value,
      });
      if (res.status !== 200) {
        setPhoneErr(res.message ?? "That code didn't work. Try again.");
        return;
      }
      // Pull the new phone claim into the local session.
      await supabase.auth.refreshSession();
      setPhoneMsg("Phone number updated.");
      resetPhone();
    } catch {
      setPhoneErr("Network error. Please try again.");
    } finally {
      setPhoneBusy(false);
    }
  }

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

          {emailOpen ? (
            <View className="gap-3 pt-2">
              {pendingEmail ? (
                <>
                  <Field
                    label={
                      emailPhase === "current"
                        ? `One more code — sent to your current address${
                            changeFromEmail
                              ? ` (${maskEmail(changeFromEmail)})`
                              : ""
                          }`
                        : `Code sent to ${maskEmail(pendingEmail)}`
                    }
                  >
                    <OtpInput
                      value={emailOtp}
                      onChange={setEmailOtp}
                      onComplete={verifyEmailCode}
                      length={EMAIL_OTP_CODE_LENGTH}
                      disabled={emailBusy}
                      invalid={!!emailErr}
                    />
                  </Field>
                  {emailErr ? (
                    <AppText variant="small" tone="error">
                      {emailErr}
                    </AppText>
                  ) : null}
                  <View className="flex-row gap-2">
                    <Button
                      title={emailBusy ? "Verifying…" : "Verify"}
                      onPress={() => verifyEmailCode()}
                      disabled={
                        emailBusy ||
                        emailOtp.trim().length < EMAIL_OTP_CODE_LENGTH
                      }
                    />
                    {emailPhase === "new" ? (
                      <Button
                        title="Resend"
                        variant="outline"
                        onPress={sendEmailCode}
                        disabled={emailBusy}
                      />
                    ) : null}
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={resetEmail}
                      disabled={emailBusy}
                    />
                  </View>
                </>
              ) : (
                <>
                  <Field label="New email">
                    <Input
                      value={email}
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                    />
                  </Field>
                  {emailErr ? (
                    <AppText variant="small" tone="error">
                      {emailErr}
                    </AppText>
                  ) : null}
                  <View className="flex-row gap-2">
                    <Button
                      title={emailBusy ? "Sending…" : "Send code"}
                      onPress={sendEmailCode}
                      disabled={emailBusy}
                    />
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={resetEmail}
                      disabled={emailBusy}
                    />
                  </View>
                </>
              )}
            </View>
          ) : (
            <Button
              title={user?.email ? "Change email" : "Add email"}
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
            <View className="gap-3 pt-2">
              {phoneE164 ? (
                <>
                  <Field label={`Code sent to ${phoneE164}`}>
                    <OtpInput
                      value={otp}
                      onChange={setOtp}
                      onComplete={verifyCode}
                      length={HUBTEL_OTP_CODE_LENGTH}
                      disabled={phoneBusy}
                      invalid={!!phoneErr}
                    />
                  </Field>
                  {phoneErr ? (
                    <AppText variant="small" tone="error">
                      {phoneErr}
                    </AppText>
                  ) : null}
                  <View className="flex-row gap-2">
                    <Button
                      title={phoneBusy ? "Verifying…" : "Verify"}
                      onPress={() => verifyCode()}
                      disabled={
                        phoneBusy || otp.trim().length < HUBTEL_OTP_CODE_LENGTH
                      }
                    />
                    <Button
                      title="Resend"
                      variant="outline"
                      onPress={sendCode}
                      disabled={phoneBusy}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View className="flex-row gap-2">
                    <View className="w-20">
                      <Field label="Code">
                        <Input value={dialCode} onChangeText={setDialCode} />
                      </Field>
                    </View>
                    <View className="flex-1">
                      <Field label="Phone number">
                        <Input
                          value={rawPhone}
                          onChangeText={setRawPhone}
                          placeholder="24 123 4567"
                          keyboardType="phone-pad"
                        />
                      </Field>
                    </View>
                  </View>
                  {phoneErr ? (
                    <AppText variant="small" tone="error">
                      {phoneErr}
                    </AppText>
                  ) : null}
                  <View className="flex-row gap-2">
                    <Button
                      title={phoneBusy ? "Sending…" : "Send code"}
                      onPress={sendCode}
                      disabled={phoneBusy}
                    />
                    <Button
                      title="Cancel"
                      variant="outline"
                      onPress={resetPhone}
                      disabled={phoneBusy}
                    />
                  </View>
                </>
              )}
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
