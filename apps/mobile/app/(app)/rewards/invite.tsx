import { QrCode } from "@/components/QrCode";
import { AppHeader } from "@/components/app/AppHeader";
import { copyText } from "@/features/messaging/clipboardSupport";
import { useReferralInvite } from "@/features/rewards/useRewards";
import { api } from "@/lib/api";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import {
  bindResultMessage,
  inviteShareMessage,
} from "@abonten/core/rewards/invite";
import { normalizeReferralCode } from "@abonten/core/rewards/referralCode";
import type { ReferralInvite } from "@abonten/types/rewards";
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Refresher,
  Skeleton,
  useToast,
} from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Linking, ScrollView, Share, TextInput, View } from "react-native";

// Rewards › Invite friends (native echo of the web invite panel): the
// personal invite link as a share sheet that opens WhatsApp first -- how
// most people share in Ghana -- plus a QR code for inviting in person, what
// each side gets, and how it's going. Friends appear by first name and
// initial only.

const STATUS_LABEL: Record<ReferralInvite["recent"][number]["status"], string> =
  {
    joined: "Joined",
    qualified: "Bought a ticket · reward pending",
    rewarded: "Reward earned",
    expired: "Didn't buy in time",
  };

function EnterInviteCode() {
  const c = useThemeColors();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "info" | "error";
    text: string;
  } | null>(null);

  async function apply() {
    const normalized = normalizeReferralCode(code);
    if (!normalized) {
      setMessage({ tone: "error", text: "Enter the 7-character invite code." });
      return;
    }
    setBusy(true);
    try {
      const res = await api.rewards.bindReferral({
        code: normalized,
        source: "typed",
      });
      if (res.data) {
        setMessage(bindResultMessage(res.data));
        if (res.data.result === "bound") {
          qc.invalidateQueries({ queryKey: ["mobile", "rewards"] });
        }
      } else {
        setMessage({ tone: "error", text: res.message ?? "Please try again." });
      }
    } catch {
      setMessage({
        tone: "error",
        text: "Network error. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-2">
      <AppText variant="label">
        Joined because a friend invited you? Enter their code
      </AppText>
      <View className="flex-row gap-2">
        <TextInput
          className="h-[48px] flex-1 rounded-xl border border-input bg-background px-3 text-[16px] tracking-[3px] text-foreground"
          value={code}
          onChangeText={(v) => {
            setCode(v.toUpperCase());
            setMessage(null);
          }}
          placeholder="K7QX2MA"
          placeholderTextColor={c["muted-foreground"]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={9}
          accessibilityLabel="Friend's invite code"
          onSubmitEditing={apply}
          returnKeyType="done"
        />
        <Button
          title="Apply"
          loading={busy}
          loadingTitle="Applying…"
          disabled={code.trim().length === 0}
          onPress={apply}
        />
      </View>
      {message ? (
        <AppText
          variant="small"
          tone={message.tone === "error" ? "error" : undefined}
        >
          {message.text}
        </AppText>
      ) : null}
    </Card>
  );
}

export default function InviteFriends() {
  const invite = useReferralInvite();
  const toast = useToast();
  const data = invite.data;

  const message =
    data?.inviteUrl != null
      ? inviteShareMessage({
          url: data.inviteUrl,
          refereeMinor: data.refereeMinor,
          minOrderMinor: data.minOrderMinor,
        })
      : null;

  async function shareWhatsApp() {
    if (!message) return;
    try {
      await Linking.openURL(
        `whatsapp://send?text=${encodeURIComponent(message)}`,
      );
    } catch {
      // WhatsApp isn't installed: the share sheet instead
      await shareAny();
    }
  }

  async function shareAny() {
    if (!message) return;
    try {
      await Share.share({ message });
    } catch {
      // dismissed
    }
  }

  async function copyCode() {
    if (!data?.code) return;
    if (await copyText(data.code)) toast.success("Invite code copied");
    else await shareAny();
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title="Invite friends"
        backFallback="/(app)/rewards"
      />
      {invite.isLoading ? (
        <View className="gap-4 p-4">
          <Skeleton height={320} radius={16} />
          <Skeleton height={120} radius={16} />
        </View>
      ) : !data || (!data.enabled && !data.invitedBy) ? (
        <EmptyState
          icon="people-outline"
          title="Invites aren't available yet"
          description="Soon you'll be able to invite friends and earn credit when they buy their first ticket."
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-4 p-4 pb-16"
          refreshControl={
            <Refresher
              refreshing={invite.isRefetching}
              onRefresh={() => invite.refetch()}
            />
          }
        >
          {data.enabled && data.code && data.inviteUrl ? (
            <Card elevated className="items-center gap-3">
              {data.referrerMinor ? (
                <AppText variant="body" className="text-center">
                  You get {formatCredit(data.referrerMinor)} when a friend you
                  invite buys their first ticket
                  {data.minOrderMinor
                    ? ` of ${formatCredit(data.minOrderMinor)} or more`
                    : ""}{" "}
                  and their event has taken place.
                  {data.refereeMinor
                    ? ` They get ${formatCredit(data.refereeMinor)} off that ticket.`
                    : ""}
                </AppText>
              ) : null}
              <View className="rounded-2xl bg-white p-2">
                <QrCode
                  value={data.inviteUrl}
                  size={184}
                  accessibilityLabel="QR code of your invite link"
                />
              </View>
              <AppText variant="caption">Your code</AppText>
              <AppText variant="hero" className="tracking-widest">
                {data.code}
              </AppText>
              <View className="w-full gap-2">
                <Button
                  title="Share on WhatsApp"
                  leftIcon="logo-whatsapp"
                  size="lg"
                  fullWidth
                  onPress={shareWhatsApp}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      title="Share link"
                      variant="outline"
                      leftIcon="share-outline"
                      fullWidth
                      onPress={shareAny}
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      title="Copy code"
                      variant="outline"
                      leftIcon="copy-outline"
                      fullWidth
                      onPress={copyCode}
                    />
                  </View>
                </View>
              </View>
              <AppText variant="caption" className="text-center">
                Invites work for new accounts, in their first week.
              </AppText>
            </Card>
          ) : null}

          <Card className="gap-3">
            <View className="flex-row flex-wrap gap-y-3">
              {[
                ["Friends joined", String(data.stats.joined)],
                ["Bought a ticket", String(data.stats.qualified)],
                ["Earned", formatCredit(data.stats.earnedMinor)],
                ["Pending", formatCredit(data.stats.pendingMinor)],
              ].map(([label, value]) => (
                <View key={label} className="w-1/2 gap-0.5">
                  <AppText variant="meta">{label}</AppText>
                  <AppText variant="sectionTitle" className="tabular-nums">
                    {value}
                  </AppText>
                </View>
              ))}
            </View>
            {data.recent.length > 0 ? (
              <View className="border-t border-border">
                {data.recent.map((friend) => (
                  <View
                    key={`${friend.name}-${friend.at}`}
                    className="flex-row items-center justify-between gap-3 border-b border-border py-2.5"
                  >
                    <AppText variant="bodyStrong">{friend.name}</AppText>
                    <AppText variant="meta" className="flex-1 text-right">
                      {STATUS_LABEL[friend.status]} ·{" "}
                      {formatDateWithSuffix(friend.at)}
                    </AppText>
                  </View>
                ))}
              </View>
            ) : (
              <AppText variant="muted">
                Friends who join with your invite show up here.
              </AppText>
            )}
          </Card>

          {data.invitedBy ? (
            <AppText variant="muted" className="text-center">
              You joined with {data.invitedBy.name}&apos;s invite.
            </AppText>
          ) : data.canBind ? (
            <EnterInviteCode />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
