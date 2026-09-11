"use client";

import { CardTitle } from "@/components/ui/typography";
import { useToast } from "@/hooks/useToast";
import EnterInviteCode from "@/rewards/molecules/EnterInviteCode";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { inviteShareMessage } from "@abonten/core/rewards/invite";
import type { ReferralInvite } from "@abonten/types/rewards";
import { useEffect, useState } from "react";

const STATUS_LABEL: Record<ReferralInvite["recent"][number]["status"], string> =
  {
    joined: "Joined",
    qualified: "Bought a ticket · reward pending",
    rewarded: "Reward earned",
    expired: "Didn't buy in time",
  };

// Rewards › Invite friends: the personal invite link (WhatsApp first -- it's
// how most people share in Ghana), what each side gets, and how it's going.
// Friends are shown by first name and initial only.
export default function InvitePanel({ invite }: { invite: ReferralInvite }) {
  const toast = useToast();
  // Known only in the browser; rendering it on the server would mismatch.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const url = invite.inviteUrl;
  const message = url
    ? inviteShareMessage({
        url,
        refereeMinor: invite.refereeMinor,
        minOrderMinor: invite.minOrderMinor,
      })
    : null;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it instead.");
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
      <CardTitle id="invite-friends-title">Invite friends</CardTitle>
      {invite.referrerMinor ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You get {formatCredit(invite.referrerMinor)} when a friend you invite
          buys their first ticket
          {invite.minOrderMinor
            ? ` of ${formatCredit(invite.minOrderMinor)} or more`
            : ""}{" "}
          and their event has taken place.
          {invite.refereeMinor
            ? ` They get ${formatCredit(invite.refereeMinor)} off that ticket.`
            : ""}{" "}
          Invites work for new accounts, in their first week.
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
              Copy
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message ?? url)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Share on WhatsApp
            </a>
            {canShare ? (
              <button
                type="button"
                onClick={shareNative}
                className="rounded-md border px-4 py-2 text-sm font-medium"
              >
                More ways to share
              </button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Your code: <span className="font-mono">{invite.code}</span>
          </p>
        </div>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Friends joined</dt>
          <dd className="text-lg font-semibold tabular-nums">{stats.joined}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bought a ticket</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {stats.qualified}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Earned</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCredit(stats.earnedMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Pending</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCredit(stats.pendingMinor)}
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
                {STATUS_LABEL[friend.status]} ·{" "}
                {formatDateWithSuffix(friend.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {invite.invitedBy ? (
        <p className="mt-4 text-sm text-muted-foreground">
          You joined with {invite.invitedBy.name}&apos;s invite.
        </p>
      ) : invite.canBind ? (
        <div className="mt-5 border-t pt-4">
          <EnterInviteCode />
        </div>
      ) : null}
    </section>
  );
}
