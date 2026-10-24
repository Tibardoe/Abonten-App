"use client";

import { acknowledgeSafetyAlert } from "@/actions/safety/acknowledgeSafetyAlert";
import { getSafetyView } from "@/actions/safety/getSafetyView";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { useToast } from "@/hooks/useToast";
import SafetyLiveMap from "@/safety/molecules/SafetyLiveMap";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { formatDateTime } from "@abonten/core/i18n/format";
import { identityBadgeLabel } from "@abonten/core/identity/copy";
import { formatPhoneInternational } from "@abonten/core/phone/phone";
import { primaryEmergencyNumber } from "@abonten/core/safety/emergencyNumbers";
import {
  mapsDirectionsUrl,
  telUrl,
  whatsAppUrl,
} from "@abonten/core/safety/links";
import type {
  SafetyAcknowledgement,
  SafetyView,
} from "@abonten/types/safetyType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  IdCard,
  MessageCircle,
  Navigation,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";

// The trusted contact's live page (/sos/<token>). It asks for the alert
// only once the browser runs it, then every 15 seconds while it is open.
// The contact can call the person, call the emergency number, open
// directions, and answer — the person sees the answer at once.

type Envelope = { status: number; message?: string; data?: SafetyView };

export default function SafetyLiveView({ token }: { token: string }) {
  const t = useTranslations("safety");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const key = ["safety-view", token];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Envelope> =>
      answerOrThrow(await getSafetyView({ token })),
    refetchInterval: (q) => {
      const seconds = q.state.data?.data?.pollSeconds;
      return seconds ? seconds * 1000 : false;
    },
    refetchOnWindowFocus: true,
  });

  const ack = useMutation({
    mutationFn: (acknowledgement: SafetyAcknowledgement) =>
      acknowledgeSafetyAlert({ token, acknowledgement }),
    onSuccess: (res) => {
      if (res.status === 200 && res.data) {
        qc.setQueryData(key, res);
        toast.success(t("answerSent", { name: res.data.person.name }));
      } else {
        toast.error(res.message ?? t("couldNotSave"));
      }
    },
    onError: () => toast.error(t("networkError")),
  });

  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[260px] w-full" />
      </div>
    );
  }

  const view = query.data?.data;
  if (!view) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
        <PageTitle>{t("title")}</PageTitle>
        <SupportingText>
          {query.isError
            ? t("networkError")
            : (query.data?.message ?? t("linkEnded"))}
        </SupportingText>
        {query.isError ? (
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("tryAgain")}
          </Button>
        ) : null}
      </div>
    );
  }

  const name = view.person.name;
  const open = view.status === "active" || view.status === "alerting";
  const alerting = view.status === "alerting";
  const emergency = primaryEmergencyNumber(view.emergencyNumbers);
  const clock = (at: string) =>
    formatDateTime(at, locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: view.timezone,
    });

  const headline = alerting
    ? view.alertReason === "check_in_missed"
      ? t("watch.missed", { name })
      : t("watch.alert", { name })
    : open
      ? t("watch.sharing", { name, time: clock(view.endsAt) })
      : view.resolution === "false_alarm"
        ? t("watch.mistake", { name })
        : view.resolution === "safe"
          ? t("watch.safe", { name })
          : t("watch.ended", { name });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <div
        className={`flex items-start gap-3 rounded-2xl border p-4 ${alerting ? "border-destructive bg-destructive/5" : "bg-card"}`}
        aria-live="polite"
      >
        {view.person.avatarUrl ? (
          <Image
            src={view.person.avatarUrl}
            alt=""
            width={56}
            height={56}
            className="rounded-full border border-border"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {alerting ? (
              <AlertTriangle
                className="h-5 w-5 shrink-0 text-destructive"
                aria-hidden
              />
            ) : !open ? (
              <ShieldCheck
                className="h-5 w-5 shrink-0 text-success"
                aria-hidden
              />
            ) : null}
            <h1 className="text-xl font-bold leading-tight">{headline}</h1>
          </div>
          {view.event ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("watch.atEventVenue", {
                event: view.event.title,
                venue: view.event.venue ?? view.event.address ?? "",
                hasVenue: view.event.venue || view.event.address ? "yes" : "no",
              })}
            </p>
          ) : null}
          {view.note ? (
            <p className="mt-3 rounded-xl bg-muted p-3 text-sm">
              {t("watch.note", { note: view.note })}
            </p>
          ) : null}
        </div>
      </div>

      {view.location ? (
        <div className="flex flex-col gap-2">
          <SafetyLiveMap
            point={view.location}
            trail={view.trail}
            label={name}
          />
          <p
            className={`text-sm ${view.locationState === "stale" ? "text-warning" : "text-muted-foreground"}`}
          >
            {t(
              view.locationState === "stale"
                ? "watch.lastSeen"
                : "watch.liveAt",
              {
                when: getRelativeTime(
                  view.location.at,
                  new Date(view.now),
                  locale,
                ),
                accuracy: view.location.accuracyM ?? 0,
                hasAccuracy: view.location.accuracyM ? "yes" : "no",
              },
            )}
          </p>
          <Button asChild variant="outline">
            <a
              href={mapsDirectionsUrl(view.location.lat, view.location.lng)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              {t("watch.directions")}
            </a>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {view.locationState === "hidden"
            ? t("watch.locationHidden")
            : t("watch.noLocation")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {view.person.phoneE164 ? (
          <Button asChild>
            <a href={telUrl(view.person.phoneE164)}>
              <Phone className="h-4 w-4" aria-hidden />
              {t("watch.call", {
                name,
                phone: formatPhoneInternational(view.person.phoneE164),
              })}
            </a>
          </Button>
        ) : null}
        {alerting && emergency ? (
          <Button asChild variant="destructive">
            <a href={telUrl(emergency.number)}>
              <Phone className="h-4 w-4" aria-hidden />
              {t("callEmergency", { number: emergency.number })}
            </a>
          </Button>
        ) : null}
      </div>

      {/* The people on site: the venue's public numbers and who runs the
          event, as their profile shows it (never their legal identity). */}
      {open &&
      view.event &&
      (view.event.organizer ||
        view.event.venuePhone ||
        view.event.venueWhatsapp) ? (
        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">{view.event.title}</h2>
          {view.event.organizer ? (
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {t("watch.organizedBy", {
                organizer: view.event.organizer.name,
              })}
              {view.event.organizer.identityChecked ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <IdCard className="h-4 w-4" aria-hidden />
                  {identityBadgeLabel(tc)}
                </span>
              ) : null}
            </p>
          ) : null}
          {view.event.venuePhone ? (
            <Button asChild variant="outline">
              <a href={telUrl(view.event.venuePhone)}>
                <Phone className="h-4 w-4" aria-hidden />
                {t("watch.callVenue", {
                  venue: view.event.venue ?? view.event.title,
                })}
              </a>
            </Button>
          ) : null}
          {view.event.venueWhatsapp ? (
            <Button asChild variant="outline">
              <a
                href={whatsAppUrl(view.event.venueWhatsapp)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                {t("watch.whatsAppVenue", {
                  venue: view.event.venue ?? view.event.title,
                })}
              </a>
            </Button>
          ) : null}
          {view.event.venuePhone || view.event.venueWhatsapp ? (
            <p className="text-xs text-muted-foreground">
              {t("watch.venueNumberNote")}
            </p>
          ) : null}
        </section>
      ) : null}

      {open ? (
        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">{t("watch.answerTitle", { name })}</h2>
          {(["on_my_way", "calling", "cant_help"] as const).map((a) => (
            <Button
              key={a}
              variant={
                view.viewer.acknowledgement === a ? "default" : "outline"
              }
              disabled={ack.isPending}
              aria-pressed={view.viewer.acknowledgement === a}
              onClick={() => ack.mutate(a)}
            >
              {t("watch.answer", { answer: a })}
            </Button>
          ))}
        </section>
      ) : null}

      {view.timeline.length > 0 ? (
        <ol className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm">
          {view.timeline.map((e) => (
            <li
              key={`${e.kind}-${e.at}`}
              className="flex justify-between gap-3"
            >
              <span>
                {t("timeline", {
                  kind: e.kind,
                  name: e.name ?? "",
                  person: name,
                  answer: e.acknowledgement ?? "",
                  outcome: e.resolution ?? "",
                  reason: e.reason ?? "",
                })}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {clock(e.at)}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {t("notEmergencyServices")}
      </p>
    </div>
  );
}
