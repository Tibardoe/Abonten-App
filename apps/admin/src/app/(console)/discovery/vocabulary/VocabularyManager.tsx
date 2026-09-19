"use client";

import { StepUpButton } from "@/components/StepUpButton";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Table,
  Td,
  Th,
  cn,
  timeAgo,
} from "@/components/ui";
import {
  deleteSearchConcept,
  previewSearchConcept,
  saveSearchConcept,
} from "@/server/actions";
import {
  SEARCH_CONCEPT_SCOPES,
  type SearchConcept,
  type SearchConceptPreview,
  type SearchConceptScope,
  type SearchVocabulary,
  conceptProblem,
  normalizeConceptWord,
  parseConceptWords,
} from "@abonten/core/search/searchVocabulary";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

const input =
  "w-full rounded border border-border bg-background px-2 py-1.5 text-sm";

const SCOPE_LABEL: Record<SearchConceptScope, string> = {
  event: "Events",
  place: "Places",
  spotlight: "Spotlights",
};

type Draft = {
  id?: number;
  expectedUpdatedAt?: string;
  term: string;
  words: string;
  appliesTo: SearchConceptScope[];
  enabled: boolean;
  note: string;
};

const EMPTY: Draft = {
  term: "",
  words: "",
  appliesTo: [...SEARCH_CONCEPT_SCOPES],
  enabled: true,
  note: "",
};

function draftFrom(c: SearchConcept): Draft {
  return {
    id: c.id,
    expectedUpdatedAt: c.updatedAt,
    term: c.term,
    words: c.expandsTo.join(", "),
    appliesTo: c.appliesTo,
    enabled: c.enabled,
    note: c.note ?? "",
  };
}

export function VocabularyManager({
  vocabulary,
  canConfigure,
  stepUpFresh,
}: {
  vocabulary: SearchVocabulary;
  canConfigure: boolean;
  stepUpFresh: boolean;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [reason, setReason] = useState("");
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<SearchConceptPreview | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const editable = canConfigure && stepUpFresh;

  const words = parseConceptWords(draft.words, draft.term);
  const problem = conceptProblem({
    term: draft.term,
    expandsTo: words,
    appliesTo: draft.appliesTo,
  });

  const concepts = useMemo(() => {
    const q = normalizeConceptWord(filter);
    if (!q) return vocabulary.concepts;
    return vocabulary.concepts.filter(
      (c) => c.term.includes(q) || c.expandsTo.some((w) => w.includes(q)),
    );
  }, [filter, vocabulary.concepts]);

  const open = (next: Draft) => {
    setDraft(next);
    setPreview(null);
    setMsg(null);
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const runPreview = () =>
    start(async () => {
      setMsg(null);
      const res = await previewSearchConcept({
        term: draft.term,
        expandsTo: words,
        appliesTo: draft.appliesTo,
      });
      if (res.status === 200 && "data" in res && res.data) setPreview(res.data);
      else setMsg({ ok: false, text: res.message ?? "Couldn't preview." });
    });

  const save = () =>
    start(async () => {
      setMsg(null);
      const res = await saveSearchConcept({
        id: draft.id,
        expectedUpdatedAt: draft.expectedUpdatedAt,
        term: draft.term,
        expandsTo: words,
        appliesTo: draft.appliesTo,
        enabled: draft.enabled,
        note: draft.note.trim() || null,
        reason: reason.trim(),
      });
      setMsg({
        ok: res.status === 200,
        text: res.message ?? (res.status === 200 ? "Saved." : "Couldn't save."),
      });
      if (res.status === 200 && "data" in res && res.data) {
        setDraft(draftFrom(res.data));
        setReason("");
        router.refresh();
      }
    });

  const remove = () =>
    start(async () => {
      if (!draft.id) return;
      if (
        !window.confirm(
          `Remove “${draft.term}”? Searches stop matching its words at once. Switching it off keeps it for later instead.`,
        )
      ) {
        return;
      }
      const res = await deleteSearchConcept({
        id: draft.id,
        reason: reason.trim(),
      });
      setMsg({
        ok: res.status === 200,
        text:
          res.message ?? (res.status === 200 ? "Removed." : "Couldn't remove."),
      });
      if (res.status === 200) {
        setDraft(EMPTY);
        setReason("");
        setPreview(null);
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      {canConfigure && !stepUpFresh ? (
        <Card className="flex items-center gap-2 p-3 text-sm">
          Changing the vocabulary needs a fresh identity check.
          <StepUpButton next="/discovery/vocabulary" />
        </Card>
      ) : null}
      {!canConfigure ? (
        <Card className="p-3 text-sm text-muted-foreground">
          You can view the vocabulary and preview terms. Changing it needs the
          “Configure discovery” permission.
        </Card>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Searches that need words</h2>
        <p className="text-xs text-muted-foreground">
          Submitted searches that found nothing, or found results nobody opened.
          Search analytics carry no user or device identifiers. A query can find
          nothing simply because nothing matching is listed yet: preview a term
          before adding it.
        </p>
        {vocabulary.gaps.length === 0 ? (
          <EmptyState>
            No unanswered searches in the last {vocabulary.days} days.
          </EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Search</Th>
                <Th className="text-right">Times</Th>
                <Th className="text-right">Found nothing</Th>
                <Th className="text-right">Opened</Th>
                <Th>Vocabulary</Th>
                <Th>Last</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {vocabulary.gaps.map((g) => (
                <tr key={g.query_norm}>
                  <Td className="font-medium">{g.query_norm}</Td>
                  <Td className="text-right tabular-nums">{g.searches}</Td>
                  <Td className="text-right tabular-nums">{g.zero_results}</Td>
                  <Td className="text-right tabular-nums">{g.clicks}</Td>
                  <Td>
                    {g.covered ? (
                      <Badge tone="info">Has related words</Badge>
                    ) : (
                      <Badge tone="warning">No related words</Badge>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">
                    {timeAgo(g.last_seen)}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const existing = vocabulary.concepts.find(
                          (c) => c.term === g.query_norm,
                        );
                        open(
                          existing
                            ? draftFrom(existing)
                            : { ...EMPTY, term: g.query_norm },
                        );
                      }}
                    >
                      {vocabulary.concepts.some((c) => c.term === g.query_norm)
                        ? "Edit term"
                        : "Add term"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <div ref={editorRef}>
        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {draft.id ? `Edit “${draft.term}”` : "New term"}
            </p>
            {draft.id || draft.term ? (
              <Button size="sm" variant="ghost" onClick={() => open(EMPTY)}>
                Start a new term
              </Button>
            ) : null}
          </div>
          <label className="block text-sm">
            <span className="font-medium">What people type</span>
            <input
              value={draft.term}
              onChange={(e) => setDraft({ ...draft, term: e.target.value })}
              placeholder="e.g. gob3"
              className={cn(input, "mt-1")}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Words listings use for it</span>
            <span className="block text-xs text-muted-foreground">
              Separate with commas or new lines. Up to 30. A listing with any of
              them matches this word of the search. The relationship works both
              ways: searching one of these words also finds the term.
            </span>
            <textarea
              value={draft.words}
              onChange={(e) => setDraft({ ...draft, words: e.target.value })}
              rows={3}
              placeholder="beans, plantain, red red"
              className={cn(input, "mt-1")}
            />
          </label>
          <fieldset className="text-sm">
            <legend className="font-medium">Applies to</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {SEARCH_CONCEPT_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={draft.appliesTo.includes(scope)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        appliesTo: e.target.checked
                          ? [...draft.appliesTo, scope]
                          : draft.appliesTo.filter((s) => s !== scope),
                      })
                    }
                  />
                  {SCOPE_LABEL[scope]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) =>
                setDraft({ ...draft, enabled: e.target.checked })
              }
            />
            In use (switch off to keep the term without it affecting search)
          </label>
          <label className="block text-sm">
            <span className="font-medium">Note</span>
            <input
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Optional, e.g. Beans and plantain"
              maxLength={200}
              className={cn(input, "mt-1")}
            />
          </label>

          {problem && (draft.term || draft.words) ? (
            <p className="text-xs text-muted-foreground">{problem}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={runPreview}
              disabled={pending || !!problem}
            >
              Preview matches
            </Button>
          </div>

          {preview ? <PreviewResult preview={preview} /> : null}

          {editable ? (
            <div className="space-y-2 border-t border-border pt-3">
              <label className="block text-sm">
                <span className="font-medium">Reason for this change</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. 12 searches for gob3 found nothing"
                  className={cn(input, "mt-1")}
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={save}
                  disabled={pending || !!problem || reason.trim().length < 5}
                >
                  {pending ? "Saving…" : draft.id ? "Save term" : "Add term"}
                </Button>
                {draft.id ? (
                  <Button
                    variant="danger"
                    onClick={remove}
                    disabled={pending || reason.trim().length < 5}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {msg ? (
            <p
              className={cn(
                "text-sm",
                msg.ok ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {msg.text}
            </p>
          ) : null}
        </Card>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            Terms ({vocabulary.concepts.length})
          </h2>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find a term or word"
            aria-label="Find a term or word"
            className={cn(input, "max-w-xs")}
          />
        </div>
        {concepts.length === 0 ? (
          <EmptyState>No terms match.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Term</Th>
                <Th>Words</Th>
                <Th>Applies to</Th>
                <Th>Changed</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {concepts.map((c) => (
                <tr key={c.id} className={c.enabled ? "" : "opacity-60"}>
                  <Td className="font-medium">
                    {c.term}
                    {!c.enabled ? <Badge className="ml-2">Off</Badge> : null}
                    {c.note ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {c.note}
                      </span>
                    ) : null}
                  </Td>
                  <Td className="text-xs">{c.expandsTo.join(", ")}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {c.appliesTo.map((s) => SCOPE_LABEL[s]).join(", ")}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted-foreground">
                    {timeAgo(c.updatedAt)}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => open(draftFrom(c))}
                    >
                      {editable ? "Edit" : "View"}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}

function PreviewResult({ preview }: { preview: SearchConceptPreview }) {
  const rows: [string, { count: number; samples: string[] } | undefined][] = [
    ["Upcoming events", preview.events],
    ["Places", preview.places],
    ["Spotlights", preview.spotlights],
  ];
  return (
    <div className="rounded border border-border bg-muted/40 p-3 text-sm">
      <p className="text-xs text-muted-foreground">
        Listings matching the term or any of its words today (up to 1,000
        counted).
      </p>
      <ul className="mt-2 space-y-2">
        {rows
          .filter(([, r]) => r)
          .map(([label, r]) => (
            <li key={label}>
              <span className="font-medium">{label}:</span>{" "}
              <span className="tabular-nums">
                {(r?.count ?? 0).toLocaleString("en-GH")}
              </span>
              {r && r.samples.length > 0 ? (
                <span className="block text-xs text-muted-foreground">
                  {r.samples.join(" · ")}
                </span>
              ) : null}
            </li>
          ))}
      </ul>
    </div>
  );
}
