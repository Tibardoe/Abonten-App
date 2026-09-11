import { CardTitle } from "@/components/ui/typography";
import { rewardsEarnLines } from "@abonten/core/rewards/earnCopy";
import type { RewardsProgram } from "@abonten/types/rewards";

// "How to earn" / "How to use" copy built from the ACTIVE program terms, so
// the page can never promise a rate the reward engine doesn't pay. Anything
// that isn't switched on yet is listed plainly as coming soon.
export default function RewardsHowItWorks({
  program,
}: {
  program: RewardsProgram;
}) {
  const earn = rewardsEarnLines(program);

  const use: string[] = [];
  if (program.redemption.promotions) {
    use.push("Feature your events and places.");
  }
  if (program.redemption.tickets) {
    use.push("Pay for tickets at checkout.");
  }

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border p-5">
        <CardTitle>How to earn</CardTitle>
        {earn.length > 0 ? (
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm">
            {earn.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Ways to earn credit by sharing events and inviting friends are
            coming soon.
          </p>
        )}
      </div>
      <div className="rounded-xl border p-5">
        <CardTitle>How to use credit</CardTitle>
        {use.length > 0 ? (
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm">
            {use.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Soon you&apos;ll be able to use credit to feature your events and
            places, and to pay for tickets.
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Abonten Credit can only be used on Abonten. It can&apos;t be
          transferred or exchanged for cash.
        </p>
      </div>
    </section>
  );
}
