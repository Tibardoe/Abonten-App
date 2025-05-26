import { useState } from "react";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import { cn } from "../lib/utils";

type TicketProp = {
  ticket: string;
  handleTicket: (categoryName: string) => void;
  checked: boolean;
  handleChecked: (state: boolean) => void;
};

export default function TicketType({
  handleTicket,
  ticket,
  checked,
  handleChecked,
}: TicketProp) {
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
          <div className="flex flex-col gap-2">
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

            {ticket === "Free" && (
              <div className="flex items-center gap-2 text-gray-700">
                <button
                  type="button"
                  onClick={() => handleChecked(!checked)}
                  className="flex justify-between items-center text-sm"
                >
                  <span className="w-[14px] h-[14px] rounded-sm grid place-items-center border border-black">
                    {checked && (
                      <span className="w-full h-full bg-black rounded-sm relative">
                        <span className="w-[5px] h-[10px] border-r-2 border-b-[3px] border-white rotate-45 absolute top-[10%] left-1/2 -translate-x-1/2" />
                      </span>
                    )}
                  </span>
                </button>
                <p className="text-xs">
                  Require interested users to register for this event
                </p>
              </div>
            )}
          </div>

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
