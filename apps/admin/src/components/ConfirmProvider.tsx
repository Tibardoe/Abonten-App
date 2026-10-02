"use client";

import { Button } from "@/components/ui";
import { createValueStore } from "@abonten/core/valueStore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// "Are you sure?" for the console, asked with one line:
//
//   const confirm = useConfirm();
//   if (!(await confirm("Reject this promotion? The advertiser is refunded.",
//     { confirmLabel: "Reject", danger: true }))) return;
//
// It replaces window.confirm(). The browser's box cannot name its buttons,
// so a refund, a ban and a publish were all confirmed with "OK"; here the
// button says what it does, and the one that cannot be undone is red.
//
// The question is one string, as it was: the part up to the first question
// mark is the heading, the rest explains what will happen. Built on the
// <dialog> element, which brings the focus trap, Escape and the backdrop.
//
// The open question lives in a store, not in useState: most panels ask from
// inside a transition (`start(async () => { if (!(await confirm(…))) … })`),
// and React holds a transition's state updates back until its work is done.
// With useState the dialog never opened: it was waiting for the action that
// was waiting for its answer (@abonten/core/valueStore).

export type ConfirmOptions = {
  /** What the button does: "Refund", "Publish now". Defaults to "Continue". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** The action removes, refuses or cannot be undone. */
  danger?: boolean;
};

type Confirm = (question: string, options?: ConfirmOptions) => Promise<boolean>;

type Request = ConfirmOptions & { title: string; body: string };

const ConfirmContext = createContext<Confirm | null>(null);

/** "Publish now? It goes live at once." → heading and explanation. */
export function splitQuestion(question: string): {
  title: string;
  body: string;
} {
  const at = question.indexOf("?");
  if (at === -1) return { title: question.trim(), body: "" };
  return {
    title: question.slice(0, at + 1).trim(),
    body: question.slice(at + 1).trim(),
  };
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const answer = useRef<((confirmed: boolean) => void) | null>(null);
  const [store] = useState(() => createValueStore<Request | null>(null));
  const request = useSyncExternalStore(store.subscribe, store.get, () => null);
  const titleId = useId();
  const bodyId = useId();

  const confirm = useCallback<Confirm>(
    (question, options) => {
      // A second question while one is open answers the first with "no".
      answer.current?.(false);
      store.set({ ...splitQuestion(question), ...options });
      return new Promise<boolean>((resolve) => {
        answer.current = resolve;
      });
    },
    [store],
  );

  const settle = useCallback(
    (confirmed: boolean) => {
      answer.current?.(confirmed);
      answer.current = null;
      if (dialog.current?.open) dialog.current.close();
      store.set(null);
    },
    [store],
  );

  useEffect(() => {
    if (request && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
    }
  }, [request]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the click is on the backdrop only; the keyboard's way out is Escape (onCancel) and the Cancel button */}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={request?.body ? bodyId : undefined}
        // Escape means "no".
        onCancel={(event) => {
          event.preventDefault();
          settle(false);
        }}
        // So does a click on the backdrop (the dialog element itself).
        onClick={(event) => {
          if (event.target === dialog.current) settle(false);
        }}
        className="w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        {request ? (
          <div className="space-y-3 p-5">
            <h2 id={titleId} className="text-base font-semibold">
              {request.title}
            </h2>
            {request.body ? (
              <p id={bodyId} className="text-sm text-muted-foreground">
                {request.body}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                // The safe answer has the focus when the dialog opens.
                autoFocus
                onClick={() => settle(false)}
              >
                {request.cancelLabel ?? "Cancel"}
              </Button>
              <Button
                variant={request.danger ? "danger" : "primary"}
                size="sm"
                onClick={() => settle(true)}
              >
                {request.confirmLabel ?? "Continue"}
              </Button>
            </div>
          </div>
        ) : null}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return confirm;
}
