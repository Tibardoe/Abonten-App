import StatusChip from "@/fieldOps/atoms/StatusChip";
import type { FieldOpsOnboardingDetail } from "@abonten/types/fieldOps";
import Link from "next/link";

/** Read-only detail of one onboarding, for the member and the team lead. */
export default function OnboardingDetailView({
  detail,
  viewer,
}: {
  detail: FieldOpsOnboardingDetail;
  viewer: "member" | "lead";
}) {
  const o = detail.onboarding;
  const mapsHref = detail.place?.location
    ? `https://www.google.com/maps/search/?api=1&query=${detail.place.location.lat},${detail.place.location.lng}`
    : null;
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{o.businessName ?? "(no name yet)"}</p>
            <p className="text-sm text-muted-foreground">
              {viewer === "lead" && o.memberName ? `${o.memberName} · ` : ""}
              {o.territoryName ?? "—"} ·{" "}
              {o.mode === "offline" ? "in person" : "online"}
              {o.submittedAt
                ? ` · submitted ${new Date(o.submittedAt).toLocaleString()}`
                : ""}
              {o.resubmissionCount > 0
                ? ` · resubmitted ×${o.resubmissionCount}`
                : ""}
            </p>
          </div>
          <StatusChip status={o.status} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-1 text-sm">
          <dt className="text-muted-foreground">Owner</dt>
          <dd className="col-span-2">
            {o.ownerFullName ?? "—"}{" "}
            {o.ownerPhoneMasked ? `· ${o.ownerPhoneMasked}` : ""}{" "}
            {o.ownerVerified ? "· verified" : "· not verified"}
          </dd>
          <dt className="text-muted-foreground">Listing</dt>
          <dd className="col-span-2">
            {detail.place ? (
              <>
                <Link
                  href={`/places/${detail.place.slug}`}
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  {detail.place.name}
                </Link>{" "}
                · {detail.place.status} · {detail.place.photoCount} photo
                {detail.place.photoCount === 1 ? "" : "s"}
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
                      map
                    </a>
                  </>
                ) : null}
              </>
            ) : (
              "not created yet"
            )}
          </dd>
          {o.submissionDistanceM !== null ? (
            <>
              <dt className="text-muted-foreground">Position</dt>
              <dd className="col-span-2">
                {o.submissionDistanceM} m from the pin
                {o.submissionAccuracyM !== null
                  ? ` (±${o.submissionAccuracyM} m)`
                  : ""}
                {o.insideTerritory === false
                  ? " · pin outside the territory"
                  : ""}
              </dd>
            </>
          ) : null}
          {o.reviewDecision ? (
            <>
              <dt className="text-muted-foreground">Review</dt>
              <dd className="col-span-2">
                {o.reviewDecision.replace("_", " ")}
                {o.reviewNote ? ` — ${o.reviewNote}` : ""}
              </dd>
            </>
          ) : null}
          {o.holdingUntil ? (
            <>
              <dt className="text-muted-foreground">Holding until</dt>
              <dd className="col-span-2">
                {new Date(o.holdingUntil).toLocaleDateString()}
              </dd>
            </>
          ) : null}
          {detail.rule ? (
            <>
              <dt className="text-muted-foreground">Pays</dt>
              <dd className="col-span-2">
                {(detail.rule.amountMinor / 100).toFixed(2)}{" "}
                {detail.rule.currency} after {detail.rule.holdingDays} days
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      {detail.place ? (
        <section className="rounded-xl border p-4 text-sm">
          <p className="font-medium">Listing details</p>
          <p className="mt-1 text-muted-foreground">
            {detail.place.categoryName ?? "no category"} ·{" "}
            {detail.place.address ?? "no address"}
          </p>
          <p className="mt-2 whitespace-pre-wrap">{detail.place.description}</p>
        </section>
      ) : null}

      <section className="rounded-xl border p-4">
        <p className="text-sm font-medium">Checklist</p>
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
          <p className="font-medium">Similar listings found at submission</p>
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
                  · {m.distanceM} m{m.phoneMatch ? " · same phone" : ""}
                  {m.strong ? " · likely match" : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            {o.duplicateAcknowledged
              ? "The member confirmed it's a different business."
              : "Not acknowledged."}
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border p-4">
        <p className="text-sm font-medium">Evidence</p>
        {detail.evidence.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">None.</p>
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
        <p className="text-sm font-medium">History</p>
        <ol className="mt-2 space-y-1 text-xs text-muted-foreground">
          {detail.timeline.map((e) => (
            <li key={e.id}>
              {new Date(e.createdAt).toLocaleString()} ·{" "}
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
