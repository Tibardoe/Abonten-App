import { getFieldOpsTerritory } from "@/actions/fieldOps/getFieldOpsTerritory";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import StatusChip from "@/fieldOps/atoms/StatusChip";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import AssignmentCard from "@/fieldOps/molecules/AssignmentCard";
import ProspectRow from "@/fieldOps/molecules/ProspectRow";
import StartOnboardingButton from "@/fieldOps/molecules/StartOnboardingButton";
import ProspectForm from "@/fieldOps/organisms/ProspectForm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FieldTerritoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current) notFound();

  const res = await getFieldOpsTerritory({
    campaignId: current.campaign.id,
    territoryId: id,
  });
  if (res.status !== 200 || !res.data) notFound();
  const { territory, myAssignments, prospects, canAddProspects } = res.data;
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${territory.centre.lat},${territory.centre.lng}`;
  const canAct =
    current.membership.status === "active" &&
    current.campaign.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <PageTitle>{territory.name}</PageTitle>
          <SupportingText>
            {territory.kind === "town" ? "Town" : "Area"} ·{" "}
            {territory.boundary
              ? "mapped boundary"
              : `${Math.round(territory.radiusM / 100) / 10} km around the centre`}{" "}
            ·{" "}
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Open in Maps
            </a>
          </SupportingText>
        </div>
        <StatusChip status={territory.status} />
      </div>
      {territory.notes ? (
        <p className="rounded-xl border p-4 text-sm">{territory.notes}</p>
      ) : null}

      {!current.isLead ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Your assignments here</h2>
          {myAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You haven&apos;t been assigned to this territory.
            </p>
          ) : (
            myAssignments.map((a) => (
              <AssignmentCard
                key={a.id}
                assignment={a}
                canAct={canAct}
                today={current.today}
              />
            ))
          )}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Businesses {current.isLead ? "the team" : "you"} found (
            {prospects.length})
          </h2>
          {canAddProspects ? (
            <div className="flex flex-wrap gap-2">
              <StartOnboardingButton
                campaignId={current.campaign.id}
                territoryId={territory.id}
                label="Onboard a business"
                size="default"
                variant="outline"
              />
              <ProspectForm
                campaignId={current.campaign.id}
                territoryId={territory.id}
              />
            </div>
          ) : null}
        </div>
        {!canAddProspects && !current.isLead ? (
          <p className="text-sm text-muted-foreground">
            You can log businesses here while you have an open assignment in
            this territory and the campaign is running.
          </p>
        ) : null}
        {prospects.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nothing logged yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {prospects.map((p) => (
              <ProspectRow key={p.id} prospect={p} editable={canAddProspects} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
