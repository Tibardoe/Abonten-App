"use client";

import updateEventTicketTypes from "@/actions/updateEventTicketTypes";
import ManagePromoCodesButton from "@/components/atoms/ManagePromoCodesButton";
import EditEventFormFields from "@/components/molecules/EditEventFormFields";
import TicketInputs from "@/components/molecules/TicketInputs";
import TicketType from "@/components/molecules/TicketType";
import { useEventEditForm } from "@/hooks/useEventEditForm";
import { useToast } from "@/hooks/useToast";
import type { Ticket } from "@abonten/types/ticketType";
import { useState } from "react";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) — same convention ManagePlaceDetailsSection.tsx uses
type ManagedEventTicketType = any;

type ManageEventDetailsSectionProps = {
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  event: any;
  hasConfirmedParticipation: boolean;
  onSaved: () => void;
};

type TicketMode = "Free" | "Single Ticket Type" | "Multiple Ticket Types";

function inferInitialTicketState(ticketTypes: ManagedEventTicketType[]): {
  mode: TicketMode;
  singleTicket: number | null;
  singleTicketQuantity: number | null;
  multipleTickets: Ticket[];
  currency: string;
} {
  const currency = ticketTypes[0]?.currency ?? "GHS";

  if (ticketTypes.length === 1 && ticketTypes[0].type === "FREE") {
    return {
      mode: "Free",
      singleTicket: null,
      singleTicketQuantity: null,
      multipleTickets: [],
      currency,
    };
  }

  if (ticketTypes.length === 1 && ticketTypes[0].type === "SINGLE TICKET") {
    return {
      mode: "Single Ticket Type",
      singleTicket: ticketTypes[0].price,
      singleTicketQuantity: ticketTypes[0].quantity,
      multipleTickets: [],
      currency,
    };
  }

  return {
    mode: "Multiple Ticket Types",
    singleTicket: null,
    singleTicketQuantity: null,
    multipleTickets: ticketTypes.map((t) => ({
      category: t.type,
      price: t.price,
      quantity: t.quantity,
      availableFrom: t.available_from ? new Date(t.available_from) : undefined,
      availableUntil: t.available_until
        ? new Date(t.available_until)
        : undefined,
    })),
    currency,
  };
}

// Details/Edit tab of the Unified Event Management page. Reuses
// useEventEditForm + EditEventFormFields directly for the core fields
// (title/description/location/dates/category/website/capacity/flyer) — the
// exact same hook/component EditEventModal.tsx used to render inside a
// modal, now embedded in a page instead (EditEventModal.tsx itself has been
// retired, see EditEventButton.tsx). Adds the two capabilities event editing
// never had before: a ticket-types editor and a promo-codes entry point,
// both locked entirely once the event has confirmed tickets (Part 6/7 of
// the Unified Event Management spec).
export default function ManageEventDetailsSection({
  event,
  hasConfirmedParticipation,
  onSaved,
}: ManageEventDetailsSectionProps) {
  const toast = useToast();

  const eventEditForm = useEventEditForm({
    eventId: event.id,
    onSuccess: onSaved,
  });

  const {
    isSubmitting,
    isResolvingLocation,
    isFetchingEvent,
    isReady,
    handleSubmit,
    onSubmit,
  } = eventEditForm;

  const initialTicketState = inferInitialTicketState(event.ticket_type ?? []);

  const [ticketMode, setTicketMode] = useState<TicketMode | null>(
    initialTicketState.mode,
  );
  const [ticketRegistrationChecked, setTicketRegistrationChecked] =
    useState(false);
  const [singleTicket, setSingleTicket] = useState<number | null>(
    initialTicketState.singleTicket,
  );
  const [singleTicketQuantity, setSingleTicketQuantity] = useState<
    number | null
  >(initialTicketState.singleTicketQuantity);
  const [multipleTickets, setMultipleTickets] = useState<Ticket[]>(
    initialTicketState.multipleTickets,
  );
  const [isSavingTickets, setIsSavingTickets] = useState(false);

  const handleSaveTicketTypes = async () => {
    setIsSavingTickets(true);
    try {
      const response = await updateEventTicketTypes({
        eventId: event.id,
        freeEvents: ticketMode,
        currency: initialTicketState.currency,
        singleTicket,
        singleTicketQuantity,
        multipleTickets,
      });

      if (response.status === 200) {
        toast.success("✅ Ticket types updated successfully!");
        onSaved();
      } else {
        toast.error(`❌ ${response.message}`);
      }
    } finally {
      setIsSavingTickets(false);
    }
  };

  const saveButtonLabel = isResolvingLocation
    ? "Resolving location..."
    : isSubmitting
      ? "Saving..."
      : "Save changes";

  // Wait for prefill to actually finish (isReady), not just for the raw
  // fetch to settle (isFetchingEvent) -- there's one render in between where
  // the query has resolved but the hook's own hydration effect hasn't run
  // yet, so initialRange/initialEntries are still undefined. DateTimePicker
  // seeds its internal date state from those props only once, at mount
  // (useState's lazy initializer), so mounting it during that gap
  // permanently locked its date/time in as empty even once the real values
  // arrived a moment later -- title/description/category didn't show this
  // because they're driven by react-hook-form's reset() or passed straight
  // through as live props instead of being seeded once.
  if (isFetchingEvent || !isReady) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
        Loading event...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <EditEventFormFields
          {...eventEditForm}
          restrictedLocked={hasConfirmedParticipation}
        />

        <button
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={isSubmitting || !isReady}
          className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saveButtonLabel}
        </button>
      </div>

      <hr className="border-border" />

      <div className="space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Ticket Types</h2>
          <p className="text-sm text-muted-foreground">
            {hasConfirmedParticipation
              ? "This event already has confirmed tickets, so ticket types can no longer be changed."
              : "Free entry, a single paid ticket, or several ticket categories."}
          </p>
        </div>

        <fieldset
          disabled={hasConfirmedParticipation}
          className={
            hasConfirmedParticipation ? "opacity-60 space-y-4" : "space-y-4"
          }
        >
          <TicketType
            ticket={ticketMode}
            handleTicket={(value) => setTicketMode(value as TicketMode)}
            checked={ticketRegistrationChecked}
            handleChecked={setTicketRegistrationChecked}
          />

          {ticketMode === "Single Ticket Type" && (
            <TicketInputs
              ticketType={ticketMode}
              singleTicketPrice={singleTicket}
              handleSingleTicket={setSingleTicket}
              singleTicketQuantity={singleTicketQuantity}
              handleSingleTicketQuantity={setSingleTicketQuantity}
            />
          )}

          {ticketMode === "Multiple Ticket Types" && (
            <TicketInputs
              ticketType={ticketMode}
              multipleTickets={multipleTickets}
              handleMultipleTickets={setMultipleTickets}
            />
          )}
        </fieldset>

        {!hasConfirmedParticipation && (
          <button
            type="button"
            onClick={handleSaveTicketTypes}
            disabled={isSavingTickets || !ticketMode}
            className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {isSavingTickets ? "Saving..." : "Save ticket types"}
          </button>
        )}
      </div>

      <hr className="border-border" />

      <div>
        <h2 className="font-semibold text-lg mb-2">Promo Codes</h2>
        <ManagePromoCodesButton eventId={event.id} />
      </div>
    </div>
  );
}
