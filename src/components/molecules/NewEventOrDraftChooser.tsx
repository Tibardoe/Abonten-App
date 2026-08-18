"use client";

import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useRouter } from "next/navigation";

type NewEventOrDraftChooserProps = {
  onCreateNew: () => void;
  onClose: () => void;
};

// Shown before opening the file picker only when the organizer has at
// least one saved event draft — never forces continuing a draft, just
// offers the choice (per spec: starting a new event must not silently
// abandon or overwrite an in-progress one).
export default function NewEventOrDraftChooser({
  onCreateNew,
  onClose,
}: NewEventOrDraftChooserProps) {
  useBodyScrollLock(true);
  const router = useRouter();

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-40">
      <div className="w-[85%] md:w-[30%] p-4 bg-card text-card-foreground rounded-xl shadow-lg">
        <h1 className="text-md font-bold text-center pb-3">Create Event</h1>
        <hr className="border-border" />
        <p className="text-center py-3 text-sm text-muted-foreground">
          You have saved drafts.
        </p>

        <div className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            className="rounded-md bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 transition-colors"
            onClick={() => router.push("/manage/drafts")}
          >
            Continue a Draft
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 hover:bg-accent transition-colors"
            onClick={onCreateNew}
          >
            Create New Event
          </button>
          <button
            type="button"
            className="text-muted-foreground px-3 py-2 hover:text-foreground transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
