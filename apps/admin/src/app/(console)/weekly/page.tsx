import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadWeeklyEditions } from "@/lib/data";
import { WEEKLY_PRODUCT_NAME } from "@abonten/core/weekly/copy";
import { formatWeekRange } from "@abonten/core/weekly/week";
import type { WeeklyEditionStatus } from "@abonten/types/weeklyType";
import Link from "next/link";
import { WeeklyTabs } from "./WeeklyTabs";
import {
  editionStatusLabel,
  editionStatusTone,
  formatAccraDateTime,
} from "./format";

// Admin › Abonten Weekly: every edition, newest week first. Editors open an
// edition to curate it; publishing happens inside the edition.

const STATUSES: WeeklyEditionStatus[] = [
  "draft",
  "scheduled",
  "published",
  "archived",
];

export default async function WeeklyEditionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; scope?: string }>;
}) {
  await requirePermissionPage("weekly.view");
  const { status: statusParam, scope } = await searchParams;
  const status = STATUSES.includes(statusParam as WeeklyEditionStatus)
    ? (statusParam as WeeklyEditionStatus)
    : undefined;
  const { ctx, editions, scopes, settings } = await loadWeeklyEditions({
    status,
    scopeId: scope || undefined,
  });
  const canEdit = ctx.permissions.includes("weekly.edit");
  const programme = settings.data?.settings;

  const filterHref = (next: { status?: string; scope?: string }) => {
    const params = new URLSearchParams();
    const s = next.status ?? status;
    const sc = next.scope ?? scope;
    if (s) params.set("status", s);
    if (sc) params.set("scope", sc);
    const qs = params.toString();
    return qs ? `/weekly?${qs}` : "/weekly";
  };

  return (
    <div>
      <PageHeader
        title={WEEKLY_PRODUCT_NAME}
        description="A weekly edition of events and places worth discovering, per area."
        actions={
          canEdit ? (
            <Link
              href="/weekly/new"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              New edition
            </Link>
          ) : null
        }
      />
      <WeeklyTabs active="/weekly" />

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3 text-sm">
        <span className="font-medium">Status</span>
        {settings.data?.killSwitch ? (
          <Badge tone="danger">Killed on the web deployment (env)</Badge>
        ) : programme ? (
          <Badge tone={programme.enabled ? "success" : "neutral"}>
            {programme.enabled ? `On · ${programme.audience}` : "Off"}
          </Badge>
        ) : null}
        {programme ? (
          <Badge tone={programme.teaserEnabled ? "info" : "neutral"}>
            Explore teaser {programme.teaserEnabled ? "on" : "off"}
          </Badge>
        ) : null}
        <span className="text-muted-foreground">
          Published editions are only visible to the audience in Settings.
        </span>
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
        <Link
          href={filterHref({ status: "" })}
          className={`rounded px-2.5 py-1 ${!status ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
        >
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={filterHref({ status: s })}
            className={`rounded px-2.5 py-1 ${status === s ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
          >
            {editionStatusLabel(s)}
          </Link>
        ))}
        {scopes.data && scopes.data.length > 1 ? (
          <span className="ml-3 flex flex-wrap gap-1">
            <Link
              href={filterHref({ scope: "" })}
              className={`rounded px-2.5 py-1 ${!scope ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
            >
              All areas
            </Link>
            {scopes.data.map((sc) => (
              <Link
                key={sc.id}
                href={filterHref({ scope: sc.id })}
                className={`rounded px-2.5 py-1 ${scope === sc.id ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
              >
                {sc.name}
              </Link>
            ))}
          </span>
        ) : null}
      </div>

      {editions.status !== 200 ? (
        <EmptyState>{editions.message ?? "Couldn't load editions."}</EmptyState>
      ) : (editions.data ?? []).length === 0 ? (
        <EmptyState>
          No editions yet.{" "}
          {canEdit ? (
            <Link href="/weekly/new" className="text-primary underline">
              Create the first one
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Week</Th>
              <Th>Area</Th>
              <Th>Title</Th>
              <Th>Status</Th>
              <Th className="text-right">Sections</Th>
              <Th className="text-right">Listings</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {(editions.data ?? []).map((e) => (
              <tr key={e.id} className="hover:bg-muted/40">
                <Td className="whitespace-nowrap">
                  <Link
                    href={`/weekly/${e.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {formatWeekRange(e.weekStart)}
                  </Link>
                </Td>
                <Td>{e.scopeName}</Td>
                <Td>{e.title}</Td>
                <Td>
                  <Badge tone={editionStatusTone(e.status)}>
                    {editionStatusLabel(e.status)}
                  </Badge>
                  {e.status === "scheduled" ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatAccraDateTime(e.scheduledFor)}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-right tabular-nums">{e.sectionCount}</Td>
                <Td className="text-right tabular-nums">{e.itemCount}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(e.updatedAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
