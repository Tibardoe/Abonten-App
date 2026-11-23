import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import { TICKET_MODE } from "@/events/ticketMode";
import { formatMoney } from "@abonten/core/formatMoney";
import { MAX_TICKET_ADMITS } from "@abonten/core/groupPricing";
import {
  type TicketAmountMode,
  openAmountRangeHint,
  openAmountRangeProblem,
  openAmountRangeProblemMessage,
} from "@abonten/core/openAmountTickets";
import {
  TICKET_TYPE_NOTE_MAX,
  normalizeTicketTypeNote,
} from "@abonten/core/ticketTypeNote";
import type { Ticket } from "@abonten/types/ticketType";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
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
  handleSingleTicketQuantity?: (quantity: number | null) => void;
  /**
   * Group tickets are switched on for this organizer: a ticket type may
   * admit several people (a Couple: 2), each getting their own ticket.
   */
  groupTicketsEnabled?: boolean;
  /**
   * Ticket types whose amount the buyer chooses are switched on for this
   * organizer (@abonten/core/openAmountTickets): a minimum, a maximum and a
   * step instead of a price.
   */
  openAmountEnabled?: boolean;
};

// An amount field: a number, or null while it is empty.
function readAmount(e: React.ChangeEvent<HTMLInputElement>): number | null {
  const value = e.target.valueAsNumber;
  return Number.isFinite(value) ? value : null;
}

// A cleared quantity field means "no stock limit of its own" (null), not 0:
// with an event capacity set, such a ticket type shares the seats the
// capacity has left (@abonten/core/ticketCapacity).
function readQuantity(e: React.ChangeEvent<HTMLInputElement>): number | null {
  const value = e.target.valueAsNumber;
  return Number.isFinite(value) ? value : null;
}

export default function TicketInputs({
  ticketType,
  singleTicketPrice,
  singleTicketQuantity,
  handleSingleTicket,
  handleSingleTicketQuantity,
  multipleTickets = [],
  handleMultipleTickets,
  groupTicketsEnabled = false,
  openAmountEnabled = false,
}: TicketInputProp) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");
  const format = useFormatter();

  const [date, setDate] = React.useState<Date | undefined>(undefined);

  const [endDate, setEndDate] = React.useState<Date | undefined>(undefined);

  const [quantity, setQuantity] = useState<number | null>(null);

  const [admits, setAdmits] = useState(1);

  const [newCategory, setNewCategory] = useState("");

  const [newPrice, setNewPrice] = useState<number | null>(null);

  // What the ticket includes ("Kids: ages 3–12"), optional.
  const [newNote, setNewNote] = useState("");

  // Fixed price, or an amount the buyer chooses within a range.
  const [amountMode, setAmountMode] = useState<TicketAmountMode>("fixed");
  const [minAmount, setMinAmount] = useState<number | null>(null);
  const [maxAmount, setMaxAmount] = useState<number | null>(null);
  const [amountStep, setAmountStep] = useState<number | null>(1);

  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const { data: currency } = useQuery({
    // Same key as useEventUploadForm.ts's identical fetchCountryMetadata()
    // call, so both share one cache entry instead of firing two requests.
    queryKey: ["user-currency"],
    queryFn: async () => {
      const userCurrency = await fetchCountryMetadata();
      return userCurrency?.currency;
    },
  });

  const isOpen = openAmountEnabled && amountMode === "open";
  const rangeProblem = isOpen
    ? openAmountRangeProblem(
        {
          minAmount: minAmount ?? undefined,
          maxAmount: maxAmount ?? undefined,
          amountStep: amountStep ?? undefined,
        },
        currency ?? "",
      )
    : null;
  // Say what is wrong once all three are typed, not while typing the first.
  const showRangeProblem =
    isOpen &&
    rangeProblem !== null &&
    minAmount !== null &&
    maxAmount !== null &&
    amountStep !== null;
  const priceReady = isOpen ? rangeProblem === null : newPrice !== null;

  const amountFields = [
    {
      id: "ticket-min-amount",
      label: t("openAmountMinLabel"),
      value: minAmount,
      onChange: setMinAmount,
    },
    {
      id: "ticket-max-amount",
      label: t("openAmountMaxLabel"),
      value: maxAmount,
      onChange: setMaxAmount,
    },
    {
      id: "ticket-amount-step",
      label: t("openAmountStepLabel"),
      value: amountStep,
      onChange: setAmountStep,
    },
  ];

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (newCategory && priceReady && date && endDate) {
      // Removal below is keyed on category name, so two ticket types
      // sharing a name would remove each other -- catch that at add time,
      // the same way PromoCodeInputs guards against duplicate codes.
      const normalized = newCategory.trim().toUpperCase();
      const isDuplicate = multipleTickets.some(
        (t) => t.category?.trim().toUpperCase() === normalized,
      );
      if (isDuplicate) {
        setDuplicateError(t("thisCategoryNameHasAlreadyBeen"));
        return;
      }

      const newTicket: Ticket = isOpen
        ? {
            category: newCategory.toUpperCase(),
            // The price shown as "From …" is the lowest amount.
            price: minAmount ?? 0,
            quantity: quantity,
            admits: 1,
            availableFrom: date,
            availableUntil: endDate,
            description: normalizeTicketTypeNote(newNote),
            amountMode: "open",
            minAmount,
            maxAmount,
            amountStep,
          }
        : {
            category: newCategory.toUpperCase(),
            price: newPrice ?? 0,
            quantity: quantity,
            admits: groupTicketsEnabled ? admits : 1,
            availableFrom: date,
            availableUntil: endDate,
            description: normalizeTicketTypeNote(newNote),
          };

      const updatedTickets = [...multipleTickets, newTicket];

      handleMultipleTickets?.(updatedTickets);

      // Clear input fields
      setNewCategory("");
      setQuantity(null);
      setAdmits(1);
      setNewPrice(null);
      setNewNote("");
      setAmountMode("fixed");
      setMinAmount(null);
      setMaxAmount(null);
      setAmountStep(1);
      setDate(undefined);
      setEndDate(undefined);
      setDuplicateError(null);
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
      {ticketType === TICKET_MODE.single && (
        <div className="flex justify-between items-center gap-2">
          <div className="flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
            <span className="text-sm text-green-600">{currency}</span>

            <input
              type="number"
              min={0}
              placeholder={t("fee")}
              value={singleTicketPrice ?? ""}
              onChange={(e) => handleSingleTicket?.(Number(e.target.value))}
              className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
            />
          </div>

          <Input
            type="number"
            min={1}
            placeholder={t("quantityOptional")}
            value={singleTicketQuantity ?? ""}
            onChange={(e) => handleSingleTicketQuantity?.(readQuantity(e))}
          />
        </div>
      )}

      {ticketType === TICKET_MODE.multiple && (
        <div className="space-y-2">
          <div className="flex flex-col gap-2">
            <div className="w-full">
              <Input
                type="text"
                placeholder={t("categoryName")}
                value={newCategory}
                onChange={(e) => {
                  setNewCategory(e.target.value);
                  setDuplicateError(null);
                }}
                aria-invalid={!!duplicateError}
              />
              {duplicateError && (
                <p className="text-destructive text-sm mt-1">
                  {duplicateError}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label
                htmlFor="ticket-note"
                className="text-sm text-muted-foreground"
              >
                {t("ticketNoteLabel")}
              </label>
              <Input
                id="ticket-note"
                type="text"
                maxLength={TICKET_TYPE_NOTE_MAX}
                placeholder={t("ticketNotePlaceholder")}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("ticketNoteHint", { max: TICKET_TYPE_NOTE_MAX })}
              </p>
            </div>

            {openAmountEnabled && (
              <fieldset className="space-y-1">
                <legend className="text-sm text-muted-foreground">
                  {t("priceModeLabel")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={amountMode === "fixed" ? "default" : "outline"}
                    aria-pressed={amountMode === "fixed"}
                    onClick={() => setAmountMode("fixed")}
                  >
                    {t("priceModeFixed")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={amountMode === "open" ? "default" : "outline"}
                    aria-pressed={amountMode === "open"}
                    onClick={() => setAmountMode("open")}
                  >
                    {t("priceModeOpen")}
                  </Button>
                </div>
              </fieldset>
            )}

            {isOpen ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  {amountFields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <label
                        htmlFor={field.id}
                        className="text-sm text-muted-foreground"
                      >
                        {field.label}
                      </label>
                      <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                        <span className="text-sm text-green-600">
                          {currency}
                        </span>
                        <input
                          id={field.id}
                          type="number"
                          min={0}
                          step="any"
                          inputMode="decimal"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(readAmount(e))}
                          aria-invalid={showRangeProblem}
                          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {showRangeProblem && rangeProblem ? (
                  <p role="alert" className="text-sm text-destructive">
                    {openAmountRangeProblemMessage(tc, rangeProblem)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("openAmountEditorHint")}
                  </p>
                )}
                <Input
                  type="number"
                  min={1}
                  placeholder={t("quantityOptional")}
                  value={quantity ?? ""}
                  onChange={(e) => setQuantity(readQuantity(e))}
                />
              </div>
            ) : (
              <div className="flex justify-between items-center gap-2">
                <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 shadow-sm transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                  <span className="text-sm text-green-600">{currency}</span>

                  <input
                    type="number"
                    min={0}
                    placeholder={t("fee")}
                    value={newPrice ?? ""}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
                  />
                </div>

                <Input
                  type="number"
                  min={1}
                  placeholder={t("quantityOptional")}
                  value={quantity ?? ""}
                  onChange={(e) => setQuantity(readQuantity(e))}
                />
              </div>
            )}

            {groupTicketsEnabled && !isOpen && (
              <div className="space-y-1">
                <label
                  htmlFor="ticket-admits"
                  className="text-sm text-muted-foreground"
                >
                  {t("peoplePerTicket")}
                </label>
                <Input
                  id="ticket-admits"
                  type="number"
                  min={1}
                  max={MAX_TICKET_ADMITS}
                  value={admits}
                  onChange={(e) => {
                    const value = e.target.valueAsNumber;
                    setAdmits(
                      Number.isFinite(value)
                        ? Math.min(
                            MAX_TICKET_ADMITS,
                            Math.max(1, Math.floor(value)),
                          )
                        : 1,
                    );
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  {t("peoplePerTicketHint")}
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <InlineDateField
                label={t("availableFrom")}
                date={date}
                onSelect={setDate}
                disabledBefore={new Date()}
              />
              <InlineDateField
                label={t("availableUntil")}
                date={endDate}
                onSelect={setEndDate}
                disabledBefore={date ?? new Date()}
              />
            </div>

            <Button
              className="self-end"
              onClick={handleClick}
              disabled={!newCategory || !priceReady || !date || !endDate}
            >
              {t("add")}
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
                        {t("category")}
                      </span>
                      <span className="text-sm font-semibold">
                        {ticket.category}
                      </span>
                      {ticket.description ? (
                        <span className="text-xs text-muted-foreground">
                          {ticket.description}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-col text-right">
                      <span className="text-sm text-muted-foreground">
                        {ticket.amountMode === "open"
                          ? t("priceModeOpen")
                          : t("price")}
                      </span>
                      <span className="text-sm font-semibold">
                        {ticket.amountMode === "open" &&
                        currency &&
                        ticket.minAmount != null &&
                        ticket.maxAmount != null &&
                        ticket.amountStep != null
                          ? openAmountRangeHint(
                              tc,
                              {
                                minAmount: ticket.minAmount,
                                maxAmount: ticket.maxAmount,
                                amountStep: ticket.amountStep,
                              },
                              currency,
                              locale,
                            )
                          : formatMoney(currency, ticket.price, { locale })}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t("quantity")}</span>
                    <p>{ticket.quantity ?? t("noLimitOfItsOwn")}</p>
                  </div>

                  {(ticket.admits ?? 1) > 1 && (
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{t("peoplePerTicket")}</span>
                      <p>{t("admitsPeople", { count: ticket.admits ?? 1 })}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <MdDateRange className="text-xl" />
                      {t("availableFromUntil", {
                        from: ticket.availableFrom
                          ? format.dateTime(ticket.availableFrom, {
                              dateStyle: "medium",
                            })
                          : "",
                        until: ticket.availableUntil
                          ? format.dateTime(ticket.availableUntil, {
                              dateStyle: "medium",
                            })
                          : "",
                      })}
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
