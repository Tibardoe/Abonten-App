import { listMyFieldOpsOnboardings } from "@/actions/fieldOps/listMyFieldOpsOnboardings";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldSubmissionsPage() {
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();
  if (current.isLead) redirect("/field/lead/review");

  const res = await listMyFieldOpsOnboardings({
    campaignId: current.campaign.id,
  });
  const all = res.data ?? [];
  const open = all.filter((o) => ["draft", "needs_changes"].includes(o.status));
  const rest = all.filter(
    (o) => !["draft", "needs_changes"].includes(o.status),
  );

  const row = (o: (typeof all)[number]) => (
    <li key={o.id} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href={
              o.status === "draft" || o.status === "needs_changes"
                ? `/field/onboard/${o.id}`
                : `/field/submissions/${o.id}`
            }
            className="font-medium hover:underline"
          >
            {o.businessName ?? "(no name yet)"}
          </Link>
          <p className="text-sm text-muted-foreground">
            {o.territoryName ?? "—"} ·{" "}
            {o.submittedAt
              ? `submitted ${new Date(o.submittedAt).toLocaleDateString()}`
              : `started ${new Date(o.createdAt).toLocaleDateString()}`}
          </p>
        </div>
        <StatusChip status={o.status} />
      </div>
      {o.status === "needs_changes" && o.reviewNote ? (
        <p className="mt-2 text-sm">Lead: {o.reviewNote}</p>
      ) : null}
      {o.status === "rejected" && o.rejectionReason ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Reason: {o.rejectionReason}
        </p>
      ) : null}
      {o.status === "verified" && o.holdingUntil ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Verified. Commission confirmed after{" "}
          {new Date(o.holdingUntil).toLocaleDateString()}.
        </p>
      ) : null}
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>Submissions</PageTitle>
        <SupportingText>
          Businesses you have onboarded and where each one stands.
        </SupportingText>
      </div>
      {open.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">In progress</h2>
          <ul className="flex flex-col gap-3">{open.map(row)}</ul>
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Submitted</h2>
        {rest.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing submitted yet. Open a territory you are assigned to and tap
            &quot;Onboard this business&quot;.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">{rest.map(row)}</ul>
        )}
      </section>
    </div>
  );
}
