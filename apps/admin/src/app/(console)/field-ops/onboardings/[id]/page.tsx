import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadFieldOpsOnboarding } from "@/lib/data";
import Link from "next/link";
import { onboardingTone } from "../page";
import { DecisionPanel } from "./DecisionPanel";

export default async function FieldOpsOnboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, detail } = await loadFieldOpsOnboarding(id);
  if (detail.status !== 200 || !detail.data) {
    return <EmptyState>{detail.message ?? "Onboarding not found."}</EmptyState>;
  }
  const d = detail.data;
  const o = d.onboarding;
  const canVerify = ctx.permissions.includes("fieldops.verify");

  return (
    <div>
      <PageHeader
        title={`Onboarding · ${o.businessName ?? "(no name yet)"}`}
        description={
          <Link
            href="/field-ops/onboardings"
            className="text-primary hover:underline"
          >
            ← Back to onboardings
          </Link>
        }
        actions={
          <Badge tone={onboardingTone(o.status)}>
            {o.status.replace("_", " ")}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Submission</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Campaign</dt>
              <dd>{d.campaignName}</dd>
              <dt className="text-muted-foreground">Member</dt>
              <dd>
                {o.memberName ?? "—"}{" "}
                <span className="text-xs text-muted-foreground">
                  ({o.mode})
                </span>
              </dd>
              <dt className="text-muted-foreground">Territory</dt>
              <dd>{o.territoryName ?? "—"}</dd>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd>
                {o.submittedAt ? timeAgo(o.submittedAt) : "not yet"}
                {o.resubmissionCount > 0
                  ? ` · resubmitted ×${o.resubmissionCount}`
                  : ""}
              </dd>
              <dt className="text-muted-foreground">Member position</dt>
              <dd>
                {o.submissionDistanceM !== null
                  ? `${o.submissionDistanceM} m from the pin${
                      o.submissionAccuracyM !== null
                        ? ` (±${o.submissionAccuracyM} m)`
                        : ""
                    }`
                  : "not recorded"}
                {o.insideTerritory === false ? " · outside territory" : ""}
              </dd>
              <dt className="text-muted-foreground">Owner</dt>
              <dd>
                {o.ownerFullName ?? "—"} · {o.ownerPhoneMasked ?? "—"} ·{" "}
                {o.ownerVerified ? "verified" : "unverified"}
                {o.ownerIsNewAccount === true ? " · new account" : ""}
                {o.ownerPriorPlaces > 0
                  ? ` · ${o.ownerPriorPlaces} prior place(s)`
                  : ""}
              </dd>
              <dt className="text-muted-foreground">Listing</dt>
              <dd>
                {d.place ? (
                  <Link
                    href={`/places/${d.place.id}`}
                    className="text-primary hover:underline"
                  >
                    {d.place.name} · {d.place.status}
                  </Link>
                ) : (
                  "not created yet"
                )}
              </dd>
              {o.reviewDecision ? (
                <>
                  <dt className="text-muted-foreground">Lead decision</dt>
                  <dd>
                    {o.reviewDecision.replace("_", " ")}
                    {o.reviewNote ? ` — ${o.reviewNote}` : ""}
                  </dd>
                </>
              ) : null}
              {o.holdingUntil ? (
                <>
                  <dt className="text-muted-foreground">Holding until</dt>
                  <dd>{new Date(o.holdingUntil).toLocaleString()}</dd>
                </>
              ) : null}
              {o.flags.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">Flags</dt>
                  <dd>{o.flags.join(", ")}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Eligibility checklist
            </h3>
            <ul className="space-y-1 text-sm">
              {d.checks.map((c) => (
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
            <p className="mt-2 text-xs text-muted-foreground">
              {d.rule
                ? `Live rule: ${(d.rule.amountMinor / 100).toFixed(2)} ${d.rule.currency}, ${d.rule.holdingDays}-day holding.`
                : "No live commission rule for this activity yet."}
            </p>
          </Card>

          {o.similarMatches.length > 0 ? (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Similar listings at submission
              </h3>
              <ul className="space-y-1 text-sm">
                {o.similarMatches.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap justify-between gap-2"
                  >
                    <span>
                      <Link
                        href={`/places/${m.id}`}
                        className="text-primary hover:underline"
                      >
                        {m.name}
                      </Link>{" "}
                      · {m.distanceM} m · similarity {m.similarity}
                      {m.phoneMatch ? " · same phone" : ""}
                    </span>
                    {m.strong ? <Badge tone="warning">strong</Badge> : null}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                {o.duplicateAcknowledged
                  ? "The member confirmed it's a different business."
                  : "No acknowledgement recorded."}
              </p>
            </Card>
          ) : null}

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Evidence</h3>
            {d.evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">None.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {d.evidence.map((e) => (
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
                      {e.uploadedAt ? "" : " (not uploaded)"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {canVerify && o.status === "submitted" ? (
            <DecisionPanel onboardingId={o.id} />
          ) : null}
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
            <ol className="space-y-2 text-xs">
              {d.timeline.map((e) => (
                <li key={e.id}>
                  <div className="font-medium">
                    {e.fromStatus && e.fromStatus !== e.toStatus
                      ? `${e.fromStatus} → ${e.toStatus}`
                      : (e.note ?? e.toStatus)}
                  </div>
                  <div className="text-muted-foreground">
                    {e.actorName ?? e.actorKind} · {timeAgo(e.createdAt)}
                    {e.fromStatus !== e.toStatus && e.note
                      ? ` — ${e.note}`
                      : ""}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
