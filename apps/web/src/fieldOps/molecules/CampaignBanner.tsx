import StatusChip from "@/fieldOps/atoms/StatusChip";
import type {
  FieldOpsCampaignSummary,
  FieldOpsMembership,
} from "@abonten/types/fieldOps";

const ROLE_LABEL: Record<FieldOpsMembership["role"], string> = {
  team_lead: "Team lead",
  content_creator: "Content creator",
  offline_member: "Field member",
  online_member: "Online member",
};

const STATUS_NOTE: Partial<Record<FieldOpsCampaignSummary["status"], string>> =
  {
    draft: "The campaign hasn't started yet. Your team lead is planning.",
    paused:
      "The campaign is paused. Nothing new can be started until it resumes.",
    winding_down:
      "The campaign is winding down: finish what's open, no new work.",
    completed: "This campaign is over. Everything here is read-only.",
  };

/** The campaign the caller is working on, their role, and any status warning. */
export default function CampaignBanner({
  campaign,
  membership,
}: {
  campaign: FieldOpsCampaignSummary;
  membership: FieldOpsMembership;
}) {
  const note =
    membership.status === "suspended"
      ? "Your membership is suspended. Talk to your team lead."
      : STATUS_NOTE[campaign.status];
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{campaign.name}</p>
          <p className="text-sm text-muted-foreground">
            {campaign.regionName} · {ROLE_LABEL[membership.role]}
          </p>
        </div>
        <StatusChip status={campaign.status} />
      </div>
      {note ? (
        <p className="mt-3 rounded-md bg-muted p-3 text-sm">{note}</p>
      ) : null}
    </section>
  );
}
