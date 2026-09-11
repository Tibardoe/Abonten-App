import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import { AppText, Button } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { captureInvite, readPendingInvite } from "./inviteCapture";
import { useInvitesLive } from "./useRewards";

// "Have an invite code?" on the sign-in screen. The code is kept on the
// device and applied once sign-in finishes (useInviteBinding), whichever way
// the person signs in. Filled in already when they came from an invite link
// or the Play Store install referrer.
export function InviteCodeField() {
  const c = useThemeColors();
  const live = useInvitesLive();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readPendingInvite().then((pending) => {
      if (!pending) return;
      setCode(pending.code);
      setSaved(pending.code);
      setOpen(true);
    });
  }, []);

  if (!live.data && !saved) return null;

  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        hitSlop={8}
        className="self-center active:opacity-60"
      >
        <AppText variant="small" tone="muted" className="font-semibold">
          Have an invite code?
        </AppText>
      </Pressable>
    );
  }

  async function save() {
    const normalized = normalizeReferralCode(code);
    if (!normalized) {
      setError("Enter the 7-character invite code.");
      return;
    }
    await captureInvite(normalized, "typed");
    setCode(normalized);
    setSaved(normalized);
    setError(null);
  }

  return (
    <View className="gap-2 rounded-2xl border border-border bg-card p-4">
      <AppText variant="label">Invite code</AppText>
      <View className="flex-row gap-2">
        <TextInput
          className={[
            "h-[48px] flex-1 rounded-xl border bg-background px-3 text-[16px] tracking-[3px] text-foreground",
            error ? "border-destructive" : "border-input",
          ].join(" ")}
          value={code}
          onChangeText={(v) => {
            setCode(v.toUpperCase());
            setSaved(null);
            setError(null);
          }}
          placeholder="K7QX2MA"
          placeholderTextColor={c["muted-foreground"]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          accessibilityLabel="Invite code"
          onSubmitEditing={save}
          returnKeyType="done"
        />
        <Button
          title={saved && saved === code ? "Saved" : "Save"}
          variant="outline"
          disabled={code.trim().length === 0 || saved === code}
          onPress={save}
        />
      </View>
      {error ? (
        <AppText variant="small" tone="error">
          {error}
        </AppText>
      ) : saved ? (
        <AppText variant="caption">
          We&apos;ll apply it when you sign in. Invite codes work for new
          accounts, in their first week.
        </AppText>
      ) : null}
    </View>
  );
}
