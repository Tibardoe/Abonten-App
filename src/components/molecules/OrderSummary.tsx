import getEventTitle from "@/actions/getEventTitle";

type TicketData = {
  Quantity: string;
  Discount: number;
  Amount: number;
  ticketType: string;
};

type OrderSummaryProp = {
  ticketSummary: TicketData[];
  eventId: string;
  totalAmount: string;
};

export default async function OrderSummary({
  ticketSummary,
  eventId,
  totalAmount,
}: OrderSummaryProp) {
  let message = "";

  const response = await getEventTitle(eventId);

  if (response.status !== 200) {
    message = response.message ?? "An error occurred";
  }

  const eventTitle = response.eventTitle;
  return (
    <div className="border rounded-md shadow-md p-4 space-y-2">
      <div>
        <h1 className="font-bold text-slate-900 text-lg mb-3">Order Summary</h1>

        <div className="flex justify-between items-center font-bold text-slate-900">
          <p>Event Title:</p>

          <p>{eventTitle?.title}</p>
        </div>
      </div>

      {ticketSummary.map((ticket) => (
        <div key={ticket.ticketType} className="mt-4 border-t pt-2">
          <div className="flex justify-between items-center font-semibold text-sm">
            <p>{ticket.ticketType}</p>
            <p>X{ticket.Quantity}</p>
          </div>

          <div className="flex justify-between text-sm opacity-70">
            <p>Discount</p>
            <p>{ticket.Discount}</p>
          </div>

          <div className="flex justify-between text-sm opacity-70">
            <p>Amount</p>
            <p>₵{ticket.Amount}</p>
          </div>
        </div>
      ))}

      <div className="flex justify-between text-sm font-bold">
        <p>Total amount</p>
        <p>₵{totalAmount}</p>
      </div>
    </div>
  );
}
