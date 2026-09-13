"use client";

import { Badge, Button, Card, cn } from "@/components/ui";
import {
  deleteWeeklySection,
  reorderWeeklyItems,
  updateWeeklySection,
} from "@/server/actions";
import {
  WEEKLY_SECTION_ICON_KEYS,
  weeklySectionIcon,
} from "@abonten/core/weekly/sectionIcons";
import {
  WEEKLY_LAYOUTS,
  WEEKLY_LAYOUT_LABEL,
  weeklySectionKind,
} from "@abonten/core/weekly/sectionKinds";
import type {
  WeeklyAdminSection,
  WeeklyLayout,
  WeeklySubjectScope,
} from "@abonten/types/weeklyType";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { fieldClass, useEditor } from "./EditorContext";
import { ItemPicker } from "./ItemPicker";
import { ItemRow } from "./ItemRow";

const SCOPE_LABEL: Record<WeeklySubjectScope, string> = {
  mixed: "Events and places",
  events: "Events only",
  places: "Places only",
};

export function SectionCard({
  section,
  allSections,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  section: WeeklyAdminSection;
  allSections: WeeklyAdminSection[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { editionId, canEdit, pending, run } = useEditor();
  const def = weeklySectionKind(section.kind);
  const isEditorial = section.kind === "editorial";

  const [title, setTitle] = useState(section.title);
  const [subtitle, setSubtitle] = useState(section.subtitle ?? "");
  const [body, setBody] = useState(section.body ?? "");
  const [layout, setLayout] = useState<WeeklyLayout>(section.layout);
  const [iconKey, setIconKey] = useState(section.iconKey ?? "");
  const [scope, setScope] = useState<WeeklySubjectScope>(section.subjectScope);

  useEffect(() => {
    setTitle(section.title);
    setSubtitle(section.subtitle ?? "");
    setBody(section.body ?? "");
    setLayout(section.layout);
    setIconKey(section.iconKey ?? "");
    setScope(section.subjectScope);
  }, [section]);

  const dirty =
    title !== section.title ||
    subtitle !== (section.subtitle ?? "") ||
    body !== (section.body ?? "") ||
    layout !== section.layout ||
    iconKey !== (section.iconKey ?? "") ||
    scope !== section.subjectScope;

  const save = (patch: Record<string, unknown>, success = "Section saved.") =>
    run(
      (version) =>
        updateWeeklySection({
          editionId,
          expectedVersion: version,
          sectionId: section.id,
          patch,
        }),
      { success },
    );

  const moveItem = (index: number, delta: -1 | 1) => {
    const ids = section.items.map((i) => i.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(
      (version) =>
        reorderWeeklyItems({
          editionId,
          expectedVersion: version,
          sectionId: section.id,
          itemIds: ids,
        }),
      { success: "Listing moved." },
    );
  };

  const headingId = `section-${section.id}`;

  return (
    <Card
      className={cn("p-4", !section.isVisible && "border-dashed opacity-80")}
    >
      <section aria-labelledby={headingId} className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id={headingId} className="text-sm font-semibold">
              {weeklySectionIcon(section.iconKey)
                ? `${weeklySectionIcon(section.iconKey)} `
                : ""}
              {section.title}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge>{def?.label ?? section.kind}</Badge>
              <span>{SCOPE_LABEL[section.subjectScope]}</span>
              <span>· {WEEKLY_LAYOUT_LABEL[section.layout]}</span>
              {!section.isVisible ? <Badge tone="warning">Hidden</Badge> : null}
              {section.kind === "for_you" ? (
                <Badge tone="info">Filled per person later</Badge>
              ) : null}
            </p>
          </div>
          {canEdit ? (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move section ${section.title} up`}
                disabled={pending || !canMoveUp}
                onClick={onMoveUp}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move section ${section.title} down`}
                disabled={pending || !canMoveDown}
                onClick={onMoveDown}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  save(
                    { isVisible: !section.isVisible },
                    section.isVisible ? "Section hidden." : "Section shown.",
                  )
                }
              >
                {section.isVisible ? "Hide" : "Show"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Delete the section “${section.title}” and its ${section.items.length} listing(s)?`,
                    )
                  ) {
                    return;
                  }
                  run(
                    (version) =>
                      deleteWeeklySection({
                        editionId,
                        expectedVersion: version,
                        sectionId: section.id,
                      }),
                    { success: "Section deleted." },
                  );
                }}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-xs font-medium">
              Edit section settings
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs sm:col-span-2">
                <span className="font-medium">Title</span>
                <input
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  className={cn(fieldClass, "mt-1")}
                />
              </label>
              <label className="block text-xs sm:col-span-2">
                <span className="font-medium">Subtitle</span>
                <input
                  value={subtitle}
                  maxLength={160}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className={cn(fieldClass, "mt-1")}
                />
              </label>
              {isEditorial ? (
                <label className="block text-xs sm:col-span-2">
                  <span className="font-medium">Text</span>
                  <textarea
                    value={body}
                    maxLength={1200}
                    rows={4}
                    onChange={(e) => setBody(e.target.value)}
                    className={cn(fieldClass, "mt-1")}
                  />
                  <span className="mt-1 block text-muted-foreground">
                    Plain text. Blank line between paragraphs.{" "}
                    {1200 - body.length} characters left.
                  </span>
                </label>
              ) : (
                <>
                  <label className="block text-xs">
                    <span className="font-medium">Layout</span>
                    <select
                      value={layout}
                      onChange={(e) =>
                        setLayout(e.target.value as WeeklyLayout)
                      }
                      className={cn(fieldClass, "mt-1")}
                    >
                      {WEEKLY_LAYOUTS.filter((l) => l !== "editorial").map(
                        (l) => (
                          <option key={l} value={l}>
                            {WEEKLY_LAYOUT_LABEL[l]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="font-medium">Takes</span>
                    <select
                      value={scope}
                      onChange={(e) =>
                        setScope(e.target.value as WeeklySubjectScope)
                      }
                      className={cn(fieldClass, "mt-1")}
                    >
                      {(Object.keys(SCOPE_LABEL) as WeeklySubjectScope[]).map(
                        (s) => (
                          <option key={s} value={s}>
                            {SCOPE_LABEL[s]}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </>
              )}
              <label className="block text-xs">
                <span className="font-medium">Icon</span>
                <select
                  value={iconKey}
                  onChange={(e) => setIconKey(e.target.value)}
                  className={cn(fieldClass, "mt-1")}
                >
                  <option value="">None</option>
                  {WEEKLY_SECTION_ICON_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {weeklySectionIcon(key)} {key.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              size="sm"
              className="mt-3"
              disabled={pending || !dirty || !title.trim()}
              onClick={() =>
                save({
                  title,
                  subtitle: subtitle || null,
                  iconKey: iconKey || null,
                  ...(isEditorial
                    ? { body: body || null }
                    : { layout, subjectScope: scope }),
                })
              }
            >
              Save section
            </Button>
          </details>
        ) : null}

        {isEditorial ? (
          section.body ? (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {section.body}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No text yet. An editorial note with no text is not shown.
            </p>
          )
        ) : (
          <>
            {section.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No listings yet. A section with no listings is not shown.
              </p>
            ) : (
              <ol className="space-y-2">
                {section.items.map((item, index) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    section={section}
                    allSections={allSections}
                    canMoveUp={index > 0}
                    canMoveDown={index < section.items.length - 1}
                    onMoveUp={() => moveItem(index, -1)}
                    onMoveDown={() => moveItem(index, 1)}
                  />
                ))}
              </ol>
            )}
            {canEdit && section.kind !== "for_you" ? (
              <ItemPicker section={section} />
            ) : null}
          </>
        )}
      </section>
    </Card>
  );
}
