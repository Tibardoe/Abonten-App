import { discoveryRoute } from "@/app/api/mobile/_lib/discoveryRoute";
import { getWeeklyProgramCore } from "@abonten/services/weekly/weeklyProgram";
import { z } from "zod";

// GET /api/mobile/weekly/program
// Whether Abonten Weekly is on for this caller (signed in or not). Fails closed.
export async function GET(req: Request) {
  const res = await discoveryRoute(
    req,
    {
      schema: z.object({}).passthrough(),
      label: "GET /weekly/program",
      allowAnonymous: true,
    },
    ({ svc, userId }) => getWeeklyProgramCore(svc, userId),
  );
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
