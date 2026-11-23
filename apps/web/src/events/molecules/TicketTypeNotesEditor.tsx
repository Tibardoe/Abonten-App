"use client";

import updateTicketTypeNotes from "@/actions/updateTicketTypeNotes";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { ticketTypeLabel } from "@abonten/core/ticketTiers";
import {
  TICKET_TYPE_NOTE_MAX,
  normalizeTicketTypeNote,
} from "@abonten/core/ticketTypeNote";
import type { ManagedEventTicketType } from "@abonten/types/managedEventType";
import { useTranslations } from "next-intl";
import { useState } from "react";

type TicketTypeNotesEditorProps = {
  eventId: string;
  ticketTypes: ManagedEventTicketType[];
  onSaved: () => void;
};

// What each ticket type includes, edited on its own once the event has
// sold (PROJECT.md §90): the rest of the ticket editor is locked then, but
// a note changes no money. Saves only the notes that changed.
export default function TicketTypeNotesEditor({
  eventId,
  ticketTypes,
  onSaved,
}: TicketTypeNotesEditorProps) {
  const t = useTranslations("events");
  const tc = useTranslations("core");
  const tCommon = useTranslations("common");
  const toast = useToast();

  const initial = Object.fromEntries(
    ticketTypes.map((type) => [type.id, type.description ?? ""]),
  );
  const [notes, setNotes] = useState<Record<string, string>>(initial);
  const [isSaving, setIsSaving] = useState(false);

  const changed = ticketTypes.filter(
    (type) =>
      normalizeTicketTypeNote(notes[type.id]) !==
      normalizeTicketTypeNote(type.description),
  );

  const save = async () => {
    setIsSaving(true);
    try {
      const response = await updateTicketTypeNotes({
        eventId,
        notes: changed.map((type) => ({
          ticketTypeId: type.id,
          description: notes[type.id] ?? null,
        })),
      });
      if (response.status === 200) {
        toast.success(t("ticketNotesSaved"));
        onSaved();
      } else {
        toast.error(`❌ ${response.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t("ticketNotes")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("ticketNotesAfterSale")}
        </p>
      </div>

      {ticketTypes.map((type) => {
        const inputId = `ticket-note-${type.id}`;
        return (
          <div key={type.id} className="space-y-1">
            <label htmlFor={inputId} className="text-sm font-medium">
              {ticketTypeLabel(tc, type.type)}
            </label>
            <Input
              id={inputId}
              type="text"
              maxLength={TICKET_TYPE_NOTE_MAX}
              placeholder={tCommon("ticketNotePlaceholder")}
              value={notes[type.id] ?? ""}
              onChange={(e) =>
                setNotes((prev) => ({ ...prev, [type.id]: e.target.value }))
              }
            />
          </div>
        );
      })}

      <p className="text-xs text-muted-foreground">
        {tCommon("ticketNoteHint", { max: TICKET_TYPE_NOTE_MAX })}
      </p>

      <button
        type="button"
        onClick={save}
        disabled={isSaving || changed.length === 0}
        className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isSaving ? t("saving") : t("saveTicketNotes")}
      </button>
    </div>
  );
}
