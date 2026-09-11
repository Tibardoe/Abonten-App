import {
  fieldOpsRoute,
  routeParams,
} from "@/app/api/mobile/field-ops/_lib/handler";
import { searchSimilarPlacesCore } from "@abonten/services/fieldOps/member/onboardingCore";
import { fieldOpsSimilarSearchSchema } from "@abonten/validation/fieldOpsSchemas";

// POST /api/mobile/field-ops/onboardings/:onboardingId/similar { campaignId, name,
// location, phoneE164?, whatsappE164? }. Same service as searchFieldOpsSimilarPlaces.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ onboardingId: string }> },
) {
  const { onboardingId } = await routeParams(params);
  return fieldOpsRoute(
    req,
    {
      schema: fieldOpsSimilarSearchSchema,
      params: { onboardingId },
      label: "POST /field-ops/onboardings/[onboardingId]/similar",
    },
    (svc, userId, data) => searchSimilarPlacesCore(svc, userId, data),
  );
}
