"use client";

import { Button, Card, cn } from "@/components/ui";
import { updateWeeklyEdition } from "@/server/actions";
import { useEffect, useState } from "react";
import { fieldClass, useEditor } from "./EditorContext";

export function EditionCopyForm({
  title,
  subtitle,
  intro,
}: {
  title: string;
  subtitle: string | null;
  intro: string | null;
}) {
  const { editionId, canEdit, pending, run } = useEditor();
  const [t, setT] = useState(title);
  const [s, setS] = useState(subtitle ?? "");
  const [i, setI] = useState(intro ?? "");

  useEffect(() => {
    setT(title);
    setS(subtitle ?? "");
    setI(intro ?? "");
  }, [title, subtitle, intro]);

  const dirty = t !== title || s !== (subtitle ?? "") || i !== (intro ?? "");

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm font-semibold">Edition copy</p>
      <label className="block text-sm">
        <span className="font-medium">Title</span>
        <input
          value={t}
          maxLength={80}
          disabled={!canEdit}
          onChange={(e) => setT(e.target.value)}
          className={cn(fieldClass, "mt-1")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Subtitle</span>
        <input
          value={s}
          maxLength={160}
          disabled={!canEdit}
          onChange={(e) => setS(e.target.value)}
          className={cn(fieldClass, "mt-1")}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">Introduction</span>
        <textarea
          value={i}
          maxLength={600}
          rows={3}
          disabled={!canEdit}
          onChange={(e) => setI(e.target.value)}
          className={cn(fieldClass, "mt-1")}
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Plain text, shown under the title. {600 - i.length} characters left.
        </span>
      </label>
      {canEdit ? (
        <Button
          size="sm"
          disabled={pending || !dirty || !t.trim()}
          onClick={() =>
            run((version) =>
              updateWeeklyEdition({
                editionId,
                expectedVersion: version,
                patch: { title: t, subtitle: s || null, intro: i || null },
              }),
            )
          }
        >
          Save copy
        </Button>
      ) : null}
    </Card>
  );
}
