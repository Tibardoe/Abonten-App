"use client";

import { getWeeklyEdition } from "@/actions/weekly/getWeeklyEdition";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useWeeklyProgram } from "@/hooks/useWeeklyProgram";
import { useQuery } from "@tanstack/react-query";
import WeeklyEditionSkeleton from "./WeeklyEditionSkeleton";
import WeeklyEditionView from "./WeeklyEditionView";
import WeeklyFallback from "./WeeklyFallback";

// The cached public page carries no edition while Abonten Weekly is open only
// to staff or beta testers. For those signed-in visitors this loads the same
// edition with their session. Everyone else sees the fallback. The query is
// keyed by user, so nothing one person may see is reused for another.
export default function WeeklyPersonalEdition({
  scope,
  week,
}: {
  scope: string | null;
  week: string | null;
}) {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const { program, resolving } = useWeeklyProgram();
  const query = useQuery({
    queryKey: ["weekly-edition", user?.id ?? null, scope, week],
    enabled: !resolving && program.enabled,
    queryFn: async () => {
      const res = await getWeeklyEdition({
        scope: scope ?? undefined,
        week: week ?? undefined,
      });
      if (res.status >= 500) {
        throw new Error(res.message ?? "Couldn't load Abonten Weekly.");
      }
      return res;
    },
    staleTime: 60_000,
  });

  if (userLoading || resolving || (program.enabled && query.isLoading)) {
    return <WeeklyEditionSkeleton />;
  }
  if (!program.enabled) {
    return <WeeklyFallback events={[]} unavailable={!!week} />;
  }
  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <InlineErrorRetry
          message="Couldn't load Abonten Weekly."
          onRetry={() => query.refetch()}
        />
      </div>
    );
  }
  const data = query.data?.data;
  if (data?.edition) return <WeeklyEditionView doc={data.edition} />;
  return (
    <WeeklyFallback
      events={data?.fallbackEvents ?? []}
      unavailable={query.data?.status === 404}
    />
  );
}
