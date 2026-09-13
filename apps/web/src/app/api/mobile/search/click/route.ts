import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { recordSearchClickCore } from "@abonten/services/search/searchCore";
import { searchClickSchema } from "@abonten/validation/discoverySchemas";

// POST /api/mobile/search/click  { searchId, entityType, entityId, rank }
// The first result opened from a search. Carries no identity.
export async function POST(req: Request) {
  return discoveryRoute(
    req,
    {
      schema: searchClickSchema,
      label: "POST /search/click",
      allowAnonymous: true,
    },
    ({ svc, data }) => recordSearchClickCore(svc, data),
  );
}
