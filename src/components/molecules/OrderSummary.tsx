import type {
  SubscriptionSummaryProps,
  TicketSummaryProps,
} from "@/types/ticketType";

// import getEventTitle from "@/actions/getEventTitle";
// import type { TicketData } from "@/types/ticketType";

// type TicketSummaryItem = {
//   type: string;
//   quantity: number;
//   discount: number;
//   amount: number;
//   unitPrice: string;
// };

// type OrderSummaryProps = {
//   orderSummary: {
//     eventTitle: string;
//     ticketSummary: TicketSummaryItem[];
//     totalAmount: number;
//     type:string
//   };
// };

// export default async function OrderSummary({
//   orderSummary,
// }: OrderSummaryProps) {
//   const { eventTitle, ticketSummary, totalAmount } = orderSummary;

//   return (
//     <div className="border rounded-2xl shadow-lg p-6 space-y-4 bg-white">
//       <div className="flex justify-between items-center">
//         <h2 className="font-semibold text-lg text-gray-800">Order Summary</h2>
//         <span className="text-sm text-gray-500">
//           #{ticketSummary.length} Tickets
//         </span>
//       </div>

//       <div className="flex justify-between text-sm border-b pb-2">
//         <p className="text-gray-600 font-medium">Event</p>
//         <p className="text-gray-900 font-semibold">{eventTitle}</p>
//       </div>

//       {ticketSummary.map((ticket, index) => (
//         <div
//           key={ticket.type}
//           className="border rounded-md px-4 py-3 bg-gray-50 shadow-sm"
//         >
//           <div className="flex justify-between text-sm font-semibold text-gray-700">
//             <p>Type: {ticket.type}</p>
//             <p>Qty: {ticket.quantity}</p>
//           </div>

//           <div className="flex justify-between text-xs mt-1 text-gray-500">
//             <p>Actual Price:</p>
//             <p>₵{ticket.unitPrice}</p>
//           </div>
//           <div className="flex justify-between text-xs text-gray-500">
//             <p>Discount:</p>
//             <p>₵{ticket.discount}</p>
//           </div>
//           <div className="flex justify-between text-xs text-gray-500">
//             <p>Subtotal:</p>
//             <p>₵{ticket.amount}</p>
//           </div>
//         </div>
//       ))}

//       <div className="flex justify-between pt-2 border-t font-bold text-gray-800">
//         <p>Total Amount</p>
//         <p>₵{totalAmount}</p>
//       </div>
//     </div>
//   );
// }

// type TicketSummaryItem = {
//   type: string;
//   quantity: number;
//   discount: number;
//   amount: number;
//   unitPrice: string;
// };

// type TicketSummaryProps = {
//   type: "ticket";
//   eventTitle: string;
//   ticketSummary: TicketSummaryItem[];
//   totalAmount: number;
// };

// type SubscriptionSummaryProps = {
//   type: "subscription";
//   planName: string;
//   amount: number;
//   features: string[];
//   totalAmount: number;
// };

type OrderSummaryProps = {
  orderSummary: TicketSummaryProps | SubscriptionSummaryProps;
};

export default function OrderSummary({ orderSummary }: OrderSummaryProps) {
  if (orderSummary.type === "ticket") {
    const { eventTitle, ticketSummary, totalAmount } = orderSummary;
    return (
      <div className="border rounded-2xl shadow-lg p-6 space-y-4 bg-white">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg text-gray-800">Order Summary</h2>
          <span className="text-sm text-gray-500">
            #{ticketSummary.length} Tickets
          </span>
        </div>

        <div className="flex justify-between text-sm border-b pb-2">
          <p className="text-gray-600 font-medium">Event</p>
          <p className="text-gray-900 font-semibold">{eventTitle}</p>
        </div>

        {ticketSummary.map((ticket) => (
          <div
            key={ticket.type}
            className="border rounded-md px-4 py-3 bg-gray-50 shadow-sm"
          >
            <div className="flex justify-between text-sm font-semibold text-gray-700">
              <p>Type: {ticket.type}</p>
              <p>Qty: {ticket.quantity}</p>
            </div>
            <div className="flex justify-between text-xs mt-1 text-gray-500">
              <p>Actual Price:</p>
              <p>₵{ticket.unitPrice}</p>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <p>Discount:</p>
              <p>₵{ticket.discount}</p>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <p>Subtotal:</p>
              <p>₵{ticket.amount}</p>
            </div>
          </div>
        ))}

        <div className="flex justify-between pt-2 border-t font-bold text-gray-800">
          <p>Total Amount</p>
          <p>₵{totalAmount}</p>
        </div>
      </div>
    );
  }

  // Subscription summary
  if (orderSummary.type === "subscription") {
    const { planName, totalAmount } = orderSummary;
    return (
      <div className="border rounded-2xl shadow-lg p-6 space-y-4 bg-white">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-lg text-gray-800">
            Subscription Summary
          </h2>
        </div>

        <div className="text-sm text-gray-600">
          <p className="font-medium">Plan:</p>
          <p className="text-gray-900 font-semibold">{planName}</p>
        </div>

        {/* <div className="text-sm text-gray-600">
          <p className="font-medium">Features:</p>
          <ul className="list-disc pl-5">
            {features.map((f, i) => (
              <li key={i.toString()}>{f}</li>
            ))}
          </ul>
        </div> */}

        <div className="flex justify-between pt-2 border-t font-bold text-gray-800">
          <p>Total Amount</p>
          <p>₵{totalAmount}</p>
        </div>
      </div>
    );
  }

  return null;
}
