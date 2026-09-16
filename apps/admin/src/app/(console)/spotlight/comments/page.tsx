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
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadContentComments } from "@/lib/data";
import Link from "next/link";
import { ContentActions } from "../../content/ContentActions";
import { SpotlightTabs } from "../SpotlightTabs";

const STATES = [
  { key: "reported", label: "Reported" },
  { key: "hidden", label: "Hidden" },
  { key: "removed", label: "Removed" },
  { key: "any", label: "Everything" },
] as const;

type StateKey = (typeof STATES)[number]["key"];

export default async function SpotlightCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; cursor?: string }>;
}) {
  await requirePermissionPage("spotlight.view");
  const sp = await searchParams;
  const state: StateKey = STATES.some((s) => s.key === sp.state)
    ? (sp.state as StateKey)
    : "reported";
  const { ctx, list } = await loadContentComments({
    state,
    cursor: sp.cursor ?? null,
  });

  return (
    <div>
      <PageHeader
        title="Spotlight & Stories"
        description="Comments on Spotlights and Stories. Authors can delete comments on their own posts; this is for everything else."
      />
      <SpotlightTabs active="/spotlight/comments" />

      <div className="mb-3 flex flex-wrap gap-1">
        {STATES.map((s) => (
          <Link
            key={s.key}
            href={`/spotlight/comments?state=${s.key}`}
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
      </div>

      {list.status !== 200 || !list.data ? (
        <EmptyState>{list.message ?? "Couldn't load comments."}</EmptyState>
      ) : list.data.rows.length === 0 ? (
        <EmptyState>Nothing matches this view.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Comment</Th>
                <Th>Author</Th>
                <Th>State</Th>
                <Th>Reports</Th>
                <Th>Posted</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <Td className="max-w-[380px]">
                    <p className="line-clamp-3 whitespace-pre-wrap">
                      {row.body}
                    </p>
                    <Link
                      href={`/spotlight/posts/${row.postId}`}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      On post {row.postId.slice(0, 8)}…
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/users/${row.authorId}`}
                      className="hover:underline"
                    >
                      {row.authorName ?? row.authorId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        row.moderationState === "visible" ? "success" : "danger"
                      }
                    >
                      {row.status === "deleted"
                        ? "deleted"
                        : row.moderationState}
                    </Badge>
                  </Td>
                  <Td className="tabular-nums">
                    {row.reportCount > 0 ? (
                      <Badge tone="warning">{row.reportCount}</Badge>
                    ) : (
                      "0"
                    )}
                  </Td>
                  <Td className="text-xs text-muted-foreground">
                    {timeAgo(row.createdAt)}
                  </Td>
                  <Td>
                    <ContentActions
                      targetType="content_comment"
                      targetId={row.id}
                      state={row.moderationState}
                      permissions={ctx.permissions}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {list.data.hasNextPage && list.data.nextCursor ? (
            <div className="mt-3 text-right">
              <Link
                href={`/spotlight/comments?state=${state}&cursor=${encodeURIComponent(list.data.nextCursor)}`}
                className="text-sm text-primary hover:underline"
              >
                Next page →
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
