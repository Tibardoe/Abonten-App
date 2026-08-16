"use client";

import deleteTicketSummaryCheckout from "@/actions/deleteTicketSummaryCheckout";
import type {
  SubscriptionSummaryProps,
  TicketSummaryItem,
  TicketSummaryProps,
} from "@/types/ticketType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { RiDeleteBin6Line } from "react-icons/ri";

type OrderSummaryProps = {
  orderSummary: TicketSummaryProps | SubscriptionSummaryProps;
  checkoutId: string;
};

export default function OrderSummary({
  orderSummary,
  checkoutId,
}: OrderSummaryProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const queryKey = ["checkout-summary", checkoutId];

  // React Query becomes the source of truth
  const { data } = useQuery({
    queryKey,
    queryFn: async () => orderSummary, // fallback (server already fetched)
    initialData: orderSummary,
  });

  // Mutation with optimistic update
  const { mutate, isPending } = useMutation({
    mutationFn: (ticketCheckoutId: string) =>
      deleteTicketSummaryCheckout(ticketCheckoutId),

    onMutate: async (ticketCheckoutId) => {
      await queryClient.cancelQueries({ queryKey });

      const previousSummary = queryClient.getQueryData<
        TicketSummaryProps | SubscriptionSummaryProps
      >(queryKey);

      queryClient.setQueryData(
        queryKey,
        (old: TicketSummaryProps | SubscriptionSummaryProps | undefined) => {
          if (!old || old.type !== "ticket") return old;

          return {
            ...old,
            ticketSummary: old.ticketSummary.filter(
              (t: TicketSummaryItem) => t.ticketCheckoutId !== ticketCheckoutId,
            ),
          };
        },
      );

      return { previousSummary };
    },

    onError: (
      _err,
      _ticketCheckoutId,
      onMutateResult:
        | {
            previousSummary?: TicketSummaryProps | SubscriptionSummaryProps;
          }
        | undefined,
    ) => {
      queryClient.setQueryData(queryKey, onMutateResult?.previousSummary);
      alert("Failed to delete item. Please try again.");
    },

    // The wallet page's "Make Payment"/Continue CTA is computed server-side
    // from the checkout total, which just changed — refresh so it reflects
    // the removed line item instead of staying stale until next navigation.
    onSuccess: () => {
      router.refresh();
    },
  });

  if (!data) return null;

  const isCheckoutPending = data.status === "pending";

  // Ticket summary
  if (data.type === "ticket") {
    const { eventTitle, ticketSummary, totalAmount } = data;

    return (
      <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg text-card-foreground">
            Order Summary
          </h2>
          <span className="text-sm text-muted-foreground">
            #{ticketSummary.length} Tickets
          </span>
        </div>

        <div className="flex justify-between text-sm border-b border-border pb-2">
          <p className="text-muted-foreground font-medium">Event</p>
          <p className="text-card-foreground font-semibold">{eventTitle}</p>
        </div>

        {ticketSummary.map((ticket) => (
          <div
            key={ticket.ticketCheckoutId}
            className="border border-border rounded-md px-4 py-3 bg-muted shadow-sm"
          >
            <div className="flex justify-between text-sm font-semibold text-foreground">
              <p>Type: {ticket.type}</p>
              <p>Qty: {ticket.quantity}</p>
            </div>

            <div className="flex justify-between text-xs mt-1 text-muted-foreground">
              <p>Actual Price:</p>
              <p>
                {ticket.currency} {ticket.unitPrice}
              </p>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <p>Discount:</p>
              <p>
                {ticket.currency} {ticket.discount}
              </p>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <p>Subtotal:</p>
              <p>
                {ticket.currency} {ticket.amount}
              </p>
            </div>

            {isCheckoutPending && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isPending}
                  className="mt-2 hover:opacity-70 transition-opacity disabled:opacity-40"
                  onClick={() => mutate(ticket.ticketCheckoutId)}
                >
                  <RiDeleteBin6Line className="text-destructive" />
                </button>
              </div>
            )}
          </div>
        ))}

        <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
          <p>Total Amount</p>
          <p>
            {ticketSummary[0]?.currency ?? ""} {totalAmount}
          </p>
        </div>
      </div>
    );
  }

  // Subscription summary
  if (data.type === "subscription") {
    const { planName, totalAmount } = data;

    return (
      <div className="border border-border rounded-2xl shadow-lg p-6 space-y-4 bg-card text-card-foreground">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg text-card-foreground">
            Subscription Summary
          </h2>
        </div>

        <div className="text-sm text-muted-foreground">
          <p className="font-medium">Plan:</p>
          <p className="text-card-foreground font-semibold">{planName}</p>
        </div>

        <div className="flex justify-between pt-2 border-t border-border font-bold text-card-foreground">
          <p>Total Amount</p>
          <p>₵{totalAmount}</p>
        </div>
      </div>
    );
  }

  return null;
}
