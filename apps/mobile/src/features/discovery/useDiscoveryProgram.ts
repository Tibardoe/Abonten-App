import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import {
  DISABLED_DISCOVERY_PROGRAM,
  type DiscoveryProgram,
} from "@abonten/types/discoveryType";
import { useQuery } from "@tanstack/react-query";

// Which Discovery features this person may use right now: the unified
// search, organizer and place search, alerts and opt-in prompts. Rolls out
// by audience and fails closed, so every entry point hides while this is
// loading, offline without a cached answer, or switched off. The answer
// depends on who is asking (audience, and alerts need an account), so it is
// cached per person: signing in must not keep showing the signed-out answer.
export const DISCOVERY_PROGRAM_KEY = [
  "mobile",
  "discovery",
  "program",
] as const;

export function useDiscoveryProgram() {
  const { session } = useSession();
  const query = useQuery({
    queryKey: [...DISCOVERY_PROGRAM_KEY, session?.user.id ?? null],
    queryFn: async (): Promise<DiscoveryProgram> => {
      const res = await api.discovery.program();
      // A server hiccup must not replace a known answer (possibly
      // restored from disk) with "switched off": throw so React Query
      // keeps the last good value. A definite answer still applies.
      if (res.status >= 500 || res.status === 429) {
        throw new Error(res.message ?? "Programme check failed");
      }
      return res.status === 200 && res.data
        ? res.data
        : DISABLED_DISCOVERY_PROGRAM;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, program: query.data ?? DISABLED_DISCOVERY_PROGRAM };
}
