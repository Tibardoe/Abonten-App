import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { distanceMetres } from "@abonten/core/fieldOps/territory";
import {
  WAITLIST_SAME_AREA_KM,
  coarsePoint,
} from "@abonten/core/market/coverage";
import { waitingText } from "@abonten/core/market/coverageCopy";
import type { AreaWaitlistStatus } from "@abonten/types/marketType";
import { useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { MARKET_CONTEXT_KEY } from "./marketContextCache";

// "Tell me when it launches" for an area Abonten hasn't launched in. The
// list lives on the server (/api/mobile/markets/waitlist), which re-checks
// the area and records only the city or a ~1 km cell.
//
// Signed out, the button sends the person to sign in first. The request is
// kept here (in memory, like the pending redirect) and sent as soon as they
// are back on Explore signed in, for the same area, so they don't have to
// find the button again.

type Point = { lat: number; lng: number };

const KEY = ["mobile", "markets", "waitlist"] as const;

let pendingJoin: (Point & { label: string | null }) | null = null;

/** Remember a join to send once the person has signed in. */
export function rememberJoinAfterSignIn(point: Point, label: string | null) {
  pendingJoin = { ...point, label };
}

export function useAreaWaitlist(
  point: Point | null,
  areaName: string | null,
  enabled: boolean,
) {
  const t = useTranslations("explore");
  const tc = useTranslations("core");

  const { session } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const cell = point ? coarsePoint(point) : null;
  const key = [...KEY, session?.user.id ?? null, cell?.lat, cell?.lng];

  const status = useQuery({
    queryKey: key,
    enabled: enabled && !!session && !!point,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AreaWaitlistStatus> => {
      const res = settleEnvelope(
        await api.markets.waitlistStatus(point as Point),
      );
      if (res.status !== 200 || !res.data)
        throw new Error(res.message ?? "Waiting list unavailable");
      return res.data;
    },
  });

  const join = useMutation({
    mutationFn: (vars: { point: Point; label: string | null }) =>
      api.markets.joinWaitlist({ ...vars.point, label: vars.label }),
    onSuccess: (res) => {
      if (res.status === 200 && res.data) {
        qc.setQueryData<AreaWaitlistStatus>(key, res.data);
        toast.success(t("youReOnTheList"), {
          description: waitingText(tc, res.data.areaName ?? areaName),
        });
        return;
      }
      if (res.status === 409) {
        // Launched since the market context was loaded: fetch it again so
        // the card goes away.
        qc.invalidateQueries({ queryKey: MARKET_CONTEXT_KEY });
        toast.success(t("abontenIsAlreadyOpenHere"), {
          description: t("haveALookAround"),
        });
        return;
      }
      toast.error(t("couldnTAddYouToThe"), {
        description: res.message ?? t("pleaseTryAgain"),
      });
    },
    onError: () => {
      toast.error(t("couldnTAddYouToThe"), {
        description: t("checkYourConnectionAndTryAgain"),
      });
    },
  });

  const leave = useMutation({
    mutationFn: (p: Point) => api.markets.leaveWaitlist(p),
    onSuccess: (res) => {
      if (res.status === 200) {
        qc.setQueryData<AreaWaitlistStatus>(key, {
          waiting: false,
          areaName: null,
        });
        return;
      }
      toast.error(t("couldnTTakeYouOffThe"), {
        description: res.message ?? t("pleaseTryAgain"),
      });
    },
  });

  // Finish a join that started signed out (cleared before sending, so it
  // goes once however often this runs).
  const signedIn = !!session;
  const { mutate } = join;
  useEffect(() => {
    if (!enabled || !signedIn || !point || !pendingJoin) return;
    const pending = pendingJoin;
    if (distanceMetres(pending, point) > WAITLIST_SAME_AREA_KM * 1000) return;
    pendingJoin = null;
    mutate({ point: pending, label: pending.label });
  }, [enabled, signedIn, point, mutate]);

  return {
    waiting: status.data?.waiting === true,
    join: (label: string | null) => {
      if (point) join.mutate({ point, label });
    },
    joining: join.isPending,
    leave: () => {
      if (point) leave.mutate(point);
    },
    leaving: leave.isPending,
  };
}
