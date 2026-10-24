import { useSession } from "@/auth/SessionProvider";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  identityOverviewKey,
  useIdentityOverview,
} from "@/features/identity/useIdentity";
import { api } from "@/lib/api";
import { LEGAL_URLS, openExternalLink } from "@/lib/legalLinks";
import { useQueryView } from "@/lib/useQueryView";
import { formatCount, formatDate } from "@abonten/core/i18n/format";
import type { IdentityOutcomeCode } from "@abonten/types/identityType";
import {
  AppText,
  Button,
  Card,
  Icon,
  type IoniconName,
  Refresher,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";

// Identity verification in the app (docs/architecture/identity-
// verification.md), the native echo of the website's Settings › Identity
// verification. The check itself runs on the provider's secure page in the
// system browser; that page hands the person back here
// (abonten://settings/identity), and the screen waits for the verdict.

const RETURN_URL = "abonten://settings/identity";
const POLL_FOR_MS = 120_000;

function Panel({
  tone,
  icon,
  title,
  children,
}: {
  tone: "ok" | "wait" | "warn";
  icon: IoniconName;
  title: string;
  children?: React.ReactNode;
}) {
  const border =
    tone === "ok"
      ? "border-success"
      : tone === "warn"
        ? "border-warning"
        : "border-primary";
  return (
    <Card className={`gap-2 ${border}`}>
      <View className="flex-row items-start gap-3">
        <Icon
          name={icon}
          size={22}
          tone={
            tone === "ok" ? "success" : tone === "warn" ? "warning" : "primary"
          }
        />
        <View className="flex-1 gap-2">
          <AppText variant="cardTitle">{title}</AppText>
          {children}
        </View>
      </View>
    </Card>
  );
}

export default function IdentityScreen() {
  const t = useTranslations("identity");
  const { locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useSession();
  const params = useLocalSearchParams<{ checked?: string }>();
  const [returnedAt, setReturnedAt] = useState<number | null>(
    params.checked ? Date.now() : null,
  );
  // Back from the provider: ask again every few seconds for two minutes,
  // while the verdict is on its way.
  const query = useIdentityOverview({
    pollWhile: (o) =>
      returnedAt !== null &&
      Date.now() - returnedAt < POLL_FOR_MS &&
      (o?.state === "in_progress" || o?.state === "not_started"),
  });
  const view = useQueryView(query);
  const overview = query.overview;
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const refetchRef = useRef(query.refetch);
  refetchRef.current = query.refetch;

  useFocusEffect(
    useCallback(() => {
      void refetchRef.current();
    }, []),
  );

  useEffect(() => {
    if (params.checked) setReturnedAt(Date.now());
  }, [params.checked]);

  const openProvider = async (url: string) => {
    try {
      // "success" means the provider's page sent the person back (they
      // finished there); a closed browser leaves the check unfinished.
      const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
      if (result.type === "success") setReturnedAt(Date.now());
    } catch {
      // The browser failed: the overview still tells the truth.
    }
    void qc.invalidateQueries({
      queryKey: identityOverviewKey(session?.user.id),
    });
  };

  const start = async () => {
    if (!overview || !documentType) return;
    setStarting(true);
    try {
      const res = await api.identity.start({
        documentCountry: overview.documents[0]?.country ?? "",
        documentType,
        consent: true,
        locale,
      });
      if ((res.status === 200 || res.status === 201) && res.data?.url) {
        await openProvider(res.data.url);
      } else {
        toast.error(res.message ?? t("couldNotStart"));
        void query.refetch();
      }
    } catch {
      toast.error(t("networkError"));
    } finally {
      setStarting(false);
    }
  };

  const cancel = (verificationId: string) => {
    Alert.alert(t("cancelTitle"), t("cancelBody"), [
      { text: t("keepGoing"), style: "cancel" },
      {
        text: t("cancelConfirm"),
        style: "destructive",
        onPress: async () => {
          try {
            const res = await api.identity.cancel(verificationId);
            if (res.status === 200) toast.success(t("cancelled"));
            else toast.error(res.message ?? t("couldNotSave"));
          } catch {
            toast.error(t("networkError"));
          }
          void query.refetch();
        },
      },
    ]);
  };

  const header = (
    <AppHeader
      variant="title"
      title={t("title")}
      backFallback="/(app)/settings"
    />
  );

  if (!overview) {
    return (
      <View className="flex-1 bg-background">
        {header}
        {query.data && query.data.status !== 200 && view.kind === "content" ? (
          <View className="p-4">
            <AppText variant="body">{query.data.message ?? ""}</AppText>
          </View>
        ) : (
          <QueryUnavailable
            view={view}
            subject={t("title")}
            onRetry={() => query.refetch()}
          />
        )}
      </View>
    );
  }

  const age = overview.program.minimumAge;
  const outcome = (code: IdentityOutcomeCode | null) =>
    t("outcome", { code: code ?? "other", age });
  const options = overview.documents[0]?.options ?? [];
  const canStart =
    overview.providerReady &&
    overview.attemptsLeftToday > 0 &&
    options.length > 0;
  const renewSoon =
    overview.state === "verified" &&
    !!overview.validUntil &&
    Date.parse(overview.validUntil) - Date.now() < 60 * 86_400_000;
  const showForm =
    overview.state === "not_started" ||
    overview.state === "rejected" ||
    overview.state === "failed" ||
    overview.state === "expired" ||
    renewSoon;
  const current = overview.current;
  // Back from the provider's page but no verdict yet: the person may have
  // finished there, so say so without claiming the photos arrived.
  const submitted = current !== null && current.status !== "created";
  const progressTitle = submitted
    ? t("checkingTitle")
    : returnedAt !== null
      ? t("returnedTitle")
      : t("unfinishedTitle");
  const progressBody = submitted
    ? t("checkingBody")
    : returnedAt !== null
      ? t("returnedBody")
      : t("unfinishedBody");

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-5 p-4 pb-16"
        refreshControl={<Refresher onRefresh={() => query.refetch()} />}
      >
        {!overview.program.enabled ? (
          <AppText variant="body">{t("notAvailableYet")}</AppText>
        ) : (
          <>
            <AppText variant="body" tone="muted">
              {t("intro")}
            </AppText>

            {overview.program.requiredFor.length > 0 &&
            overview.state !== "verified" ? (
              <Card className="gap-2">
                {overview.program.requiredFor.map((purpose) => (
                  <View key={purpose} className="flex-row gap-2">
                    <Icon name="information-circle-outline" size={18} />
                    <AppText variant="small" className="flex-1">
                      {t("requiredFor", { purpose })}
                    </AppText>
                  </View>
                ))}
              </Card>
            ) : null}

            {overview.state === "verified" ? (
              <Panel
                tone="ok"
                icon="shield-checkmark"
                title={t("verifiedTitle")}
              >
                {overview.verifiedName ? (
                  <AppText variant="small">
                    {t("verifiedAs", { name: overview.verifiedName })}
                  </AppText>
                ) : null}
                {overview.validUntil ? (
                  <AppText variant="small" tone="muted">
                    {t("validUntil", {
                      date: formatDate(overview.validUntil, locale, {
                        dateStyle: "long",
                      }),
                    })}
                  </AppText>
                ) : null}
                <AppText variant="small" tone="muted">
                  {t("verifiedNote")}
                </AppText>
              </Panel>
            ) : null}

            {overview.state === "in_progress" && current ? (
              <Panel tone="wait" icon="time-outline" title={progressTitle}>
                <AppText variant="small">{progressBody}</AppText>
                <View className="flex-row flex-wrap gap-2">
                  {overview.resumeUrl && current.status === "created" ? (
                    <Button
                      title={t("continueCheck")}
                      size="sm"
                      onPress={() =>
                        overview.resumeUrl
                          ? void openProvider(overview.resumeUrl)
                          : undefined
                      }
                    />
                  ) : null}
                  {current.status === "created" ||
                  current.status === "submitted" ? (
                    <Button
                      title={t("cancelCheck")}
                      size="sm"
                      variant="outline"
                      onPress={() => cancel(current.id)}
                    />
                  ) : null}
                </View>
              </Panel>
            ) : null}

            {overview.state === "in_review" ? (
              <Panel tone="wait" icon="time-outline" title={t("reviewTitle")}>
                <AppText variant="small">{t("reviewBody")}</AppText>
              </Panel>
            ) : null}

            {overview.state === "rejected" || overview.state === "failed" ? (
              <Panel
                tone="warn"
                icon="alert-circle-outline"
                title={
                  overview.state === "rejected"
                    ? t("rejectedTitle")
                    : t("failedTitle")
                }
              >
                <AppText variant="small">
                  {outcome(current?.outcome ?? null)}
                </AppText>
              </Panel>
            ) : null}

            {overview.state === "expired" ? (
              <Panel
                tone="warn"
                icon="alert-circle-outline"
                title={t("expiredTitle")}
              >
                <AppText variant="small">{t("expiredBody")}</AppText>
              </Panel>
            ) : null}

            {showForm ? (
              <Card className="gap-4">
                <View className="flex-row items-center gap-3">
                  <Icon
                    name="shield-checkmark-outline"
                    size={22}
                    tone="primary"
                  />
                  <AppText variant="cardTitle">
                    {renewSoon ? t("renewTitle") : t("startTitle")}
                  </AppText>
                </View>

                {!overview.providerReady || options.length === 0 ? (
                  <AppText variant="small" tone="muted">
                    {t("notReady")}
                  </AppText>
                ) : (
                  <>
                    <View className="gap-2">
                      <AppText variant="bodyStrong">
                        {t("chooseDocument")}
                      </AppText>
                      {options.map((o) => (
                        <Pressable
                          key={o.type}
                          onPress={() => setDocumentType(o.type)}
                          accessibilityRole="radio"
                          accessibilityLabel={t("documentName", {
                            type: o.type,
                          })}
                          accessibilityState={{
                            selected: documentType === o.type,
                          }}
                          className={`flex-row items-center gap-3 rounded-xl border p-3 ${
                            documentType === o.type
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card"
                          }`}
                        >
                          <Icon
                            name={
                              documentType === o.type
                                ? "radio-button-on"
                                : "radio-button-off"
                            }
                            size={20}
                            tone={documentType === o.type ? "primary" : "muted"}
                          />
                          <AppText variant="small" className="flex-1">
                            {t("documentName", { type: o.type })}
                          </AppText>
                        </Pressable>
                      ))}
                    </View>

                    <View className="gap-1">
                      {[t("step1"), t("step2"), t("step3")].map((step, i) => (
                        <View key={step} className="flex-row items-start gap-2">
                          <AppText variant="small" tone="muted">
                            {formatCount(i + 1, locale)}.
                          </AppText>
                          <AppText
                            variant="small"
                            tone="muted"
                            className="flex-1"
                          >
                            {step}
                          </AppText>
                        </View>
                      ))}
                    </View>

                    <View className="gap-2 rounded-xl bg-muted p-3">
                      <AppText variant="small" tone="muted">
                        {t("whatWeKeep")}
                      </AppText>
                      <AppText variant="small" tone="muted">
                        {t("whoSees")}
                      </AppText>
                      <Pressable
                        accessibilityRole="link"
                        onPress={() =>
                          void openExternalLink(LEGAL_URLS.privacy)
                        }
                      >
                        <AppText variant="small" className="underline">
                          {t("privacyLink")}
                        </AppText>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => setConsent((v) => !v)}
                      accessibilityRole="checkbox"
                      accessibilityLabel={t("consent")}
                      accessibilityState={{ checked: consent }}
                      className="flex-row items-start gap-3"
                    >
                      <Icon
                        name={consent ? "checkbox" : "square-outline"}
                        size={22}
                        tone={consent ? "primary" : "muted"}
                      />
                      <AppText variant="small" className="flex-1">
                        {t("consent")}
                      </AppText>
                    </Pressable>

                    {overview.attemptsLeftToday === 0 ? (
                      <AppText variant="small" tone="muted">
                        {t("noAttemptsLeft")}
                      </AppText>
                    ) : null}

                    <Button
                      title={t("startCheck")}
                      loading={starting}
                      loadingTitle={t("starting")}
                      disabled={!canStart || !consent || !documentType}
                      onPress={() => void start()}
                    />
                  </>
                )}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
