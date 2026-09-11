import { CardTitle } from "@/components/ui/typography";

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
  return (
    <section className="rounded-xl border p-5">
      <CardTitle>Your referral code</CardTitle>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.2em]">
        {code}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        When you share an event, the link carries this code. If someone buys a
        ticket through it within {windowDays} days, you earn{" "}
        {(rateBps / 100).toFixed(0)}% of the ticket price in credit once the
        event is over. Your own tickets and events you organize don&apos;t
        count.
      </p>
    </section>
  );
}
