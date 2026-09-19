import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import type { ActivePromotionSummary } from "@abonten/types/promotionSummaryType";
import { useQuery } from "@tanstack/react-query";

// Everything the signed-in person is promoting (featured events and places,
// promoted Spotlights), from the same service the web Settings card uses.
// Persisted for offline use (queryPersistPolicy "active-promotions"); the
// promotion flows invalidate ACTIVE_PROMOTIONS_KEY when they activate,
// pause or cancel one.

export const ACTIVE_PROMOTIONS_KEY = [
  "mobile",
  "account",
  "promotions",
] as const;

export function useActivePromotions() {
  const { session } = useSession();
  return useQuery({
    queryKey: [...ACTIVE_PROMOTIONS_KEY, session?.user.id ?? null],
    enabled: !!session,
    queryFn: async (): Promise<ActivePromotionSummary[]> => {
      const res = await api.account.activePromotions();
      if (res.status !== 200 || !res.data) {
        throw new Error(res.message ?? "Couldn't load your promotions.");
      }
      return res.data;
    },
    // A promotion changes only when bought, paused or ended; the flows that
    // do that invalidate this. Expiry is time-based, so a minute is plenty.
    staleTime: 60_000,
  });
}
