import { cn } from "@/components/lib/utils";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatCredit } from "@abonten/core/rewards/creditAmount";
import type { CreditSummary } from "@abonten/types/rewards";

// The one number a user should notice first -- what they can spend right
// now -- with everything else (pending, on hold, expiring) explained in
// plain words underneath rather than as competing figures.
export default function CreditBalanceCard({
  summary,
}: {
  summary: CreditSummary;
}) {
  const frozen = summary.status === "frozen";

  return (
    <section
      aria-label="Your Abonten Credit"
      className="rounded-xl border bg-card p-5 md:p-6"
    >
      <p className="text-sm text-muted-foreground">Available to spend</p>
      <p
        className={cn(
          "mt-1 text-4xl font-semibold tabular-nums tracking-tight",
          summary.inDebt && "text-destructive",
        )}
      >
        {formatCredit(summary.availableMinor)}
      </p>

      <div className="mt-4 flex flex-col gap-1.5 text-sm">
        {summary.pendingMinor > 0 ? (
          <p>
            <span className="font-medium tabular-nums">
              {formatCredit(summary.pendingMinor)}
            </span>{" "}
            <span className="text-muted-foreground">
              pending
              {summary.nextRelease
                ? ` · next ${formatCredit(summary.nextRelease.amountMinor)} unlocks ${formatDateWithSuffix(summary.nextRelease.releaseAt)}`
                : ""}
            </span>
          </p>
        ) : null}
        {summary.onHoldMinor > 0 ? (
          <p className="text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">
              {formatCredit(summary.onHoldMinor)}
            </span>{" "}
            on hold for a checkout in progress
          </p>
        ) : null}
        {summary.expiringSoon ? (
          <p className="text-amber-700 dark:text-amber-400">
            {formatCredit(summary.expiringSoon.amountMinor)} expires on{" "}
            {formatDateWithSuffix(summary.expiringSoon.expiresAt)}. Use it
            before then.
          </p>
        ) : null}
      </div>

      {frozen ? (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm">
          Your credit is on hold while we review recent activity. You can still
          earn, but you can&apos;t spend credit until the review is finished.
          Contact support if you have questions.
        </p>
      ) : null}
      {summary.inDebt ? (
        <p className="mt-4 rounded-md bg-muted p-3 text-sm">
          A reward was reversed after you had already used it. New credit you
          earn goes towards this first.
        </p>
      ) : null}
    </section>
  );
}
