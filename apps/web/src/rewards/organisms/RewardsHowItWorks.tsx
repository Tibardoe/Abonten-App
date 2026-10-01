import { CardTitle } from "@/components/ui/typography";
import { rewardsEarnLines } from "@abonten/core/rewards/earnCopy";
import type { RewardsProgram } from "@abonten/types/rewards";
import { useLocale, useTranslations } from "next-intl";

// "How to earn" / "How to use" copy built from the ACTIVE program terms, so
// the page can never promise a rate the reward engine doesn't pay. Anything
// that isn't switched on yet is listed plainly as coming soon.
export default function RewardsHowItWorks({
  program,
}: {
  program: RewardsProgram;
}) {
  const t = useTranslations("rewards");
  const tc = useTranslations("core");
  const locale = useLocale();

  const earn = rewardsEarnLines({ t: tc, locale }, program);

  const use: string[] = [];
  if (program.redemption.promotions) {
    use.push(t("featureYourEventsAndPlaces"));
  }
  if (program.redemption.tickets) {
    use.push(t("payForTicketsAtCheckout"));
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border p-5">
        <CardTitle>{t("howToEarn")}</CardTitle>
        {earn.length > 0 ? (
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm">
            {earn.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("waysToEarnCreditBySharing")}
          </p>
        )}
      </div>
      <div className="rounded-xl border p-5">
        <CardTitle>{t("howToUseCredit")}</CardTitle>
        {use.length > 0 ? (
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm">
            {use.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("soonYouLlBeAbleTo")}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          {t("abontenCreditCanOnlyBeUsed")}
        </p>
      </div>
    </section>
  );
}
