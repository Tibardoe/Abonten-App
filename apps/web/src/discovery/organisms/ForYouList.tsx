"use client";

import { dismissRecommendation } from "@/actions/discovery/dismissRecommendation";
import { listRecommendations } from "@/actions/discovery/listRecommendations";
import { markRecommendationOpened } from "@/actions/discovery/markRecommendationOpened";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { Skeleton } from "@/components/ui/skeleton";
import NoEventsFound from "@/events/molecules/NoEventsFound";
import { useToast } from "@/hooks/useToast";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { RecommendationItem } from "@abonten/types/discoveryType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

// "For you": the live picks the recommendation engine made for this person
// in the last 30 days that are still worth showing (not ended, not already
// bought, saved or visited). Every card says why it is here and can be
// dismissed with "Not interested", which also teaches the engine.

const KEY = ["recommendations"] as const;

function PickCard({
  item,
  onDismiss,
  dismissing,
}: {
  item: RecommendationItem;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const locale = useLocale();

  const t = useTranslations("discovery");

  const isEvent = item.subjectType === "event" && item.event;
  const href = isEvent
    ? `/events/${item.event?.eventCode.toLowerCase()}`
    : `/places/${item.place?.slug}`;
  const title = isEvent ? item.event?.title : item.place?.name;
  const imageId = isEvent
    ? item.event?.flyerPublicId
    : item.place?.coverPublicId;
  const imageVersion = isEvent
    ? item.event?.flyerVersion
    : item.place?.coverVersion;
  const meta = isEvent
    ? [
        item.event?.startsAt
          ? formatDateWithSuffix(item.event.startsAt, undefined, locale)
          : null,
        item.event?.address,
      ]
    : [item.place?.category, item.place?.address];

  return (
    <li className="flex gap-4 rounded-xl border border-border bg-card p-3 md:p-4">
      <Link
        href={href}
        onClick={() =>
          void markRecommendationOpened({
            subjectType: item.subjectType,
            subjectId: item.subjectId,
          })
        }
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted md:h-28 md:w-28"
      >
        {imageId ? (
          <Image
            src={buildCloudinaryUrl(imageId, imageVersion, {
              width: 112,
              height: 112,
            })}
            alt=""
            fill
            sizes="112px"
            className="object-cover"
          />
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-xs font-medium text-primary">{item.reasonLabel}</p>
        <Link
          href={href}
          onClick={() =>
            void markRecommendationOpened({
              subjectType: item.subjectType,
              subjectId: item.subjectId,
            })
          }
          className="mt-0.5 line-clamp-2 font-medium hover:text-primary"
        >
          {title}
        </Link>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
          {meta.filter(Boolean).join(" · ")}
        </p>
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={onDismiss}
            disabled={dismissing}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
          >
            {t("notInterested")}
          </button>
        </div>
      </div>
    </li>
  );
}

export default function ForYouList() {
  const t = useTranslations("discovery");

  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await listRecommendations();
      if (res.status !== 200 || !("data" in res)) {
        throw new Error(res.message ?? "Couldn't load your picks.");
      }
      return res.data ?? [];
    },
    staleTime: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: (item: RecommendationItem) =>
      dismissRecommendation({
        subjectType: item.subjectType,
        subjectId: item.subjectId,
      }),
    onMutate: (item) => {
      const previous = qc.getQueryData<RecommendationItem[]>(KEY);
      qc.setQueryData<RecommendationItem[]>(KEY, (list) =>
        (list ?? []).filter((i) => i.id !== item.id),
      );
      return { previous };
    },
    onSuccess: (res, _item, context) => {
      if (res.status === 200) {
        toast.success(res.message ?? t("gotIt"));
      } else {
        qc.setQueryData(KEY, context?.previous);
        toast.error(res.message ?? t("couldnTSaveThat"));
      }
    },
    onError: (_e, _item, context) => {
      qc.setQueryData(KEY, context?.previous);
      toast.error(t("couldnTSaveThat"));
    },
  });

  if (isLoading) {
    return (
      <ul className="space-y-3" aria-busy>
        {["a", "b", "c"].map((k) => (
          <Skeleton key={k} className="h-28 w-full rounded-xl" />
        ))}
      </ul>
    );
  }
  if (isError) {
    return (
      <InlineErrorRetry
        message={t("couldnTLoadYourPicks")}
        onRetry={() => refetch()}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <NoEventsFound
        heading={t("noPicksYet")}
        description={t("turnOnAlertsAfterYouGet")}
        action={{
          label: t("manageNotifications"),
          href: "/settings/notifications",
        }}
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {data.map((item) => (
          <PickCard
            key={item.id}
            item={item}
            dismissing={dismiss.isPending && dismiss.variables?.id === item.id}
            onDismiss={() => dismiss.mutate(item)}
          />
        ))}
      </ul>
      <p className="text-center text-sm text-muted-foreground">
        {t("picksComeOnlyFromWhatYou2")}
        <Link
          href="/settings/notifications"
          className="text-primary hover:underline"
        >
          {t("manageNotifications")}
        </Link>
      </p>
    </div>
  );
}
