import {
  Badge,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadContent } from "@/lib/data";
import type { ModeratableTargetType } from "@abonten/types/adminTypes";
import Link from "next/link";
import { ContentActions } from "./ContentActions";

const TYPES: { key: ModeratableTargetType; label: string }[] = [
  { key: "event", label: "Events" },
  { key: "place", label: "Places" },
  { key: "event_review", label: "Event reviews" },
  { key: "place_review", label: "Place reviews" },
  { key: "user_review", label: "User reviews" },
  { key: "highlight", label: "Highlights" },
];

const STATES: { key: string; label: string }[] = [
  { key: "actioned", label: "All moderated" },
  { key: "hidden", label: "Hidden" },
  { key: "removed", label: "Removed" },
  { key: "restricted", label: "Restricted" },
  { key: "any", label: "Everything" },
];

function stateTone(s: string | null) {
  return s === "removed"
    ? "danger"
    : s === "hidden"
      ? "warning"
      : s === "restricted"
        ? "info"
        : "neutral";
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const ctx = await requireAdmin();
  const type = (
    TYPES.some((t) => t.key === sp.type) ? sp.type : "event"
  ) as ModeratableTargetType;
  const state = STATES.some((s) => s.key === sp.state)
    ? (sp.state as string)
    : "actioned";
  const search = sp.q ?? "";

  const { list, counts } = await loadContent({
    targetType: type,
    // biome-ignore lint/suspicious/noExplicitAny: state is one of the ContentStateFilter literals, validated above
    state: state as any,
    search,
    cursor: sp.cursor ?? null,
  });

  const c = counts.status === 200 ? counts.data : null;

  return (
    <div>
      <PageHeader
        title="Content moderation"
        description="Everything staff have hidden, removed or restricted — plus a browse of live content. Actions here are the same ones the report workspace uses."
      />

      <div className="mb-3 flex flex-wrap gap-1">
        {TYPES.map((t) => (
          <Link
            key={t.key}
            href={`/content?type=${t.key}&state=${state}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              type === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {STATES.map((s) => (
          <Link
            key={s.key}
            href={`/content?type=${type}&state=${s.key}`}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              state === s.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {s.label}
          </Link>
        ))}
        {c ? (
          <span className="ml-2 text-xs text-muted-foreground">
            {c.hidden} hidden · {c.removed} removed · {c.restricted} restricted
          </span>
        ) : null}
      </div>

      {list.status !== 200 ? (
        <EmptyState>{list.message ?? "Couldn't load content."}</EmptyState>
      ) : list.data.length === 0 ? (
        <EmptyState>Nothing matches this view.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Owner</Th>
              <Th>State</Th>
              <Th>Reports</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.data.map((item) => (
              <tr key={item.id} className="hover:bg-muted/40">
                <Td className="max-w-[320px]">
                  <span className="line-clamp-2">{item.label}</span>
                  <div className="text-xs text-muted-foreground">
                    {item.id.slice(0, 8)}…
                    {item.status ? ` · ${item.status}` : ""}
                  </div>
                </Td>
                <Td>
                  {item.ownerId ? (
                    <Link
                      href={`/organizers/${item.ownerId}`}
                      className="text-primary hover:underline"
                    >
                      {item.ownerName ?? `${item.ownerId.slice(0, 8)}…`}
                    </Link>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td>
                  {item.moderationState ? (
                    <Badge tone={stateTone(item.moderationState)}>
                      {item.moderationState}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">live</span>
                  )}
                </Td>
                <Td className="tabular-nums">{item.reportCount}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">
                  {timeAgo(item.createdAt)}
                </Td>
                <Td>
                  <ContentActions
                    targetType={item.targetType}
                    targetId={item.id}
                    state={item.moderationState}
                    permissions={ctx.permissions}
                  />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {list.hasNextPage && list.nextCursor ? (
        <div className="mt-3">
          <Link
            href={`/content?type=${type}&state=${state}&cursor=${encodeURIComponent(list.nextCursor)}`}
            className="text-sm text-primary hover:underline"
          >
            Next page →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
