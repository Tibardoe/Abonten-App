"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import { updateRewardsSettings } from "@/server/actions";
import type { RewardsProgramSettings } from "@abonten/types/rewards";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

// Switches for features that haven't shipped are shown locked with the
// phase that delivers them, so nobody can switch on half-built behaviour.
const LOCKED: {
  label: string;
  phase: string;
  value: (s: RewardsProgramSettings) => boolean;
}[] = [
  {
    label: "Cash withdrawals",
    phase: "Not in version 1",
    value: (s) => s.withdrawalsEnabled,
  },
];

const cedis = (minor: number) => (minor / 100).toFixed(2);
const toMinor = (value: string) => Math.round(Number(value) * 100);
const pct = (bps: number) => (bps / 100).toString();
const toBps = (value: string) => Math.round(Number(value) * 100);

export function SettingsForm({
  settings,
  canConfigure,
  stepUpFresh,
}: {
  settings: RewardsProgramSettings;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(settings.rewardsEnabled);
  const [redeemPromotions, setRedeemPromotions] = useState(
    settings.redeemPromotionsEnabled,
  );
  const [redeemTickets, setRedeemTickets] = useState(
    settings.redeemTicketsEnabled,
  );
  const [allowFullCredit, setAllowFullCredit] = useState(
    settings.allowFullCreditTicketOrders,
  );
  const [audience, setAudience] = useState(settings.audience);
  const [beta, setBeta] = useState(settings.betaUserIds.join("\n"));
  const [minCash, setMinCash] = useState(cedis(settings.minCashChargeMinor));
  const [maxShare, setMaxShare] = useState(
    pct(settings.maxCreditShareOfTicketOrderBps),
  );
  const [budgetFloor, setBudgetFloor] = useState(
    cedis(settings.budgetFloorMinor),
  );
  const [budgetShare, setBudgetShare] = useState(
    pct(settings.budgetNetRevenueShareBps),
  );
  const [dualApproval, setDualApproval] = useState(
    cedis(settings.dualApprovalThresholdMinor),
  );
  const [goodwillCap, setGoodwillCap] = useState(
    cedis(settings.supportGoodwillMonthlyCapMinor),
  );
  const [payoutHold, setPayoutHold] = useState(
    pct(settings.creditSharePayoutHoldBps),
  );
  const [capture, setCapture] = useState(settings.referralCaptureEnabled);
  const [shadow, setShadow] = useState(settings.shadowMode);
  const [windowDays, setWindowDays] = useState(
    String(settings.referralAttributionWindowDays),
  );
  const [reason, setReason] = useState("");

  const editable = canConfigure && stepUpFresh;

  const save = () =>
    start(async () => {
      setMsg(null);
      const betaUserIds = beta
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await updateRewardsSettings({
        expectedUpdatedAt: settings.updatedAt,
        reason: reason.trim(),
        patch: {
          rewardsEnabled: enabled,
          redeemPromotionsEnabled: redeemPromotions,
          redeemTicketsEnabled: redeemTickets,
          allowFullCreditTicketOrders: allowFullCredit,
          audience,
          betaUserIds,
          minCashChargeMinor: toMinor(minCash),
          maxCreditShareOfTicketOrderBps: toBps(maxShare),
          budgetFloorMinor: toMinor(budgetFloor),
          budgetNetRevenueShareBps: toBps(budgetShare),
          dualApprovalThresholdMinor: toMinor(dualApproval),
          supportGoodwillMonthlyCapMinor: toMinor(goodwillCap),
          creditSharePayoutHoldBps: toBps(payoutHold),
          referralCaptureEnabled: capture,
          shadowMode: shadow,
          referralAttributionWindowDays: Math.round(Number(windowDays)),
        },
      });
      setMsg(res.message ?? null);
      if (res.status === 200) {
        setReason("");
        router.refresh();
      }
    });

  const field = (
    label: string,
    hint: string,
    value: string,
    set: (v: string) => void,
    suffix: string,
  ) => (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <span className="block text-xs text-muted-foreground">{hint}</span>
      <span className="mt-1 flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => set(e.target.value)}
          disabled={!editable}
          inputMode="decimal"
          className={cn(input, "w-32")}
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );

  return (
    <div className="space-y-4">
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing program settings needs a fresh identity check.
          <StepUpButton next="/rewards/settings" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view these settings. Changing them needs the “Configure
          rewards” permission.
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Who can see Abonten Rewards</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!editable}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Program switched on
        </label>
        <label className="block text-sm">
          <span className="block font-medium">Audience</span>
          <select
            value={audience}
            disabled={!editable}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
            className={cn(input, "mt-1 w-56")}
          >
            <option value="staff">Staff only (active admins)</option>
            <option value="beta">Staff + beta users</option>
            <option value="all">Everyone</option>
          </select>
        </label>
        {audience === "beta" ? (
          <label className="block text-sm">
            <span className="font-medium">Beta user ids</span>
            <span className="block text-xs text-muted-foreground">
              One user id per line (copy it from the user&apos;s admin page).
            </span>
            <textarea
              value={beta}
              disabled={!editable}
              onChange={(e) => setBeta(e.target.value)}
              rows={4}
              className={cn(input, "mt-1 font-mono text-xs")}
            />
          </label>
        ) : null}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Where credit can be spent</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={redeemPromotions}
            disabled={!editable}
            onChange={(e) => setRedeemPromotions(e.target.checked)}
          />
          <span>
            <span className="block">Featuring events and places</span>
            <span className="block text-xs text-muted-foreground">
              Shows a “Use credit” switch on promotion checkout. Credit can pay
              part of a promotion, or all of it.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={redeemTickets}
            disabled={!editable}
            onChange={(e) => setRedeemTickets(e.target.checked)}
          />
          <span>
            <span className="block">Tickets</span>
            <span className="block text-xs text-muted-foreground">
              Shows a “Use credit” switch on ticket checkout. Every cedi of
              credit spent on a ticket is paid by Abonten: the organizer still
              gets the full ticket price. Credit can&apos;t be used on tickets
              to your own event.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 pl-6 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={allowFullCredit}
            disabled={!editable || !redeemTickets}
            onChange={(e) => setAllowFullCredit(e.target.checked)}
          />
          <span>
            <span className="block">
              Allow ticket orders paid fully with credit
            </span>
            <span className="block text-xs text-muted-foreground">
              Off: a ticket order always charges at least the minimum cash
              amount below. On: credit can cover the whole order (only when the
              share limit below is 100%).
            </span>
          </span>
        </label>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Event referrals</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={capture}
            disabled={!editable}
            onChange={(e) => setCapture(e.target.checked)}
          />
          <span>
            <span className="block">Capture referral links</span>
            <span className="block text-xs text-muted-foreground">
              Signed-in users&apos; share links carry their referral code, and a
              checkout opened through one records who referred it. Nothing is
              paid by this alone: the “Event referral” rule (or, for
              organizers&apos; own commissions, the “Promoter commission” rule)
              must also be live.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={shadow}
            disabled={!editable}
            onChange={(e) => setShadow(e.target.checked)}
          />
          <span>
            <span className="block">
              Shadow mode (evaluate rewards without paying)
            </span>
            <span className="block text-xs text-muted-foreground">
              On: every referred sale, invite and monthly rebate is evaluated
              and shown under Referrals and Rebates, but no credit is posted and
              nobody is notified. Turn it off only after reviewing the projected
              cost and risk flags — people then start earning real credit.
            </span>
          </span>
        </label>
        {field(
          "Attribution window",
          "A purchase counts for a referral link opened within this many days (the most recent link wins).",
          windowDays,
          setWindowDays,
          "days",
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-semibold">Money limits</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            "Monthly budget floor",
            "The reward budget is never lower than this, even in a quiet month.",
            budgetFloor,
            setBudgetFloor,
            "GH₵",
          )}
          {field(
            "Budget share of net revenue",
            "Monthly ceiling = the larger of the floor and this share of trailing 30-day net revenue.",
            budgetShare,
            setBudgetShare,
            "%",
          )}
          {field(
            "Second-approver threshold",
            "Manual adjustments at or above this need a different admin to approve.",
            dualApproval,
            setDualApproval,
            "GH₵",
          )}
          {field(
            "Goodwill limit per user per month",
            "The most support can give one user in a calendar month.",
            goodwillCap,
            setGoodwillCap,
            "GH₵",
          )}
          {field(
            "Minimum cash charge",
            "A part-credit order must still charge at least this much in cash.",
            minCash,
            setMinCash,
            "GH₵",
          )}
          {field(
            "Most of a ticket order credit can pay",
            "Needs to be 100% for “paid fully with credit” to take effect.",
            maxShare,
            setMaxShare,
            "%",
          )}
          {field(
            "Hold organizer payouts above",
            "Payouts for events where credit paid more than this share of revenue are held for review.",
            payoutHold,
            setPayoutHold,
            "%",
          )}
        </div>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold">Not available yet</p>
        <ul className="space-y-1 text-sm">
          {LOCKED.map((l) => (
            <li
              key={l.label}
              className="flex items-center justify-between gap-3"
            >
              <span className="text-muted-foreground">{l.label}</span>
              <span className="text-xs text-muted-foreground">
                {l.value(settings) ? "on" : "off"} · {l.phase}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {editable ? (
        <Card className="space-y-2 p-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you changing these settings? (required, audited)"
            rows={2}
            className={input}
          />
          <Button disabled={pending || reason.trim().length < 3} onClick={save}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
          {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
