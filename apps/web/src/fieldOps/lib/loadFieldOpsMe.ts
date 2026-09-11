import { getMyFieldOps } from "@/actions/fieldOps/getMyFieldOps";
import { cache } from "react";

// The /field layout and every /field page need the same answer; React's
// request-scoped cache makes that one call per request.
export const loadFieldOpsMe = cache(async () => getMyFieldOps());
