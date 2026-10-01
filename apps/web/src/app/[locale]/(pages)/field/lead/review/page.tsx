import { listFieldOpsReviewQueue } from "@/actions/fieldOps/listFieldOpsReviewQueue";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldLeadReviewPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await listFieldOpsReviewQueue({
    campaignId: current.campaign.id,
  });
  const all = res.data ?? [];
  const waiting = all.filter((o) => o.status === "submitted");
  const done = all.filter((o) => o.status !== "submitted");

  const row = (o: (typeof all)[number]) => (
    <li key={o.id} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={`/field/lead/review/${o.id}`}
            className="font-medium hover:underline"
          >
            {o.businessName ?? "(no name)"}
          </Link>
          <p className="text-sm text-muted-foreground">
            {o.memberName ?? "Member"} · {o.territoryName ?? "—"} ·{" "}
            {o.mode === "offline" ? "in person" : "online"}
            {o.submittedAt
              ? ` · ${new Date(o.submittedAt).toLocaleString()}`
              : ""}
            {o.insideTerritory === false ? " · outside territory" : ""}
            {o.similarMatches.some((m) => m.strong)
              ? " · possible duplicate"
              : ""}
          </p>
        </div>
        <StatusChip status={o.status} />
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Review</PageTitle>
        <SupportingText>
          Check each submission against the photos, the map and the checklist.
          Your decision starts the holding period; Abonten re-checks everything
          before the commission is confirmed.
        </SupportingText>
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">
          Waiting for you ({waiting.length})
        </h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <ul className="flex flex-col gap-3">{waiting.map(row)}</ul>
        )}
      </section>
      {done.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Decided</h2>
          <ul className="flex flex-col gap-3">{done.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
