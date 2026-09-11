import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadFieldOpsFlagQueue } from "@/lib/data";
import Link from "next/link";
import { FieldOpsTabs } from "../FieldOpsTabs";
import { FlagDecision } from "./FlagDecision";

// What each flag means in plain words. The keys match the check keys in
// @abonten/core/fieldOps/eligibility plus the sweep's own two.
const FLAG_LABELS: Record<string, string> = {
  spot_check: "Routine spot check — nothing is wrong, it was sampled",
  eligibility: "One or more checks did not pass",
  no_rule: "No commission rule was live when the lead verified it",
  budget_exhausted: "The campaign's budget cap would be exceeded",
  awaiting_release_policy: "Its rule pays on something Phase 3 doesn't handle",
  photos: "Fewer photos than the rule asks for",
  description: "The description is shorter than the rule asks for",
  category: "No category set",
  contact: "No phone or WhatsApp number",
  opening_hours: "No opening hours",
  inside_territory: "The pin is outside the assigned territory",
  on_site: "The member was not near the business when they submitted",
  not_duplicate: "An older listing looks like the same business",
  reversed: "A commission on this onboarding was reversed",
};

const money = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toFixed(2)}`;

export default async function FieldOpsReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx, queue, campaigns } = await loadFieldOpsFlagQueue({
    campaignId: sp.campaign || undefined,
    cursor: sp.cursor || undefined,
  });
  const canDecide = ctx.permissions.includes("fieldops.verify");

  return (
    <div>
      <PageHeader
        title="Field Ops · Review queue"
        description="Onboardings the eligibility sweep would not pay on its own: a check that did not pass, a routine spot check, or a budget or rule problem. Nothing here is paid until an admin decides."
      />
      <FieldOpsTabs active="/field-ops/review" />

      {campaigns.status === 200 &&
      campaigns.data &&
      campaigns.data.length > 1 ? (
        <form className="mb-3 flex items-center gap-1 text-xs">
          <select
            name="campaign"
            defaultValue={sp.campaign ?? ""}
            className="rounded border border-border bg-background px-2 py-1"
          >
            <option value="">All campaigns</option>
            {campaigns.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-border px-2 py-1 hover:bg-muted"
          >
            Filter
          </button>
        </form>
      ) : null}

      {queue.status !== 200 || !queue.data ? (
        <EmptyState>{queue.message ?? "Couldn't load the queue."}</EmptyState>
      ) : queue.data.items.length === 0 ? (
        <EmptyState>Nothing is waiting for a decision.</EmptyState>
      ) : (
        <div className="space-y-3">
          {queue.data.items.map((item) => {
            const o = item.onboarding;
            return (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/field-ops/onboardings/${o.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {o.businessName ?? "(no name)"}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {o.memberName ?? o.memberUserId.slice(0, 8)} ·{" "}
                      {item.campaignName} · {o.territoryName ?? "no territory"}{" "}
                      · flagged {timeAgo(o.updatedAt)}
                    </p>
                  </div>
                  {item.commission ? (
                    <Badge tone="info">
                      {money(
                        item.commission.amountMinor,
                        item.commission.currency,
                      )}{" "}
                      pending
                    </Badge>
                  ) : (
                    <Badge tone="neutral">No commission</Badge>
                  )}
                </div>

                <ul className="mt-3 space-y-1 text-sm">
                  {item.flags.length === 0 ? (
                    <li className="text-muted-foreground">
                      No flag recorded — check the onboarding's timeline.
                    </li>
                  ) : (
                    item.flags.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span aria-hidden>•</span>
                        <span>{FLAG_LABELS[f] ?? f.replace(/_/g, " ")}</span>
                      </li>
                    ))
                  )}
                </ul>

                {canDecide ? (
                  <div className="mt-3">
                    <FlagDecision onboardingId={o.id} />
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      {queue.status === 200 && queue.data?.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/field-ops/review?cursor=${encodeURIComponent(queue.data.nextCursor)}${sp.campaign ? `&campaign=${sp.campaign}` : ""}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
