"use client";

import { useConfirmContext } from "@/providers/ConfirmProvider";

// Thin re-export so call sites import from the conventional src/hooks
// location instead of reaching into src/providers directly.
export function useConfirm() {
  return useConfirmContext();
}
