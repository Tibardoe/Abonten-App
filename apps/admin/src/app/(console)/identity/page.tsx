import {
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadIdentityList } from "@/lib/data";
import Link from "next/link";
import { IdentityTabs } from "./IdentityTabs";
import {
  PROVIDER_VERDICT,
  documentLabel,
  identityStatusBadge,
} from "./identityStatus";

// Admin › Identity: who has proved who they are, and the checks waiting for
// a person. Names, dates of birth and document details are never listed;
// they are shown one check at a time, behind a reason and a fresh re-auth.

type Params = Record<string, string | string[] | undefined>;

function hrefWith(
  params: Params,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && !(k in changes) && k !== "before")
      next.set(k, v);
  }
  for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v);
  const qs = next.toString();
  return `/identity${qs ? `?${qs}` : ""}`;
}

function FilterLink({
  params,
  value,
  label,
}: {
  params: Params;
  value: string | null;
  label: string;
}) {
  const active =
    (typeof params.status === "string" ? params.status : null) === value;
  return (
    <Link
      href={hrefWith(params, { status: value })}
      aria-current={active ? "page" : undefined}
      className={`rounded border px-2 py-1 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
    >
      {label}
    </Link>
  );
}

export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requirePermissionPage("identity.view");
  const params = await searchParams;
  const { list } = await loadIdentityList(params);
  const rows = list.data?.rows ?? [];
  const counts = list.data?.counts;
  const last = rows.at(-1);

  return (
    <div>
      <PageHeader
        title="Identity"
        description="Government ID and live-selfie checks of the people behind organizers and places. A check the provider was unsure about, or a document already on another account, waits here for a person."
      />
      <IdentityTabs active="/identity" />
      {counts ? (
        <div className="mb-6 grid grid-cols-3 gap-3 md:max-w-xl">
          <Stat
            label="Needs review"
            value={counts.needsReview}
            tone={counts.needsReview > 0 ? "warning" : undefined}
          />
          <Stat label="Verified" value={counts.approved} />
          <Stat label="In progress" value={counts.open} />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterLink params={params} value={null} label="All" />
        <FilterLink params={params} value="needs_review" label="Needs review" />
        <FilterLink params={params} value="approved" label="Verified" />
        <FilterLink params={params} value="rejected" label="Rejected" />
        <FilterLink params={params} value="revoked" label="Revoked" />
        <FilterLink params={params} value="failed" label="Failed" />
        <FilterLink params={params} value="processing" label="Checking" />
      </div>

      {list.status !== 200 || !list.data ? (
        <EmptyState>
          {list.message ?? "Couldn't load identity checks."}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>No identity checks match.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Person</Th>
                <Th>Document</Th>
                <Th>State</Th>
                <Th>Provider said</Th>
                <Th>Same document elsewhere</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      href={`/identity/${r.id}`}
                      className="underline underline-offset-2"
                    >
                      {timeAgo(r.createdAt)}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/users/${r.userId}`}
                      className="underline underline-offset-2"
                    >
                      {r.username ? `@${r.username}` : r.userId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>{documentLabel(r.documentCountry, r.documentType)}</Td>
                  <Td>{identityStatusBadge(r.status)}</Td>
                  <Td>
                    {r.resultStatus ? PROVIDER_VERDICT[r.resultStatus] : "—"}
                    {r.fraudDetected ? (
                      <span className="block text-xs text-destructive">
                        Fraud signal
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {r.matchedAccounts > 0 ? (
                      <span className="text-warning">
                        {r.matchedAccounts} account
                        {r.matchedAccounts === 1 ? "" : "s"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {rows.length >= 50 && last ? (
            <div className="mt-3">
              <Link
                className="text-sm underline underline-offset-2"
                href={hrefWith(params, { before: last.createdAt })}
              >
                Older checks
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
