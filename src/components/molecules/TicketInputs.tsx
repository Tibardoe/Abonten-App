import type { Ticket } from "@/types/ticketType";
import { getUserCurrency } from "@/utils/getUserCurrency";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { useEffect, useState } from "react";
import { LiaTimesSolid } from "react-icons/lia";
import { MdDateRange } from "react-icons/md";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type TicketInputProp = {
  ticketType: string;
  singleTicketPrice?: number | null;
  singleTicketQuantity?: number | null;
  handleSingleTicket?: (amount: number) => void;
  handleMultipleTickets?: (tickets: Ticket[]) => void;
  handleSingleTicketQuantity?: (quantity: number) => void;
};

export default function TicketInputs({
  ticketType,
  singleTicketPrice,
  singleTicketQuantity,
  handleSingleTicket,
  handleSingleTicketQuantity,
  handleMultipleTickets,
}: TicketInputProp) {
  const [date, setDate] = React.useState<Date | undefined>(undefined);

  const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);

  const [quantity, setQuantity] = useState<number | null>(null);

  const [newCategory, setNewCategory] = useState("");

  const [newPrice, setNewPrice] = useState<number | null>(null);

  const [multipleTickets, setMultipleTickets] = useState<
    {
      category: string;
      price: number;
      quantity: number;
      availableFrom: Date;
      availableUntil: Date;
    }[]
  >([]);

  const { data: currency } = useQuery({
    queryKey: ["currency"],
    queryFn: async () => {
      const userCurrency = await getUserCurrency();
      return userCurrency;
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

      setMultipleTickets(updatedTickets);
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
    setMultipleTickets(updatedTickets);

    handleMultipleTickets?.(updatedTickets); // Send to parent
  };

  return (
    <>
      {ticketType === "Single Ticket Type" && (
        <div className="flex justify-between items-center gap-2">
          <div className="flex items-center justify-center gap-2 border rounded-md p-2">
            <span className="text-green-600 text-sm">{currency}</span>

            <input
              type="number"
              placeholder="Fee"
              value={singleTicketPrice ?? ""}
              onChange={(e) => handleSingleTicket?.(Number(e.target.value))}
              className="outline-none text-sm"
            />
          </div>

          <input
            type="number"
            placeholder="Quantity"
            value={singleTicketQuantity ?? ""}
            onChange={(e) =>
              handleSingleTicketQuantity?.(Number(e.target.value))
            }
            className="border w-full p-2 rounded-md text-sm"
          />
        </div>
      )}

      {ticketType === "Multiple Ticket Types" && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2">
            <div className="w-full">
              <input
                type="text"
                placeholder="Category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="border w-full p-2 rounded-md text-sm"
              />
            </div>

            <div className="flex justify-between items-center gap-2">
              <div className="w-full flex items-center justify-center gap-2 border rounded-md p-2">
                <span className="text-green-600 text-sm">{currency}</span>

                <input
                  type="number"
                  placeholder="Fee"
                  value={newPrice ?? ""}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="outline-none text-sm"
                />
              </div>

              <input
                type="number"
                placeholder="Quantity"
                value={quantity ?? ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="border p-2 rounded-md text-sm w-full"
              />
            </div>

            <div className="flex items-center justify-between">
              {/* start date */}
              <Popover>
                <PopoverTrigger className="flex items-center gap-1">
                  <MdDateRange className="text-2xl" />{" "}
                  {date ? (
                    date.toLocaleDateString()
                  ) : (
                    <p className="text-sm font-bold text-gray-600">
                      Available From
                    </p>
                  )}
                </PopoverTrigger>

                <PopoverContent className="space-y-4">
                  <Calendar
                    initialFocus
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-sm font-bold text-gray-600">To</p>

              {/* End date */}
              <Popover>
                <PopoverTrigger className="flex items-center gap-1">
                  <MdDateRange className="text-2xl" />{" "}
                  {endDate ? (
                    endDate.toLocaleDateString()
                  ) : (
                    <p className="text-sm font-bold text-gray-600">
                      Available Until
                    </p>
                  )}
                </PopoverTrigger>

                <PopoverContent className="space-y-4">
                  <Calendar
                    initialFocus
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                  />
                </PopoverContent>
              </Popover>
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
                  className="border rounded-md p-3 shadow-md bg-white flex flex-col gap-2"
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
                      {ticket.availableFrom.toLocaleDateString()} &rarr;{" "}
                      {ticket.availableUntil.toLocaleDateString()}
                    </div>

                    <button
                      type="button"
                      onClick={(event) => handleRemove(event, ticket.category)}
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
