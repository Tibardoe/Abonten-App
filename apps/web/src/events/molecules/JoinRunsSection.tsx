"use client";

import getJoinableRuns from "@/actions/getJoinableRuns";
import joinEventRuns from "@/actions/joinEventRuns";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Inside Manage › Details › Shows: bring another of the account's listings,
 * with every show of its run, into this run, so buyers see the play once
 * (docs/architecture/show-runs.md §2b). Hidden when there is nothing to
 * bring in.
 */
export default function JoinRunsSection({ eventId }: { eventId: string }) {
  const t = useTranslations("events");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const qc = useQueryClient();
  const [chosen, setChosen] = useState("");
  const [pending, start] = useTransition();
  const key = ["joinable-runs", eventId];

  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = answerOrThrow(await getJoinableRuns({ eventId }));
      return res.status === 200 && "data" in res ? res.data : [];
    },
    staleTime: 30_000,
  });
  const runs = data ?? [];
  if (runs.length === 0) return null;

  const label = (run: (typeof runs)[number]) =>
    t("joinRunsOption", {
      title: run.title,
      count: run.showCount,
      first: run.firstStartsAt
        ? formatInTimeZone(
            run.firstStartsAt,
            run.timezone,
            { day: "numeric", month: "short" },
            locale,
          )
        : "",
    });
  const run = runs.find((r) => r.eventId === chosen) ?? null;

  const join = () =>
    start(async () => {
      if (!run) return;
      const ok = await confirm({
        title: t("joinRunsConfirm", {
          title: run.title,
          count: run.showCount,
        }),
        confirmLabel: t("joinRunsButton"),
      });
      if (!ok) return;
      const res = await joinEventRuns({
        eventId,
        otherEventId: run.eventId,
      }).catch(actionUnreachable);
      if (res.status !== 200) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message);
      setChosen("");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["event-shows", eventId] });
      router.refresh();
    });

  return (
    <div className="space-y-2 border-t border-border pt-5">
      <p className="text-sm font-medium">{t("joinRunsTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("joinRunsIntro")}</p>
      <div className="flex flex-wrap items-end gap-2">
        <select
          aria-label={t("joinRunsChoose")}
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          className="h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">{t("joinRunsChoose")}</option>
          {runs.map((r) => (
            <option key={r.eventId} value={r.eventId}>
              {label(r)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !run}
          onClick={join}
        >
          {t("joinRunsButton")}
        </Button>
      </div>
    </div>
  );
}
