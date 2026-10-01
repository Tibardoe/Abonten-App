import { useTranslations } from "next-intl";
import { useState } from "react";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";
import { cn } from "../lib/utils";

type TicketProp = {
  ticket: string | null;
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
              onClick={() => handleTicket(t("free"))}
              className="flex justify-between items-center w-full text-sm"
            >
              {t("free")}
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-border">
                <span
                  className={cn("bg-primary w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== t("free"),
                    flex: ticket === t("free"),
                  })}
                />
              </span>
            </button>

            {ticket === t("free") && (
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
              onClick={() => handleTicket(t("singleTicketType"))}
              className="flex justify-between items-center w-full text-sm"
            >
              {t("singleTicketType")}
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-border">
                <span
                  className={cn("bg-primary w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== t("singleTicketType"),
                    flex: ticket === t("singleTicketType"),
                  })}
                />
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleTicket(t("multipleTicketTypes"))}
              className="flex justify-between items-center w-full text-sm"
            >
              {t("multipleTicketTypes")}
              <span className="w-[20px] h-[20px] rounded-full grid place-items-center border border-border">
                <span
                  className={cn("bg-primary w-[10px] h-[10px] rounded-full", {
                    hidden: ticket !== t("multipleTicketTypes"),
                    flex: ticket === t("multipleTicketTypes"),
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
