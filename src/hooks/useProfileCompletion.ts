import { getProfileCompletion } from "@/actions/getProfileCompletion";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";

// Same ["user-details", userId]-style sharing convention as
// useCurrentUserDetails() -- one cache entry per user, invalidated
// alongside user-details wherever a profile field changes so the
// checklist/indicator update immediately.
export function useProfileCompletion() {
  const { data: user } = useCurrentUser();

  return useQuery({
    queryKey: ["profile-completion", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const result = await getProfileCompletion();
      return result.status === 200 ? result.completion : null;
    },
    staleTime: 60 * 1000,
  });
}
