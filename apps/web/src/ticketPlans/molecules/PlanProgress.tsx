"use client";

import { Progress } from "@/components/ui/progress";
import { formatMoney } from "@abonten/core/money/formatMoney";
import { planProgress } from "@abonten/core/ticketPlans/rules";
import { useLocale, useTranslations } from "next-intl";

/** "GH₵60.00 of GH₵210.00 paid" with a bar. */
export default function PlanProgress({
  paidMinor,
  totalMinor,
  currency,
}: {
  paidMinor: number;
  totalMinor: number;
  currency: string;
}) {
  const t = useTranslations("ticketPlans");
  const locale = useLocale();
  const say = (amountMinor: number) =>
    formatMoney({ amountMinor, currency }, { locale });
  const share = Math.round(planProgress({ paidMinor, totalMinor }) * 100);
  return (
    <div className="space-y-2">
      <Progress value={share} aria-label={t("progressLabel")} />
      <p className="text-sm">
        {t.rich("paidOfTotal", {
          paid: say(paidMinor),
          total: say(totalMinor),
          strong: (chunks) => <span className="font-semibold">{chunks}</span>,
        })}
      </p>
    </div>
  );
}
