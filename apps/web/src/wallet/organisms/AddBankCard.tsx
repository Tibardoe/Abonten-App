"use client";

import confirmCardVerification from "@/actions/confirmCardVerification";
import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import initCardVerification from "@/actions/initCardVerification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PAYSTACK_INLINE_SCRIPT_SRC,
  useResumePaystackPopup,
} from "@/hooks/usePaystackPopup";
import { useMutation } from "@tanstack/react-query";
import Script from "next/script";
import { useState } from "react";

type PopupCloseProp = {
  onSaved: (method: PaymentMethodRow) => void;
};

type CardFlowState =
  | { phase: "idle" }
  | { phase: "awaiting-popup"; reference: string; accessCode: string }
  | { phase: "confirming" }
  | { phase: "error"; message: string };

/**
 * Getting a real, reusable saved card requires one real Paystack charge —
 * there is no way to "tokenize" a card without actually charging it. This
 * runs a small GHS 1 verification charge through the Paystack popup, then
 * confirmCardVerification.ts independently verifies it, captures the
 * reusable authorization Paystack returns, refunds the GHS 1, and saves
 * only the safe display fields + the authorization token. No card number
 * or CVV is ever collected by this form — there is no form.
 */
export default function AddBankCard({ onSaved }: PopupCloseProp) {
  const [label, setLabel] = useState("");
  const [state, setState] = useState<CardFlowState>({ phase: "idle" });

  const startMutation = useMutation({
    mutationFn: initCardVerification,
    onSuccess: (response) => {
      if (response.status !== 200) {
        setState({ phase: "error", message: response.message });
        return;
      }
      setState({
        phase: "awaiting-popup",
        reference: response.data.reference,
        accessCode: response.data.accessCode,
      });
    },
    onError: () =>
      setState({
        phase: "error",
        message: "Couldn't start card verification. Please try again.",
      }),
  });

  const confirmMutation = useMutation({
    mutationFn: (reference: string) =>
      confirmCardVerification(reference, label || undefined),
    onSuccess: (response) => {
      if (response.status !== 200) {
        setState({ phase: "error", message: response.message });
        return;
      }
      onSaved(response.data);
    },
    onError: () =>
      setState({
        phase: "error",
        message: "Couldn't verify your card. Please try again.",
      }),
  });

  useResumePaystackPopup(
    state.phase === "awaiting-popup" ? state.accessCode : null,
    {
      onSuccess: () => {
        if (state.phase !== "awaiting-popup") return;
        setState({ phase: "confirming" });
        confirmMutation.mutate(state.reference);
      },
      onCancel: () => setState({ phase: "idle" }),
    },
  );

  const isBusy =
    startMutation.isPending ||
    state.phase === "awaiting-popup" ||
    state.phase === "confirming";

  return (
    <div className="space-y-5">
      <Script src={PAYSTACK_INLINE_SCRIPT_SRC} strategy="afterInteractive" />

      <p className="text-sm text-muted-foreground">
        Save your Visa or Mastercard for faster checkout.
      </p>

      <div className="flex flex-col gap-5">
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          We'll charge GHS 1 through Paystack's secure payment window to verify
          your card, then refund it immediately. We never see or store your card
          number or CVV — only Paystack does.
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor="label" className="text-sm">
            Label (optional)
          </label>
          <Input
            id="label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Eg. My Visa"
            disabled={isBusy}
          />
        </div>

        {state.phase === "awaiting-popup" && (
          <p className="text-sm text-muted-foreground text-center">
            Complete the GHS 1 verification in the Paystack window…
          </p>
        )}

        {state.phase === "confirming" && (
          <p className="text-sm text-muted-foreground text-center">
            Verifying and saving your card…
          </p>
        )}

        {state.phase === "error" && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <Button
          type="button"
          disabled={isBusy}
          onClick={() => {
            setState({ phase: "idle" });
            startMutation.mutate();
          }}
          className="font-semibold md:self-end rounded-md py-6 text-lg md:text-sm"
        >
          {isBusy ? "Processing…" : "Verify & Save Card"}
        </Button>
      </div>
    </div>
  );
}
