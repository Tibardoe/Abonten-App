import { CardTitle } from "@/components/ui/typography";
import { useTranslations } from "next-intl";

// The user's referral code. Event share buttons already add it to the link
// (?ref=CODE), so there's nothing to copy -- this just says what happens.
export default function ReferralCodeCard({
  code,
  rateBps,
  windowDays,
}: {
  code: string;
  rateBps: number;
  windowDays: number;
}) {
  const t = useTranslations("rewards");

  return (
    <section className="rounded-xl border p-5">
      <CardTitle>{t("yourReferralCode")}</CardTitle>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.2em]">
        {code}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("whenYouShareAnEventThe", {
          windowDays: windowDays,
          toFixed: (rateBps / 100).toFixed(0),
        })}
      </p>
    </section>
  );
}
