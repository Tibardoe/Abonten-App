import { useState } from "react";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import { cn } from "../lib/utils";

type TicketProp = {
  ticket: string;
  handleTicket: (categoryName: string) => void;
};

export default function TicketType({ handleTicket, ticket }: TicketProp) {
  const [showTicketDropdown, setShowTicketDropdown] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShowTicketDropdown((prevState) => !prevState)}
        className="flex gap-2 justify-between w-full items-center"
      >
        <h2 className="font-semibold text-slate-700">Ticketing</h2>

        {showTicketDropdown ? (
          <IoIosArrowUp className="text-2xl" />
        ) : (
          <IoIosArrowDown className="text-2xl" />
        )}
      </button>

      {showTicketDropdown && (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => handleTicket("Free")}
            className="flex justify-between items-center w-full text-sm"
          >
            Free
            <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-black">
              <span
                className={cn("bg-black w-[10px] h-[10px] rounded-full", {
                  hidden: ticket !== "Free",
                  flex: ticket === "Free",
                })}
              />
            </span>
          </button>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleTicket("Single Ticket Type")}
              className="flex justify-between items-center w-full text-sm"
            >
              Sinlge Ticket Type
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-black">
                <span
                  className={cn("bg-black w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== "Single Ticket Type",
                    flex: ticket === "Single Ticket Type",
                  })}
                />
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleTicket("Multiple Ticket Types")}
              className="flex justify-between items-center w-full text-sm"
            >
              Multiple Ticket Types
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-black">
                <span
                  className={cn("bg-black w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== "Multiple Ticket Types",
                    flex: ticket === "Multiple Ticket Types",
                  })}
                />
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
