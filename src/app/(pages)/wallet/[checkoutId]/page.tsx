import getSubscriptionCheckout from "@/actions/getSubscriptionCheckout";
import getTicketCheckout from "@/actions/getTicketCheckout";
import CheckoutBtn from "@/components/atoms/CheckoutBtn";
import OrderSummary from "@/components/molecules/OrderSummary";
import type { TicketSummaryItem } from "@/types/ticketType";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import ContinueButton from "@/wallet/atoms/ContinueButton";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";

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
  let eventDateAndTime = { date: "", time: "" };
  let eventId = "";
  let ticketSummary: TicketSummaryItem[] = [];
  let totalAmount = 0;
  let promoCode = "";

  if (checkoutId && checkoutType === "ticket") {
    const res = await getTicketCheckout(checkoutId);
    if (res.status === 200 && res.data?.length) {
      orderSummary = res.data;

      const event = orderSummary[0].event;
      eventTitle = event.title;
      eventId = orderSummary[0].event_id;
      eventDateAndTime = getFormattedEventDate(
        event.starts_at,
        event.ends_at,
        event.event_dates,
      );
      ticketSummary = orderSummary.map((ticket) => ({
        type: ticket.ticket_type.type,
        unitPrice: ticket.unit_price,
        quantity: ticket.quantity,
        discount: ticket.discount,
        amount: ticket.total_price,
      }));
      totalAmount = orderSummary.reduce(
        (sum, ticket) => sum + ticket.total_price,
        0,
      );
      promoCode = orderSummary[0].promo_code;
      orderSummary = {
        eventTitle,
        ticketSummary,
        totalAmount,
        type: "ticket" as const,
      };
    }
  }

  if (checkoutId && checkoutType === "subscription") {
    const response = await getSubscriptionCheckout(checkoutId);
    if (response.status === 200 && response.data?.length) {
      const data = response.data;
      orderSummary = {
        planName: data[0].subscription_plan.name,
        amount: data[0].subscription_plan.unit_price,
        features: data[0].features,
        totalAmount: data[0].total_price,
        type: "subscription" as const,
      };
      totalAmount = data[0].total_price;
    }
  }

  return (
    <div className="flex flex-col justify-center gap-5">
      {!orderSummary && checkoutType === "ticket" ? (
        <div>
          <p>Order processed successfully!</p>
        </div>
      ) : (
        <>
          {" "}
          <div>
            <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
            <p className="opacity-60 text-sm">
              Add your mobile money wallet or bank card (and associated account)
              to pay
            </p>
          </div>
          {orderSummary && <OrderSummary orderSummary={orderSummary} />}
          {!checkoutId ? (
            <AddWalletButton />
          ) : totalAmount === 0 && checkoutType === "ticket" ? (
            <CheckoutBtn
              eventId={eventId}
              btnText="Make Payment"
              eventTitle={eventTitle}
              date={eventDateAndTime.date}
              time={eventDateAndTime.time}
              ticketSummary={ticketSummary}
              promoCode={promoCode}
              checkoutId={checkoutId}
              checkoutType={checkoutType}
            />
          ) : (
            <>
              <AddWalletButton />
              <ContinueButton />
            </>
          )}
        </>
      )}
    </div>
  );
}
