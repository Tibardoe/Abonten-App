"use client";

import createMultiCheckoutPaymentAttempt from "@/actions/createMultiCheckoutPaymentAttempt";
import { createPromotionPaymentAttempt } from "@/actions/createPromotionPaymentAttempt";
import getCheckoutPaymentOptions from "@/actions/getCheckoutPaymentOptions";
import { getPromotionCreditQuote } from "@/actions/getPromotionCreditQuote";
import getUserPaymentMethods from "@/actions/getUserPaymentMethods";
import prepareMultiCheckoutPayment from "@/actions/prepareMultiCheckoutPayment";
import retryPaymentFulfillment from "@/actions/retryPaymentFulfillment";
import submitPaystackChargeOtp from "@/actions/submitPaystackChargeOtp";
import verifyPaystackPayment from "@/actions/verifyPaystackPayment";
import EmailRequiredToPay, {
  useNeedsEmailToPay,
} from "@/components/molecules/EmailRequiredToPay";
import UseCreditToggle from "@/components/molecules/UseCreditToggle";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PAYSTACK_INLINE_SCRIPT_SRC,
  useResumePaystackPopup,
} from "@/hooks/usePaystackPopup";
import { useToast } from "@/hooks/useToast";
import {
  invalidateEventListQueries,
  invalidatePlaceListQueries,
  invalidateTicketStatusQueries,
} from "@/utils/mutationQueryInvalidation";
import PaymentMethodCard, {
  getPaymentMethodDisplay,
  NO_PAYMENT_METHODS_MESSAGE,
} from "@/wallet/molecules/PaymentMethodCard";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import { PAYMENT_METHODS_QUERY_KEY } from "@/wallet/organisms/WalletManager";
import { formatMoney } from "@abonten/core/formatMoney";
import { getFulfillmentMessage } from "@abonten/core/paymentStatusCopy";
import { PENDING_CHECKOUTS_QUERY_KEY } from "@abonten/core/queryKeys";
import { creditMinorToMajor } from "@abonten/core/rewards/creditAmount";
import type { CheckoutInit } from "@abonten/services/payments/providers/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

type PayChoice = { paymentMethodId: string | null; method: string | null };

type PaymentMethodSelectorProps = (
  | {
      kind: "ticket";
      checkoutSessionIds: string[];
      onInvalidSessions?: (invalidSessionIds: string[]) => void;
    }
  | {
      kind: "promotion";
      placePromotionCheckoutId: string;
      amount: number;
      currency: string;
    }
  | {
      kind: "event-promotion";
      eventPromotionCheckoutId: string;
      amount: number;
      currency: string;
    }
  | {
      // Promoted Spotlight campaign. Cash only: the server never offers
      // credit for it, so the quote below always comes back empty.
      kind: "spotlight-promotion";
      contentCampaignCheckoutId: string;
      amount: number;
      currency: string;
    }
) & {
  // Purely informational — lets a wrapping component (e.g. a collapsible
  // panel) show the current phase/selected wallet without owning any
  // payment state itself. Never used to drive payment logic in here.
  onStatusChange?: (status: PaymentSelectorStatus) => void;
  // Fired once fulfillment is server-confirmed (status 200 from
  // verifyPaystackPayment/retryPaymentFulfillment) — lets a parent that owns
  // its own list of pending checkouts (e.g. PendingCheckoutsBasket) show a
  // dedicated success state instead of letting the just-paid item silently
  // disappear from underneath the user when the parent's own cache is
  // invalidated. Never used to drive payment logic in here.
  onPurchaseSucceeded?: () => void;
};

export type PaymentSelectorStatus = {
  phase: PaymentUiState["phase"];
  selectedMethodLabel: string | null;
};

type PaymentInit = CheckoutInit;

type PaymentUiState =
  | { phase: "selecting" }
  | { phase: "awaiting-popup"; primaryAttemptId: string; accessCode: string }
  | {
      phase: "awaiting-direct";
      primaryAttemptId: string;
      chargeStatus: string;
      displayMessage?: string;
    }
  | { phase: "verifying" }
  | { phase: "pending"; primaryAttemptId: string; message?: string }
  | { phase: "cancelled"; primaryAttemptId: string; accessCode: string }
  | { phase: "failed"; message: string }
  // Payment succeeded — never treat this like "failed" (which implies the
  // charge itself was declined and it's safe to try again). Only a Retry
  // that resumes the SAME payment_attempt is offered here.
  | { phase: "fulfillment-failed"; paymentAttemptId: string; message: string }
  | { phase: "succeeded" };

const DIRECT_CHARGE_POLL_INTERVAL_MS = 4000;

/**
 * Shared "select a payment method and pay" step for ticket and promotion
 * checkout. The server decides HOW to charge based on the
 * selected method (see paystackInit.ts's initiatePaystackChargeForAttempt):
 *  - a saved card/mobile money wallet with a real, usable token charges
 *    directly (`mode: "direct"`) — no popup, this component just shows the
 *    right waiting state and polls for the result.
 *  - anything else opens the Paystack popup as an overlay on this exact
 *    page (`mode: "popup"`) — never a redirect to a hosted checkout page.
 * Either way, the popup/direct-charge outcome is only ever used to kick off
 * server-side verification (verifyPaystackPayment) — it is never treated as
 * proof of payment on its own; the same authoritative
 * finalizePaystackPayment the Paystack webhook calls is what actually
 * confirms success.
 *
 * The `ticket` kind always takes an array of checkout session ids (length 1
 * for a single pending checkout, more for several paid together) and derives
 * its own authoritative total via prepareMultiCheckoutPayment rather than
 * trusting a parent-computed amount — the server is always what decides what
 * gets charged.
 */
export default function PaymentMethodSelector(
  props: PaymentMethodSelectorProps,
) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const needsEmail = useNeedsEmailToPay();
  // Either a saved wallet entry or a way to pay on the provider's page —
  // never both. The order's market decides which of either are offered.
  const [selectedId, setSelectedIdState] = useState<string | null>(null);
  const [selectedHostedMethod, setSelectedHostedMethodState] = useState<
    string | null
  >(null);
  const setSelectedId = (id: string | null) => {
    setSelectedIdState(id);
    if (id) setSelectedHostedMethodState(null);
  };
  const setSelectedMethod = (method: string | null) => {
    setSelectedHostedMethodState(method);
    if (method) setSelectedIdState(null);
  };
  const [uiState, setUiState] = useState<PaymentUiState>({
    phase: "selecting",
  });
  const [otp, setOtp] = useState("");

  const sortedSessionIds =
    props.kind === "ticket" ? [...props.checkoutSessionIds].sort() : [];

  const {
    data: prepared,
    isPending: isPreparePending,
    isError: isPrepareError,
    refetch: refetchPrepared,
  } = useQuery({
    queryKey: ["prepare-multi-checkout", sortedSessionIds],
    queryFn: () => prepareMultiCheckoutPayment(sortedSessionIds),
    enabled: props.kind === "ticket" && sortedSessionIds.length > 0,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-run when the prepared summary itself changes, not on every parent re-render passing a new onInvalidSessions closure (props.kind is fixed for the lifetime of one instance).
  useEffect(() => {
    if (props.kind !== "ticket" || !prepared) return;
    if (prepared.status === 200 && prepared.invalidSessionIds.length > 0) {
      props.onInvalidSessions?.(prepared.invalidSessionIds);
    }
  }, [prepared]);

  // Abonten Credit: the server quotes how much applies (tickets: as part of
  // the prepare step; promotions: its own quote). The switch starts ON
  // whenever there is credit to use (it expires otherwise).
  const promotionTarget =
    props.kind === "promotion"
      ? { kind: "place" as const, checkoutId: props.placePromotionCheckoutId }
      : props.kind === "event-promotion"
        ? { kind: "event" as const, checkoutId: props.eventPromotionCheckoutId }
        : props.kind === "spotlight-promotion"
          ? {
              kind: "spotlight" as const,
              checkoutId: props.contentCampaignCheckoutId,
            }
          : null;
  const { data: creditQuoteResponse, refetch: refetchCreditQuote } = useQuery({
    queryKey: [
      "promotion-credit-quote",
      promotionTarget?.kind,
      promotionTarget?.checkoutId,
    ],
    queryFn: () =>
      promotionTarget
        ? getPromotionCreditQuote(promotionTarget)
        : Promise.resolve(null),
    enabled: !!promotionTarget,
  });
  const rawCreditQuote =
    props.kind === "ticket"
      ? prepared?.status === 200
        ? prepared.credit
        : null
      : creditQuoteResponse?.status === 200
        ? creditQuoteResponse.data
        : null;
  const creditQuote =
    rawCreditQuote?.offered && rawCreditQuote.creditMinor > 0
      ? rawCreditQuote
      : null;
  const refreshCreditQuote = () => {
    if (props.kind === "ticket") refetchPrepared();
    else refetchCreditQuote();
  };
  const [useCreditChoice, setUseCreditChoice] = useState<boolean | null>(null);
  const useCredit = !!creditQuote && (useCreditChoice ?? true);
  const creditCoversAll = useCredit && !!creditQuote?.creditOnly;

  const amount =
    useCredit && creditQuote
      ? creditMinorToMajor(creditQuote.cashMinor, creditQuote.currency)
      : props.kind !== "ticket"
        ? props.amount
        : prepared?.status === 200
          ? prepared.grandTotal
          : 0;
  const currency =
    props.kind !== "ticket"
      ? props.currency
      : prepared?.status === 200
        ? prepared.currency
        : "";

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: PAYMENT_METHODS_QUERY_KEY,
    queryFn: async () => {
      const response = await getUserPaymentMethods();
      return response.status === 200 ? response.data : [];
    },
  });

  const methods = data ?? [];

  const optionsTarget =
    props.kind === "ticket"
      ? sortedSessionIds.length > 0
        ? { kind: "ticket" as const, checkoutSessionIds: sortedSessionIds }
        : null
      : promotionTarget;
  const { data: optionsResponse } = useQuery({
    queryKey: [
      "checkout-payment-options",
      optionsTarget?.kind,
      optionsTarget && "checkoutId" in optionsTarget
        ? optionsTarget.checkoutId
        : sortedSessionIds,
    ],
    queryFn: () =>
      optionsTarget
        ? getCheckoutPaymentOptions(optionsTarget)
        : Promise.resolve(null),
    enabled: !!optionsTarget,
  });
  const paymentOptions =
    optionsResponse?.status === 200 ? optionsResponse.data : null;
  const savedOption = (id: string) =>
    paymentOptions?.saved.find((s) => s.id === id) ?? null;
  // Until the options arrive every saved entry is shown as before; once
  // they do, one that cannot pay in this order's market is shown but
  // cannot be picked, with the reason.
  const isUsable = (id: string) => savedOption(id)?.usable ?? true;
  const hostedMethods = paymentOptions?.methods ?? [];

  // biome-ignore lint/correctness/useExhaustiveDependencies: pick a default once per options/wallet change; the setters are stable wrappers.
  useEffect(() => {
    if (selectedId && isUsable(selectedId)) return;
    if (selectedHostedMethod) return;
    const usable = methods.filter((m) => isUsable(m.id));
    const defaultSaved = usable.find((m) => m.is_default) ?? usable[0];
    if (defaultSaved) {
      setSelectedId(defaultSaved.id);
      return;
    }
    if (selectedId) setSelectedIdState(null);
    const recommended =
      hostedMethods.find((m) => m.recommended) ?? hostedMethods[0];
    if (recommended) setSelectedMethod(recommended.method);
  }, [methods, selectedId, selectedHostedMethod, paymentOptions]);

  const selectedMethod = methods.find((m) => m.id === selectedId) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only report when the phase or selected wallet actually changes, not on every parent re-render passing a new onStatusChange closure.
  useEffect(() => {
    props.onStatusChange?.({
      phase: uiState.phase,
      selectedMethodLabel: selectedMethod
        ? getPaymentMethodDisplay(selectedMethod).title
        : (hostedMethods.find((m) => m.method === selectedHostedMethod)
            ?.label ?? null),
    });
  }, [uiState.phase, selectedMethod, selectedHostedMethod]);

  const handlePaymentInit = (
    primaryAttemptId: string,
    payment: PaymentInit,
  ) => {
    if (payment.mode === "popup" && payment.provider !== "paystack") {
      // An in-page overlay is only wired for Paystack's inline SDK; any
      // other provider's popup continues on its hosted page instead.
      setUiState({ phase: "verifying" });
      window.location.assign(payment.authorizationUrl);
      return;
    }

    if (payment.mode === "popup") {
      setUiState({
        phase: "awaiting-popup",
        primaryAttemptId,
        accessCode: payment.accessCode,
      });
      return;
    }

    if (payment.mode === "redirect") {
      // A hosted provider page (Stripe Checkout): the person leaves this
      // page and comes back to the checkout URL, where the pending-attempt
      // banner and the verify action pick the payment up.
      setUiState({ phase: "verifying" });
      window.location.assign(payment.url);
      return;
    }

    if (
      payment.chargeStatus === "failed" ||
      payment.chargeStatus === "success"
    ) {
      // Already conclusively resolved (declined, or — for some mobile money
      // networks — approved instantly with no phone prompt at all) — verify
      // immediately rather than showing a misleading "awaiting
      // approval"/"approve on your phone" message for a few seconds until
      // the next poll cycle catches up.
      setUiState({ phase: "verifying" });
      verifyMutation.mutate(primaryAttemptId);
      return;
    }

    setUiState({
      phase: "awaiting-direct",
      primaryAttemptId,
      chargeStatus: payment.chargeStatus,
      displayMessage: payment.displayMessage,
    });
  };

  // With credit covering everything there's no Paystack step: the tickets
  // are issued before the call returns and `verification` carries the result.
  const ticketPayMutation = useMutation({
    mutationFn: (choice: PayChoice) =>
      createMultiCheckoutPaymentAttempt({
        checkoutSessionIds:
          props.kind === "ticket" ? props.checkoutSessionIds : [],
        paymentMethodId: choice.paymentMethodId,
        method: choice.method,
        useCredit,
      }),
    onSuccess: (response) => {
      if (response.status === 409) {
        toast.error(response.message);
        if (props.kind === "ticket" && response.invalidSessionIds.length > 0) {
          props.onInvalidSessions?.(response.invalidSessionIds);
        }
        refreshCreditQuote();
        return;
      }
      if (response.status !== 200) {
        toast.error(response.message);
        return;
      }
      const primaryAttemptId = response.data.attempts[0].id;
      if (response.data.payment) {
        handlePaymentInit(primaryAttemptId, response.data.payment);
        return;
      }
      if (response.data.verification) {
        applyVerification(response.data.verification, primaryAttemptId);
      }
    },
    onError: () => toast.error("Failed to start payment. Please try again."),
  });

  // Event and place promotions share one service (and one mutation). With
  // credit covering everything there's no Paystack step: the promotion is
  // activated before the call returns and `verification` carries the result.
  const promotionPayMutation = useMutation({
    mutationFn: (choice: PayChoice) =>
      createPromotionPaymentAttempt({
        kind: promotionTarget?.kind ?? "event",
        checkoutId: promotionTarget?.checkoutId ?? "",
        paymentMethodId: choice.paymentMethodId,
        method: choice.method,
        useCredit,
      }),
    onSuccess: (response) => {
      if (response.status !== 200) {
        toast.error(response.message);
        if (response.status === 409) refreshCreditQuote();
        return;
      }
      if (response.data.payment) {
        handlePaymentInit(response.data.attempt.id, response.data.payment);
        return;
      }
      if (response.data.verification) {
        applyVerification(response.data.verification, response.data.attempt.id);
      }
    },
    onError: () => toast.error("Failed to start payment. Please try again."),
  });

  const payMutation =
    props.kind === "ticket" ? ticketPayMutation : promotionPayMutation;

  // Invalidates the cache families a successful purchase can affect, scoped
  // to what this payment actually was — kept in one place so both the
  // initial verify and a later retryFulfillmentMutation success stay in
  // sync (see mutationQueryInvalidation.ts; targeted, not a full refetch).
  const invalidateAfterSuccess = () => {
    if (props.kind === "ticket") {
      invalidateTicketStatusQueries(queryClient);
      invalidateEventListQueries(queryClient);
      // The event-details page's live attendee count/sold-out display
      // (EventAttendanceStats.tsx) and AttendingButton.tsx both key their
      // query as ["attendance-count", eventId] — this doesn't know which
      // event(s) were just paid for, so invalidate the whole family rather
      // than plumb eventId through every payment kind just for this. Cheap:
      // it only refetches count queries that are actually mounted/observed.
      queryClient.invalidateQueries({ queryKey: ["attendance-count"] });
      // Drops the just-paid session(s) out of PendingCheckoutsBasket's own
      // list — the basket refetches with `status = 'pending'` still applied
      // server-side, so only the completed session(s) disappear; unrelated
      // pending checkouts are untouched.
      queryClient.invalidateQueries({ queryKey: PENDING_CHECKOUTS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["prepare-multi-checkout"] });
    } else if (props.kind === "event-promotion") {
      invalidateEventListQueries(queryClient);
    } else if (props.kind === "promotion") {
      invalidatePlaceListQueries(queryClient);
    } else if (props.kind === "spotlight-promotion") {
      queryClient.invalidateQueries({ queryKey: ["content", "campaigns"] });
    }
    if (promotionTarget) {
      queryClient.invalidateQueries({ queryKey: ["promotion-credit-quote"] });
    }
  };

  // One place that turns a verification outcome into UI state — used by the
  // verify call after Paystack, and by a credit-only promotion, which is
  // finalized as part of starting it.
  const applyVerification = (
    response: Awaited<ReturnType<typeof verifyPaystackPayment>>,
    primaryAttemptId: string,
  ) => {
    if (response.status === 200) {
      setUiState({ phase: "succeeded" });
      invalidateAfterSuccess();
      props.onPurchaseSucceeded?.();
      // Re-runs this checkout page's server fetch so the already-correct,
      // per-kind "purchase complete" state (and the removal of the Pay
      // button/order summary) takes over immediately instead of waiting
      // for a manual reload.
      router.refresh();
      return;
    }
    if (response.status === 202) {
      setUiState({
        phase: "pending",
        primaryAttemptId,
        message:
          response.data.finalized === "pending"
            ? "Your mobile money payment is still awaiting authorization."
            : "We're finishing up your payment.",
      });
      return;
    }
    if (response.status === 207) {
      setUiState({
        phase: "fulfillment-failed",
        paymentAttemptId: response.data.paymentAttemptId,
        message: response.message,
      });
      return;
    }
    setUiState({
      phase: "failed",
      message: response.message ?? "Your payment could not be verified.",
    });
  };

  const verifyMutation = useMutation({
    mutationFn: (primaryAttemptId: string) =>
      verifyPaystackPayment(primaryAttemptId),
    onSuccess: applyVerification,
    onError: () =>
      setUiState({
        phase: "failed",
        message: "The payment could not be verified. Please try again.",
      }),
  });

  const retryFulfillmentMutation = useMutation({
    mutationFn: (paymentAttemptId: string) =>
      retryPaymentFulfillment(paymentAttemptId),
    onSuccess: (response) => {
      if (response.status === 200) {
        setUiState({ phase: "succeeded" });
        invalidateAfterSuccess();
        props.onPurchaseSucceeded?.();
        router.refresh();
        return;
      }
      if (response.status === 207) {
        setUiState({
          phase: "fulfillment-failed",
          paymentAttemptId: response.data.paymentAttemptId,
          message: response.message,
        });
        return;
      }
      if (response.status === 202) {
        toast.error(
          "We're finishing up your payment. Please check back in a moment.",
        );
        return;
      }
      toast.error(
        "message" in response && response.message
          ? response.message
          : "Still couldn't finish this. Please contact support.",
      );
    },
    onError: () =>
      toast.error("Still couldn't finish this. Please contact support."),
  });

  const otpMutation = useMutation({
    mutationFn: (primaryAttemptId: string) =>
      submitPaystackChargeOtp(primaryAttemptId, otp),
    onSuccess: (response, primaryAttemptId) => {
      if (response.status !== 200) {
        toast.error(response.message);
        return;
      }
      setUiState({ phase: "verifying" });
      verifyMutation.mutate(primaryAttemptId);
    },
    onError: () =>
      toast.error("That code didn't work. Please check and try again."),
  });

  useResumePaystackPopup(
    uiState.phase === "awaiting-popup" ? uiState.accessCode : null,
    {
      onSuccess: () => {
        if (uiState.phase !== "awaiting-popup") return;
        const primaryAttemptId = uiState.primaryAttemptId;
        setUiState({ phase: "verifying" });
        verifyMutation.mutate(primaryAttemptId);
      },
      onCancel: () => {
        if (uiState.phase !== "awaiting-popup") return;
        setUiState({
          phase: "cancelled",
          primaryAttemptId: uiState.primaryAttemptId,
          accessCode: uiState.accessCode,
        });
      },
    },
  );

  // Direct charges (saved card authorization / mobile money) have no popup
  // callback to tell us when they're done — poll verification instead,
  // except while waiting on an OTP the user still needs to type in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: verifyMutation is stable enough for this purpose; only uiState should drive when polling starts/stops.
  useEffect(() => {
    if (uiState.phase !== "awaiting-direct") return;
    if (uiState.chargeStatus === "send_otp") return;

    const interval = setInterval(() => {
      verifyMutation.mutate(uiState.primaryAttemptId);
    }, DIRECT_CHARGE_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [uiState]);

  // No email on the account (a phone sign-up): every payment is refused
  // without one, so ask for it here instead of failing on "Pay".
  if (needsEmail) {
    return (
      <EmailRequiredToPay
        purpose={props.kind === "ticket" ? "tickets" : "promotion"}
      />
    );
  }

  if (props.kind === "ticket" && (isPreparePending || isPrepareError)) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3 text-center text-muted-foreground py-4">
        <p>Couldn't load your payment methods.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="underline font-medium"
        >
          Try again
        </button>
      </div>
    );
  }

  const paystackScript = (
    <Script src={PAYSTACK_INLINE_SCRIPT_SRC} strategy="afterInteractive" />
  );

  if (uiState.phase === "succeeded") {
    return (
      <>
        {paystackScript}
        <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-center">
          <p className="font-semibold">{getFulfillmentMessage(props.kind)}</p>
        </div>
      </>
    );
  }

  if (uiState.phase === "verifying") {
    return (
      <>
        {paystackScript}
        <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
          <p>Verifying your payment…</p>
        </div>
      </>
    );
  }

  if (uiState.phase === "pending") {
    return (
      <>
        {paystackScript}
        <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
          <p>
            {uiState.message ??
              "Your payment is still processing. This page stays reserved until it expires."}
          </p>
          <button
            type="button"
            onClick={() => verifyMutation.mutate(uiState.primaryAttemptId)}
            className="underline font-medium"
          >
            Check status
          </button>
        </div>
      </>
    );
  }

  if (uiState.phase === "awaiting-direct") {
    const primaryAttemptId = uiState.primaryAttemptId;

    if (uiState.chargeStatus === "send_otp") {
      return (
        <>
          {paystackScript}
          <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-center">
            <p>
              {uiState.displayMessage ??
                "Enter the OTP sent to your phone to approve this payment."}
            </p>
            <Input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter OTP"
              className="text-center"
            />
            <button
              type="button"
              disabled={!otp || otpMutation.isPending}
              onClick={() => otpMutation.mutate(primaryAttemptId)}
              className="w-full rounded-md p-3 font-bold text-primary-foreground bg-primary text-center disabled:opacity-50"
            >
              {otpMutation.isPending ? "Submitting…" : "Submit code"}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        {paystackScript}
        <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
          <p>
            {uiState.displayMessage ??
              "Approve this payment on your phone to continue."}
          </p>
          <button
            type="button"
            onClick={() => verifyMutation.mutate(primaryAttemptId)}
            className="underline font-medium"
          >
            I've approved — check now
          </button>
        </div>
      </>
    );
  }

  if (uiState.phase === "awaiting-popup") {
    return (
      <>
        {paystackScript}
        <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
          <p>Complete your payment in the Paystack window…</p>
        </div>
      </>
    );
  }

  if (uiState.phase === "fulfillment-failed") {
    const paymentAttemptId = uiState.paymentAttemptId;

    return (
      <>
        {paystackScript}
        <div className="space-y-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-center">
          <p className="font-semibold">Payment successful</p>
          <p>{uiState.message}</p>
          <button
            type="button"
            disabled={retryFulfillmentMutation.isPending}
            onClick={() => retryFulfillmentMutation.mutate(paymentAttemptId)}
            className="w-full rounded-md p-3 font-bold text-primary-foreground bg-primary text-center disabled:opacity-50"
          >
            {retryFulfillmentMutation.isPending ? "Retrying…" : "Retry"}
          </button>
        </div>
      </>
    );
  }

  if (uiState.phase === "cancelled" || uiState.phase === "failed") {
    const message =
      uiState.phase === "failed"
        ? uiState.message
        : "Payment cancelled — you can try again.";

    return (
      <>
        {paystackScript}
        <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-center">
          <p>{message}</p>
          <button
            type="button"
            onClick={() => {
              if (uiState.phase === "cancelled") {
                // Same Paystack transaction is still valid — resume it
                // instead of starting a brand new one.
                setUiState({
                  phase: "awaiting-popup",
                  primaryAttemptId: uiState.primaryAttemptId,
                  accessCode: uiState.accessCode,
                });
              } else {
                setUiState({ phase: "selecting" });
                refreshCreditQuote();
              }
            }}
            className="underline font-medium"
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {paystackScript}

      {creditQuote ? (
        <UseCreditToggle
          quote={creditQuote}
          checked={useCredit}
          onChange={setUseCreditChoice}
          disabled={payMutation.isPending}
        />
      ) : null}

      {creditCoversAll ? null : (
        <>
          <p className="font-semibold text-sm">
            {useCredit ? "Pay the rest with" : "Payment method"}
          </p>

          {methods.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {NO_PAYMENT_METHODS_MESSAGE}
            </p>
          ) : (
            <div className="space-y-2">
              {methods.map((method) => {
                const option = savedOption(method.id);
                const usable = isUsable(method.id);
                return (
                  <div
                    key={method.id}
                    className={usable ? undefined : "opacity-60"}
                    aria-disabled={!usable}
                  >
                    <PaymentMethodCard
                      method={method}
                      selected={usable && selectedId === method.id}
                      onSelect={
                        usable ? () => setSelectedId(method.id) : undefined
                      }
                    />
                    {!usable && option?.reason ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {option.reason}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {hostedMethods.length > 0 ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">
                {methods.length > 0 ? "Or pay another way" : "Ways to pay"}
              </legend>
              {hostedMethods.map((m) => (
                <label
                  key={`${m.provider}:${m.method}`}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    selectedHostedMethod === m.method
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="pay-another-way"
                      checked={selectedHostedMethod === m.method}
                      onChange={() => setSelectedMethod(m.method)}
                    />
                    {m.label}
                  </span>
                  {m.recommended ? (
                    <span className="text-xs text-muted-foreground">
                      Recommended
                    </span>
                  ) : null}
                </label>
              ))}
            </fieldset>
          ) : paymentOptions && !paymentOptions.transacting ? (
            <p className="text-xs text-muted-foreground">
              Sales are paused in {paymentOptions.marketName} right now.
            </p>
          ) : null}

          <AddWalletButton
            onAdded={(method) => {
              queryClient.invalidateQueries({
                queryKey: PAYMENT_METHODS_QUERY_KEY,
              });
              setSelectedId(method.id);
            }}
          />
        </>
      )}

      <button
        type="button"
        disabled={
          (!creditCoversAll && !selectedId && !selectedHostedMethod) ||
          payMutation.isPending
        }
        onClick={() => {
          if (creditCoversAll) {
            payMutation.mutate({ paymentMethodId: null, method: null });
          } else if (selectedId) {
            payMutation.mutate({ paymentMethodId: selectedId, method: null });
          } else if (selectedHostedMethod) {
            payMutation.mutate({
              paymentMethodId: null,
              method: selectedHostedMethod,
            });
          }
        }}
        className="w-full rounded-md p-4 font-bold text-primary-foreground bg-primary text-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {payMutation.isPending
          ? creditCoversAll
            ? "Confirming…"
            : "Starting payment…"
          : creditCoversAll
            ? "Confirm and pay with credit"
            : `Pay ${formatMoney(currency, amount)}`}
      </button>
    </div>
  );
}
