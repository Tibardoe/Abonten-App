"use client";

import { cancelIdentityVerification } from "@/actions/identity/cancelIdentityVerification";
import { getIdentityOverview } from "@/actions/identity/getIdentityOverview";
import { startIdentityVerification } from "@/actions/identity/startIdentityVerification";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SupportingText } from "@/components/ui/typography";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import { formatDate } from "@abonten/core/i18n/format";
import type {
  IdentityOutcomeCode,
  IdentityOverview,
} from "@abonten/types/identityType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Clock, ShieldAlert, ShieldCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

// Identity verification on the website (docs/architecture/identity-
// verification.md). The person agrees, picks a document and is sent to the
// identity provider's secure page; Abonten never sees the images. Coming
// back (?checked=<id>), the page waits for the provider's verdict.

const KEY = ["identity-overview"];
type Envelope = { status: number; message?: string; data?: IdentityOverview };

function Panel({
  tone,
  icon,
  title,
  children,
}: {
  tone: "ok" | "wait" | "warn" | "plain";
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  const border =
    tone === "ok"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "wait"
          ? "border-sky-500/40 bg-sky-500/5"
          : "border-border";
  return (
    <section className={`rounded-2xl border p-5 ${border}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}

export default function IdentitySection() {
  const t = useTranslations("identity");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const params = useSearchParams();
  const returned = params.get("checked");
  const consentId = useId();
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [waitingSince] = useState(() => Date.now());

  const query = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Envelope> =>
      answerOrThrow(await getIdentityOverview()),
  });
  const overview = query.data?.data;

  // Back from the provider: ask again every few seconds for two minutes,
  // while the verdict is on its way.
  const waiting =
    !!returned &&
    (overview?.state === "in_progress" || overview?.state === "not_started");
  useEffect(() => {
    if (!waiting) return;
    if (Date.now() - waitingSince > 120_000) return;
    const timer = setTimeout(() => void query.refetch(), 5_000);
    return () => clearTimeout(timer);
  }, [waiting, waitingSince, query]);

  const start = useMutation({
    mutationFn: async () =>
      startIdentityVerification({
        documentCountry: overview?.documents[0]?.country ?? "",
        documentType: documentType ?? "",
        consent: true,
        locale,
      }),
    onSuccess: (res) => {
      if ((res.status === 200 || res.status === 201) && res.data?.url) {
        window.location.assign(res.data.url);
        return;
      }
      toast.error(res.message ?? t("couldNotStart"));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: () => toast.error(t("networkError")),
  });

  const cancel = async (verificationId: string) => {
    const ok = await confirm({
      title: t("cancelTitle"),
      message: t("cancelBody"),
      confirmLabel: t("cancelConfirm"),
      cancelLabel: t("keepGoing"),
    });
    if (!ok) return;
    const res = await cancelIdentityVerification({ verificationId }).catch(
      actionUnreachable,
    );
    if (res.status === 200) toast.success(t("cancelled"));
    else toast.error(res.message ?? t("couldNotSave"));
    void qc.invalidateQueries({ queryKey: KEY });
  };

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!overview) {
    return (
      <SupportingText>
        {query.isError ? t("networkError") : (query.data?.message ?? "")}
      </SupportingText>
    );
  }
  if (!overview.program.enabled) {
    return <SupportingText>{t("notAvailableYet")}</SupportingText>;
  }

  const outcome = (code: IdentityOutcomeCode | null) =>
    code
      ? t("outcome", { code, age: overview.program.minimumAge })
      : t("outcome", { code: "other", age: overview.program.minimumAge });

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

  return (
    <div className="flex flex-col gap-6">
      <SupportingText>{t("intro")}</SupportingText>

      {overview.program.requiredFor.length > 0 &&
      overview.state !== "verified" ? (
        <ul className="list-disc space-y-1 rounded-xl border p-4 pl-8 text-sm">
          {overview.program.requiredFor.map((purpose) => (
            <li key={purpose}>{t("requiredFor", { purpose })}</li>
          ))}
        </ul>
      ) : null}

      {overview.state === "verified" ? (
        <Panel
          tone="ok"
          icon={<BadgeCheck className="h-6 w-6 text-emerald-600" />}
          title={t("verifiedTitle")}
        >
          {overview.verifiedName ? (
            <p className="text-sm">
              {t("verifiedAs", { name: overview.verifiedName })}
            </p>
          ) : null}
          {overview.validUntil ? (
            <p className="text-sm text-muted-foreground">
              {t("validUntil", {
                date: formatDate(overview.validUntil, locale, {
                  dateStyle: "long",
                }),
              })}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">{t("verifiedNote")}</p>
        </Panel>
      ) : null}

      {overview.state === "in_progress" && overview.current ? (
        <Panel
          tone="wait"
          icon={<Clock className="h-6 w-6 text-sky-600" />}
          title={
            overview.current.status !== "created"
              ? t("checkingTitle")
              : returned
                ? t("returnedTitle")
                : t("unfinishedTitle")
          }
        >
          <p className="text-sm">
            {overview.current.status !== "created"
              ? t("checkingBody")
              : returned
                ? t("returnedBody")
                : t("unfinishedBody")}
          </p>
          <div className="flex flex-wrap gap-2">
            {overview.resumeUrl && overview.current.status === "created" ? (
              <Button asChild>
                <a href={overview.resumeUrl}>{t("continueCheck")}</a>
              </Button>
            ) : null}
            {overview.current.status === "created" ||
            overview.current.status === "submitted" ? (
              <Button
                variant="outline"
                onClick={() =>
                  overview.current ? void cancel(overview.current.id) : null
                }
              >
                {t("cancelCheck")}
              </Button>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {overview.state === "in_review" ? (
        <Panel
          tone="wait"
          icon={<Clock className="h-6 w-6 text-sky-600" />}
          title={t("reviewTitle")}
        >
          <p className="text-sm">{t("reviewBody")}</p>
        </Panel>
      ) : null}

      {overview.state === "rejected" || overview.state === "failed" ? (
        <Panel
          tone="warn"
          icon={<ShieldAlert className="h-6 w-6 text-amber-600" />}
          title={
            overview.state === "rejected"
              ? t("rejectedTitle")
              : t("failedTitle")
          }
        >
          <p className="text-sm">
            {outcome(overview.current?.outcome ?? null)}
          </p>
        </Panel>
      ) : null}

      {overview.state === "expired" ? (
        <Panel
          tone="warn"
          icon={<ShieldAlert className="h-6 w-6 text-amber-600" />}
          title={t("expiredTitle")}
        >
          <p className="text-sm">{t("expiredBody")}</p>
        </Panel>
      ) : null}

      {showForm ? (
        <section className="flex flex-col gap-5 rounded-2xl border p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-semibold">
              {renewSoon ? t("renewTitle") : t("startTitle")}
            </h2>
          </div>

          {!overview.providerReady || options.length === 0 ? (
            <SupportingText>{t("notReady")}</SupportingText>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">
                  {t("chooseDocument")}
                </legend>
                {options.map((o) => (
                  <label
                    key={o.type}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${
                      documentType === o.type
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="identity-document"
                      value={o.type}
                      checked={documentType === o.type}
                      onChange={() => setDocumentType(o.type)}
                    />
                    <span>{t("documentName", { type: o.type })}</span>
                  </label>
                ))}
              </fieldset>

              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("step1")}</li>
                <li>{t("step2")}</li>
                <li>{t("step3")}</li>
              </ol>

              <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">
                <p>{t("whatWeKeep")}</p>
                <p className="mt-2">
                  {t("whoSees")}{" "}
                  <Link className="underline" href="/legal/privacy">
                    {t("privacyLink")}
                  </Link>
                </p>
              </div>

              <div className="flex items-start gap-3 text-sm">
                <input
                  id={consentId}
                  type="checkbox"
                  className="mt-1"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <label htmlFor={consentId}>{t("consent")}</label>
              </div>

              {overview.attemptsLeftToday === 0 ? (
                <SupportingText>{t("noAttemptsLeft")}</SupportingText>
              ) : null}

              <div>
                <Button
                  disabled={
                    !canStart || !consent || !documentType || start.isPending
                  }
                  onClick={() => start.mutate()}
                >
                  {start.isPending ? t("starting") : t("startCheck")}
                </Button>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
