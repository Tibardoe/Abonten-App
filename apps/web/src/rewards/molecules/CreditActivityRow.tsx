import { cn } from "@/components/lib/utils";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { formatCreditDelta } from "@abonten/core/rewards/creditAmount";
import type {
  CreditActivityItem,
  CreditActivityState,
} from "@abonten/types/rewards";
import { useLocale, useTranslations } from "next-intl";

const STATE_LABEL: Record<CreditActivityState, string> = {
  pending: "pending2",
  available: "available",
  used: "used",
  expired: "expired",
  reversed: "reversed",
  completed: "",
};

const STATE_CLASS: Record<CreditActivityState, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  available: "bg-mint/15 text-foreground",
  used: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  reversed: "bg-destructive/10 text-destructive",
  completed: "",
};

export default function CreditActivityRow({
  item,
}: {
  item: CreditActivityItem;
}) {
  const locale = useLocale();
  const t = useTranslations("rewards");

  const detail =
    item.state === "pending" && item.releaseAt
      ? t("unlocksOn", {
          date: formatDateWithSuffix(item.releaseAt, undefined, locale),
        })
      : item.state === "available" && item.expiresAt
        ? t("expiresOn", {
            date: formatDateWithSuffix(item.expiresAt, undefined, locale),
          })
        : null;
  // A voided/expired grant never reached the user's balance as spendable
  // credit, so its amount is shown struck through rather than as income.
  const struck =
    item.amountMinor > 0 &&
    (item.state === "reversed" || item.state === "expired");

  return (
    <li className="flex items-start justify-between gap-4 border-b py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="font-medium">{item.title}</p>
        {item.subtitle ? (
          <p className="truncate text-sm text-muted-foreground">
            {item.subtitle}
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDateWithSuffix(item.createdAt, undefined, locale)}
          {detail ? ` · ${detail}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            "font-semibold tabular-nums",
            item.amountMinor < 0 && "text-muted-foreground",
            struck && "line-through opacity-60",
          )}
        >
          {formatCreditDelta(item.amountMinor, item.currency)}
        </span>
        {STATE_LABEL[item.state] ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium",
              STATE_CLASS[item.state],
            )}
          >
            {t(STATE_LABEL[item.state])}
          </span>
        ) : null}
      </div>
    </li>
  );
}
