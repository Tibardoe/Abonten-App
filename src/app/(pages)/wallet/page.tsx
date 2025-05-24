import getEventTitle from "@/actions/getEventTitle";
import getTicketCheckout from "@/actions/getTicketCheckout";
import CheckoutBtn from "@/components/atoms/CheckoutBtn";
import OrderSummary from "@/components/molecules/OrderSummary";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import ContinueButton from "@/wallet/atoms/ContinueButton";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";

export default async function page({
  searchParams,
}: {
  searchParams?: {
    checkoutId?: string;
  };
}) {
  const checkoutId = searchParams?.checkoutId || "";

  let notification: string | null;

  const orderSummaryResponse = await getTicketCheckout(checkoutId);

  if (orderSummaryResponse.status !== 200) {
    notification = orderSummaryResponse.message ?? "An Error occured";
  }

  const orderSummary = orderSummaryResponse.data;

  const event = orderSummary[0].event;

  const eventTitle = event.title;

  const eventId = orderSummary[0].event_id;

  const eventDateAndTime = getFormattedEventDate(
    event.starts_at,
    event.ends_at,
    event.event_dates,
  );

  const ticketSummary = orderSummary.map((ticket) => ({
    type: ticket.ticket_type.type,
    unitPrice: ticket.unit_price,
    quantity: ticket.quantity,
    discount: ticket.discount,
    amount: ticket.total_price,
  }));

  const totalAmount = orderSummary.reduce(
    (sum, ticket) => sum + ticket.total_price,
    0,
  );

  const promoCode = orderSummary[0].promo_code; // Assuming same code for all

  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
        <p className="opacity-60 text-sm">
          Add your mobile money wallet or bank card (and associated account) to
          pay
        </p>
      </div>

      <OrderSummary
        orderSummary={{
          eventTitle,
          ticketSummary,
          totalAmount,
        }}
      />

      {totalAmount === 0 ? (
        <CheckoutBtn
          eventId={eventId}
          btnText="Make Payment"
          eventTitle={eventTitle}
          date={eventDateAndTime.date}
          time={eventDateAndTime.time}
          ticketSummary={ticketSummary}
          promoCode={promoCode}
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
