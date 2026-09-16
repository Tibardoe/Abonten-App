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
import { loadContentPosts } from "@/lib/data";
import type { ContentKind } from "@abonten/types/contentType";
import Link from "next/link";
import { ContentActions } from "../../content/ContentActions";
import { SpotlightTabs } from "../SpotlightTabs";

const KINDS: { key: ContentKind; label: string }[] = [
  { key: "spotlight", label: "Spotlights" },
  { key: "story", label: "Stories" },
];

const STATES = [
  { key: "live", label: "Live" },
  { key: "reported", label: "Reported" },
  { key: "hidden", label: "Hidden" },
  { key: "removed", label: "Removed" },
  { key: "restricted", label: "Restricted" },
  { key: "expired", label: "Ended Stories" },
  { key: "any", label: "Everything" },
] as const;

type StateKey = (typeof STATES)[number]["key"];

function stateTone(
  moderation: string,
): "neutral" | "success" | "warning" | "danger" {
  if (moderation === "removed" || moderation === "hidden") return "danger";
  if (moderation === "restricted") return "warning";
  return "success";
}

export default async function SpotlightPostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    state?: string;
    q?: string;
    cursor?: string;
  }>;
}) {
  await requirePermissionPage("spotlight.view");
  const sp = await searchParams;
  const kind: ContentKind = sp.kind === "story" ? "story" : "spotlight";
  const state: StateKey = STATES.some((s) => s.key === sp.state)
    ? (sp.state as StateKey)
    : "live";
  const search = sp.q?.trim() ?? "";

  const { ctx, list } = await loadContentPosts({
    kind,
    state,
    search: search || null,
    cursor: sp.cursor ?? null,
  });

  const qs = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { kind, state, q: search || undefined, ...changes };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/spotlight/posts?${params.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Spotlight & Stories"
        description="Browse posts and act on them. Actions are the same ones the report workspace uses, and every one is audited."
      />
      <SpotlightTabs active="/spotlight/posts" />

      <div className="mb-3 flex flex-wrap items-center gap-1">
        {KINDS.map((k) => (
          <Link
            key={k.key}
            href={qs({ kind: k.key, cursor: undefined })}
            className={cn(
              "rounded px-2.5 py-1 text-xs",
              kind === k.key
                ? "bg-primary text-primary-foreground"
                : "border border-border hover:bg-muted",
            )}
          >
            {k.label}
          </Link>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {STATES.map((s) => (
          <Link
            key={s.key}
            href={qs({ state: s.key, cursor: undefined })}
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
        <form
          method="get"
          action="/spotlight/posts"
          className="ml-auto flex gap-1"
        >
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="state" value={state} />
          <label htmlFor="posts-search" className="sr-only">
            Search captions
          </label>
          <input
            id="posts-search"
            name="q"
            defaultValue={search}
            placeholder="Search captions"
            className="h-8 rounded border border-border bg-background px-2 text-xs"
          />
        </form>
      </div>

      {list.status !== 200 || !list.data ? (
        <EmptyState>{list.message ?? "Couldn't load posts."}</EmptyState>
      ) : list.data.rows.length === 0 ? (
        <EmptyState>Nothing matches this view.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Post</Th>
                <Th>Author</Th>
                <Th>State</Th>
                <Th>Reports</Th>
                <Th>Engagement</Th>
                <Th>Published</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.data.rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <Td className="max-w-[320px]">
                    <div className="flex items-start gap-2">
                      {row.thumbnailUrl ? (
                        <img
                          src={row.thumbnailUrl}
                          alt=""
                          className="h-14 w-9 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <Link
                          href={`/spotlight/posts/${row.id}`}
                          className="line-clamp-2 hover:underline"
                        >
                          {row.caption?.trim() || "No caption"}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {row.publisherKind} · {row.id.slice(0, 8)}…
                        </div>
                      </div>
                    </div>
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
                    <Badge tone={stateTone(row.moderationState)}>
                      {row.moderationState}
                    </Badge>
                    {row.status !== "published" ? (
                      <div className="mt-1">
                        <Badge>{row.status}</Badge>
                      </div>
                    ) : null}
                  </Td>
                  <Td className="tabular-nums">
                    {row.reportCount > 0 ? (
                      <Badge tone="warning">{row.reportCount}</Badge>
                    ) : (
                      "0"
                    )}
                  </Td>
                  <Td className="text-xs tabular-nums text-muted-foreground">
                    {row.counts.views.toLocaleString("en-GH")} views ·{" "}
                    {row.counts.likes.toLocaleString("en-GH")} likes ·{" "}
                    {row.counts.comments.toLocaleString("en-GH")} comments
                  </Td>
                  <Td className="text-xs text-muted-foreground">
                    {timeAgo(row.publishedAt ?? row.createdAt)}
                  </Td>
                  <Td>
                    <ContentActions
                      targetType={row.kind}
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
                href={qs({ cursor: list.data.nextCursor })}
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
