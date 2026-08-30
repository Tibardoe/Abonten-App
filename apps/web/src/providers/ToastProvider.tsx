"use client";

import Notification from "@/components/atoms/Notification";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastVariant = "success" | "error" | "warning" | "info" | "loading";

export type ToastEntry = {
  id: string;
  variant: ToastVariant;
  message: string;
};

type ShowToastOptions = {
  /** Explicit id to dedupe/replace on. Defaults to a key derived from the
   * variant + message, so calling the same toast twice (e.g. a double
   * click) replaces the existing one instead of stacking a duplicate. */
  id?: string;
  durationMs?: number;
};

type UpdateToastOptions = {
  variant: ToastVariant;
  message: string;
  durationMs?: number;
};

type ToastContextValue = {
  toasts: ToastEntry[];
  success: (message: string, options?: ShowToastOptions) => string;
  error: (message: string, options?: ShowToastOptions) => string;
  warning: (message: string, options?: ShowToastOptions) => string;
  info: (message: string, options?: ShowToastOptions) => string;
  /** Loading toasts never auto-dismiss -- resolve them with update() or dismiss(). */
  loading: (message: string, options?: ShowToastOptions) => string;
  update: (id: string, options: UpdateToastOptions) => void;
  dismiss: (id: string) => void;
};

// Errors/warnings stay up long enough to actually read; success/info are
// quick confirmations; loading has no timer since it's resolved explicitly.
const DEFAULT_DURATIONS: Record<ToastVariant, number | null> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 6000,
  loading: null,
};

const ToastContext = createContext<ToastContextValue | null>(null);

export default function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    },
    [clearTimer],
  );

  const scheduleAutoDismiss = useCallback(
    (id: string, durationMs: number | null) => {
      clearTimer(id);
      if (durationMs === null) return;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
    },
    [clearTimer, dismiss],
  );

  const show = useCallback(
    (variant: ToastVariant, message: string, options?: ShowToastOptions) => {
      const id = options?.id ?? `${variant}:${message}`;
      const durationMs = options?.durationMs ?? DEFAULT_DURATIONS[variant];

      setToasts((current) => [
        ...current.filter((toast) => toast.id !== id),
        { id, variant, message },
      ]);
      scheduleAutoDismiss(id, durationMs);

      return id;
    },
    [scheduleAutoDismiss],
  );

  const update = useCallback(
    (id: string, options: UpdateToastOptions) => {
      setToasts((current) => {
        const entry: ToastEntry = {
          id,
          variant: options.variant,
          message: options.message,
        };
        const exists = current.some((toast) => toast.id === id);
        return exists
          ? current.map((toast) => (toast.id === id ? entry : toast))
          : [...current, entry];
      });
      scheduleAutoDismiss(
        id,
        options.durationMs ?? DEFAULT_DURATIONS[options.variant],
      );
    },
    [scheduleAutoDismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      success: (message, options) => show("success", message, options),
      error: (message, options) => show("error", message, options),
      warning: (message, options) => show("warning", message, options),
      info: (message, options) => show("info", message, options),
      loading: (message, options) => show("loading", message, options),
      update,
      dismiss,
    }),
    [toasts, show, update, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Notification toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToastContext() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
