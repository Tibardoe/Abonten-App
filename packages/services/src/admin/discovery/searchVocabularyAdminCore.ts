import { logger } from "@abonten/core/logger";
import {
  SEARCH_CONCEPT_SCOPES,
  type SearchConcept,
  type SearchConceptPreview,
  type SearchConceptScope,
  type SearchVocabulary,
  type SearchVocabularyGap,
  conceptProblem,
  normalizeConceptWord,
} from "@abonten/core/search/searchVocabulary";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

// Admin › Discovery › Vocabulary: the search_concept rows that widen a
// search word to the words listings use (migration 20260919091000), and the
// loop to tune them from real searches (20260919100000): what people
// searched for and did not find, and a preview of what a term would match
// before it is saved. Reads need discovery.view; changes need
// discovery.configure (step-up is asserted by the admin transport), a
// reason, and — for an edit — the row's last updated_at. Every change is
// audited with the row before and after.

type RequestMeta = Record<string, unknown> | undefined;

const denied = (e: unknown): AdminEnvelope<never> =>
  adminError(e) as AdminEnvelope<never>;

type ConceptRow = {
  id: number;
  term: string;
  expands_to: string[];
  applies_to: string[];
  enabled: boolean;
  note: string | null;
  updated_at: string;
};

function mapConcept(row: ConceptRow): SearchConcept {
  return {
    id: row.id,
    term: row.term,
    expandsTo: row.expands_to,
    appliesTo: row.applies_to.filter((s): s is SearchConceptScope =>
      (SEARCH_CONCEPT_SCOPES as readonly string[]).includes(s),
    ),
    enabled: row.enabled,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

const CONCEPT_COLUMNS =
  "id, term, expands_to, applies_to, enabled, note, updated_at";

export async function getSearchVocabularyCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { days?: number } = {},
): Promise<AdminEnvelope<SearchVocabulary>> {
  try {
    assertPermission(ctx, "discovery.view");
  } catch (e) {
    return denied(e);
  }
  const days = Math.min(Math.max(Math.trunc(input.days ?? 30), 1), 365);
  const [concepts, gaps] = await Promise.all([
    supabase.from("search_concept").select(CONCEPT_COLUMNS).order("term"),
    supabase.rpc("admin_search_vocabulary_gaps", {
      p_days: days,
      p_limit: 100,
    }),
  ]);
  if (concepts.error || gaps.error) {
    logger.error(
      `getSearchVocabularyCore failed: ${concepts.error?.message ?? gaps.error?.message}`,
    );
    return { status: 500, message: "Couldn't load the search vocabulary." };
  }
  return {
    status: 200,
    data: {
      days,
      concepts: (concepts.data as ConceptRow[]).map(mapConcept),
      gaps: (gaps.data as unknown as SearchVocabularyGap[]) ?? [],
    },
  };
}

export async function previewSearchConceptCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { term: string; expandsTo: string[]; appliesTo: string[] },
): Promise<AdminEnvelope<SearchConceptPreview>> {
  try {
    assertPermission(ctx, "discovery.view");
  } catch (e) {
    return denied(e);
  }
  const term = normalizeConceptWord(input.term);
  const expandsTo = input.expandsTo.map(normalizeConceptWord).filter(Boolean);
  const problem = conceptProblem({
    term,
    expandsTo,
    appliesTo: input.appliesTo,
  });
  if (problem) return { status: 400, message: problem };

  const { data, error } = await supabase.rpc("admin_search_concept_preview", {
    p_term: term,
    p_expands_to: expandsTo,
    p_applies_to: input.appliesTo,
  });
  if (error) {
    logger.error(`previewSearchConceptCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't preview that term." };
  }
  return { status: 200, data: data as unknown as SearchConceptPreview };
}

export async function saveSearchConceptCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    /** Absent for a new term. */
    id?: number;
    /** The row's updated_at when it was loaded (edits only). */
    expectedUpdatedAt?: string;
    term: string;
    expandsTo: string[];
    appliesTo: string[];
    enabled: boolean;
    note?: string | null;
    reason: string;
  },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<SearchConcept>> {
  try {
    assertPermission(ctx, "discovery.configure");
  } catch (e) {
    return denied(e);
  }
  if (!input.reason || input.reason.trim().length < 5) {
    return { status: 400, message: "Give a short reason for this change." };
  }
  const term = normalizeConceptWord(input.term);
  const expandsTo = [
    ...new Set(input.expandsTo.map(normalizeConceptWord).filter(Boolean)),
  ].filter((w) => w !== term);
  const appliesTo = [...new Set(input.appliesTo)];
  const problem = conceptProblem({ term, expandsTo, appliesTo });
  if (problem) return { status: 400, message: problem };
  const note = input.note?.trim() || null;

  let before: SearchConcept | null = null;
  let saved: ConceptRow | null = null;

  if (input.id !== undefined) {
    if (!input.expectedUpdatedAt) {
      return { status: 400, message: "Reload the vocabulary and try again." };
    }
    const current = await supabase
      .from("search_concept")
      .select(CONCEPT_COLUMNS)
      .eq("id", input.id)
      .maybeSingle();
    if (current.error) {
      logger.error(
        `saveSearchConceptCore read failed: ${current.error.message}`,
      );
      return { status: 500, message: "Something went wrong" };
    }
    if (!current.data) return { status: 404, message: "That term is gone." };
    before = mapConcept(current.data as ConceptRow);

    const { data, error } = await supabase
      .from("search_concept")
      .update({
        term,
        expands_to: expandsTo,
        applies_to: appliesTo,
        enabled: input.enabled,
        note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("updated_at", input.expectedUpdatedAt)
      .select(CONCEPT_COLUMNS)
      .maybeSingle();
    if (error) return conceptWriteError(error);
    if (!data) {
      return {
        status: 409,
        message: "Someone else changed this term. Reload and try again.",
      };
    }
    saved = data as ConceptRow;
  } else {
    const { data, error } = await supabase
      .from("search_concept")
      .insert({
        term,
        expands_to: expandsTo,
        applies_to: appliesTo,
        enabled: input.enabled,
        note,
      })
      .select(CONCEPT_COLUMNS)
      .single();
    if (error) return conceptWriteError(error);
    saved = data as ConceptRow;
  }

  const after = mapConcept(saved);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: before
      ? "discovery.vocabulary.update"
      : "discovery.vocabulary.create",
    targetType: "search_concept",
    targetId: String(after.id),
    summary: before
      ? `Search term “${after.term}” changed`
      : `Search term “${after.term}” added`,
    reason: input.reason.trim(),
    before: before ?? undefined,
    after,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });

  return {
    status: 200,
    message: before ? "Term saved." : "Term added.",
    data: after,
  };
}

export async function deleteSearchConceptCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { id: number; reason: string },
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<null>> {
  try {
    assertPermission(ctx, "discovery.configure");
  } catch (e) {
    return denied(e);
  }
  if (!input.reason || input.reason.trim().length < 5) {
    return { status: 400, message: "Give a short reason for this change." };
  }
  const { data, error } = await supabase
    .from("search_concept")
    .delete()
    .eq("id", input.id)
    .select(CONCEPT_COLUMNS)
    .maybeSingle();
  if (error) {
    logger.error(`deleteSearchConceptCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!data) return { status: 404, message: "That term is gone." };
  const before = mapConcept(data as ConceptRow);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "discovery.vocabulary.delete",
    targetType: "search_concept",
    targetId: String(before.id),
    summary: `Search term “${before.term}” removed`,
    reason: input.reason.trim(),
    before,
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Term removed.", data: null };
}

function conceptWriteError(error: {
  code?: string;
  message: string;
}): AdminEnvelope<never> {
  if (error.code === "23505") {
    return {
      status: 409,
      message: "That term already exists. Edit it instead.",
    };
  }
  if (error.code === "23514") {
    return { status: 400, message: "That term or its words aren't valid." };
  }
  logger.error(`search_concept write failed: ${error.message}`);
  return { status: 500, message: "Something went wrong" };
}
