"use client";

import createMultiCheckoutPaymentAttempt from "@/actions/createMultiCheckoutPaymentAttempt";
import createPaymentAttempt from "@/actions/createPaymentAttempt";
import getUserPaymentMethods from "@/actions/getUserPaymentMethods";
import prepareMultiCheckoutPayment from "@/actions/prepareMultiCheckoutPayment";
import retryPaymentFulfillment from "@/actions/retryPaymentFulfillment";
import submitPaystackChargeOtp from "@/actions/submitPaystackChargeOtp";
import verifyPaystackPayment from "@/actions/verifyPaystackPayment";
import Notification from "@/components/atoms/Notification";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PAYSTACK_INLINE_SCRIPT_SRC,
  useResumePaystackPopup,
} from "@/hooks/usePaystackPopup";
import {
  invalidateEventListQueries,
  invalidatePlaceListQueries,
  invalidateTicketStatusQueries,
} from "@/utils/mutationQueryInvalidation";
import { getFulfillmentMessage } from "@/utils/paymentStatusCopy";
import { PENDING_CHECKOUTS_QUERY_KEY } from "@/utils/queryKeys";
import PaymentMethodCard, {
  getPaymentMethodDisplay,
} from "@/wallet/molecules/PaymentMethodCard";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import { PAYMENT_METHODS_QUERY_KEY } from "@/wallet/organisms/WalletManager";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useState } from "react";

type PaymentMethodSelectorProps = (
  | {
      kind: "ticket";
      checkoutSessionIds: string[];
      onInvalidSessions?: (invalidSessionIds: string[]) => void;
    }
  | {
      kind: "subscription";
      subscriptionCheckoutId: string;
      amount: number;
      currency: string;
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

type PaystackPaymentInfo =
  | {
      mode: "popup";
      reference: string;
      accessCode: string;
      authorizationUrl: string;
    }
  | {
      mode: "direct";
      reference: string;
      chargeStatus: string;
      displayMessage?: string;
    };

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
 * Shared "select a payment method and pay" step for both ticket and
 * subscription checkout. The server decides HOW to charge based on the
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
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

  const amount =
    props.kind === "subscription" ||
    props.kind === "promotion" ||
    props.kind === "event-promotion"
      ? props.amount
      : prepared?.status === 200
        ? prepared.grandTotal
        : 0;
  const currency =
    props.kind === "subscription" ||
    props.kind === "promotion" ||
    props.kind === "event-promotion"
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

  useEffect(() => {
    if (selectedId || methods.length === 0) return;
    const defaultMethod = methods.find((m) => m.is_default) ?? methods[0];
    setSelectedId(defaultMethod.id);
  }, [methods, selectedId]);

  const selectedMethod = methods.find((m) => m.id === selectedId) ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only report when the phase or selected wallet actually changes, not on every parent re-render passing a new onStatusChange closure.
  useEffect(() => {
    props.onStatusChange?.({
      phase: uiState.phase,
      selectedMethodLabel: selectedMethod
        ? getPaymentMethodDisplay(selectedMethod).title
        : null,
    });
  }, [uiState.phase, selectedMethod]);

  const handlePaystackInfo = (
    primaryAttemptId: string,
    paystack: PaystackPaymentInfo,
  ) => {
    if (paystack.mode === "popup") {
      setUiState({
        phase: "awaiting-popup",
        primaryAttemptId,
        accessCode: paystack.accessCode,
      });
      return;
    }

    if (
      paystack.chargeStatus === "failed" ||
      paystack.chargeStatus === "success"
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
      chargeStatus: paystack.chargeStatus,
      displayMessage: paystack.displayMessage,
    });
  };

  const ticketPayMutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      createMultiCheckoutPaymentAttempt({
        checkoutSessionIds:
          props.kind === "ticket" ? props.checkoutSessionIds : [],
        paymentMethodId,
      }),
    onSuccess: (response) => {
      if (response.status === 409) {
        setNotification(response.message);
        if (props.kind === "ticket") {
          props.onInvalidSessions?.(response.invalidSessionIds);
        }
        return;
      }
      if (response.status !== 200) {
        setNotification(response.message);
        return;
      }
      handlePaystackInfo(response.data.attempts[0].id, response.data.paystack);
    },
    onError: () =>
      setNotification("Failed to start payment. Please try again."),
  });

  const subscriptionPayMutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      createPaymentAttempt({
        subscriptionCheckoutId:
          props.kind === "subscription" ? props.subscriptionCheckoutId : "",
        paymentMethodId,
      }),
    onSuccess: (response) => {
      if (response.status !== 200) {
        setNotification(response.message);
        return;
      }
      handlePaystackInfo(response.data.id, response.data.paystack);
    },
    onError: () =>
      setNotification("Failed to start payment. Please try again."),
  });

  const promotionPayMutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      createPaymentAttempt({
        placePromotionCheckoutId:
          props.kind === "promotion" ? props.placePromotionCheckoutId : "",
        paymentMethodId,
      }),
    onSuccess: (response) => {
      if (response.status !== 200) {
        setNotification(response.message);
        return;
      }
      handlePaystackInfo(response.data.id, response.data.paystack);
    },
    onError: () =>
      setNotification("Failed to start payment. Please try again."),
  });

  const eventPromotionPayMutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      createPaymentAttempt({
        eventPromotionCheckoutId:
          props.kind === "event-promotion"
            ? props.eventPromotionCheckoutId
            : "",
        paymentMethodId,
      }),
    onSuccess: (response) => {
      if (response.status !== 200) {
        setNotification(response.message);
        return;
      }
      handlePaystackInfo(response.data.id, response.data.paystack);
    },
    onError: () =>
      setNotification("Failed to start payment. Please try again."),
  });

  const payMutation =
    props.kind === "ticket"
      ? ticketPayMutation
      : props.kind === "promotion"
        ? promotionPayMutation
        : props.kind === "event-promotion"
          ? eventPromotionPayMutation
          : subscriptionPayMutation;

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
    } else if (props.kind === "event-promotion") {
      invalidateEventListQueries(queryClient);
    } else if (props.kind === "promotion") {
      invalidatePlaceListQueries(queryClient);
    }
  };

  const verifyMutation = useMutation({
    mutationFn: (primaryAttemptId: string) =>
      verifyPaystackPayment(primaryAttemptId),
    onSuccess: (response, primaryAttemptId) => {
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
    },
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
        setNotification(
          "We're finishing up your payment. Please check back in a moment.",
        );
        return;
      }
      setNotification(
        "message" in response && response.message
          ? response.message
          : "Still couldn't finish this. Please contact support.",
      );
    },
    onError: () =>
      setNotification("Still couldn't finish this. Please contact support."),
  });

  const otpMutation = useMutation({
    mutationFn: (primaryAttemptId: string) =>
      submitPaystackChargeOtp(primaryAttemptId, otp),
    onSuccess: (response, primaryAttemptId) => {
      if (response.status !== 200) {
        setNotification(response.message);
        return;
      }
      setUiState({ phase: "verifying" });
      verifyMutation.mutate(primaryAttemptId);
    },
    onError: () =>
      setNotification("That code didn't work. Please check and try again."),
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
        {notification && <Notification notification={notification} />}
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
      <p className="font-semibold text-sm">Payment method</p>

      {methods.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          You don't have a saved payment method yet.
        </p>
      ) : (
        <div className="space-y-2">
          {methods.map((method) => (
            <PaymentMethodCard
              key={method.id}
              method={method}
              selected={selectedId === method.id}
              onSelect={() => setSelectedId(method.id)}
            />
          ))}
        </div>
      )}

      <AddWalletButton
        onAdded={(method) => {
          queryClient.invalidateQueries({
            queryKey: PAYMENT_METHODS_QUERY_KEY,
          });
          setSelectedId(method.id);
        }}
      />

      <button
        type="button"
        disabled={!selectedId || payMutation.isPending}
        onClick={() => selectedId && payMutation.mutate(selectedId)}
        className="w-full rounded-md p-4 font-bold text-primary-foreground bg-primary text-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {payMutation.isPending
          ? "Starting payment…"
          : `Pay ${currency} ${amount.toFixed(2)}`}
      </button>

      {notification && <Notification notification={notification} />}
    </div>
  );
}
