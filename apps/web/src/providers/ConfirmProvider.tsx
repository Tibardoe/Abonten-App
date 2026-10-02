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
import { useTranslations } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
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
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const answer = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((next) => {
    // A second question while one is open answers the first with "no".
    answer.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      answer.current = resolve;
    });
  }, []);

  const settle = (confirmed: boolean) => {
    answer.current?.(confirmed);
    answer.current = null;
    setOptions(null);
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
