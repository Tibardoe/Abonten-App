"use client";

import cancelTicketCheckoutSession from "@/actions/cancelTicketCheckoutSession";
import deleteTicketSummaryCheckout from "@/actions/deleteTicketSummaryCheckout";
import generateTicket from "@/actions/generateTicket";
import getUserPendingTicketCheckouts, {
  type PendingCheckoutSession,
} from "@/actions/getUserPendingTicketCheckouts";
import updateTicketCheckoutQuantity from "@/actions/updateTicketCheckoutQuantity";
import Notification from "@/components/atoms/Notification";
import TicketCheckoutSessionCard from "@/components/molecules/TicketCheckoutSessionCard";
import CollapsiblePaymentPanel from "@/components/organisms/CollapsiblePaymentPanel";
import PaymentMethodSelector, {
  type PaymentSelectorStatus,
} from "@/components/organisms/PaymentMethodSelector";
import { computeCheckoutFee } from "@/utils/checkoutPricing";
import { invalidateTicketStatusQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PendingCheckoutsBasketProps = {
  initialSessions: PendingCheckoutSession[];
};

const QUERY_KEY = ["pending-checkouts"];

export default function PendingCheckoutsBasket({
  initialSessions,
}: PendingCheckoutsBasketProps) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const response = await getUserPendingTicketCheckouts();
      return response.status === 200 ? response.sessions : [];
    },
    initialData: initialSessions,
  });

  const sessions = data ?? [];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSessions.map((s) => s.checkoutSessionId)),
  );
  const [pendingLineIds, setPendingLineIds] = useState<Set<string>>(new Set());
  const [removingSessionIds, setRemovingSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [notification, setNotification] = useState<string | null>(null);
  const [isProceeding, setIsProceeding] = useState(false);

  // Purely a UI affordance — separate from selectedIds/quantities/payment
  // state above, so collapsing/expanding it can never touch checkout data.
  const [isPaymentPanelExpanded, setIsPaymentPanelExpanded] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentSelectorStatus>({
    phase: "selecting",
    selectedMethodLabel: null,
  });

  // While a payment attempt is actually in flight, force the panel open and
  // block collapsing it — collapsing mid-payment would hide OTP/approval
  // prompts and could look like the payment silently stalled or invite a
  // duplicate attempt.
  const isPaymentInFlight =
    paymentStatus.phase === "awaiting-popup" ||
    paymentStatus.phase === "awaiting-direct" ||
    paymentStatus.phase === "verifying" ||
    paymentStatus.phase === "pending";

  useEffect(() => {
    if (isPaymentInFlight) setIsPaymentPanelExpanded(true);
  }, [isPaymentInFlight]);

  // Newly-seen sessions (e.g. a fresh checkout just created elsewhere) start
  // selected, matching the old single-session behavior where the only
  // pending checkout was implicitly "what you're paying for".
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const session of sessions) {
        if (!next.has(session.checkoutSessionId)) {
          next.add(session.checkoutSessionId);
          changed = true;
        }
      }
      for (const id of next) {
        if (!sessions.some((s) => s.checkoutSessionId === id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sessions]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 3000);
    return () => clearTimeout(timer);
  }, [notification]);

  const toggleSelected = (checkoutSessionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(checkoutSessionId)) {
        next.delete(checkoutSessionId);
      } else {
        next.add(checkoutSessionId);
      }
      return next;
    });
  };

  const allSelected =
    sessions.length > 0 &&
    sessions.every((s) => selectedIds.has(s.checkoutSessionId));

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === sessions.length
        ? new Set()
        : new Set(sessions.map((s) => s.checkoutSessionId)),
    );
  };

  const handleInvalidSessions = (invalidSessionIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of invalidSessionIds) next.delete(id);
      return next;
    });
    setNotification(
      "One of your selected checkouts has expired. Please review your order.",
    );
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const quantityMutation = useMutation({
    mutationFn: ({
      ticketCheckoutId,
      newQuantity,
    }: {
      ticketCheckoutId: string;
      newQuantity: number;
    }) => updateTicketCheckoutQuantity(ticketCheckoutId, newQuantity),

    // Only the quantity itself moves optimistically — the line's
    // discount/amount and the session's subtotal are left untouched rather
    // than guessed, since promo eligibility for the delta units is
    // server-authoritative (see updateTicketCheckoutQuantity.ts). Those get
    // patched in from the real response the moment it arrives, below.
    onMutate: async ({ ticketCheckoutId, newQuantity }) => {
      setPendingLineIds((prev) => new Set(prev).add(ticketCheckoutId));

      await queryClient.cancelQueries({ queryKey: QUERY_KEY });

      const previousSessions =
        queryClient.getQueryData<PendingCheckoutSession[]>(QUERY_KEY);

      queryClient.setQueryData<PendingCheckoutSession[]>(QUERY_KEY, (old) =>
        old?.map((session) => ({
          ...session,
          lines: session.lines.map((line) =>
            line.ticketCheckoutId === ticketCheckoutId
              ? { ...line, quantity: newQuantity }
              : line,
          ),
        })),
      );

      return { previousSessions };
    },

    onError: (_err, { ticketCheckoutId }, context) => {
      setNotification("Failed to update quantity. Please try again.");
      setPendingLineIds((prev) => {
        const next = new Set(prev);
        next.delete(ticketCheckoutId);
        return next;
      });
      if (context?.previousSessions) {
        queryClient.setQueryData(QUERY_KEY, context.previousSessions);
      }
    },

    onSuccess: (response, { ticketCheckoutId }, context) => {
      setPendingLineIds((prev) => {
        const next = new Set(prev);
        next.delete(ticketCheckoutId);
        return next;
      });

      if (response.status !== 200) {
        setNotification(response.message ?? "Failed to update quantity.");
        if (context?.previousSessions) {
          queryClient.setQueryData(QUERY_KEY, context.previousSessions);
        }
      } else if ("quantity" in response) {
        // updateTicketCheckoutQuantity's inferred return type doesn't
        // discriminate cleanly on `status` alone (its no-op-delta branch
        // also returns status 200), so TS can't narrow these as required
        // from the `"quantity" in response` check above — but the action
        // always returns all three together at runtime.
        const { quantity, discount, amount } = response as {
          quantity: number;
          discount: number;
          amount: number;
        };

        // The server's recalculated discount/amount for this line, patched
        // in immediately rather than waiting for the refetch below.
        queryClient.setQueryData<PendingCheckoutSession[]>(QUERY_KEY, (old) =>
          old?.map((session) => {
            if (
              !session.lines.some(
                (l) => l.ticketCheckoutId === ticketCheckoutId,
              )
            ) {
              return session;
            }
            const lines = session.lines.map((line) =>
              line.ticketCheckoutId === ticketCheckoutId
                ? { ...line, quantity, discount, amount }
                : line,
            );
            return {
              ...session,
              lines,
              sessionSubtotal: lines.reduce((sum, l) => sum + l.amount, 0),
            };
          }),
        );
      }

      // The server is the source of truth for the recalculated pricing
      // (promo eligibility, availability) — refetch rather than fully trust
      // the patch above.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      router.refresh();
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: (ticketCheckoutId: string) =>
      deleteTicketSummaryCheckout(ticketCheckoutId),

    onMutate: async (ticketCheckoutId) => {
      setPendingLineIds((prev) => new Set(prev).add(ticketCheckoutId));

      await queryClient.cancelQueries({ queryKey: QUERY_KEY });

      const previousSessions =
        queryClient.getQueryData<PendingCheckoutSession[]>(QUERY_KEY);

      queryClient.setQueryData<PendingCheckoutSession[]>(QUERY_KEY, (old) =>
        old
          ?.map((session) => {
            const lines = session.lines.filter(
              (line) => line.ticketCheckoutId !== ticketCheckoutId,
            );
            return {
              ...session,
              lines,
              sessionSubtotal: lines.reduce((sum, l) => sum + l.amount, 0),
            };
          })
          .filter((session) => session.lines.length > 0),
      );

      return { previousSessions };
    },

    onError: (_err, _ticketCheckoutId, context) => {
      setNotification("Failed to remove item. Please try again.");
      if (context?.previousSessions) {
        queryClient.setQueryData(QUERY_KEY, context.previousSessions);
      }
    },

    onSuccess: (response, _ticketCheckoutId, context) => {
      if (response.status !== 200) {
        setNotification(response.message ?? "Failed to remove item.");
        if (context?.previousSessions) {
          queryClient.setQueryData(QUERY_KEY, context.previousSessions);
        }
      }
    },

    onSettled: (_data, _err, ticketCheckoutId) => {
      setPendingLineIds((prev) => {
        const next = new Set(prev);
        next.delete(ticketCheckoutId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      router.refresh();
    },
  });

  const removeSessionMutation = useMutation({
    mutationFn: (checkoutSessionId: string) =>
      cancelTicketCheckoutSession(checkoutSessionId),

    onMutate: async (checkoutSessionId) => {
      setRemovingSessionIds((prev) => new Set(prev).add(checkoutSessionId));

      await queryClient.cancelQueries({ queryKey: QUERY_KEY });

      const previousSessions =
        queryClient.getQueryData<PendingCheckoutSession[]>(QUERY_KEY);
      const wasSelected = selectedIds.has(checkoutSessionId);

      queryClient.setQueryData<PendingCheckoutSession[]>(QUERY_KEY, (old) =>
        old?.filter(
          (session) => session.checkoutSessionId !== checkoutSessionId,
        ),
      );

      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(checkoutSessionId);
        return next;
      });

      return { previousSessions, wasSelected };
    },

    onError: (_err, checkoutSessionId, context) => {
      setNotification("Failed to remove checkout. Please try again.");
      if (context?.previousSessions) {
        queryClient.setQueryData(QUERY_KEY, context.previousSessions);
      }
      if (context?.wasSelected) {
        setSelectedIds((prev) => new Set(prev).add(checkoutSessionId));
      }
    },

    onSuccess: (response, checkoutSessionId, context) => {
      if (response.status !== 200) {
        setNotification(response.message ?? "Failed to remove checkout.");
        if (context?.previousSessions) {
          queryClient.setQueryData(QUERY_KEY, context.previousSessions);
        }
        if (context?.wasSelected) {
          setSelectedIds((prev) => new Set(prev).add(checkoutSessionId));
        }
      }
    },

    onSettled: (_data, _err, checkoutSessionId) => {
      setRemovingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(checkoutSessionId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      router.refresh();
    },
  });

  const handleExpired = (checkoutSessionId: string) => {
    setNotification("A pending checkout just expired.");
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(checkoutSessionId);
      return next;
    });
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const selectedSessions = sessions.filter((s) =>
    selectedIds.has(s.checkoutSessionId),
  );

  const selectedLines = selectedSessions.flatMap((s) => s.lines);
  const selectedGrossSubtotal = selectedLines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const selectedDiscount = selectedLines.reduce(
    (sum, line) => sum + line.discount,
    0,
  );
  const selectedTotal = selectedLines.reduce(
    (sum, line) => sum + line.amount,
    0,
  );
  // Same 2% service fee CheckoutModal.tsx previews before the checkout is
  // even created — computed here (and again, authoritatively, in
  // createPaymentAttempt.ts) so what's shown here matches what gets charged.
  const selectedFee = computeCheckoutFee(selectedTotal);
  const selectedGrandTotal = selectedTotal + selectedFee;
  const currency = selectedLines[0]?.currency ?? "";

  const allSelectedAreFree =
    selectedSessions.length > 0 &&
    selectedSessions.every((s) => s.sessionSubtotal === 0);

  const handleProceed = async () => {
    if (!allSelectedAreFree) return;

    setIsProceeding(true);

    const results: { eventTitle: string; ok: boolean; message?: string }[] = [];

    for (const session of selectedSessions) {
      const response = await generateTicket(session.checkoutSessionId);
      results.push({
        eventTitle: session.eventTitle,
        ok: response.status === 200,
        message: response.message,
      });
    }

    const failed = results.filter((r) => !r.ok);
    const succeeded = results.filter((r) => r.ok);

    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    if (succeeded.length > 0) {
      // A newly-issued ticket affects the organizer's attendance list and
      // dashboard stats too, not just this basket — same cache family
      // cancelUserTicket invalidates, since both are ticket-status changes.
      invalidateTicketStatusQueries(queryClient);
    }
    setIsProceeding(false);

    if (failed.length === 0) {
      router.push("/manage/my-events");
      return;
    }

    // Partial (or total) failure — e.g. a session expired mid-click, or was
    // already completed in another tab. Sessions that DID succeed are
    // already 'paid' server-side and will drop out of the basket on the
    // refetch above; failed ones stay pending and retryable. Don't navigate
    // away, so the user can see what still needs attention.
    setNotification(
      failed.length === results.length
        ? (failed[0].message ?? "Something went wrong.")
        : `${succeeded.length} of ${results.length} completed. "${failed[0].eventTitle}" failed: ${failed[0].message ?? "unknown error"}`,
    );
    router.refresh();
  };

  if (sessions.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>No pending checkouts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-36 md:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-lg md:text-xl">Order Summary</h2>
        {sessions.length > 1 && (
          <button
            type="button"
            onClick={toggleSelectAll}
            className="text-xs font-medium text-primary underline"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>
      {sessions.length > 1 && (
        <p className="text-xs text-muted-foreground -mt-3">
          Select the tickets you want to pay for.
        </p>
      )}

      {sessions.map((session) => (
        <TicketCheckoutSessionCard
          key={session.checkoutSessionId}
          session={session}
          selected={selectedIds.has(session.checkoutSessionId)}
          onToggleSelected={() => toggleSelected(session.checkoutSessionId)}
          onQuantityChange={(ticketCheckoutId, newQuantity) =>
            quantityMutation.mutate({ ticketCheckoutId, newQuantity })
          }
          onDeleteLine={(ticketCheckoutId) =>
            deleteLineMutation.mutate(ticketCheckoutId)
          }
          onRemoveSession={(checkoutSessionId) =>
            removeSessionMutation.mutate(checkoutSessionId)
          }
          onExpired={handleExpired}
          pendingLineIds={pendingLineIds}
          isRemoving={removingSessionIds.has(session.checkoutSessionId)}
        />
      ))}

      <div className="border border-border rounded-2xl shadow-lg p-6 space-y-2 bg-card text-card-foreground">
        <p className="text-xs text-muted-foreground">
          {selectedSessions.length} checkout
          {selectedSessions.length === 1 ? "" : "s"} selected (
          {selectedLines.reduce((sum, line) => sum + line.quantity, 0)} ticket
          {selectedLines.reduce((sum, line) => sum + line.quantity, 0) === 1
            ? ""
            : "s"}
          )
        </p>
        <div className="flex justify-between text-sm text-muted-foreground">
          <p>Selected subtotal</p>
          <p>
            {currency} {selectedGrossSubtotal.toFixed(2)}
          </p>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <p>Discount</p>
          <p>
            -{currency} {selectedDiscount.toFixed(2)}
          </p>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <p>
            Fee <span className="text-xs text-muted-foreground">(2%)</span>
          </p>
          <p>
            {currency} {selectedFee.toFixed(2)}
          </p>
        </div>
        <div className="flex justify-between font-bold text-base pt-2 border-t border-border">
          <p>Total</p>
          <p>
            {currency} {selectedGrandTotal.toFixed(2)}
          </p>
        </div>
      </div>

      <CollapsiblePaymentPanel
        isExpanded={isPaymentPanelExpanded}
        onToggle={() => setIsPaymentPanelExpanded((prev) => !prev)}
        toggleDisabled={isPaymentInFlight}
        totalLabel={`${currency} ${selectedGrandTotal.toFixed(2)}`.trim()}
        statusText={
          selectedSessions.length === 0
            ? "No checkout selected"
            : allSelectedAreFree
              ? "Free — ready to confirm"
              : (paymentStatus.selectedMethodLabel ?? "Select a payment method")
        }
      >
        {selectedSessions.length > 0 && !allSelectedAreFree ? (
          <div className="space-y-3 pt-2">
            <PaymentMethodSelector
              kind="ticket"
              checkoutSessionIds={[...selectedIds]}
              onInvalidSessions={handleInvalidSessions}
              onStatusChange={setPaymentStatus}
            />
          </div>
        ) : (
          <button
            type="button"
            disabled={!allSelectedAreFree || isProceeding}
            onClick={handleProceed}
            className="w-full rounded-md p-4 font-bold text-primary-foreground bg-primary text-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProceeding ? "Processing..." : "Proceed to Payment"}
          </button>
        )}
      </CollapsiblePaymentPanel>

      {notification && <Notification notification={notification} />}
    </div>
  );
}
