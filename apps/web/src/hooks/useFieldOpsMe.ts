"use client";

import { getMyFieldOps } from "@/actions/fieldOps/getMyFieldOps";
import { useQuery } from "@tanstack/react-query";

// Whether the signed-in user is on a Field Ops team (and the programme is
// on). Drives the "Field work" entry points; the pages re-check on the
// server. Cached briefly so the header doesn't refetch on every render.
export function useFieldOpsMe() {
  return useQuery({
    queryKey: ["fieldops-me"],
    queryFn: async () => (await getMyFieldOps()).data ?? null,
    staleTime: 5 * 60 * 1000,
  });
}
