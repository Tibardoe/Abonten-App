import StatusChip from "@/fieldOps/atoms/StatusChip";
import { FIELD_OPS_ROLE_LABEL } from "@/fieldOps/lib/roleLabel";
import type {
  FieldOpsCampaignSummary,
  FieldOpsMembership,
} from "@abonten/types/fieldOps";
import { useTranslations } from "next-intl";

const STATUS_NOTE: Partial<Record<FieldOpsCampaignSummary["status"], string>> =
  {
    draft: "theCampaignHasnTStartedYet",
    paused: "theCampaignIsPausedNothingNew",
    winding_down: "theCampaignIsWindingDownFinish",
    completed: "thisCampaignIsOverEverythingHere",
  };

/** The campaign the caller is working on, their role, and any status warning. */
export default function CampaignBanner({
  campaign,
  membership,
}: {
  campaign: FieldOpsCampaignSummary;
  membership: FieldOpsMembership;
}) {
  const t = useTranslations("fieldOps");

  const note =
    membership.status === "suspended"
      ? t("yourMembershipIsSuspendedTalkTo")
      : STATUS_NOTE[campaign.status]
        ? t(STATUS_NOTE[campaign.status] as string)
        : undefined;
  return (
    <section className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{campaign.name}</p>
          <p className="text-sm text-muted-foreground">
            {campaign.regionName} · {t(FIELD_OPS_ROLE_LABEL[membership.role])}
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
