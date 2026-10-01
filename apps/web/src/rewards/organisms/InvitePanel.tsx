"use client";

import { CardTitle } from "@/components/ui/typography";
import { useToast } from "@/hooks/useToast";
import EnterInviteCode from "@/rewards/molecules/EnterInviteCode";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { inviteShareMessage } from "@abonten/core/rewards/invite";
import type { ReferralInvite } from "@abonten/types/rewards";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const STATUS_LABEL: Record<ReferralInvite["recent"][number]["status"], string> =
  {
    joined: "joined",
    qualified: "boughtATicketRewardPending",
    rewarded: "rewardEarned",
    expired: "didnTBuyInTime",
  };

// Rewards › Invite friends: the personal invite link (WhatsApp first -- it's
// how most people share in Ghana), what each side gets, and how it's going.
// Friends are shown by first name and initial only.
export default function InvitePanel({ invite }: { invite: ReferralInvite }) {
  const locale = useLocale();

  const t = useTranslations("rewards");
  const tc = useTranslations("core");

  const toast = useToast();
  // Known only in the browser; rendering it on the server would mismatch.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const url = invite.inviteUrl;
  const message = url
    ? inviteShareMessage(tc, {
        url,
        refereeMinor: invite.refereeMinor,
        minOrderMinor: invite.minOrderMinor,
        currency: invite.currency,
      })
    : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("inviteLinkCopied"));
    } catch {
      toast.error(t("couldnTCopySelectTheLink"));
    }
  };

  const shareNative = async () => {
    if (!url || !message) return;
    try {
      await navigator.share({ text: message });
    } catch {
      // dismissed
    }
  };

  const { stats } = invite;

  return (
    <section
      aria-labelledby="invite-friends-title"
      className="rounded-xl border p-5"
    >
      <CardTitle id="invite-friends-title">{t("inviteFriends")}</CardTitle>
      {invite.referrerMinor ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            invite.minOrderMinor
              ? "youGetWhenFriendBuysMin"
              : "youGetWhenFriendBuys",
            {
              amount: formatCredit(invite.referrerMinor, invite.currency),
              minimum: invite.minOrderMinor
                ? formatCredit(invite.minOrderMinor, invite.currency)
                : "",
            },
          )}{" "}
          {invite.refereeMinor
            ? `${t("theyGetOffThatTicket", {
                amount: formatCredit(invite.refereeMinor, invite.currency),
              })} `
            : ""}
          {t("invitesWorkForNewAccountsIn")}
        </p>
      ) : null}

      {url ? (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              {url}
            </span>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 text-sm font-medium text-primary"
            >
              {t("copy")}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message ?? url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              {t("shareOnWhatsapp")}
            </a>
            {canShare ? (
              <button
                type="button"
                onClick={shareNative}
                className="rounded-md border px-4 py-2 text-sm font-medium"
              >
                {t("moreWaysToShare")}
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("yourCode")} <span className="font-mono">{invite.code}</span>
          </p>
        </div>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">{t("friendsJoined")}</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.joined}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("boughtATicket")}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {stats.qualified}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("earned")}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCredit(stats.earnedMinor, invite.currency)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("pending2")}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCredit(stats.pendingMinor, invite.currency)}
          </dd>
        </div>
      </dl>

      {invite.recent.length > 0 ? (
        <ul className="mt-4 divide-y border-t text-sm">
          {invite.recent.map((friend) => (
            <li
              key={`${friend.name}-${friend.at}`}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="font-medium">{friend.name}</span>
              <span className="text-right text-muted-foreground">
                {t(STATUS_LABEL[friend.status])} ·{" "}
                {formatDateWithSuffix(friend.at, undefined, locale)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {invite.invitedBy ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {t("youJoinedWithSInvite", { name: invite.invitedBy.name })}
        </p>
      ) : invite.canBind ? (
        <div className="mt-5 border-t pt-4">
          <EnterInviteCode />
        </div>
      ) : null}
    </section>
  );
}
