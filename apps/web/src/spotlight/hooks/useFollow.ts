"use client";

import { getFollowStatus } from "@/actions/content/getFollowStatus";
import { setFollow } from "@/actions/content/setFollow";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useToast } from "@/hooks/useToast";
import type {
  FollowStatus,
  FollowTargetKind,
} from "@abonten/types/contentType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { dataOf, messageOf } from "../lib/result";

export function useFollow(
  kind: FollowTargetKind,
  targetId: string,
  enabled = true,
  /** Already known from a post document: skip the status request. */
  known?: boolean,
) {
  const t = useTranslations("spotlight");

  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const toast = useToast();
  const key = ["content", "follow", kind, targetId, user?.id ?? null];

  const status = useQuery({
    queryKey: key,
    enabled: enabled && !!targetId && known === undefined,
    queryFn: async (): Promise<FollowStatus> =>
      dataOf(await getFollowStatus({ targetKind: kind, targetId })) ?? {
        following: false,
        followerCount: 0,
      },
    staleTime: 60_000,
  });

  const toggle = useMutation({
    mutationFn: (following: boolean) =>
      setFollow({ targetKind: kind, targetId, following }),
    onMutate: (following) => {
      const previous =
        qc.getQueryData<FollowStatus>(key) ??
        (known === undefined
          ? undefined
          : { following: known, followerCount: 0 });
      if (previous) {
        const delta = following === previous.following ? 0 : following ? 1 : -1;
        qc.setQueryData<FollowStatus>(key, {
          following,
          followerCount: Math.max(0, previous.followerCount + delta),
        });
      }
      return { previous };
    },
    onSuccess: (res, _following, context) => {
      const data = dataOf(res);
      if (!data) {
        qc.setQueryData(key, context?.previous);
        toast.error(messageOf(res, t("couldnTUpdateThisFollow")));
        return;
      }
      qc.setQueryData<FollowStatus>(key, data);
      qc.invalidateQueries({ queryKey: ["content", "stories", "tray"] });
      qc.invalidateQueries({ queryKey: ["content", "feed", "following"] });
    },
    onError: (_e, _following, context) => {
      qc.setQueryData(key, context?.previous);
      toast.error(t("couldnTUpdateThisFollowPlease"));
    },
  });

  return { status, toggle };
}
