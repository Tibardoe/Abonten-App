"use client";

import createPaymentAttempt, {
  type PaymentAttemptRow,
} from "@/actions/createPaymentAttempt";
import getUserPaymentMethods from "@/actions/getUserPaymentMethods";
import Notification from "@/components/atoms/Notification";
import { Skeleton } from "@/components/ui/skeleton";
import PaymentMethodCard from "@/wallet/molecules/PaymentMethodCard";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import { PAYMENT_METHODS_QUERY_KEY } from "@/wallet/organisms/WalletManager";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

type PaymentMethodSelectorProps = {
  amount: number;
  currency: string;
} & (
  | { kind: "ticket"; checkoutSessionId: string }
  | { kind: "subscription"; subscriptionCheckoutId: string }
);

/**
 * Shared "select a payment method and pay" step for both ticket and
 * subscription checkout. Adding a new method here happens in place (the
 * popup, not a navigation), so a pending checkout's reservation is never
 * disturbed. There is no payment gateway yet, so "Pay" creates a
 * payment_attempt row and reports that honestly — it never pretends the
 * purchase completed.
 */
export default function PaymentMethodSelector(
  props: PaymentMethodSelectorProps,
) {
  const { amount, currency } = props;
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<PaymentAttemptRow | null>(null);

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

  const payMutation = useMutation({
    mutationFn: (paymentMethodId: string) =>
      props.kind === "ticket"
        ? createPaymentAttempt({
            checkoutSessionId: props.checkoutSessionId,
            paymentMethodId,
          })
        : createPaymentAttempt({
            subscriptionCheckoutId: props.subscriptionCheckoutId,
            paymentMethodId,
          }),
    onSuccess: (response) => {
      if (response.status !== 200) {
        setNotification(response.message);
        return;
      }
      setAttempt(response.data);
    },
    onError: () =>
      setNotification("Failed to start payment. Please try again."),
  });

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

  if (
    attempt &&
    attempt.status !== "failed" &&
    attempt.status !== "cancelled"
  ) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground text-center">
        <p>
          Payment attempt created for {currency} {amount.toFixed(2)} — we're
          setting up secure payment processing. This checkout stays reserved
          until it expires.
        </p>
        <button
          type="button"
          onClick={() => setAttempt(null)}
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
