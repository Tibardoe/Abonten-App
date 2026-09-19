import { EmptyState, PageHeader } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadSearchVocabulary } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import { DiscoveryTabs } from "../DiscoveryTabs";
import { VocabularyManager } from "./VocabularyManager";

// Admin › Discovery › Vocabulary: the words search widens a query with
// (search_concept), tuned from what people actually searched for.

const RANGES = [7, 30, 90];

export default async function DiscoveryVocabularyPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; term?: string }>;
}) {
  await requirePermissionPage("discovery.view");
  const { days: daysParam } = await searchParams;
  const days = RANGES.includes(Number(daysParam)) ? Number(daysParam) : 30;
  const { ctx, vocabulary } = await loadSearchVocabulary(days);
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title="Search vocabulary"
        description="What a search word also matches. Each word of a query still has to be found, by itself or one of its words, so a term never turns a specific search into a broad one. Every change is audited."
      />
      <DiscoveryTabs active="/discovery/vocabulary" />
      <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-muted-foreground">Searches from the</span>
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/discovery/vocabulary?days=${r}`}
            className={
              r === days
                ? "rounded bg-primary px-2 py-1 text-primary-foreground"
                : "rounded border border-border px-2 py-1 hover:bg-muted"
            }
          >
            last {r} days
          </Link>
        ))}
      </div>
      {vocabulary.status !== 200 || !vocabulary.data ? (
        <EmptyState>
          {vocabulary.message ?? "Couldn't load the vocabulary."}
        </EmptyState>
      ) : (
        <VocabularyManager
          vocabulary={vocabulary.data}
          canConfigure={ctx.permissions.includes("discovery.configure")}
          stepUpFresh={stepUpFresh}
        />
      )}
    </div>
  );
}
