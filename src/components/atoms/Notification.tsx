"use client";

import type { ToastEntry, ToastVariant } from "@/providers/ToastProvider";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
} from "lucide-react";

type NotificationProps = {
  toasts: ToastEntry[];
  onDismiss: (id: string) => void;
};

const VARIANT_STYLES: Record<
  ToastVariant,
  {
    icon: React.ReactNode;
    role: "status" | "alert";
    live: "polite" | "assertive";
  }
> = {
  success: {
    icon: <CheckCircle2 className="size-5 shrink-0 text-success" />,
    role: "status",
    live: "polite",
  },
  info: {
    icon: <Info className="size-5 shrink-0 text-primary" />,
    role: "status",
    live: "polite",
  },
  warning: {
    icon: <AlertTriangle className="size-5 shrink-0 text-warning" />,
    role: "status",
    live: "polite",
  },
  error: {
    icon: <XCircle className="size-5 shrink-0 text-destructive" />,
    role: "alert",
    live: "assertive",
  },
  loading: {
    icon: (
      <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
    ),
    role: "status",
    live: "polite",
  },
};

export default function Notification({ toasts, onDismiss }: NotificationProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="fixed bottom-24 right-[5%] z-30 flex w-80 flex-col gap-2 md:right-[10%] md:bottom-10">
      <AnimatePresence>
        {toasts.map((toast) => {
          const { icon, role, live } = VARIANT_STYLES[toast.variant];

          return (
            <motion.div
              key={toast.id}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 50 }
              }
              transition={{ duration: prefersReducedMotion ? 0.05 : 0.4 }}
              role={role}
              aria-live={live}
              className="flex items-start gap-2 rounded-lg border border-border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
            >
              {icon}
              <p className="flex-1">{toast.message}</p>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
