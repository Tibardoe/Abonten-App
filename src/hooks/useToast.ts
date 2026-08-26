"use client";

import { useToastContext } from "@/providers/ToastProvider";

// Thin re-export so call sites import from the conventional src/hooks
// location instead of reaching into src/providers directly.
export function useToast() {
  return useToastContext();
}
