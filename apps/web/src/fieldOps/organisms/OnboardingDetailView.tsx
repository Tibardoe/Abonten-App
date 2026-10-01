import StatusChip from "@/fieldOps/atoms/StatusChip";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import { formatMinor } from "@abonten/core/content/campaignMoney";
import type { FieldOpsOnboardingDetail } from "@abonten/types/fieldOps";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import Link from "next/link";

/** Read-only detail of one onboarding, for the member and the team lead. */
export default function OnboardingDetailView({
  detail,
  viewer,
}: {
  detail: FieldOpsOnboardingDetail;
  viewer: "member" | "lead";
}) {
  const locale = useLocale();
  const t = useTranslations("fieldOps");
  const tc = useTranslations("core");
  const format = useFormatter();

  const o = detail.onboarding;
  const mapsHref = detail.place?.location
    ? `https://www.google.com/maps/search/?api=1&query=${detail.place.location.lat},${detail.place.location.lng}`
    : null;
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{o.businessName ?? t("noNameYet")}</p>
            <p className="text-sm text-muted-foreground">
              {[
                viewer === "lead" && o.memberName ? o.memberName : null,
                o.territoryName ?? "—",
                o.mode === "offline" ? t("inPerson") : t("online"),
                o.submittedAt
                  ? t("submittedOn", {
                      date: format.dateTime(new Date(o.submittedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })
                  : null,
                o.resubmissionCount > 0
                  ? t("resubmittedTimes", { count: o.resubmissionCount })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <StatusChip status={o.status} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-1 text-sm">
          <dt className="text-muted-foreground">{t("owner")}</dt>
          <dd className="col-span-2">
            {[
              o.ownerFullName ?? "—",
              o.ownerPhoneMasked,
              o.ownerVerified ? t("verifiedLabel") : t("notVerifiedLabel"),
            ]
              .filter(Boolean)
              .join(" · ")}
          </dd>
          {o.eventId ? (
            <>
              <dt className="text-muted-foreground">{t("event")}</dt>
              <dd className="col-span-2">
                {o.eventSlug ? (
                  <Link
                    href={`/events/${o.eventSlug}`}
                    target="_blank"
                    className="text-primary hover:underline"
                  >
                    {o.eventTitle ?? t("theEvent2")}
                  </Link>
                ) : (
                  (o.eventTitle ?? t("theEvent2"))
                )}
                {o.eventStartsAt ? (
                  <>
                    {" · "}
                    {new Date(o.eventStartsAt) > new Date()
                      ? t("runs", {
                          date: format.dateTime(new Date(o.eventStartsAt), {
                            dateStyle: "medium",
                          }),
                        })
                      : t("ran", {
                          date: format.dateTime(new Date(o.eventStartsAt), {
                            dateStyle: "medium",
                          }),
                        })}
                  </>
                ) : null}
              </dd>
            </>
          ) : null}
          {o.claimRequestId ? (
            <>
              <dt className="text-muted-foreground">{t("claim")}</dt>
              <dd className="col-span-2">
                {t("filedForTheOwnerStatus", {
                  status:
                    o.claimStatus === "approved"
                      ? t("approved")
                      : o.claimStatus === "rejected"
                        ? t("rejected")
                        : t("waitingForAnAdmin"),
                })}
              </dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">{t("listing")}</dt>
          <dd className="col-span-2">
            {detail.place ? (
              <>
                <Link
                  href={`/places/${detail.place.slug}`}
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  {detail.place.name}
                </Link>
                {t("photoCount", {
                  status: detail.place.status,
                  count: detail.place.photoCount,
                })}
                {mapsHref ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {t("map")}
                    </a>
                  </>
                ) : null}
              </>
            ) : (
              t("notCreatedYet")
            )}
          </dd>
          {o.submissionDistanceM !== null ? (
            <>
              <dt className="text-muted-foreground">{t("position")}</dt>
              <dd className="col-span-2">
                {t("mFromThePin", {
                  submissionDistanceM: o.submissionDistanceM,
                })}
                {o.submissionAccuracyM !== null
                  ? ` (±${o.submissionAccuracyM} m)`
                  : ""}
                {o.insideTerritory === false ? t("pinOutsideTheTerritory") : ""}
              </dd>
            </>
          ) : null}
          {o.reviewDecision ? (
            <>
              <dt className="text-muted-foreground">{t("review")}</dt>
              <dd className="col-span-2">
                {o.reviewDecision.replace("_", " ")}
                {o.reviewNote ? ` — ${o.reviewNote}` : ""}
              </dd>
            </>
          ) : null}
          {o.holdingUntil ? (
            <>
              <dt className="text-muted-foreground">{t("holdingUntil")}</dt>
              <dd className="col-span-2">
                {format.dateTime(new Date(o.holdingUntil), {
                  dateStyle: "medium",
                })}
              </dd>
            </>
          ) : null}
          {detail.rule ? (
            <>
              <dt className="text-muted-foreground">{t("pays")}</dt>
              <dd className="col-span-2">
                {t("afterDays", {
                  formatMinor: formatMinor(
                    detail.rule.amountMinor,
                    detail.rule.currency,
                    locale,
                  ),
                  holdingDays: detail.rule.holdingDays,
                })}
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      {detail.place ? (
        <section className="rounded-xl border p-4 text-sm">
          <p className="font-medium">{t("listingDetails")}</p>
          <p className="mt-1 text-muted-foreground">
            {placeCategoryLabel(tc, { name: detail.place.categoryName }) ||
              t("noCategory")}{" "}
            · {detail.place.address ?? t("noAddress")}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{detail.place.description}</p>
        </section>
      ) : null}

      <section className="rounded-xl border p-4">
        <p className="text-sm font-medium">{t("checklist")}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {detail.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2">
              <span
                className={
                  c.ok === true
                    ? "text-emerald-600"
                    : c.ok === false
                      ? c.severity === "hard"
                        ? "text-destructive"
                        : "text-amber-600"
                      : "text-muted-foreground"
                }
              >
                {c.ok === true ? "✓" : c.ok === false ? "✗" : "·"}
              </span>
              <span>
                {c.label}
                {c.detail ? (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    — {c.detail}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {o.similarMatches.length > 0 ? (
        <section className="rounded-xl border p-4 text-sm">
          <p className="font-medium">{t("similarListingsFoundAtSubmission")}</p>
          <ul className="mt-2 space-y-1">
            {o.similarMatches.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/places/${m.slug}`}
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  {m.name}
                </Link>{" "}
                <span className="text-muted-foreground">
                  {t("m", { distanceM: m.distanceM })}
                  {m.phoneMatch ? t("samePhone") : ""}
                  {m.strong ? t("likelyMatch") : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            {o.duplicateAcknowledged
              ? t("theMemberConfirmedItSA")
              : t("notAcknowledged")}
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border p-4">
        <p className="text-sm font-medium">{t("evidence")}</p>
        {detail.evidence.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t("none2")}</p>
        ) : (
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {detail.evidence.map((e) => (
              <li key={e.id} className="text-xs">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noreferrer">
                    <img
                      src={e.url}
                      alt={e.kind}
                      className="aspect-square w-full rounded object-cover"
                    />
                  </a>
                ) : (
                  <div className="aspect-square w-full rounded bg-muted" />
                )}
                <div className="mt-1 capitalize">
                  {e.kind.replace("_", " ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border p-4">
        <p className="text-sm font-medium">{t("history")}</p>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
          {detail.timeline.map((e) => (
            <li key={e.id}>
              {format.dateTime(new Date(e.createdAt), {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              ·{" "}
              {e.fromStatus && e.fromStatus !== e.toStatus
                ? `${e.fromStatus} → ${e.toStatus}`
                : (e.note ?? e.toStatus)}
              {e.fromStatus !== e.toStatus && e.note ? ` — ${e.note}` : ""}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
