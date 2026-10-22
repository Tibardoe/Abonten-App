import { useSession } from "@/auth/SessionProvider";
import { PhoneVerificationForm } from "@/components/account/PhoneVerificationForm";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { useHomeDialCode } from "@/features/markets/MarketProvider";
import { ActiveSessionCard } from "@/features/safety/ActiveSessionCard";
import { SosHoldButton } from "@/features/safety/SosHoldButton";
import {
  type StartSessionRequest,
  StartSessionSheet,
} from "@/features/safety/StartSessionSheet";
import {
  callNumber,
  deviceSosText,
  openDeviceSms,
} from "@/features/safety/deviceSms";
import { useSafetyKeepAwake } from "@/features/safety/keepAwake";
import {
  askSafetyLocationPermission,
  quickSafetyFix,
  readSafetyLocationPermission,
} from "@/features/safety/safetyLocation";
import {
  type SafetySnapshot,
  readSafetySnapshot,
} from "@/features/safety/safetyStore";
import {
  useApplySafetySession,
  useSafetyOverview,
  useStartSafety,
} from "@/features/safety/useSafety";
import { api } from "@/lib/api";
import { useIsOnline } from "@/lib/network";
import { useQueryView } from "@/lib/useQueryView";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { formatDateTime } from "@abonten/core/i18n/format";
import { formatPhoneInternational } from "@abonten/core/phone/phone";
import type {
  SafetyContact,
  SafetyEmergencyNumber,
  SafetyOverview,
  SafetySession,
  SafetySessionSummary,
} from "@abonten/types/safetyType";
import {
  AppText,
  Badge,
  Button,
  Card,
  Chip,
  Icon,
  PressableCard,
  Refresher,
  Sheet,
  hapticSuccess,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";

// Abonten Safety: SOS, "check in on me", "share my location", the trusted
// contacts and the local emergency numbers (docs/architecture/safety.md).
// The screen works with no connection too: SOS then opens the phone's own
// Messages app to the contacts saved on this phone.

const SOS_SLOW_AFTER_MS = 6_000;

function EmergencyNumbers({
  numbers,
  onCall,
}: {
  numbers: SafetyEmergencyNumber[];
  onCall: (n: string) => void;
}) {
  const t = useTranslations("safety");
  if (numbers.length === 0) return null;
  return (
    <Card className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon name="call-outline" size={18} tone="destructive" />
        <AppText variant="cardTitle">{t("emergencyServices")}</AppText>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {numbers.map((n) => (
          <Button
            key={`${n.service}-${n.number}`}
            title={t("emergencyService", {
              service: n.service,
              number: n.number,
            })}
            variant={n.service === "all" ? "destructive" : "outline"}
            size="sm"
            leftIcon="call"
            onPress={() => onCall(n.number)}
          />
        ))}
      </View>
      <AppText variant="caption">{t("notEmergencyServices")}</AppText>
    </Card>
  );
}

function ContactStatus({ c }: { c: SafetyContact }) {
  const t = useTranslations("safety");
  if (c.status === "accepted")
    return (
      <Badge
        label={t("contactStatus.accepted")}
        tone="success"
        uppercase={false}
      />
    );
  if (c.status === "declined")
    return (
      <Badge
        label={t("contactStatus.declined")}
        tone="destructive"
        uppercase={false}
      />
    );
  if (!c.canText && !c.email)
    return (
      <Badge
        label={t("contactStatus.phoneOnly")}
        tone="warning"
        uppercase={false}
      />
    );
  return (
    <Badge label={t("contactStatus.pending")} tone="muted" uppercase={false} />
  );
}

function History({
  items,
  timezone,
}: { items: SafetySessionSummary[]; timezone: string }) {
  const t = useTranslations("safety");
  const { locale } = useLocale();
  if (items.length === 0) return null;
  return (
    <View className="gap-2">
      <AppText variant="sectionTitle">{t("history")}</AppText>
      <Card className="gap-2">
        {items.map((s) => (
          <View
            key={s.id}
            className="flex-row items-center justify-between gap-3 py-1"
          >
            <View className="flex-1">
              <AppText variant="bodyStrong">
                {t("historyKind", { kind: s.alertedAt ? "alert" : s.kind })}
              </AppText>
              <AppText variant="meta">
                {t("historyLine", {
                  when: formatDateTime(s.startedAt, locale, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: timezone,
                  }),
                  event: s.eventTitle ?? "",
                  hasEvent: s.eventTitle ? "yes" : "no",
                })}
              </AppText>
            </View>
            <AppText variant="meta">
              {t("historyOutcome", { outcome: s.resolution ?? "ended" })}
            </AppText>
          </View>
        ))}
      </Card>
    </View>
  );
}

export default function SafetyScreen() {
  const t = useTranslations("safety");
  const { locale } = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const online = useIsOnline();
  const homeDialCode = useHomeDialCode();
  const overview = useSafetyOverview();
  const view = useQueryView(overview);
  const apply = useApplySafetySession();
  const startSafety = useStartSafety();

  const data: SafetyOverview | null = overview.data?.data ?? null;
  const [snapshot, setSnapshot] = useState<SafetySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"check_in" | "share" | "phone" | null>(
    null,
  );
  const [eventId, setEventId] = useState<string | null | undefined>(undefined);
  const [locationAllowed, setLocationAllowed] = useState(true);
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [sosSending, setSosSending] = useState(false);
  const [sosSlow, setSosSlow] = useState(false);

  useEffect(() => {
    if (userId) void readSafetySnapshot(userId).then(setSnapshot);
  }, [userId]);

  // An SOS waits up to the server's deadline before the phone's own
  // Messages app opens. Past a few seconds the person is offered it at once.
  useEffect(() => {
    if (!sosSending) {
      setSosSlow(false);
      return;
    }
    const timer = setTimeout(() => setSosSlow(true), SOS_SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [sosSending]);

  useFocusEffect(
    useCallback(() => {
      void readSafetyLocationPermission().then((p) =>
        setLocationAllowed(p === "granted"),
      );
    }, []),
  );

  const active: SafetySession | null = data?.active ?? null;
  useSafetyKeepAwake(active?.status === "alerting");

  const contacts = data?.contacts ?? [];
  const reachableContacts = contacts.filter((c) => c.status !== "declined");
  const phonesToText = (
    data ? reachableContacts : (snapshot?.contacts ?? [])
  ).map((c) => c.phoneE164);
  const emergencyNumbers =
    data?.emergencyNumbers ?? snapshot?.emergencyNumbers ?? [];
  const timezone = data?.timezone ?? "UTC";
  const program = data?.program;
  const chosenEvent = useMemo(() => {
    const choices = data?.eventChoices ?? [];
    if (eventId === null) return null;
    if (eventId) return choices.find((e) => e.id === eventId) ?? null;
    return choices[0] ?? null;
  }, [data?.eventChoices, eventId]);

  const setupNeeded =
    !!data &&
    (data.needsName || !data.phone.verified || reachableContacts.length === 0);

  const textFromPhone = async (phones: string[]) => {
    const fix = await quickSafetyFix();
    await openDeviceSms(phones, deviceSosText(fix));
  };

  const triggerSos = async () => {
    setBusy(true);
    try {
      let permission = await readSafetyLocationPermission();
      if (permission === "unknown" || permission === "denied") {
        permission = await askSafetyLocationPermission();
      }
      setLocationAllowed(permission === "granted");
      setSosSending(true);
      const outcome = await startSafety({
        kind: "sos",
        eventId: chosenEvent?.id ?? null,
      });
      if (outcome.kind === "started") {
        hapticSuccess();
        toast.success(t("sosSent"));
      } else if (outcome.kind === "offline") {
        setOfflineNotice(true);
      }
    } finally {
      setSosSending(false);
      setBusy(false);
    }
  };

  const slowSosCard = sosSlow ? (
    <Card className="gap-2 border-warning">
      <AppText variant="small">{t("sosStillSending")}</AppText>
      <Button
        title={t("textFromPhoneToo")}
        variant="outline"
        size="sm"
        leftIcon="chatbubble-outline"
        onPress={() => void textFromPhone(phonesToText)}
      />
    </Card>
  ) : null;

  const startSession = async (request: StartSessionRequest) => {
    setBusy(true);
    try {
      const permission = await askSafetyLocationPermission();
      setLocationAllowed(permission === "granted");
      const outcome = await startSafety({
        ...request,
        eventId: chosenEvent?.id ?? null,
      });
      if (outcome.kind === "started") {
        setSheet(null);
        toast.success(
          request.kind === "check_in" ? t("checkInStarted") : t("shareStarted"),
        );
      } else if (outcome.kind === "refused") {
        toast.error(outcome.message || t("couldNotStart"));
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setBusy(false);
    }
  };

  const resolve = (resolution: "safe" | "false_alarm" | "ended") => {
    if (!active) return;
    const run = async () => {
      setBusy(true);
      try {
        const res = await api.safety.resolve(active.id, { resolution });
        if (res.status === 200 && res.data) {
          apply(res.data);
          hapticSuccess();
          toast.success(
            resolution === "ended"
              ? t("sharingStopped")
              : resolution === "false_alarm"
                ? t("toldMistake")
                : t("toldSafe"),
          );
        } else {
          toast.error(res.message ?? t("couldNotSave"));
        }
      } catch {
        toast.error(t("networkError"));
      } finally {
        setBusy(false);
      }
    };
    if (active.status !== "alerting") {
      void run();
      return;
    }
    Alert.alert(
      resolution === "false_alarm"
        ? t("confirmMistakeTitle")
        : t("confirmSafeTitle"),
      resolution === "false_alarm"
        ? t("confirmMistakeBody")
        : t("confirmSafeBody"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: resolution === "false_alarm" ? t("itWasAMistake") : t("imSafe"),
          onPress: () => void run(),
        },
      ],
    );
  };

  const update = async (body: {
    note?: string | null;
    extendMinutes?: number;
  }) => {
    if (!active) return false;
    setBusy(true);
    try {
      const res = await api.safety.update(active.id, body);
      if (res.status === 200 && res.data) {
        apply(res.data);
        return true;
      }
      toast.error(res.message ?? t("couldNotSave"));
      return false;
    } catch {
      toast.error(t("networkError"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const tellEventTeam = () => {
    if (!active) return;
    Alert.alert(t("tellEventTeamTitle"), t("tellEventTeamBody"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("tellThem"),
        onPress: async () => {
          setBusy(true);
          try {
            const res = await api.safety.tellEventTeam(active.id);
            if (res.status === 200 && res.data) {
              apply(res.data);
              toast.success(t("eventTeamTold"));
            } else toast.error(res.message ?? t("couldNotSave"));
          } catch {
            toast.error(t("networkError"));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const openLocationSettings = async () => {
    const p = await askSafetyLocationPermission();
    setLocationAllowed(p === "granted");
    if (p === "blocked") Linking.openSettings().catch(() => {});
  };

  // Still loading, with contacts saved on this phone: SOS is there at once
  // (it tries Abonten first and falls back to the phone's Messages app). A
  // slow or stalled connection must never leave a spinner where SOS is.
  if (!data && view.kind === "loading" && snapshot?.contacts.length) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          variant="title"
          title={t("title")}
          backFallback="/(app)/account"
        />
        <ScrollView contentContainerClassName="gap-5 p-4 pb-12">
          {slowSosCard}
          {offlineNotice ? (
            <Card className="gap-2 border-warning">
              <AppText variant="bodyStrong">{t("offlineSentTitle")}</AppText>
              <AppText variant="small">{t("offlineSentBody")}</AppText>
            </Card>
          ) : null}
          <View className="items-center gap-3">
            <SosHoldButton
              onTrigger={() => void triggerSos()}
              disabled={busy}
            />
            <AppText variant="small" className="px-6 text-center">
              {t("sosHoldHint")}
            </AppText>
          </View>
          <EmergencyNumbers numbers={emergencyNumbers} onCall={callNumber} />
        </ScrollView>
      </View>
    );
  }

  // Offline with nothing loaded: SOS from the phone itself, to the contacts
  // saved on this phone.
  if (!data && (view.kind === "offline" || view.kind === "error")) {
    return (
      <View className="flex-1 bg-background">
        <AppHeader
          variant="title"
          title={t("title")}
          backFallback="/(app)/account"
        />
        <ScrollView contentContainerClassName="gap-5 p-4 pb-12">
          {snapshot && snapshot.contacts.length > 0 ? (
            <Card className="items-center gap-4">
              <AppText variant="cardTitle" className="text-center">
                {t("offlineTitle")}
              </AppText>
              <AppText variant="small" className="text-center">
                {t("offlineBody")}
              </AppText>
              <SosHoldButton
                label={t("holdToTextFromPhone")}
                onTrigger={() =>
                  void textFromPhone(snapshot.contacts.map((c) => c.phoneE164))
                }
              />
            </Card>
          ) : (
            <QueryUnavailable
              view={view}
              subject={t("title")}
              onRetry={() => overview.refetch()}
            />
          )}
          <EmergencyNumbers numbers={emergencyNumbers} onCall={callNumber} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title={t("title")}
        backFallback="/(app)/account"
      />
      {!data ? (
        <QueryUnavailable
          view={view}
          subject={t("title")}
          onRetry={() => overview.refetch()}
        />
      ) : (
        <ScrollView
          className="flex-1 bg-background"
          contentContainerClassName="gap-6 p-4 pb-16"
          refreshControl={<Refresher onRefresh={() => overview.refetch()} />}
          keyboardShouldPersistTaps="handled"
        >
          {slowSosCard}
          {offlineNotice ? (
            <Card className="gap-2 border-warning">
              <AppText variant="bodyStrong">{t("offlineSentTitle")}</AppText>
              <AppText variant="small">{t("offlineSentBody")}</AppText>
              <Button
                title={t("textFromPhoneAgain")}
                variant="outline"
                size="sm"
                onPress={() =>
                  void textFromPhone(reachableContacts.map((c) => c.phoneE164))
                }
              />
            </Card>
          ) : null}

          {active ? (
            <ActiveSessionCard
              session={active}
              emergencyNumbers={emergencyNumbers}
              timezone={timezone}
              locationAllowed={locationAllowed}
              busy={busy}
              actions={{
                onSos: () => void triggerSos(),
                onResolve: resolve,
                onExtend: (minutes) => void update({ extendMinutes: minutes }),
                onSaveNote: (note) => update({ note: note.trim() || null }),
                onTellEventTeam: tellEventTeam,
                onTextFromPhone: () =>
                  void textFromPhone(
                    (active.textFromPhone.length > 0
                      ? active.textFromPhone
                      : reachableContacts
                    ).map((c) => c.phoneE164),
                  ),
                onCall: callNumber,
                onTurnOnLocation: () => void openLocationSettings(),
              }}
            />
          ) : setupNeeded ? (
            <Card className="gap-4">
              <View className="gap-1">
                <AppText variant="cardTitle">{t("setupTitle")}</AppText>
                <AppText variant="small">{t("setupBody")}</AppText>
              </View>
              {data.needsName ? (
                <Button
                  title={t("addYourName")}
                  variant="outline"
                  leftIcon="person-outline"
                  onPress={() => router.push("/(app)/settings/edit-profile")}
                />
              ) : null}
              {!data.phone.verified ? (
                <Button
                  title={t("verifyYourPhone")}
                  variant="outline"
                  leftIcon="phone-portrait-outline"
                  onPress={() => setSheet("phone")}
                />
              ) : null}
              {reachableContacts.length === 0 ? (
                <Button
                  title={t("addFirstContact")}
                  leftIcon="person-add-outline"
                  disabled={!data.phone.verified || data.needsName}
                  onPress={() => router.push("/(app)/safety/contact")}
                />
              ) : null}
            </Card>
          ) : program?.enabled ? (
            <View className="gap-4">
              <View className="items-center gap-3">
                <SosHoldButton
                  onTrigger={() => void triggerSos()}
                  disabled={busy}
                />
                <AppText variant="small" className="px-6 text-center">
                  {t("sosExplain", { count: reachableContacts.length })}
                </AppText>
                {!online ? (
                  <AppText variant="caption" className="px-6 text-center">
                    {t("sosOfflineHint")}
                  </AppText>
                ) : null}
              </View>

              {(data.eventChoices ?? []).length > 0 ? (
                <View className="gap-2">
                  <AppText variant="label">{t("whereAreYou")}</AppText>
                  <View className="flex-row flex-wrap gap-2">
                    {data.eventChoices.map((e) => (
                      <Chip
                        key={e.id}
                        label={e.title}
                        selected={chosenEvent?.id === e.id}
                        onPress={() => setEventId(e.id)}
                      />
                    ))}
                    <Chip
                      label={t("notAtAnEvent")}
                      selected={chosenEvent === null}
                      onPress={() => setEventId(null)}
                    />
                  </View>
                </View>
              ) : null}

              {program.checkIn ? (
                <PressableCard
                  className="flex-row items-center gap-3"
                  onPress={() => setSheet("check_in")}
                >
                  <Icon name="time-outline" size={24} tone="primary" />
                  <View className="flex-1">
                    <AppText variant="cardTitle">{t("checkInTitle")}</AppText>
                    <AppText variant="meta">{t("checkInCardBody")}</AppText>
                  </View>
                  <Icon name="chevron-forward" size={16} tone="muted" />
                </PressableCard>
              ) : null}
              {program.share ? (
                <PressableCard
                  className="flex-row items-center gap-3"
                  onPress={() => setSheet("share")}
                >
                  <Icon
                    name="navigate-circle-outline"
                    size={24}
                    tone="primary"
                  />
                  <View className="flex-1">
                    <AppText variant="cardTitle">{t("shareTitle")}</AppText>
                    <AppText variant="meta">{t("shareCardBody")}</AppText>
                  </View>
                  <Icon name="chevron-forward" size={16} tone="muted" />
                </PressableCard>
              ) : null}
            </View>
          ) : (
            <Card>
              <AppText variant="small">{t("notAvailableYet")}</AppText>
            </Card>
          )}

          <EmergencyNumbers numbers={emergencyNumbers} onCall={callNumber} />

          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <AppText variant="sectionTitle">{t("trustedContacts")}</AppText>
              {contacts.length < (program?.maxContacts || 5) &&
              data.phone.verified &&
              !data.needsName ? (
                <Button
                  title={t("add")}
                  size="sm"
                  variant="ghost"
                  leftIcon="add"
                  onPress={() => router.push("/(app)/safety/contact")}
                />
              ) : null}
            </View>
            {contacts.length === 0 ? (
              <AppText variant="small">{t("noContactsYet")}</AppText>
            ) : (
              <View className="gap-2">
                {contacts.map((c) => (
                  <PressableCard
                    key={c.id}
                    className="flex-row items-center gap-3"
                    accessibilityLabel={t("editContact", { name: c.name })}
                    onPress={() =>
                      router.push({
                        pathname: "/(app)/safety/contact",
                        params: { id: c.id },
                      })
                    }
                  >
                    <Icon name="person-circle-outline" size={28} tone="muted" />
                    <View className="flex-1 gap-0.5">
                      <AppText variant="bodyStrong">{c.name}</AppText>
                      <AppText variant="meta">
                        {t("contactLine", {
                          relationship: c.relationship,
                          phone: formatPhoneInternational(c.phoneE164),
                        })}
                      </AppText>
                    </View>
                    <ContactStatus c={c} />
                  </PressableCard>
                ))}
              </View>
            )}
            <AppText variant="caption">
              {t("contactsHint", { max: program?.maxContacts || 5 })}
            </AppText>
          </View>

          <History items={data.recent} timezone={timezone} />

          <Card className="gap-2">
            <AppText variant="bodyStrong">{t("howItWorksTitle")}</AppText>
            <AppText variant="small">{t("howItWorksSos")}</AppText>
            <AppText variant="small">{t("howItWorksCheckIn")}</AppText>
            <AppText variant="small">{t("howItWorksPrivacy")}</AppText>
            {snapshot?.savedAt ? (
              <AppText variant="caption">
                {t("savedOnPhone", {
                  when: getRelativeTime(
                    new Date(snapshot.savedAt),
                    new Date(),
                    locale,
                  ),
                })}
              </AppText>
            ) : null}
          </Card>
        </ScrollView>
      )}

      {data ? (
        <>
          <StartSessionSheet
            mode={sheet === "share" ? "share" : "check_in"}
            open={sheet === "check_in" || sheet === "share"}
            onClose={() => setSheet(null)}
            contacts={contacts}
            event={chosenEvent}
            timezone={timezone}
            graceMinutes={program?.checkInGraceMinutes ?? 5}
            shareMaxHours={program?.shareMaxHours ?? 12}
            busy={busy}
            onStart={(r) => void startSession(r)}
          />
          <Sheet
            open={sheet === "phone"}
            onClose={() => setSheet(null)}
            title={t("verifyYourPhone")}
          >
            <PhoneVerificationForm
              homeDialCode={homeDialCode}
              onDone={(message) => {
                setSheet(null);
                toast.success(message);
                void overview.refetch();
              }}
              onCancel={() => setSheet(null)}
            />
          </Sheet>
        </>
      ) : null}
    </View>
  );
}
