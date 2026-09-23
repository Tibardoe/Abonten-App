import { dismissAccountSetupPrompt } from "@/actions/dismissAccountSetupPrompt";
import {
  type GetProfileCompletionResult,
  getProfileCompletion,
} from "@/actions/getProfileCompletion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";

// Account setup for the signed-in user (@abonten/core/profileCompletion):
// one cache entry per user under ["profile-completion", userId], invalidated
// wherever a profile field, the email or the phone changes so the checklist,
// the indicator and the reminder card update immediately.

type SetupState = Extract<GetProfileCompletionResult, { status: 200 }>;

function useAccountSetupState() {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["profile-completion", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<SetupState | null> => {
      const result = await getProfileCompletion();
      return result.status === 200 ? result : null;
    },
    staleTime: 60 * 1000,
  });
}

export function useProfileCompletion() {
  const query = useAccountSetupState();
  return { ...query, data: query.data?.completion ?? null };
}

/**
 * The dismissible "Finish setting up your account" reminder: whether it may
 * show (never once complete; quiet for 7, 30, then 90 days after each "Not
 * now", on every device) and how to put it away.
 */
export function useAccountSetupPrompt() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const query = useAccountSetupState();
  const key = ["profile-completion", user?.id];

  const dismiss = useMutation({
    mutationFn: () => dismissAccountSetupPrompt(),
    onMutate: () => {
      queryClient.setQueryData<SetupState | null>(key, (old) =>
        old ? { ...old, promptVisible: false } : old,
      );
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    completion: query.data?.completion ?? null,
    visible: !!query.data?.promptVisible,
    dismiss: () => dismiss.mutate(),
  };
}
