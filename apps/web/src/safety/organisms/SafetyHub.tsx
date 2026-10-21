"use client";

import { addSafetyContact } from "@/actions/safety/addSafetyContact";
import { getSafetyOverview } from "@/actions/safety/getSafetyOverview";
import { removeSafetyContact } from "@/actions/safety/removeSafetyContact";
import { resendSafetyInvite } from "@/actions/safety/resendSafetyInvite";
import { resolveSafetySession } from "@/actions/safety/resolveSafetySession";
import { startSafetySession } from "@/actions/safety/startSafetySession";
import { tellSafetyEventTeam } from "@/actions/safety/tellSafetyEventTeam";
import { updateSafetySession } from "@/actions/safety/updateSafetySession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import {
  browserFix,
  useBrowserSafetyLocation,
} from "@/safety/hooks/useBrowserSafetyLocation";
import SosHoldButton from "@/safety/molecules/SosHoldButton";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { formatDateTime } from "@abonten/core/i18n/format";
import { formatPhoneInternational } from "@abonten/core/phone/phone";
import { primaryEmergencyNumber } from "@abonten/core/safety/emergencyNumbers";
import { deviceSmsUrl, mapsPinUrl, telUrl } from "@abonten/core/safety/links";
import {
  CHECK_IN_EXTEND_MINUTES,
  CHECK_IN_PRESET_MINUTES,
  SAFETY_NOTE_MAX,
  SAFETY_RELATIONSHIPS,
  SHARE_PRESET_HOURS,
} from "@abonten/core/safety/rules";
import { LOCALE_NAMES, LOCALE_ORDER } from "@abonten/i18n/locales";
import type {
  SafetyContact,
  SafetyOverview,
  SafetyRelationship,
  SafetySession,
} from "@abonten/types/safetyType";
import type { StartSafetySessionInput } from "@abonten/validation/safetySchemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Phone, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useId, useMemo, useState } from "react";

// Abonten Safety on the website (docs/architecture/safety.md). The same
// services and rules as the app: SOS (hold the button), a check-in that
// alerts the contacts if it is missed, a live location share, the trusted
// contacts and the market's emergency numbers. While a session is open this
// page sends the browser's position and keeps the screen on during an alert.

const KEY = ["safety-overview"];

// Omit, kept per kind (a plain Omit of a union keeps only the shared keys).
type StartRequest = StartSafetySessionInput extends infer U
  ? U extends StartSafetySessionInput
    ? Omit<U, "clientRequestId" | "location">
    : never
  : never;
type Envelope = { status: number; message?: string; data?: SafetyOverview };

function uuid(): string {
  return crypto.randomUUID();
}

function ActivePanel({
  session,
  overview,
  busy,
  onChanged,
  setBusy,
}: {
  session: SafetySession;
  overview: SafetyOverview;
  busy: boolean;
  onChanged: () => void;
  setBusy: (b: boolean) => void;
}) {
  const t = useTranslations("safety");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState(session.note ?? "");
  const noteId = useId();
  const alerting = session.status === "alerting";
  const emergency = primaryEmergencyNumber(overview.emergencyNumbers);
  const clock = (at: string) =>
    formatDateTime(at, locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: overview.timezone,
    });
  const [smsBody, setSmsBody] = useState<string | null>(null);

  const run = async (
    call: () => Promise<{ status: number; message?: string }>,
    done?: string,
  ) => {
    setBusy(true);
    try {
      const res = await call();
      if (res.status === 200) {
        if (done) toast.success(done);
        onChanged();
      } else toast.error(res.message ?? t("couldNotSave"));
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (resolution: "safe" | "false_alarm" | "ended") => {
    if (alerting) {
      const ok = await confirm({
        title:
          resolution === "false_alarm"
            ? t("confirmMistakeTitle")
            : t("confirmSafeTitle"),
        message:
          resolution === "false_alarm"
            ? t("confirmMistakeBody")
            : t("confirmSafeBody"),
        confirmLabel:
          resolution === "false_alarm" ? t("itWasAMistake") : t("imSafe"),
        cancelLabel: t("cancel"),
      });
      if (!ok) return;
    }
    await run(
      () =>
        resolveSafetySession({ sessionId: session.id, resolution }).catch(
          actionUnreachable,
        ),
      resolution === "ended"
        ? t("sharingStopped")
        : resolution === "false_alarm"
          ? t("toldMistake")
          : t("toldSafe"),
    );
  };

  const phones = (
    session.textFromPhone.length > 0
      ? session.textFromPhone
      : overview.contacts.filter((c) => c.status !== "declined")
  ).map((c) => c.phoneE164);

  const prepareSms = async () => {
    const fix = await browserFix();
    setSmsBody(
      fix
        ? t("deviceSms.withLocation", { link: mapsPinUrl(fix.lat, fix.lng) })
        : t("deviceSms.withoutLocation"),
    );
  };

  const title = alerting
    ? session.alertReason === "check_in_missed"
      ? t("active.missedTitle")
      : t("active.alertTitle")
    : session.kind === "check_in" && session.dueAt
      ? t("active.checkInTitle", { time: clock(session.dueAt) })
      : t("active.shareTitle", { time: clock(session.endsAt) });

  return (
    <section
      className={`flex flex-col gap-4 rounded-2xl border p-5 ${alerting ? "border-destructive bg-destructive/5" : "bg-card"}`}
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        {alerting ? (
          <AlertTriangle
            className="mt-1 h-6 w-6 shrink-0 text-destructive"
            aria-hidden
          />
        ) : (
          <ShieldCheck
            className="mt-1 h-6 w-6 shrink-0 text-primary"
            aria-hidden
          />
        )}
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{title}</h2>
          {session.event ? (
            <p className="text-sm text-muted-foreground">
              {t("active.atEvent", { event: session.event.title })}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {session.lastLocation
              ? t("active.locationSent", {
                  when: getRelativeTime(
                    session.lastLocation.at,
                    undefined,
                    locale,
                  ),
                })
              : t("active.locationWaitingWeb")}
          </p>
        </div>
      </div>

      {session.recipients.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-background text-sm">
          {session.recipients.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="font-medium">
                {r.kind === "event_team" ? t("eventTeam") : r.name}
              </span>
              <span className="text-muted-foreground">
                {r.acknowledgement === "on_my_way"
                  ? t("recipient.onMyWay")
                  : r.acknowledgement === "calling"
                    ? t("recipient.calling")
                    : r.acknowledgement === "cant_help"
                      ? t("recipient.cantHelp")
                      : r.viewedAt
                        ? t("recipient.opened", {
                            when: getRelativeTime(
                              r.viewedAt,
                              undefined,
                              locale,
                            ),
                          })
                        : r.delivery === "sent"
                          ? t("recipient.told")
                          : r.delivery === "pending" || r.delivery === "sending"
                            ? t("recipient.sending")
                            : r.delivery === "failed"
                              ? t("recipient.failed")
                              : t("recipient.notTexted")}
              </span>
            </li>
          ))}
        </ul>
      ) : session.kind === "check_in" ? (
        <p className="text-sm text-muted-foreground">
          {t("active.checkInQuiet")}
        </p>
      ) : null}

      {alerting && emergency ? (
        <Button asChild variant="destructive" size="lg">
          <a href={telUrl(emergency.number)}>
            <Phone className="h-4 w-4" aria-hidden />
            {t("callEmergency", { number: emergency.number })}
          </a>
        </Button>
      ) : null}

      {(alerting || session.kind === "share") && phones.length > 0 ? (
        smsBody ? (
          <Button
            asChild
            variant={session.textFromPhone.length > 0 ? "default" : "outline"}
          >
            <a href={deviceSmsUrl("web", phones, smsBody)}>
              {t("openMessagesApp")}
            </a>
          </Button>
        ) : (
          <Button variant="outline" onClick={() => void prepareSms()}>
            {session.textFromPhone.length > 0
              ? t("textThemFromPhone", { count: session.textFromPhone.length })
              : t("textFromPhoneToo")}
          </Button>
        )
      ) : null}

      {session.canTellEventTeam ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            const ok = await confirm({
              title: t("tellEventTeamTitle"),
              message: t("tellEventTeamBody"),
              confirmLabel: t("tellThem"),
              cancelLabel: t("cancel"),
            });
            if (ok)
              await run(
                () =>
                  tellSafetyEventTeam({ sessionId: session.id }).catch(
                    actionUnreachable,
                  ),
                t("eventTeamTold"),
              );
          }}
        >
          {t("tellEventTeam")}
        </Button>
      ) : null}

      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={noteId} className="font-medium">
          {t("noteLabel")}
        </label>
        <Textarea
          id={noteId}
          value={note}
          maxLength={SAFETY_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
        />
        <span className="text-xs text-muted-foreground">{t("noteHint")}</span>
      </div>
      {note.trim() !== (session.note ?? "") ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(
              () =>
                updateSafetySession({
                  sessionId: session.id,
                  note: note.trim() || null,
                }).catch(actionUnreachable),
              t("contactSaved"),
            )
          }
        >
          {t("saveNote")}
        </Button>
      ) : null}

      {session.kind === "check_in" && session.status === "active" ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void resolve("safe")}>
            {t("imSafe")}
          </Button>
          {CHECK_IN_EXTEND_MINUTES.map((m) => (
            <Button
              key={m}
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(() =>
                  updateSafetySession({
                    sessionId: session.id,
                    extendMinutes: m,
                  }).catch(actionUnreachable),
                )
              }
            >
              {t("extendBy", { minutes: m })}
            </Button>
          ))}
        </div>
      ) : null}

      {session.kind === "share" && !alerting ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void resolve("ended")}
        >
          {t("stopSharing")}
        </Button>
      ) : null}

      {alerting ? (
        <div className="flex flex-col gap-2 border-t pt-4">
          <Button disabled={busy} onClick={() => void resolve("safe")}>
            {t("imSafe")}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void resolve("false_alarm")}
          >
            {t("itWasAMistake")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ContactsSection({
  overview,
  onChanged,
}: {
  overview: SafetyOverview;
  onChanged: () => void;
}) {
  const t = useTranslations("safety");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const nameId = useId();
  const dialId = useId();
  const phoneId = useId();
  const emailId = useId();
  const [name, setName] = useState("");
  const [dialCode, setDialCode] = useState("+233");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] =
    useState<SafetyRelationship>("family");
  const [contactLocale, setContactLocale] = useState<string>(locale);
  const canAdd =
    overview.phone.verified &&
    !overview.needsName &&
    overview.contacts.length < (overview.program.maxContacts || 5);

  const add = useMutation({
    mutationFn: () =>
      addSafetyContact({
        name,
        dialCode,
        phone,
        email: email.trim() || null,
        relationship,
        locale: contactLocale,
      }),
    onSuccess: (res) => {
      if (res.status === 201 && res.data) {
        toast.success(
          res.data.canText || res.data.email
            ? t("contactAddedInvited", { name: res.data.name })
            : t("contactAddedNoText", { name: res.data.name }),
        );
        setAdding(false);
        setName("");
        setPhone("");
        setEmail("");
        onChanged();
      } else toast.error(res.message ?? t("couldNotSave"));
    },
    onError: () => toast.error(t("networkError")),
  });

  const remove = async (c: SafetyContact) => {
    const ok = await confirm({
      title: t("removeContactTitle", { name: c.name }),
      message: t("removeContactBody"),
      confirmLabel: t("remove"),
      cancelLabel: t("cancel"),
    });
    if (!ok) return;
    const res = await removeSafetyContact({ contactId: c.id }).catch(
      actionUnreachable,
    );
    if (res.status === 200) {
      toast.success(t("contactRemoved"));
      onChanged();
    } else toast.error(res.message ?? t("couldNotSave"));
  };

  const resend = async (c: SafetyContact) => {
    const res = await resendSafetyInvite({ contactId: c.id }).catch(
      actionUnreachable,
    );
    if (res.status === 200) {
      toast.success(t("inviteSent"));
      onChanged();
    } else toast.error(res.message ?? t("couldNotSave"));
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("trustedContacts")}</h2>
        {canAdd && !adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            {t("addContactTitle")}
          </Button>
        ) : null}
      </div>
      {overview.contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noContactsYet")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {overview.contacts.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("contactLine", {
                    relationship: c.relationship,
                    phone: formatPhoneInternational(c.phoneE164),
                  })}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.status === "accepted"
                  ? t("contactStatus.accepted")
                  : c.status === "declined"
                    ? t("contactStatus.declined")
                    : !c.canText && !c.email
                      ? t("contactStatus.phoneOnly")
                      : t("contactStatus.pending")}
              </span>
              {c.canResendInvite ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void resend(c)}
                >
                  {t("resendInvite")}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("removeContactTitle", { name: c.name })}
                onClick={() => void remove(c)}
              >
                {t("remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form
          className="flex flex-col gap-3 rounded-2xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">
            {t("addContactIntro")}
          </p>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor={nameId} className="font-medium">
              {t("contactName")}
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex w-24 flex-col gap-1 text-sm">
              <label htmlFor={dialId} className="font-medium">
                {t("countryCode")}
              </label>
              <Input
                id={dialId}
                value={dialCode}
                onChange={(e) => setDialCode(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1 text-sm">
              <label htmlFor={phoneId} className="font-medium">
                {t("phoneNumber")}
              </label>
              <Input
                id={phoneId}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel-national"
                required
              />
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("relationship")}</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={relationship}
              onChange={(e) =>
                setRelationship(e.target.value as SafetyRelationship)
              }
            >
              {SAFETY_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {t("relationshipName", { relationship: r })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("theirLanguage")}</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={contactLocale}
              onChange={(e) => setContactLocale(e.target.value)}
            >
              {LOCALE_ORDER.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              {t("theirLanguageHint")}
            </span>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor={emailId} className="font-medium">
              {t("emailOptional")}
            </label>
            <Input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              {t("emailHint")}
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? t("saving") : t("addAndInvite")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAdding(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("contactsHint", { max: overview.program.maxContacts || 5 })}
      </p>
    </section>
  );
}

export default function SafetyHub() {
  const t = useTranslations("safety");
  const locale = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [eventId, setEventId] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<"check_in" | "share" | null>(null);
  const [minutes, setMinutes] = useState<number>(CHECK_IN_PRESET_MINUTES[1]);
  const [hours, setHours] = useState<number>(SHARE_PRESET_HOURS[1]);
  const [note, setNote] = useState("");
  const noteId = useId();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Envelope> =>
      answerOrThrow(await getSafetyOverview()),
    // While a session is open, keep up with answers and deliveries.
    refetchInterval: (q) => (q.state.data?.data?.active ? 20_000 : false),
  });
  const refresh = useCallback(
    () => void qc.invalidateQueries({ queryKey: KEY }),
    [qc],
  );
  const overview = query.data?.data ?? null;
  const active = overview?.active ?? null;
  useBrowserSafetyLocation(active, refresh);

  const chosenEvent = useMemo(() => {
    const choices = overview?.eventChoices ?? [];
    if (eventId === null) return null;
    if (eventId) return choices.find((e) => e.id === eventId) ?? null;
    return choices[0] ?? null;
  }, [overview?.eventChoices, eventId]);

  const start = async (input: StartRequest) => {
    setBusy(true);
    try {
      const location = await browserFix();
      const res = await startSafetySession({
        ...input,
        clientRequestId: uuid(),
        location,
        eventId: chosenEvent?.id ?? null,
      } as StartSafetySessionInput).catch(actionUnreachable);
      if (res.status === 200 || res.status === 201) {
        toast.success(
          input.kind === "sos"
            ? t("sosSent")
            : input.kind === "check_in"
              ? t("checkInStarted")
              : t("shareStarted"),
        );
        setMode(null);
        setNote("");
        refresh();
      } else {
        toast.error(res.message ?? t("couldNotStart"));
      }
    } finally {
      setBusy(false);
    }
  };

  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <PageTitle>{t("title")}</PageTitle>
        <SupportingText>
          {query.data?.message ?? t("networkError")}
        </SupportingText>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("tryAgain")}
        </Button>
      </div>
    );
  }

  const reachable = overview.contacts.filter((c) => c.status !== "declined");
  const setupNeeded =
    overview.needsName || !overview.phone.verified || reachable.length === 0;
  const program = overview.program;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div>
        <PageTitle>{t("title")}</PageTitle>
        <SupportingText>{t("webIntro")}</SupportingText>
      </div>

      {active ? (
        <ActivePanel
          session={active}
          overview={overview}
          busy={busy}
          onChanged={refresh}
          setBusy={setBusy}
        />
      ) : !program.enabled ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          {t("notAvailableYet")}
        </p>
      ) : setupNeeded ? (
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("setupTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("setupBody")}</p>
          {overview.needsName ? (
            <Button asChild variant="outline">
              <Link href="/settings/edit-profile">{t("addYourName")}</Link>
            </Button>
          ) : null}
          {!overview.phone.verified ? (
            <Button asChild variant="outline">
              <Link href="/settings/account-setup">{t("verifyYourPhone")}</Link>
            </Button>
          ) : null}
          {reachable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("addFirstContactBelow")}
            </p>
          ) : null}
        </section>
      ) : (
        <section className="flex flex-col items-center gap-4">
          <SosHoldButton
            onTrigger={() => void start({ kind: "sos" })}
            disabled={busy}
          />
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {t("sosExplain", { count: reachable.length })}
          </p>
          {overview.eventChoices.length > 0 ? (
            <div className="flex flex-col items-center gap-2">
              <span className="text-sm font-medium">{t("whereAreYou")}</span>
              <div className="flex flex-wrap justify-center gap-2">
                {overview.eventChoices.map((e) => (
                  <Button
                    key={e.id}
                    size="sm"
                    variant={chosenEvent?.id === e.id ? "default" : "outline"}
                    onClick={() => setEventId(e.id)}
                  >
                    {e.title}
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={chosenEvent === null ? "default" : "outline"}
                  onClick={() => setEventId(null)}
                >
                  {t("notAtAnEvent")}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="grid w-full gap-3 sm:grid-cols-2">
            {program.checkIn ? (
              <button
                type="button"
                className={`rounded-2xl border p-4 text-left ${mode === "check_in" ? "border-primary" : "bg-card"}`}
                onClick={() => setMode(mode === "check_in" ? null : "check_in")}
                aria-expanded={mode === "check_in"}
              >
                <p className="font-semibold">{t("checkInTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("checkInCardBody")}
                </p>
              </button>
            ) : null}
            {program.share ? (
              <button
                type="button"
                className={`rounded-2xl border p-4 text-left ${mode === "share" ? "border-primary" : "bg-card"}`}
                onClick={() => setMode(mode === "share" ? null : "share")}
                aria-expanded={mode === "share"}
              >
                <p className="font-semibold">{t("shareTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("shareCardBody")}
                </p>
              </button>
            ) : null}
          </div>
          {mode ? (
            <div className="flex w-full flex-col gap-3 rounded-2xl border bg-card p-4">
              <p className="text-sm text-muted-foreground">
                {mode === "check_in" ? t("checkInExplain") : t("shareExplain")}
              </p>
              <div className="flex flex-wrap gap-2">
                {mode === "check_in"
                  ? CHECK_IN_PRESET_MINUTES.map((m) => (
                      <Button
                        key={m}
                        size="sm"
                        variant={minutes === m ? "default" : "outline"}
                        onClick={() => setMinutes(m)}
                      >
                        {t("inDuration", {
                          duration:
                            m < 60
                              ? t("minutesShort", { minutes: m })
                              : t("hoursShort", { hours: m / 60 }),
                        })}
                      </Button>
                    ))
                  : SHARE_PRESET_HOURS.filter(
                      (h) => h <= program.shareMaxHours,
                    ).map((h) => (
                      <Button
                        key={h}
                        size="sm"
                        variant={hours === h ? "default" : "outline"}
                        onClick={() => setHours(h)}
                      >
                        {t("hoursShort", { hours: h })}
                      </Button>
                    ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "check_in"
                  ? t("checkInPreview", {
                      time: formatDateTime(
                        Date.now() + minutes * 60_000,
                        locale,
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: overview.timezone,
                        },
                      ),
                      alertTime: formatDateTime(
                        Date.now() +
                          (minutes + program.checkInGraceMinutes) * 60_000,
                        locale,
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: overview.timezone,
                        },
                      ),
                      count: reachable.length,
                    })
                  : t("sharePreview", {
                      time: formatDateTime(
                        Date.now() + hours * 3_600_000,
                        locale,
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: overview.timezone,
                        },
                      ),
                    })}
              </p>
              <div className="flex flex-col gap-1 text-sm">
                <label htmlFor={noteId} className="font-medium">
                  {t("noteLabel")}
                </label>
                <Textarea
                  id={noteId}
                  value={note}
                  maxLength={SAFETY_NOTE_MAX}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={
                    mode === "check_in"
                      ? t("checkInNotePlaceholder")
                      : t("notePlaceholder")
                  }
                />
              </div>
              <Button
                disabled={busy}
                onClick={() =>
                  void start(
                    mode === "check_in"
                      ? {
                          kind: "check_in",
                          minutes,
                          note: note.trim() || undefined,
                        }
                      : {
                          kind: "share",
                          hours,
                          note: note.trim() || undefined,
                        },
                  )
                }
              >
                {busy
                  ? t("starting")
                  : mode === "check_in"
                    ? t("startCheckIn")
                    : t("startSharing")}
              </Button>
            </div>
          ) : null}
        </section>
      )}

      {overview.emergencyNumbers.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <h2 className="font-semibold">{t("emergencyServices")}</h2>
          <div className="flex flex-wrap gap-2">
            {overview.emergencyNumbers.map((n) => (
              <Button
                key={`${n.service}-${n.number}`}
                asChild
                size="sm"
                variant={n.service === "all" ? "destructive" : "outline"}
              >
                <a href={telUrl(n.number)}>
                  {t("emergencyService", {
                    service: n.service,
                    number: n.number,
                  })}
                </a>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("notEmergencyServices")}
          </p>
        </section>
      ) : null}

      <ContactsSection overview={overview} onChanged={refresh} />

      <section className="flex flex-col gap-2 rounded-2xl border bg-card p-4 text-sm">
        <h2 className="font-semibold">{t("howItWorksTitle")}</h2>
        <p>{t("howItWorksSos")}</p>
        <p>{t("howItWorksCheckIn")}</p>
        <p>{t("howItWorksPrivacy")}</p>
        <p className="text-muted-foreground">{t("appIsBetter")}</p>
      </section>
    </div>
  );
}
