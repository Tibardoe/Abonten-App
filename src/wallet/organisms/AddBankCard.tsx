"use client";

import confirmCardVerification from "@/actions/confirmCardVerification";
import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import initCardVerification from "@/actions/initCardVerification";
import MaskIcon from "@/components/atoms/MaskIcon";
import { Button } from "@/components/ui/button";
import {
  PAYSTACK_INLINE_SCRIPT_SRC,
  useResumePaystackPopup,
} from "@/hooks/usePaystackPopup";
import { useMutation } from "@tanstack/react-query";
import Script from "next/script";
import { useState } from "react";

type PopupCloseProp = {
  onclick: () => void;
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
export default function AddBankCard({ onclick, onSaved }: PopupCloseProp) {
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
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full h-screen md:h-fit md:w-[60%] lg:w-[50%] bg-card text-card-foreground md:rounded-xl pt-5 p-3 md:p-5 space-y-5 pb-16 md:pb-20"
    >
      <Script src={PAYSTACK_INLINE_SCRIPT_SRC} strategy="afterInteractive" />

      <div className="hidden md:flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">Add Bank Card</h1>
          <p className="opacity-50">
            Save your Visa or Mastercard for faster checkout
          </p>
        </div>

        <button type="button" onClick={onclick}>
          <MaskIcon
            src="/assets/images/circularCancel.svg"
            alt="Close"
            className="w-[25px] h-[25px] bg-foreground"
          />
        </button>
      </div>

      {/* Mobile header */}
      <div className="flex flex-col gap-2 md:hidden pb-10">
        <div className="flex items-center w-full">
          <button type="button" onClick={onclick}>
            <MaskIcon
              src="/assets/images/arrowLeft.svg"
              alt="Close"
              className="self-start w-[30px] h-[30px]"
            />
          </button>
          <h1 className="font-bold text-xl m-auto">Add Bank Card</h1>
        </div>

        <p className="text-center text-sm">
          Save your Visa or Mastercard for faster checkout
        </p>
      </div>

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
          <div className="border border-input rounded-md px-4 py-2 bg-background">
            <input
              id="label"
              type="text"
              className="outline-none w-full"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Eg. My Visa"
              disabled={isBusy}
            />
          </div>
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
