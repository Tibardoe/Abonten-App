import getSubscriptionCheckout from "@/actions/getSubscriptionCheckout";
import getTicketCheckout from "@/actions/getTicketCheckout";
import CheckoutBtn from "@/components/atoms/CheckoutBtn";
import CheckoutExpiryBanner from "@/components/molecules/CheckoutExpiryBanner";
import OrderSummary from "@/components/molecules/OrderSummary";
import type {
  CheckoutSessionStatus,
  TicketSummaryItem,
} from "@/types/ticketType";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import ContinueButton from "@/wallet/atoms/ContinueButton";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  params,
  searchParams,
}: {
  params: Promise<{ checkoutId: string }>;
  searchParams: Promise<{ type: string }>;
}) {
  const { checkoutId } = await params;

  const checkoutType = (await searchParams).type;

  let orderSummary = null;
  let eventTitle = "";
  let eventCode = "";
  let eventDateAndTime = { date: "", time: "" };
  let eventId = "";
  let ticketSummary: TicketSummaryItem[] = [];
  let totalAmount = 0;
  let sessionStatus: CheckoutSessionStatus | null = null;
  let expiresAt: string | null = null;

  if (checkoutId && checkoutType === "ticket") {
    const res = await getTicketCheckout(checkoutId);
    if (res.status === 200 && res.data?.length) {
      const allRows = res.data;

      // A checkout session groups one row per ticket-type line item, and
      // getTicketCheckout self-heals expiry on every read — so rows here
      // already reflect an accurate status. The overall session state is
      // derived from those rows: any 'pending' line means the checkout is
      // still active; otherwise it's 'paid' if anything actually went
      // through, and 'expired' (covering both the 'expired' and
      // 'cancelled' row statuses) if nothing did.
      const pendingRows = allRows.filter((row) => row.status === "pending");
      const paidRows = allRows.filter((row) => row.status === "paid");

      sessionStatus =
        pendingRows.length > 0
          ? "pending"
          : paidRows.length > 0
            ? "paid"
            : "expired";

      const relevantRows = sessionStatus === "pending" ? pendingRows : paidRows;

      const event = allRows[0].event;

      eventTitle = event.title;
      eventCode = event.event_code;
      eventId = allRows[0].event_id;
      eventDateAndTime = getFormattedEventDate(
        event.starts_at,
        event.ends_at,
        event.event_occurrence,
      );
      expiresAt = pendingRows[0]?.expires_at ?? null;

      ticketSummary = relevantRows.map((ticket) => ({
        ticketCheckoutId: ticket.id,
        type: ticket.ticket_type.type,
        unitPrice: ticket.unit_price,
        quantity: ticket.quantity,
        discount: ticket.discount,
        amount: ticket.total_price,
        currency: ticket.ticket_type.currency,
      }));
      totalAmount = relevantRows.reduce(
        (sum, ticket) => sum + ticket.total_price,
        0,
      );
      orderSummary = {
        eventTitle,
        eventCode,
        ticketSummary,
        totalAmount,
        status: sessionStatus,
        expiresAt,
        type: "ticket" as const,
      };
    }
  }

  if (checkoutId && checkoutType === "subscription") {
    const response = await getSubscriptionCheckout(checkoutId);
    if (response.status === 200 && response.data?.length) {
      const data = response.data[0];

      sessionStatus =
        data.status === "pending"
          ? "pending"
          : data.status === "paid"
            ? "paid"
            : "expired";
      expiresAt = data.status === "pending" ? data.expires_at : null;

      orderSummary = {
        planName: data.subscription_plan.name,
        amount: data.subscription_plan.unit_price,
        features: data.features,
        totalAmount: data.total_price,
        status: sessionStatus,
        expiresAt,
        type: "subscription" as const,
      };
      totalAmount = data.total_price;
    }
  }

  const isPending = sessionStatus === "pending";
  const isPaid = sessionStatus === "paid";
  const isExpiredOrCancelled = sessionStatus === "expired";

  return (
    <div className="flex flex-col justify-center gap-5">
      {!orderSummary && checkoutType === "ticket" ? (
        <div>
          <p>Order processed successfully!</p>
        </div>
      ) : (
        <>
          <div>
            <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
            <p className="opacity-60 text-sm">
              Add your mobile money wallet or bank card (and associated account)
              to pay
            </p>
          </div>

          {isPaid && (
            <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary text-center">
              Purchase complete —{" "}
              <Link href="/manage/my-events" className="underline">
                view your tickets
              </Link>
              .
            </div>
          )}

          {isExpiredOrCancelled && (
            <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive text-center">
              <p>This checkout has expired and can no longer be completed.</p>
              <Link
                href={
                  checkoutType === "ticket" && eventCode
                    ? `/events/${eventCode.toLowerCase()}`
                    : "/plans"
                }
                className="inline-block underline font-medium"
              >
                Start a new checkout
              </Link>
            </div>
          )}

          {isPending && expiresAt && (
            <CheckoutExpiryBanner expiresAt={expiresAt} />
          )}

          {orderSummary &&
            !(checkoutType === "ticket" && isExpiredOrCancelled) && (
              <OrderSummary
                orderSummary={orderSummary}
                checkoutId={checkoutId}
              />
            )}

          {isPending &&
            (!checkoutId ? (
              <AddWalletButton />
            ) : totalAmount === 0 && checkoutType === "ticket" ? (
              <CheckoutBtn
                eventId={eventId}
                btnText="Make Payment"
                eventTitle={eventTitle}
                date={eventDateAndTime.date}
                time={eventDateAndTime.time}
                checkoutId={checkoutId}
              />
            ) : (
              <>
                <AddWalletButton />
                <ContinueButton />
              </>
            ))}
        </>
      )}
    </div>
  );
}
