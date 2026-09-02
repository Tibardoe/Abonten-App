import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  AppText,
  Button,
  Card,
  Divider,
  Field,
  Icon,
  Input,
} from "@abonten/ui-native";
import { useState } from "react";
import { ScrollView, View } from "react-native";

// Native echo of the web settings/security page (SecurityInputFields):
// change email (Supabase's own confirmation-link flow) and change/add phone
// (Hubtel OTP -> Admin API, via /api/mobile/account/phone/*). Linked Google
// identity is shown read-only. The email confirmation link opens the web
// callback — the app picks up the change on its next session refresh.

const DEFAULT_DIAL_CODE = "+233";
const WEB_ORIGIN = process.env.EXPO_PUBLIC_API_BASE_URL;

function VerifiedTag({ verified }: { verified: boolean }) {
  return verified ? (
    <View className="flex-row items-center gap-1">
      <Icon name="checkmark-circle" size={16} color="#22c55e" />
      <AppText className="text-[12px] text-primary">Verified</AppText>
    </View>
  ) : (
    <AppText className="text-[12px] text-muted-foreground">Unverified</AppText>
  );
}

export default function Security() {
  const { session } = useSession();
  const user = session?.user;
  const google = (user?.identities ?? []).some((i) => i.provider === "google");

  // ---- email --------------------------------------------------------------
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);

  async function submitEmail() {
    setEmailErr(null);
    setEmailMsg(null);
    const next = email.trim();
    if (!next || next === user?.email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setEmailErr("Enter a valid email address.");
      return;
    }
    setEmailBusy(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: next },
        WEB_ORIGIN
          ? { emailRedirectTo: `${WEB_ORIGIN}/auth/callback` }
          : undefined,
      );
      if (error) {
        setEmailErr(error.message);
        return;
      }
      setEmailMsg(
        `We've sent a confirmation link to ${next}. Open it to verify your new email.`,
      );
      setEmail("");
      setEmailOpen(false);
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

  async function verifyCode() {
    if (!phoneE164) return;
    setPhoneErr(null);
    setPhoneBusy(true);
    try {
      const res = await api.account.verifyPhoneChange({
        phoneE164,
        code: otp.trim(),
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
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4"
    >
      {/* Email */}
      <Card padded>
        <View className="flex-row items-center justify-between py-1">
          <View className="flex-1">
            <AppText variant="caption">Email</AppText>
            <AppText variant="body">{user?.email || "No email added"}</AppText>
          </View>
          {user?.email ? (
            <VerifiedTag verified={!!user.email_confirmed_at} />
          ) : null}
        </View>

        {emailOpen ? (
          <View className="gap-3 pt-2">
            <Field label="New email">
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </Field>
            {emailErr ? (
              <AppText className="text-[13px] text-destructive">
                {emailErr}
              </AppText>
            ) : null}
            <View className="flex-row gap-2">
              <Button
                title={emailBusy ? "Sending…" : "Send confirmation"}
                onPress={submitEmail}
                disabled={emailBusy}
              />
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => {
                  setEmailOpen(false);
                  setEmailErr(null);
                }}
                disabled={emailBusy}
              />
            </View>
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
          <AppText className="pt-2 text-[13px] text-primary">
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
                  <Input
                    value={otp}
                    onChangeText={setOtp}
                    placeholder="0000"
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    maxLength={6}
                  />
                </Field>
                {phoneErr ? (
                  <AppText className="text-[13px] text-destructive">
                    {phoneErr}
                  </AppText>
                ) : null}
                <View className="flex-row gap-2">
                  <Button
                    title={phoneBusy ? "Verifying…" : "Verify"}
                    onPress={verifyCode}
                    disabled={phoneBusy || otp.trim().length < 4}
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
                  <AppText className="text-[13px] text-destructive">
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
          <AppText className="pt-2 text-[13px] text-primary">
            {phoneMsg}
          </AppText>
        ) : null}
      </Card>

      {/* Google */}
      <Card padded>
        <View className="flex-row items-center justify-between py-1">
          <View className="flex-1">
            <AppText variant="caption">Google</AppText>
            <AppText variant="body">{google ? "Linked" : "Not linked"}</AppText>
          </View>
        </View>
      </Card>

      <Divider />
      <AppText variant="caption">
        Changing your email sends a confirmation link — open it to finish. A new
        phone number is verified by a one-time code.
      </AppText>
    </ScrollView>
  );
}
