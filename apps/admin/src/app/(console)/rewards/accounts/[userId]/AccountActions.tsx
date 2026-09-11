"use client";

import { StepUpButton } from "@/components/StepUpButton";
import { Button, Card, cn } from "@/components/ui";
import {
  grantGoodwillCredit,
  requestCreditAdjustment,
  setCreditAccountStatus,
  setReferralCodeDisabled,
} from "@/server/actions";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const inputClass =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

function Result({ msg }: { msg: string | null }) {
  return msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null;
}

// Freeze stops spending, reserving and withdrawing; the account keeps
// earning. Status only -- no credit moves.
export function FreezePanel({
  userId,
  status,
  canFreeze,
}: {
  userId: string;
  status: "active" | "frozen" | "closed";
  canFreeze: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!canFreeze || status === "closed") return null;
  const next = status === "frozen" ? "active" : "frozen";

  return (
    <Card className="space-y-2 p-3">
      <p className="text-sm font-semibold">
        {next === "frozen"
          ? "Freeze this credit account"
          : "Unfreeze this credit account"}
      </p>
      <p className="text-xs text-muted-foreground">
        {next === "frozen"
          ? "The user keeps earning, but can't spend credit until you unfreeze it."
          : "The user can spend their credit again."}
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required, audited)"
        className={inputClass}
      />
      <Button
        size="sm"
        variant={next === "frozen" ? "danger" : "outline"}
        disabled={pending || reason.trim().length < 3}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await setCreditAccountStatus({
              userId,
              status: next,
              reason: reason.trim(),
            });
            setMsg(res.message ?? null);
            if (res.status === 200) {
              setReason("");
              router.refresh();
            }
          })
        }
      >
        {next === "frozen" ? "Freeze account" : "Unfreeze account"}
      </Button>
      <Result msg={msg} />
    </Card>
  );
}

// Small support goodwill, capped per user per month by the database.
export function GoodwillPanel({
  userId,
  canGrant,
  usedMinor,
  capMinor,
}: {
  userId: string;
  canGrant: boolean;
  usedMinor: number;
  capMinor: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [msg, setMsg] = useState<string | null>(null);

  if (!canGrant) return null;
  const left = Math.max(capMinor - usedMinor, 0);

  return (
    <Card className="space-y-2 p-3">
      <p className="text-sm font-semibold">Give goodwill credit</p>
      <p className="text-xs text-muted-foreground">
        For small service failures. {formatCredit(left)} left for this user this
        month (limit {formatCredit(capMinor)}). Expires in 90 days.
      </p>
      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="GH₵"
          inputMode="decimal"
          className={cn(inputClass, "w-24")}
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required, audited)"
          className={inputClass}
        />
      </div>
      <Button
        size="sm"
        disabled={pending || !(Number(amount) > 0) || reason.trim().length < 3}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await grantGoodwillCredit({
              userId,
              amount: Number(amount),
              reason: reason.trim(),
              requestId,
            });
            setMsg(res.message ?? null);
            if (res.status === 200) {
              setAmount("");
              setReason("");
              setRequestId(crypto.randomUUID());
              router.refresh();
            }
          })
        }
      >
        Give credit
      </Button>
      <Result msg={msg} />
    </Card>
  );
}

// Manual adjustment. At or above the dual-approval threshold it is only
// recorded as a request until a different admin approves it.
export function AdjustmentPanel({
  userId,
  canAdjust,
  stepUpFresh,
  thresholdMinor,
}: {
  userId: string;
  canAdjust: boolean;
  stepUpFresh: boolean;
  thresholdMinor: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [direction, setDirection] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [label, setLabel] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!canAdjust) return null;
  const valid = Number(amount) > 0 && reason.trim().length >= 3;

  return (
    <Card className="space-y-2 p-3">
      <p className="text-sm font-semibold">Adjust credit</p>
      <p className="text-xs text-muted-foreground">
        Adjustments of {formatCredit(thresholdMinor)} or more need a second
        admin to approve them.
      </p>
      {!stepUpFresh ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Needs a fresh identity check.
          <StepUpButton next={`/rewards/accounts/${userId}`} />
        </div>
      ) : null}
      <div className="flex gap-2">
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as "credit" | "debit")}
          className="rounded border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="credit">Add credit</option>
          <option value="debit">Remove credit</option>
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="GH₵"
          inputMode="decimal"
          className={cn(inputClass, "w-28")}
        />
      </div>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="What the user sees (optional), e.g. “Compensation for event change”"
        className={inputClass}
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Internal reason (required, audited)"
        rows={2}
        className={inputClass}
      />
      {direction === "debit" ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={allowNegative}
            onChange={(e) => setAllowNegative(e.target.checked)}
          />
          Allow the balance to go below zero (recovering credit already spent)
        </label>
      ) : null}
      {!confirm ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!stepUpFresh || !valid || pending}
          onClick={() => setConfirm(true)}
        >
          Review adjustment…
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs">
            {direction === "credit" ? "Add" : "Remove"}{" "}
            {formatCredit(Math.round(Number(amount) * 100))}?
          </span>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setMsg(null);
                const res = await requestCreditAdjustment({
                  userId,
                  direction,
                  amount: Number(amount),
                  reason: reason.trim(),
                  userLabel: label.trim() || undefined,
                  allowNegative: direction === "debit" && allowNegative,
                });
                setMsg(res.message ?? null);
                setConfirm(false);
                if (res.status === 200 || res.status === 202) {
                  setAmount("");
                  setReason("");
                  setLabel("");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Saving…" : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirm(false)}
          >
            Cancel
          </Button>
        </div>
      )}
      <Result msg={msg} />
    </Card>
  );
}

// A disabled referral code records no clicks, stamps no checkouts and binds
// no new friends. Rewards already decided stay as they are.
export function ReferralCodePanel({
  userId,
  code,
  disabled,
  canChange,
}: {
  userId: string;
  code: string;
  disabled: boolean;
  canChange: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  if (!canChange) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required, audited)"
        className={inputClass}
      />
      <Button
        size="sm"
        variant={disabled ? "outline" : "danger"}
        disabled={pending || reason.trim().length < 3}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await setReferralCodeDisabled({
              userId,
              disabled: !disabled,
              reason: reason.trim(),
            });
            setMsg(res.message ?? null);
            if (res.status === 200) {
              setReason("");
              router.refresh();
            }
          })
        }
      >
        {disabled ? `Enable ${code}` : `Disable ${code}`}
      </Button>
      <Result msg={msg} />
    </div>
  );
}
