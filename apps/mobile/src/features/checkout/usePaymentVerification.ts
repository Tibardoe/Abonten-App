import { api } from "@/lib/api";
import { invalidateAfterTicketMutation } from "@/lib/ticketMutationInvalidation";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

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

export type PaymentKind =
  | "ticket"
  | "event_promotion"
  | "place_promotion"
  | "spotlight_promotion"
  /** One part of a Pay small small plan. */
  | "ticket_plan";

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
  mode: "popup" | "direct" | "redirect";
  /** Popup/redirect — the provider's payment page to open in a browser session. */
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
// After the first ~80 s the screen keeps asking, more slowly, while it is
// open (a mobile-money approval can take minutes), and at once whenever the
// app comes back to the front — usually from the wallet's approval prompt.
const SLOW_POLL_MS = 20_000;
const MAX_SLOW_POLLS = 30;
// A pressed "Check again" rests this long before it can be pressed again:
// every press asks the provider, and a button that gave no sign of life
// invited tapping it over and over.
export const CHECK_COOLDOWN_SECONDS = 10;

const PENDING_NOTE: Record<PaymentKind, string> = {
  ticket: "yourPaymentIsStillBeingConfirmed",
  event_promotion: "yourPaymentIsStillBeingConfirmed",
  place_promotion: "yourPaymentIsStillBeingConfirmed",
  spotlight_promotion: "yourPaymentIsStillBeingConfirmed",
  ticket_plan: "yourPaymentIsStillBeingConfirmed",
};

const FULFILMENT_NOTE: Record<PaymentKind, string> = {
  ticket: "yourPaymentWentThroughButWe",
  event_promotion: "yourPaymentWentThroughButThe",
  place_promotion: "yourPaymentWentThroughButThe",
  spotlight_promotion: "yourPaymentWentThroughButThe2",
  ticket_plan: "yourPaymentWentThroughButWe",
};

type VerifyResponse = Awaited<ReturnType<typeof api.payments.verify>>;

export function usePaymentVerification(params: PaymentVerificationParams) {
  const t = useTranslations("checkout");

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
  /** Seconds before "Check again" can be pressed again. */
  const [cooldown, setCooldown] = useState(0);
  /** The last "Check again" came back with no change. */
  const [checkedJustNow, setCheckedJustNow] = useState(false);
  /** The last request never reached Abonten (offline, weak signal). */
  const [weakConnection, setWeakConnection] = useState(false);

  const pollsRef = useRef(0);
  const slowPollsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  // Succeeded or failed for good: nothing more to ask.
  const settledRef = useRef(false);
  // The state's status, readable from timers and listeners.
  const phaseRef = useRef<PaymentVerifyState["status"]>(state.status);
  const backgroundCheckRef = useRef<() => Promise<void>>(async () => {});

  const setPhase = useCallback((next: PaymentVerifyState) => {
    phaseRef.current = next.status;
    setState(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // One request to Abonten. A request that never arrives is not an answer:
  // it marks the connection weak and reads as "no news" (status 500).
  const ask = useCallback(
    async (via: "verify" | "retry"): Promise<VerifyResponse> => {
      try {
        const res =
          via === "retry"
            ? await api.payments.retry(attemptId)
            : await api.payments.verify(attemptId);
        setWeakConnection(false);
        return res as VerifyResponse;
      } catch {
        setWeakConnection(true);
        return { status: 500, message: t("networkError") } as VerifyResponse;
      }
    },
    [attemptId, t],
  );

  const onSucceeded = useCallback(() => {
    settledRef.current = true;
    clearTimer();
    setPhase({ status: "succeeded" });
    // The purchased thing (ticket / featured listing) + everything its
    // inventory/attendance change ripples through: My Tickets, the
    // discovery + explore feeds (stale "X going / Y spots left" on cards),
    // the "You're going" badge, event/place detail, organizer views,
    // review eligibility. See lib/ticketMutationInvalidation.ts.
    invalidateAfterTicketMutation(qc);
    // A plan's part: its plan and the Balance screen read it next.
    if (kind === "ticket_plan") {
      void qc.invalidateQueries({ queryKey: ["mobile", "ticket-plans"] });
    }
    // The held checkout is gone from Tickets / Home now.
    void qc.invalidateQueries({ queryKey: ["mobile", "checkout", "pending"] });
  }, [qc, clearTimer, kind, setPhase]);

  const applyVerifyResult = useCallback(
    (
      res: VerifyResponse,
      { fromRetry }: { fromRetry: boolean },
    ): "terminal" | "continue" => {
      if (res.status === 200) {
        onSucceeded();
        return "terminal";
      }
      if (res.status === 207) {
        // Paid; the tickets (or the promotion) are not out yet. "Retry"
        // asks again, so this is not settled.
        clearTimer();
        setPhase({
          status: "fulfillmentFailed",
          message: res.message ?? t(FULFILMENT_NOTE[kind]),
        });
        return "terminal";
      }
      if (res.status === 400) {
        settledRef.current = true;
        clearTimer();
        setPhase({
          status: "failed",
          message: res.message ?? t("yourPaymentCouldNotBeCompleted"),
        });
        return "terminal";
      }
      // 202 pending / 401 / 403 / 404 / 500 — transient from the client's POV.
      if (fromRetry) {
        if (phaseRef.current !== "fulfillmentFailed") {
          setPhase({ status: "pending", note: t(PENDING_NOTE[kind]) });
        }
        return "terminal";
      }
      return "continue";
    },
    [kind, onSucceeded, clearTimer, setPhase, t],
  );

  // The slow checks while the "still confirming" screen is open.
  const scheduleSlowCheck = useCallback(() => {
    clearTimer();
    if (settledRef.current || !aliveRef.current) return;
    if (slowPollsRef.current >= MAX_SLOW_POLLS) return;
    timerRef.current = setTimeout(() => {
      void backgroundCheckRef.current();
    }, SLOW_POLL_MS);
  }, [clearTimer]);

  const backgroundCheck = useCallback(async () => {
    if (settledRef.current || !aliveRef.current) return;
    if (phaseRef.current !== "pending") return;
    slowPollsRef.current += 1;
    const res = await ask("verify");
    if (settledRef.current || !aliveRef.current) return;
    if (applyVerifyResult(res, { fromRetry: false }) === "continue") {
      scheduleSlowCheck();
    }
  }, [ask, applyVerifyResult, scheduleSlowCheck]);
  backgroundCheckRef.current = backgroundCheck;

  const poll = useCallback(async () => {
    if (settledRef.current || !aliveRef.current) return;
    const res = await ask("verify");
    if (settledRef.current || !aliveRef.current) return;

    const next = applyVerifyResult(res, { fromRetry: false });
    if (next === "terminal") return;

    pollsRef.current += 1;
    if (pollsRef.current >= MAX_POLLS) {
      // Not settled: "Check again" works from here, and the slow checks
      // carry on in the background. (Until 2026-11-17 this marked the
      // payment settled, so "Check again" silently did nothing.)
      setPhase({ status: "pending", note: t(PENDING_NOTE[kind]) });
      slowPollsRef.current = 0;
      scheduleSlowCheck();
      return;
    }
    timerRef.current = setTimeout(poll, POLL_MS);
  }, [ask, applyVerifyResult, kind, scheduleSlowCheck, setPhase, t]);

  const startPolling = useCallback(() => {
    settledRef.current = false;
    pollsRef.current = 0;
    setPhase({ status: "verifying" });
    clearTimer();
    void poll();
  }, [poll, clearTimer, setPhase]);

  // Mount: open the provider's payment page (if any), then begin polling. Direct
  // charges that need an OTP wait on the `otp` state instead. Runs exactly
  // once — every input is a route param fixed for the screen's lifetime.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once by design
  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      if ((mode === "popup" || mode === "redirect") && authorizationUrl) {
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

  // Back from the wallet app (or anywhere): ask straight away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" || phaseRef.current !== "pending") return;
      clearTimer();
      void backgroundCheckRef.current();
    });
    return () => sub.remove();
  }, [clearTimer]);

  // The "Check again" rest, counted down a second at a time.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // "Check again" / "Retry": re-runs the server's own verification (never
  // charges again). Only offered while pending or finishing up.
  const checkAgain = useCallback(async () => {
    if (checking || cooldown > 0 || settledRef.current) return;
    const phase = phaseRef.current;
    if (phase !== "pending" && phase !== "fulfillmentFailed") return;
    setChecking(true);
    setCheckedJustNow(false);
    clearTimer();
    try {
      const res = await ask("retry");
      if (!aliveRef.current) return;
      applyVerifyResult(res, { fromRetry: true });
      if (
        phaseRef.current === "pending" ||
        phaseRef.current === "fulfillmentFailed"
      ) {
        setCheckedJustNow(true);
        setCooldown(CHECK_COOLDOWN_SECONDS);
        if (phaseRef.current === "pending") scheduleSlowCheck();
      }
    } finally {
      setChecking(false);
    }
  }, [
    checking,
    cooldown,
    ask,
    applyVerifyResult,
    clearTimer,
    scheduleSlowCheck,
  ]);

  const submitOtp = useCallback(
    async (otp: string) => {
      const code = otp.trim();
      if (!code || otpSubmitting) return;
      setOtpSubmitting(true);
      try {
        const res = await api.payments.submitChargeOtp(attemptId, code);
        if (res.status !== 200) {
          setPhase({
            status: "otp",
            error: res.message ?? t("thatCodeDidnTWorkTry"),
          });
          return;
        }
        startPolling();
      } catch {
        setPhase({
          status: "otp",
          error: t("networkErrorTryAgain"),
        });
      } finally {
        setOtpSubmitting(false);
      }
    },
    [attemptId, otpSubmitting, startPolling, setPhase, t],
  );

  return {
    state,
    checking,
    otpSubmitting,
    checkAgain,
    submitOtp,
    cooldown,
    checkedJustNow,
    weakConnection,
  };
}
