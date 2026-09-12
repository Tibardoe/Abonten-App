import {
  Badge,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { loadVerificationCases, loadVerificationOverview } from "@/lib/data";
import { VERIFICATION_STATUS_TONE } from "@abonten/core/verification/copy";
import type {
  VerificationStatus,
  VerificationSubjectType,
} from "@abonten/types/verificationType";
import Link from "next/link";

// Trust & Verification review queue (PROJECT.md §30). Same shape as the
// Claims list: status tabs and a subject filter as plain links over
// searchParams, keyset "Next page" at the bottom.

const TABS: { key: VerificationStatus | "all"; label: string }[] = [
  { key: "pending_review", label: "Pending" },
  { key: "needs_info", label: "Needs info" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "revoked", label: "Revoked" },
  { key: "withdrawn", label: "Withdrawn" },
  { key: "all", label: "All" },
];

const SUBJECTS: { key: VerificationSubjectType | "all"; label: string }[] = [
  { key: "all", label: "All subjects" },
  { key: "place", label: "Places" },
  { key: "organizer", label: "Organizers" },
];

export default async function VerificationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const status = (sp.status ?? "pending_review") as VerificationStatus | "all";
  const subjectType = (sp.subject ?? "all") as VerificationSubjectType | "all";

  const [res, overview] = await Promise.all([
    loadVerificationCases({
      status,
      subjectType,
      cursor: sp.cursor ?? null,
    }),
    loadVerificationOverview(),
  ]);

  const counts = overview.status === 200 ? overview.data : null;
  const qs = (next: Record<string, string>) =>
    `/verification?${new URLSearchParams({
      status,
      subject: subjectType,
      ...next,
    }).toString()}`;

  return (
    <div>
      <PageHeader
        title="Verification"
        description="Places and organizers asking Abonten to review their documents. Approving shows a Verified badge — it does not vouch for the business itself."
      />

      {counts ? (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Places pending"
            value={counts.pendingPlaces}
            tone={counts.pendingPlaces > 0 ? "warning" : undefined}
          />
          <Stat
            label="Organizers pending"
            value={counts.pendingOrganizers}
            tone={counts.pendingOrganizers > 0 ? "warning" : undefined}
          />
          <Stat label="Awaiting applicant" value={counts.needsInfo} />
          <Stat label="Verified places" value={counts.approvedPlaces} />
          <Stat label="Verified organizers" value={counts.approvedOrganizers} />
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs({ status: t.key })}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              status === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {SUBJECTS.map((s) => (
          <Link
            key={s.key}
            href={qs({ subject: s.key })}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              subjectType === s.key
                ? "bg-muted font-medium"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {res.status !== 200 ? (
        <EmptyState>
          {res.message ?? "Couldn't load verification requests."}
        </EmptyState>
      ) : res.data.length === 0 ? (
        <EmptyState>Nothing in this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Subject</Th>
              <Th>Type</Th>
              <Th>Requested by</Th>
              <Th>Documents</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
            </tr>
          </thead>
          <tbody>
            {res.data.map((c) => (
              <tr key={c.id} className="hover:bg-muted/40">
                <Td>
                  <Link
                    href={`/verification/${c.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.subjectName ?? c.subjectId.slice(0, 8)}
                  </Link>
                  {c.subjectSlug ? (
                    <div className="text-xs text-muted-foreground">
                      /{c.subjectSlug}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={c.subjectType === "place" ? "info" : "neutral"}>
                    {c.subjectType}
                  </Badge>
                  {c.organizerType ? (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {c.organizerType}
                    </div>
                  ) : null}
                </Td>
                <Td>{c.requesterName ?? c.requesterId.slice(0, 8)}</Td>
                <Td className="tabular-nums">{c.evidenceCount}</Td>
                <Td>
                  <Badge tone={VERIFICATION_STATUS_TONE[c.status]}>
                    {c.status.replace("_", " ")}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {c.submittedAt ? timeAgo(c.submittedAt) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {res.hasNextPage && res.nextCursor ? (
        <div className="mt-3">
          <Link
            href={qs({ cursor: res.nextCursor })}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
