"use client";

import { Button, Card, cn } from "@/components/ui";
import { addWeeklySection, reorderWeeklySections } from "@/server/actions";
import {
  WEEKLY_SECTION_KINDS,
  weeklySectionKind,
} from "@abonten/core/weekly/sectionKinds";
import type { WeeklyAdminSection } from "@abonten/types/weeklyType";
import { useState } from "react";
import { fieldClass, useEditor } from "./EditorContext";
import { SectionCard } from "./SectionCard";

export function SectionList({ sections }: { sections: WeeklyAdminSection[] }) {
  const { editionId, canEdit, pending, run } = useEditor();
  const [kind, setKind] = useState("curated");

  const move = (index: number, delta: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(
      (version) =>
        reorderWeeklySections({
          editionId,
          expectedVersion: version,
          sectionIds: ids,
        }),
      { success: "Section moved." },
    );
  };

  return (
    <div className="space-y-4">
      {sections.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          No sections yet. Add one below.
        </Card>
      ) : null}
      {sections.map((section, index) => (
        <SectionCard
          key={section.id}
          section={section}
          allSections={sections}
          canMoveUp={index > 0}
          canMoveDown={index < sections.length - 1}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, 1)}
        />
      ))}

      {canEdit ? (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <label className="block min-w-[14rem] flex-1 text-sm">
            <span className="font-medium">Add a section</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={cn(fieldClass, "mt-1")}
            >
              {WEEKLY_SECTION_KINDS.filter((k) => k.editorial).map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label} — {k.description}
                </option>
              ))}
            </select>
          </label>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                (version) =>
                  addWeeklySection({
                    editionId,
                    expectedVersion: version,
                    section: {
                      kind,
                      title: weeklySectionKind(kind)?.defaultTitle,
                    },
                  }),
                { success: "Section added." },
              )
            }
          >
            Add section
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
