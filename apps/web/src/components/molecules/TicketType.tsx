import { TICKET_MODE, type TicketMode } from "@/events/ticketMode";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import { cn } from "../lib/utils";

type TicketProp = {
  /** A TICKET_MODE code, never a label. */
  ticket: string | null;
  handleTicket: (mode: TicketMode) => void;
  checked: boolean;
  handleChecked: (state: boolean) => void;
};

export default function TicketType({
  handleTicket,
  ticket,
  checked,
  handleChecked,
}: TicketProp) {
  const t = useTranslations("common");

  const [showTicketDropdown, setShowTicketDropdown] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShowTicketDropdown((prevState) => !prevState)}
        className="flex gap-2 justify-between w-full items-center"
      >
        <h2>{t("ticketing")}</h2>

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
              onClick={() => handleTicket(TICKET_MODE.free)}
              className="flex justify-between items-center w-full text-sm"
            >
              {t("free")}
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-border">
                <span
                  className={cn("bg-primary w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== TICKET_MODE.free,
                    flex: ticket === TICKET_MODE.free,
                  })}
                />
              </span>
            </button>

            {ticket === TICKET_MODE.free && (
              <div className="flex items-center gap-2 text-foreground">
                <button
                  type="button"
                  onClick={() => handleChecked(!checked)}
                  className="flex justify-between items-center text-sm"
                >
                  <span className="w-[14px] h-[14px] rounded-sm grid place-items-center border border-border">
                    {checked && (
                      <span className="w-full h-full bg-primary rounded-sm relative">
                        <span className="w-[5px] h-[10px] border-r-2 border-b-[3px] border-primary-foreground rotate-45 absolute top-[10%] left-1/2 -translate-x-1/2" />
                      </span>
                    )}
                  </span>
                </button>
                <p className="text-xs">
                  {t("requireInterestedUsersToRegisterFor")}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleTicket(TICKET_MODE.single)}
              className="flex justify-between items-center w-full text-sm"
            >
              {t("singleTicketType")}
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-border">
                <span
                  className={cn("bg-primary w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== TICKET_MODE.single,
                    flex: ticket === TICKET_MODE.single,
                  })}
                />
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleTicket(TICKET_MODE.multiple)}
              className="flex justify-between items-center w-full text-sm"
            >
              {t("multipleTicketTypes")}
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-border">
                <span
                  className={cn("bg-primary w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== TICKET_MODE.multiple,
                    flex: ticket === TICKET_MODE.multiple,
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
