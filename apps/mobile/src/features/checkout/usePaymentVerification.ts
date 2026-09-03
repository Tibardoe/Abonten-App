import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";

// The single payment-verification state machine, shared by every Paystack
// purchase flow (event tickets, event promotion, place promotion). It used
// to be copy-pasted into PaymentSection.tsx and PromotionPaymentSection.tsx;
// both now just start the attempt and hand off to <PaymentVerificationScreen>,
// which is driven entirely by this hook.
//
// The backend (`finalizePaystackPayment`) is the source of truth — this hook
// only ever *reads* status via `api.payments.verify` (optimistic fast path,
// races the webhook safely behind a CAS lock) and `api.payments.retry`
// (re-run fulfilment, NEVER re-charges — this is what "Check again" calls).

export type PaymentKind = "ticket" | "event_promotion" | "place_promotion";

export type PaymentVerifyState =
  | { status: "verifying"; note?: string }
  | { status: "otp"; error?: string }
  | { status: "succeeded" }
  | { status: "pending"; note: string }
  | { status: "fulfillmentFailed"; message: string }
  | { status: "failed"; message: string };

export type PaymentVerificationParams = {
  attemptId: string;
  kind: PaymentKind;
  mode: "popup" | "direct";
  /** Popup only — the Paystack checkout URL to open in a browser session. */
  authorizationUrl?: string;
  /** The `abonten://…` URL the popup redirects back to when it closes. */
  deepLink?: string;
  /** Direct charge only — "send_otp" routes straight to the OTP step. */
  chargeStatus?: string;
  /** Direct charge hint ("Approve the prompt on your phone…"). */
  displayMessage?: string;
};

const POLL_MS = 4000;
const MAX_POLLS = 20;

const PENDING_NOTE: Record<PaymentKind, string> = {
  ticket:
    "Your payment is still being confirmed. This usually clears within a minute.",
  event_promotion:
    "Your payment is still being confirmed. This usually clears within a minute.",
  place_promotion:
    "Your payment is still being confirmed. This usually clears within a minute.",
};

const FULFILMENT_NOTE: Record<PaymentKind, string> = {
  ticket:
    "Your payment went through, but we haven't issued your ticket yet. Retry now — you won't be charged again.",
  event_promotion:
    "Your payment went through, but the promotion isn't active yet. Retry now — you won't be charged again.",
  place_promotion:
    "Your payment went through, but the promotion isn't active yet. Retry now — you won't be charged again.",
};

export function usePaymentVerification(params: PaymentVerificationParams) {
  const { attemptId, kind, mode, authorizationUrl, deepLink, chargeStatus } =
    params;
  const qc = useQueryClient();

  const [state, setState] = useState<PaymentVerifyState>(
    mode === "direct" && chargeStatus === "send_otp"
      ? { status: "otp" }
      : { status: "verifying" },
  );
  const [checking, setChecking] = useState(false);
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  const pollsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  const settledRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onSucceeded = useCallback(() => {
    settledRef.current = true;
    clearTimer();
    setState({ status: "succeeded" });
    // The purchased thing (ticket / featured listing) + any inventory or
    // balance it touched. Broad on purpose — a successful payment can ripple
    // through several screens.
    for (const key of [
      ["mobile", "tickets"],
      ["mobile", "checkout"],
      ["mobile", "event"],
      ["mobile", "place"],
      ["mobile", "organizer"],
      ["mobile", "review-eligibility"],
    ]) {
      qc.invalidateQueries({ queryKey: key });
    }
  }, [qc, clearTimer]);

  const applyVerifyResult = useCallback(
    (
      res: Awaited<ReturnType<typeof api.payments.verify>>,
      { fromRetry }: { fromRetry: boolean },
    ): "terminal" | "continue" => {
      if (res.status === 200) {
        onSucceeded();
        return "terminal";
      }
      if (res.status === 207) {
        settledRef.current = true;
        clearTimer();
        setState({
          status: "fulfillmentFailed",
          message: res.message ?? FULFILMENT_NOTE[kind],
        });
        return "terminal";
      }
      if (res.status === 400) {
        settledRef.current = true;
        clearTimer();
        setState({
          status: "failed",
          message: res.message ?? "Your payment could not be completed.",
        });
        return "terminal";
      }
      // 202 pending / 401 / 403 / 404 / 500 — transient from the client's POV.
      if (fromRetry) {
        setState({ status: "pending", note: PENDING_NOTE[kind] });
        return "terminal";
      }
      return "continue";
    },
    [kind, onSucceeded, clearTimer],
  );

  const poll = useCallback(async () => {
    if (settledRef.current || !aliveRef.current) return;
    let res: Awaited<ReturnType<typeof api.payments.verify>>;
    try {
      res = await api.payments.verify(attemptId);
    } catch {
      res = { status: 500, message: "Network error" };
    }
    if (settledRef.current || !aliveRef.current) return;

    const next = applyVerifyResult(res, { fromRetry: false });
    if (next === "terminal") return;

    pollsRef.current += 1;
    if (pollsRef.current >= MAX_POLLS) {
      settledRef.current = true;
      clearTimer();
      setState({ status: "pending", note: PENDING_NOTE[kind] });
      return;
    }
    timerRef.current = setTimeout(poll, POLL_MS);
  }, [attemptId, applyVerifyResult, clearTimer, kind]);

  const startPolling = useCallback(() => {
    settledRef.current = false;
    pollsRef.current = 0;
    setState({ status: "verifying" });
    clearTimer();
    void poll();
  }, [poll, clearTimer]);

  // Mount: open the Paystack popup (if any), then begin polling. Direct
  // charges that need an OTP wait on the `otp` state instead. Runs exactly
  // once — every input is a route param fixed for the screen's lifetime.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once by design
  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      if (mode === "popup" && authorizationUrl) {
        try {
          await WebBrowser.openAuthSessionAsync(
            authorizationUrl,
            deepLink ?? "abonten://",
          );
        } catch {
          // user dismissed / browser failed — verify still tells the truth
        }
      }
      if (!aliveRef.current) return;
      if (mode === "direct" && chargeStatus === "send_otp") return;
      void poll();
    })();
    return () => {
      aliveRef.current = false;
      clearTimer();
    };
  }, []);

  const checkAgain = useCallback(async () => {
    if (checking || settledRef.current) return;
    setChecking(true);
    try {
      let res: Awaited<ReturnType<typeof api.payments.retry>>;
      try {
        res = await api.payments.retry(attemptId);
      } catch {
        res = { status: 500, message: "Network error" };
      }
      applyVerifyResult(res, { fromRetry: true });
    } finally {
      setChecking(false);
    }
  }, [attemptId, checking, applyVerifyResult]);

  const submitOtp = useCallback(
    async (otp: string) => {
      const code = otp.trim();
      if (!code || otpSubmitting) return;
      setOtpSubmitting(true);
      try {
        const res = await api.payments.submitChargeOtp(attemptId, code);
        if (res.status !== 200) {
          setState({
            status: "otp",
            error: res.message ?? "That code didn't work. Try again.",
          });
          return;
        }
        startPolling();
      } catch {
        setState({
          status: "otp",
          error: "Network error. Try again.",
        });
      } finally {
        setOtpSubmitting(false);
      }
    },
    [attemptId, otpSubmitting, startPolling],
  );

  return { state, checking, otpSubmitting, checkAgain, submitOtp };
}
