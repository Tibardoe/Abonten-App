import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import type { Ticket } from "@/types/ticketType";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { useState } from "react";
import { LiaTimesSolid } from "react-icons/lia";
import { MdDateRange } from "react-icons/md";
import { InlineDateField } from "../atoms/InlineDateField";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type TicketInputProp = {
  ticketType: string;
  singleTicketPrice?: number | null;
  singleTicketQuantity?: number | null;
  handleSingleTicket?: (amount: number) => void;
  multipleTickets?: Ticket[];
  handleMultipleTickets?: (tickets: Ticket[]) => void;
  handleSingleTicketQuantity?: (quantity: number) => void;
};

export default function TicketInputs({
  ticketType,
  singleTicketPrice,
  singleTicketQuantity,
  handleSingleTicket,
  handleSingleTicketQuantity,
  multipleTickets = [],
  handleMultipleTickets,
}: TicketInputProp) {
  const [date, setDate] = React.useState<Date | undefined>(undefined);

  const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);

  const [quantity, setQuantity] = useState<number | null>(null);

  const [newCategory, setNewCategory] = useState("");

  const [newPrice, setNewPrice] = useState<number | null>(null);

  const { data: currency } = useQuery({
    // Same key as useEventUploadForm.ts's identical fetchCountryMetadata()
    // call, so both share one cache entry instead of firing two requests.
    queryKey: ["user-currency"],
    queryFn: async () => {
      const userCurrency = await fetchCountryMetadata();
      return userCurrency?.currency;
    },
  });

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (
      newCategory &&
      newPrice !== null &&
      quantity !== null &&
      date &&
      endDate
    ) {
      const newTicket = {
        category: newCategory.toUpperCase(),
        price: newPrice,
        quantity: quantity,
        availableFrom: date,
        availableUntil: endDate,
      };

      const updatedTickets = [...multipleTickets, newTicket];

      handleMultipleTickets?.(updatedTickets);

      // Clear input fields
      setNewCategory("");
      setQuantity(null);
      setNewPrice(null);
      setDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleRemove = (
    event: React.MouseEvent<HTMLButtonElement>,
    ticket: string,
  ) => {
    event?.preventDefault();

    const updatedTickets = multipleTickets.filter((t) => t.category !== ticket);

    handleMultipleTickets?.(updatedTickets); // Send to parent
  };

  return (
    <>
      {ticketType === "Single Ticket Type" && (
        <div className="flex justify-between items-center gap-2">
          <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
            <span className="text-sm text-green-600">{currency}</span>

            <input
              type="number"
              placeholder="Fee"
              value={singleTicketPrice ?? ""}
              onChange={(e) => handleSingleTicket?.(Number(e.target.value))}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>

          <Input
            type="number"
            placeholder="Quantity"
            value={singleTicketQuantity ?? ""}
            onChange={(e) =>
              handleSingleTicketQuantity?.(Number(e.target.value))
            }
          />
        </div>
      )}

      {ticketType === "Multiple Ticket Types" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2">
            <div className="w-full">
              <Input
                type="text"
                placeholder="Category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
            </div>

            <div className="flex justify-between items-center gap-2">
              <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                <span className="text-sm text-green-600">{currency}</span>

                <input
                  type="number"
                  placeholder="Fee"
                  value={newPrice ?? ""}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
                />
              </div>

              <Input
                type="number"
                placeholder="Quantity"
                value={quantity ?? ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InlineDateField
                label="Available From"
                date={date}
                onSelect={setDate}
                disabledBefore={new Date()}
              />
              <InlineDateField
                label="Available Until"
                date={endDate}
                onSelect={setEndDate}
                disabledBefore={date ?? new Date()}
              />
            </div>

            <Button
              className="self-end"
              onClick={handleClick}
              disabled={
                !newCategory ||
                newPrice === null ||
                quantity === null ||
                !date ||
                !endDate
              }
            >
              Add
            </Button>
          </div>

          {multipleTickets.length > 0 && (
            <ul className="space-y-2">
              {multipleTickets.map((ticket) => (
                <li
                  key={ticket.category}
                  className="border border-border rounded-md p-3 shadow-md bg-card text-card-foreground flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-sm text-muted-foreground">
                        Category
                      </span>
                      <span className="text-sm font-semibold">
                        {ticket.category}
                      </span>
                    </div>

                    <div className="flex flex-col text-right">
                      <span className="text-sm text-muted-foreground">
                        Price
                      </span>
                      <span className="text-sm font-semibold">
                        {currency} {ticket.price}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Quantity</span>
                    <p>{ticket.quantity}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <MdDateRange className="text-xl" />
                      {ticket.availableFrom?.toLocaleDateString()} &rarr;{" "}
                      {ticket.availableUntil?.toLocaleDateString()}
                    </div>

                    <button
                      type="button"
                      onClick={(event) =>
                        handleRemove(event, ticket.category ?? "")
                      }
                    >
                      <LiaTimesSolid className="text-xl" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
