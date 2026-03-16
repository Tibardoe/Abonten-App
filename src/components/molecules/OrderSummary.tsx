// "use client";

// import deleteTicketSummaryCheckout from "@/actions/deleteTicketSummaryCheckout";
// import type {
//   SubscriptionSummaryProps,
//   TicketSummaryItem,
//   TicketSummaryProps,
// } from "@/types/ticketType";
// import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// import { RiDeleteBin6Line } from "react-icons/ri";

// type OrderSummaryProps = {
//   orderSummary: TicketSummaryProps | SubscriptionSummaryProps;
// };

// export default function OrderSummary({ orderSummary }: OrderSummaryProps) {
//   const queryClient = useQueryClient();

//   const { data } = useQuery({
//     queryKey: ["checkout-summary"],
//     initialData: orderSummary,
//   });

//   const summary = data;

//   // 1. Define the mutation
//   const { mutate, isPending } = useMutation({
//     mutationFn: (ticketCheckoutId: string) =>
//       deleteTicketSummaryCheckout(ticketCheckoutId),

//     // 2. Optimistic Update Logic
//     onMutate: async (ticketCheckoutId) => {
//       // Cancel any outgoing refetches so they don't overwrite our optimistic update
//       await queryClient.cancelQueries({ queryKey: ["checkout-summary"] });

//       // Snapshot the previous value
//       const previousSummary = queryClient.getQueryData<
//         TicketSummaryProps | SubscriptionSummaryProps
//       >(["checkout-summary"]);

//       // Optimistically update to the new value
//       queryClient.setQueryData(
//         ["checkout-summary"],
//         (old: TicketSummaryProps | SubscriptionSummaryProps | undefined) => {
//           if (!old || old.type !== "ticket") return old;

//           return {
//             ...old,
//             ticketSummary: old.ticketSummary.filter(
//               (t: TicketSummaryItem) => t.ticketCheckoutId !== ticketCheckoutId,
//             ),
//           };
//         },
//       );

//       // Return context object with the snapshotted value
//       return { previousSummary };
//     },

//     // 3. Rollback on failure
//     onError: (
//       err,
//       ticketCheckoutId,
//       context: {
//         previousSummary?: TicketSummaryProps | SubscriptionSummaryProps;
//       },
//     ) => {
//       queryClient.setQueryData(["checkout-summary"], context?.previousSummary);
//       alert("Failed to delete item. Please try again.");
//     },

//     // 4. Refetch after success or failure to sync with server
//     onSettled: () => {
//       queryClient.invalidateQueries({ queryKey: ["checkout-summary"] });
//     },
//   });

//   if (orderSummary.type === "ticket") {
//     const { eventTitle, ticketSummary, totalAmount } = orderSummary;

//     return (
//       <div className="border rounded-2xl shadow-lg p-6 space-y-4 bg-white">
//         <div className="flex justify-between items-center">
//           <h2 className="font-semibold text-lg text-gray-800">Order Summary</h2>
//           <span className="text-sm text-gray-500">
//             #{ticketSummary.length} Tickets
//           </span>
//         </div>

//         <div className="flex justify-between text-sm border-b pb-2">
//           <p className="text-gray-600 font-medium">Event</p>
//           <p className="text-gray-900 font-semibold">{eventTitle}</p>
//         </div>

//         {ticketSummary.map((ticket) => (
//           <div
//             key={ticket.type}
//             className="border rounded-md px-4 py-3 bg-gray-50 shadow-sm"
//           >
//             <div className="flex justify-between text-sm font-semibold text-gray-700">
//               <p>Type: {ticket.type}</p>
//               <p>Qty: {ticket.quantity}</p>
//             </div>
//             <div className="flex justify-between text-xs mt-1 text-gray-500">
//               <p>Actual Price:</p>
//               <p>
//                 {ticket.currency} {ticket.unitPrice}
//               </p>
//             </div>
//             <div className="flex justify-between text-xs text-gray-500">
//               <p>Discount:</p>
//               <p>
//                 {ticket.currency} {ticket.discount}
//               </p>
//             </div>
//             <div className="flex justify-between text-xs text-gray-500">
//               <p>Subtotal:</p>
//               <p>
//                 {ticket.currency} {ticket.amount}
//               </p>
//             </div>

//             <div className="flex justify-end">
//               <button
//                 type="button"
//                 className="mt-2 hover:opacity-70 transition-opacity"
//                 disabled={isPending}
//                 onClick={() => mutate(ticket.ticketCheckoutId)}
//               >
//                 <RiDeleteBin6Line className="text-red-500" />
//               </button>
//             </div>
//           </div>
//         ))}

//         <div className="flex justify-between pt-2 border-t font-bold text-gray-800">
//           <p>Total Amount</p>
//           <p>
//             {ticketSummary[0]?.currency ?? ""} {totalAmount}
//           </p>
//         </div>
//       </div>
//     );
//   }

//   // Subscription summary
//   if (orderSummary.type === "subscription") {
//     const { planName, totalAmount } = orderSummary;
//     return (
//       <div className="border rounded-2xl shadow-lg p-6 space-y-4 bg-white">
//         <div className="flex justify-between items-center">
//           <h2 className="font-semibold text-lg text-gray-800">
//             Subscription Summary
//           </h2>
//         </div>

//         <div className="text-sm text-gray-600">
//           <p className="font-medium">Plan:</p>
//           <p className="text-gray-900 font-semibold">{planName}</p>
//         </div>

//         {/* <div className="text-sm text-gray-600">
//           <p className="font-medium">Features:</p>
//           <ul className="list-disc pl-5">
//             {features.map((f, i) => (
//               <li key={i.toString()}>{f}</li>
//             ))}
//           </ul>
//         </div> */}

//         <div className="flex justify-between pt-2 border-t font-bold text-gray-800">
//           <p>Total Amount</p>
//           <p>₵{totalAmount}</p>
//         </div>
//       </div>
//     );
//   }

//   return null;
// }

"use client";

import deleteTicketSummaryCheckout from "@/actions/deleteTicketSummaryCheckout";
import type {
  SubscriptionSummaryProps,
  TicketSummaryItem,
  TicketSummaryProps,
} from "@/types/ticketType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RiDeleteBin6Line } from "react-icons/ri";

type OrderSummaryProps = {
  orderSummary: TicketSummaryProps | SubscriptionSummaryProps;
};

export default function OrderSummary({ orderSummary }: OrderSummaryProps) {
  const queryClient = useQueryClient();

  // React Query becomes the source of truth
  const { data } = useQuery({
    queryKey: ["checkout-summary"],
    queryFn: async () => orderSummary, // fallback (server already fetched)
    initialData: orderSummary,
  });

  // Mutation with optimistic update
  const { mutate, isPending } = useMutation({
    mutationFn: (ticketCheckoutId: string) =>
      deleteTicketSummaryCheckout(ticketCheckoutId),

    onMutate: async (ticketCheckoutId) => {
      await queryClient.cancelQueries({ queryKey: ["checkout-summary"] });

      const previousSummary = queryClient.getQueryData<
        TicketSummaryProps | SubscriptionSummaryProps
      >(["checkout-summary"]);

      queryClient.setQueryData(
        ["checkout-summary"],
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
      // err,
      // ticketCheckoutId,
      context: {
        previousSummary?: TicketSummaryProps | SubscriptionSummaryProps;
      },
    ) => {
      queryClient.setQueryData(["checkout-summary"], context?.previousSummary);
      alert("Failed to delete item. Please try again.");
    },

    onSuccess: () => {},
  });

  if (!data) return null;

  // Ticket summary
  if (data.type === "ticket") {
    const { eventTitle, ticketSummary, totalAmount } = data;

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
            key={ticket.ticketCheckoutId}
            className="border rounded-md px-4 py-3 bg-gray-50 shadow-sm"
          >
            <div className="flex justify-between text-sm font-semibold text-gray-700">
              <p>Type: {ticket.type}</p>
              <p>Qty: {ticket.quantity}</p>
            </div>

            <div className="flex justify-between text-xs mt-1 text-gray-500">
              <p>Actual Price:</p>
              <p>
                {ticket.currency} {ticket.unitPrice}
              </p>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <p>Discount:</p>
              <p>
                {ticket.currency} {ticket.discount}
              </p>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
              <p>Subtotal:</p>
              <p>
                {ticket.currency} {ticket.amount}
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={isPending}
                className="mt-2 hover:opacity-70 transition-opacity disabled:opacity-40"
                onClick={() => mutate(ticket.ticketCheckoutId)}
              >
                <RiDeleteBin6Line className="text-red-500" />
              </button>
            </div>
          </div>
        ))}

        <div className="flex justify-between pt-2 border-t font-bold text-gray-800">
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

        <div className="flex justify-between pt-2 border-t font-bold text-gray-800">
          <p>Total Amount</p>
          <p>₵{totalAmount}</p>
        </div>
      </div>
    );
  }

  return null;
}
