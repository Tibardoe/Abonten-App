"use client";

import joinAreaWaitlist from "@/actions/joinAreaWaitlist";
import leaveAreaWaitlist from "@/actions/leaveAreaWaitlist";
import { Button } from "@/components/ui/button";
import { supabase } from "@/config/supabase/client";
import { useToast } from "@/hooks/useToast";
import { getSignInUrl } from "@abonten/core/getSignInUrl";
import type { BrowseSuggestions } from "@abonten/core/market/coverage";
import {
  BROWSE_ELSEWHERE_TITLE,
  JOIN_WAITLIST_LABEL,
  LEAVE_WAITLIST_LABEL,
  NOT_LAUNCHED_BODY,
  browseReasonLabel,
  cityDistanceText,
  notLaunchedTitle,
  supplyPrompt,
  waitingText,
} from "@abonten/core/market/coverageCopy";
import type { DistanceUnit } from "@abonten/core/units/distance";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FiBell, FiChevronRight, FiClock, FiMapPin } from "react-icons/fi";

const JOIN_PARAM = "joinWaitlist";

// The interactive half of AreaCoverageNotice: the waiting list, the
// launched cities to explore instead (as the market's browse fallback picked
// them — a list to choose from, or one city marked with why it is
// suggested) and the way to list events or a place here. Signed out, "Tell
// me when it launches" goes through sign-in and comes back with
// ?joinWaitlist=1, which finishes the join here once.
export default function AreaCoveragePanel({
  browse,
  areaName,
  point,
  waiting: initiallyWaiting,
  distanceUnit,
  autoJoin,
}: {
  browse: BrowseSuggestions;
  areaName: string | null;
  point: { lat: number; lng: number };
  waiting: boolean;
  distanceUnit: DistanceUnit;
  autoJoin: boolean;
}) {
  const t = useTranslations("events");

  const [waiting, setWaiting] = useState(initiallyWaiting);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const autoJoined = useRef(false);

  function currentQuery(extra?: Record<string, string | null>) {
    const params = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(extra ?? {})) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const q = params.toString();
    return q ? `${pathname}?${q}` : pathname;
  }

  function join() {
    startTransition(async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push(getSignInUrl(currentQuery({ [JOIN_PARAM]: "1" })));
        return;
      }
      const res = await joinAreaWaitlist({ ...point, label: areaName });
      if (res.status === 200) {
        setWaiting(true);
        toast.success(waitingText(res.data?.areaName ?? areaName));
      } else if (res.status === 409) {
        toast.success(t("abontenIsAlreadyOpenHereHave"));
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldnTAddYouToThe"));
      }
    });
  }

  function leave() {
    startTransition(async () => {
      const res = await leaveAreaWaitlist(point);
      if (res.status === 200) setWaiting(false);
      else toast.error(res.message ?? t("couldnTTakeYouOffThe"));
    });
  }

  // Back from signing in: finish the join once, then drop the parameter.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per arrival
  useEffect(() => {
    if (!autoJoin || autoJoined.current) return;
    autoJoined.current = true;
    router.replace(currentQuery({ [JOIN_PARAM]: null }), { scroll: false });
    if (!initiallyWaiting) join();
  }, [autoJoin]);

  const title = notLaunchedTitle(areaName);
  const reason = browseReasonLabel(browse.reason);

  return (
    <section
      aria-labelledby="area-coverage-title"
      className="my-3 rounded-xl border border-border bg-card p-4 md:p-5"
    >
      <div className="flex items-start gap-3">
        <FiClock aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="area-coverage-title" className="font-semibold text-base">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground">
            {waiting ? waitingText(areaName) : NOT_LAUNCHED_BODY}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 md:pl-8">
        {waiting ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={leave}
            disabled={pending}
          >
            {pending ? t("removingYou") : LEAVE_WAITLIST_LABEL}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={join} disabled={pending}>
            <FiBell aria-hidden className="h-4 w-4" />
            {pending ? t("addingYou") : JOIN_WAITLIST_LABEL}
          </Button>
        )}
      </div>

      {browse.cities.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3 md:pl-8">
          <h3 className="text-sm font-medium">{BROWSE_ELSEWHERE_TITLE}</h3>
          <ul className="mt-1">
            {browse.cities.map((city) => (
              <li key={city.region.id}>
                <Link
                  href={`/explore/${city.region.slug}?lat=${city.region.lat}&lng=${city.region.lng}`}
                  className="flex min-h-11 items-center gap-2 rounded-md px-1 text-sm hover:bg-accent"
                >
                  <FiMapPin
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-primary"
                  />
                  <span className="flex-1 truncate font-medium">
                    {city.region.name}
                  </span>
                  {reason ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {reason}
                    </span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {cityDistanceText(city, distanceUnit)}
                  </span>
                  <FiChevronRight
                    aria-hidden
                    className="h-4 w-4 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground md:pl-8">
        {supplyPrompt(areaName)}{" "}
        <Link
          href="/help/organizers/creating-and-publishing-events"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("howToListAnEvent")}
        </Link>
        {" · "}
        <Link
          href="/help/place-owners/managing-your-place"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("howToAddAPlace")}
        </Link>
      </p>
    </section>
  );
}
