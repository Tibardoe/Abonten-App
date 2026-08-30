"use client";

import { useEffect, useRef } from "react";

export type PaystackPopupResult = { reference: string; status: string };

declare global {
  interface Window {
    PaystackPop?: new () => {
      resumeTransaction: (
        accessCode: string,
        handlers: {
          onSuccess: (transaction: PaystackPopupResult) => void;
          onCancel: () => void;
        },
      ) => void;
    };
  }
}

// Shared with next/script in every consumer: <Script src={PAYSTACK_INLINE_SCRIPT_SRC} strategy="afterInteractive" />
// next/script dedupes by src, so it's safe for both PaymentMethodSelector and
// AddBankCard to render this tag independently.
export const PAYSTACK_INLINE_SCRIPT_SRC = "https://js.paystack.co/v2/inline.js";

/**
 * Opens the Paystack Inline popup for a server-initialized transaction
 * (`accessCode`), as an overlay on the current page rather than a redirect.
 * Extracted out of PaymentMethodSelector.tsx so AddBankCard.tsx's card
 * verification flow can reuse the exact same popup-opening logic instead of
 * duplicating it. Opens at most once per `accessCode` — call `resetPopup()`
 * before reusing the same access code again (e.g. after the user cancels
 * and wants to retry the same still-valid transaction).
 */
export function useResumePaystackPopup(
  accessCode: string | null,
  handlers: {
    onSuccess: (transaction: PaystackPopupResult) => void;
    onCancel: () => void;
  },
) {
  const openedAccessCodeRef = useRef<string | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!accessCode) return;
    if (openedAccessCodeRef.current === accessCode) return;
    if (!window.PaystackPop) return;

    openedAccessCodeRef.current = accessCode;
    const popup = new window.PaystackPop();

    popup.resumeTransaction(accessCode, {
      onSuccess: (transaction) => handlersRef.current.onSuccess(transaction),
      onCancel: () => handlersRef.current.onCancel(),
    });
  }, [accessCode]);

  return {
    resetPopup: () => {
      openedAccessCodeRef.current = null;
    },
  };
}
