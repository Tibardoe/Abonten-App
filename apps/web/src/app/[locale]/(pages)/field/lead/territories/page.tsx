import { listFieldOpsLeadTerritories } from "@/actions/fieldOps/listFieldOpsLeadTerritories";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { loadFieldOpsMe } from "@/fieldOps/lib/loadFieldOpsMe";
import LeadTerritoryList from "@/fieldOps/organisms/LeadTerritoryList";
import { findCountry } from "@abonten/core/geo/countries";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const EDITABLE = new Set(["draft", "active", "paused", "winding_down"]);

export default async function FieldLeadTerritoriesPage() {
  const t = await getTranslations("fieldOps");

  const me = await loadFieldOpsMe();
  const current = me.data?.current;
  if (!current?.isLead) notFound();

  const res = await listFieldOpsLeadTerritories({
    campaignId: current.campaign.id,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>{t("territories")}</PageTitle>
        <SupportingText>
          {t("theTownsAndAreasOfYour", {
            regionName: current.campaign.regionName,
          })}
        </SupportingText>
      </div>
      <LeadTerritoryList
        campaignId={current.campaign.id}
        // Geocoding reads a bare town name against the campaign's own
        // region and country ("Tema, Greater Accra, Ghana"; "Ikeja, Lagos, Nigeria").
        placeContext={[
          current.campaign.regionName,
          findCountry(current.campaign.countryCode)?.name,
        ]
          .filter(Boolean)
          .join(", ")}
        territories={res.data ?? []}
        editable={
          current.membership.status === "active" &&
          EDITABLE.has(current.campaign.status)
        }
      />
    </div>
  );
}
