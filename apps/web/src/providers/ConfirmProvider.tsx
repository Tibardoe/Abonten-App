"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createValueStore } from "@abonten/core/valueStore";
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// "Are you sure?" as a dialog of the app, asked with one line:
//
//   const confirm = useConfirm();   (hooks/useConfirm.ts)
//   if (!(await confirm({ title, message, confirmLabel }))) return;
//
// It replaces window.confirm(). The browser's own box is unstyled, cannot
// name its buttons ("OK" to delete an account), and some in-app browsers
// (a link opened inside a chat or social app) do not show it at all and
// answer "no", which made the action behind it impossible there.
//
// The open question lives in a store, not in useState, so it may be asked
// from anywhere: React holds back the state updates made inside a
// transition until the transition's work is done, and a dialog opened with
// useState from `startTransition(async () => { if (!(await confirm(…))) … })`
// would never appear (@abonten/core/valueStore).

export type ConfirmOptions = {
  /** The question: "Delete this message?" */
  title: string;
  /** What will happen, and whether it can be undone. */
  message?: string;
  /** The action's own verb: "Delete", "Withdraw". Never "OK". */
  confirmLabel: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

export default function ConfirmProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("common");
  const [store] = useState(() => createValueStore<ConfirmOptions | null>(null));
  const options = useSyncExternalStore(store.subscribe, store.get, () => null);
  const answer = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (next) => {
      // A second question while one is open answers the first with "no".
      answer.current?.(false);
      store.set(next);
      return new Promise<boolean>((resolve) => {
        answer.current = resolve;
      });
    },
    [store],
  );

  const settle = (confirmed: boolean) => {
    answer.current?.(confirmed);
    answer.current = null;
    store.set(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <AlertDialog
          open
          onOpenChange={(open) => {
            // Escape and a click outside mean "no".
            if (!open) settle(false);
          }}
        >
          <AlertDialogContent>
            <AlertDialogTitle>{options.title}</AlertDialogTitle>
            {options.message ? (
              <AlertDialogDescription>{options.message}</AlertDialogDescription>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>
                {options.cancelLabel ?? t("buttons.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => settle(true)}>
                {options.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirmContext(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return confirm;
}
