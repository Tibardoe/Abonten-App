"use client";

import createMultiCheckoutPaymentAttempt from "@/actions/createMultiCheckoutPaymentAttempt";
import createPaymentAttempt, {
  type PaymentAttemptRow,
} from "@/actions/createPaymentAttempt";
import getUserPaymentMethods from "@/actions/getUserPaymentMethods";
import prepareMultiCheckoutPayment from "@/actions/prepareMultiCheckoutPayment";
import Notification from "@/components/atoms/Notification";
import { Skeleton } from "@/components/ui/skeleton";
import PaymentMethodCard from "@/wallet/molecules/PaymentMethodCard";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import { PAYMENT_METHODS_QUERY_KEY } from "@/wallet/organisms/WalletManager";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

type PaymentMethodSelectorProps =
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
    };

/**
 * Shared "select a payment method and pay" step for both ticket and
 * subscription checkout. Adding a new method here happens in place (the
 * popup, not a navigation), so a pending checkout's reservation is never
 * disturbed. There is no payment gateway yet, so "Pay" creates payment_attempt
 * row(s) and reports that honestly — it never pretends the purchase completed.
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<PaymentAttemptRow[] | null>(null);

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
    props.kind === "subscription"
      ? props.amount
      : prepared?.status === 200
        ? prepared.grandTotal
        : 0;
  const currency =
    props.kind === "subscription"
      ? props.currency
      : prepared?.status === 200
        ? prepared.currency
        : "";
  const sessionCount = props.kind === "ticket" ? sortedSessionIds.length : 1;

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
      setAttempts(response.data.attempts);
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
      setAttempts([response.data]);
    },
    onError: () =>
      setNotification("Failed to start payment. Please try again."),
  });

  const payMutation =
    props.kind === "ticket" ? ticketPayMutation : subscriptionPayMutation;

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

  const activeAttempts = attempts?.filter(
    (a) => a.status !== "failed" && a.status !== "cancelled",
  );

  if (activeAttempts && activeAttempts.length > 0) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
        <p>
          Payment attempt created for {currency} {amount.toFixed(2)}
          {sessionCount > 1 ? ` across ${sessionCount} checkouts` : ""} — we're
          setting up secure payment processing. This checkout stays reserved
          until it expires.
        </p>
        <button
          type="button"
          onClick={() => setAttempts(null)}
          className="underline font-medium"
        >
          Choose a different payment method
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
          ? "Processing..."
          : `Pay ${currency} ${amount.toFixed(2)}`}
      </button>

      {notification && <Notification notification={notification} />}
    </div>
  );
}
