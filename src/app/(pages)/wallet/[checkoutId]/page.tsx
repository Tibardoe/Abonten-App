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
  //   const checkoutId = searchParams?.checkoutId || "";
  //   const checkoutType = searchParams?.type;

  const { checkoutId } = await params;

  const checkoutType = (await searchParams).type;

  // let notification: string | null;

  let orderSummary = null;
  let eventTitle = "";
  let eventDateAndTime = { date: "", time: "" };
  let eventId = "";
  let ticketSummary: TicketSummaryItem[] = [];
  let totalAmount = 0;
  let promoCode = "";

  if (checkoutId && checkoutType === "ticket") {
    const res = await getTicketCheckout(checkoutId);
    if (res.status === 200 && res.data) {
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
    if (response.status === 200 && response.data) {
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

  // const orderSummaryResponse = await getTicketCheckout(checkoutId);

  // if (orderSummaryResponse.status !== 200) {
  //   notification = orderSummaryResponse.message ?? "An Error occured";
  // }

  // const orderSummary = orderSummaryResponse.data;

  // const event = orderSummary[0].event;

  // const eventTitle = event.title;

  // const eventId = orderSummary[0].event_id;

  // const eventDateAndTime = getFormattedEventDate(
  //   event.starts_at,
  //   event.ends_at,
  //   event.event_dates
  // );

  // const ticketSummary = orderSummary.map((ticket) => ({
  //   type: ticket.ticket_type.type,
  //   unitPrice: ticket.unit_price,
  //   quantity: ticket.quantity,
  //   discount: ticket.discount,
  //   amount: ticket.total_price,
  // }));

  // const totalAmount = orderSummary.reduce(
  //   (sum, ticket) => sum + ticket.total_price,
  //   0
  // );

  // const promoCode = orderSummary[0].promo_code; // Assuming same code for all

  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
        <p className="opacity-60 text-sm">
          Add your mobile money wallet or bank card (and associated account) to
          pay
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
    </div>
  );
}
