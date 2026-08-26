import DateTimeSelectorBtn from "@/components/atoms/DateTimeSelectorBtn";
import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PostInput from "@/components/atoms/PostInput";
import PromoCodeBtn from "@/components/atoms/PromoCodeBtn";
import CategoryFilter from "@/components/molecules/CategoryFilter";
import DateTimePicker from "@/components/molecules/DateTimePicker";
import PromoCodeInputs from "@/components/molecules/PromoCodeInputs";
import TicketInputs from "@/components/molecules/TicketInputs";
import TicketType from "@/components/molecules/TicketType";
import TypeFilter from "@/components/molecules/TypeFilter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { useEventUploadForm } from "@/hooks/useEventUploadForm";
import PlaceSearchSelect from "@/places/molecules/PlaceSearchSelect";
import { useEffect, useRef } from "react";

type EventUploadFormFieldsProps = Pick<
  ReturnType<typeof useEventUploadForm>,
  | "form"
  | "control"
  | "selectedAddress"
  | "setSelectedAddress"
  | "addressInputRef"
  | "handleSelectCoordinates"
  | "dateType"
  | "setDateType"
  | "handleDateAndTime"
  | "initialDateRangeForPicker"
  | "initialDateEntriesForPicker"
  | "ticket"
  | "setTicket"
  | "checked"
  | "handleChecked"
  | "singleTicket"
  | "handleSingleTicket"
  | "singleTicketQuantity"
  | "handleSingleTicketQuantity"
  | "multipleTickets"
  | "handleMultipleTickets"
  | "handlePromoCodesChange"
  | "promoCodes"
  | "showPromoCodeFormPopup"
  | "handlePromoCodeFormPopup"
  | "category"
  | "setCategory"
  | "types"
  | "handleType"
  | "handleSubmit"
  | "onSubmit"
  | "selectedPlaceId"
  | "selectedPlaceName"
  | "handleSelectPlace"
  | "clearSelectedPlace"
  | "isPlacePreselected"
  | "hasAttemptedSubmit"
  | "invalidSection"
> & { className?: string };

// The event-details fields shared by every step-2 (details) screen of the
// event upload flow. Previously pasted twice (once per desktop/mobile
// modal) with identical fields, validation messages and handlers.
//
// Section order follows a "what -> when/where -> details -> tickets ->
// promo" hierarchy. Promotion (featuring an event) intentionally has no
// field here at all -- it now only happens after creation, via Manage ->
// Events -> Promotion.
export default function EventUploadFormFields({
  form,
  control,
  selectedAddress,
  setSelectedAddress,
  addressInputRef,
  handleSelectCoordinates,
  dateType,
  setDateType,
  handleDateAndTime,
  initialDateRangeForPicker,
  initialDateEntriesForPicker,
  ticket,
  setTicket,
  checked,
  handleChecked,
  singleTicket,
  handleSingleTicket,
  singleTicketQuantity,
  handleSingleTicketQuantity,
  multipleTickets,
  handleMultipleTickets,
  handlePromoCodesChange,
  promoCodes,
  showPromoCodeFormPopup,
  handlePromoCodeFormPopup,
  category,
  setCategory,
  types,
  handleType,
  handleSubmit,
  onSubmit,
  selectedPlaceId,
  selectedPlaceName,
  handleSelectPlace,
  clearSelectedPlace,
  isPlacePreselected,
  hasAttemptedSubmit,
  invalidSection,
  className,
}: EventUploadFormFieldsProps) {
  const dateSectionRef = useRef<HTMLDivElement>(null);
  const locationSectionRef = useRef<HTMLDivElement>(null);
  const ticketSectionRef = useRef<HTMLDivElement>(null);

  // Points the organizer at whichever section a failed submit's manual
  // (non-RHF) validation blamed -- otherwise a 3-second toast is the only
  // clue, and the offending section may already be scrolled out of view.
  useEffect(() => {
    if (!invalidSection) return;
    const target = {
      date: dateSectionRef,
      location: locationSectionRef,
      tickets: ticketSectionRef,
    }[invalidSection];
    target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [invalidSection]);

  return (
    <Form {...form}>
      <form className={className} onSubmit={handleSubmit(onSubmit)}>
        <div className="space-y-6 py-5 font-normal">
          {/* Event basics -- what is the event? */}
          <div className="space-y-4 text-sm">
            <FormField
              control={control}
              name="title"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <PostInput
                      type="text"
                      inputPlaceholder="Title"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-sm" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="description"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <PostInput
                      type="text"
                      inputPlaceholder="Description"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-sm" />
                </FormItem>
              )}
            />

            <CategoryFilter handleCategory={setCategory} category={category} />
            {hasAttemptedSubmit && category === "" && (
              <p className="text-destructive text-sm">Select event category</p>
            )}

            <TypeFilter
              selectedTypes={types}
              selectedCategory={category}
              handleType={handleType}
            />
            {hasAttemptedSubmit && types.length === 0 && (
              <p className="text-destructive text-sm">
                Select at least one type for event
              </p>
            )}
          </div>

          {/* Date and time -- when is it? */}
          <div ref={dateSectionRef} className="space-y-4 text-sm">
            <h2>Date & Time</h2>
            <div className="grid grid-cols-2 gap-4">
              <DateTimeSelectorBtn
                dateType="single"
                currentType={dateType}
                title="Single/Range"
                text="One date or continuous range"
                onClick={setDateType}
              />

              <DateTimeSelectorBtn
                dateType="specific"
                currentType={dateType}
                title="Multiple Dates"
                text="Set specific non-consecutive dates"
                onClick={setDateType}
              />
            </div>

            <DateTimePicker
              handleDateAndTime={handleDateAndTime}
              dateType={dateType}
              initialRange={initialDateRangeForPicker}
              initialEntries={initialDateEntriesForPicker}
            />
          </div>

          {/* Location -- where is it? */}
          <div ref={locationSectionRef} className="space-y-4 text-sm">
            <h2>Location</h2>

            <PostAutoComplete
              ref={addressInputRef}
              address={{ address: setSelectedAddress }}
              onSelectCoordinates={handleSelectCoordinates}
              value={selectedAddress}
              placeholderText={{
                text: "Location",
                svgUrl: "/assets/images/location.svg",
              }}
            />
            {hasAttemptedSubmit && selectedAddress === "" && (
              <p className="text-destructive text-sm">Location required</p>
            )}

            {/* Venue / Place (optional) -- an alternative to typing the address
              above: pick an existing Abonten Place instead, which fills the
              address field for you. Hidden entirely when the venue is already
              locked in (opened from a place's own "+ Add Upcoming Event"
              button), per the Places spec. */}
            {!isPlacePreselected && (
              <PlaceSearchSelect
                selectedPlaceId={selectedPlaceId}
                selectedPlaceName={selectedPlaceName}
                onSelect={handleSelectPlace}
                onClear={clearSelectedPlace}
              />
            )}
          </div>

          {/* Event details -- capacity and website */}
          <div className="space-y-4 text-sm">
            <h2>Event Details</h2>

            <FormField
              control={control}
              name="capacity"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <PostInput
                      type="number"
                      inputPlaceholder="Capacity"
                      {...field}
                      onChange={(e) =>
                        field.onChange(
                          (e.target as HTMLInputElement).valueAsNumber,
                        )
                      }
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    Leave blank for unlimited capacity
                  </p>
                  <FormMessage className="text-sm" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="website_url"
              render={({ field }) => (
                <FormItem className="space-y-0">
                  <FormControl>
                    <PostInput
                      type="text"
                      inputPlaceholder="Website (optional)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-sm" />
                </FormItem>
              )}
            />
          </div>

          {/* Tickets -- how can people attend? */}
          <div ref={ticketSectionRef} className="space-y-3 text-sm font-normal">
            <h2>Tickets</h2>

            <TicketType
              handleTicket={setTicket}
              ticket={ticket}
              checked={checked}
              handleChecked={handleChecked}
            />

            {ticket === "Single Ticket Type" && (
              <TicketInputs
                ticketType={ticket}
                singleTicketPrice={singleTicket}
                handleSingleTicket={handleSingleTicket}
                singleTicketQuantity={singleTicketQuantity}
                handleSingleTicketQuantity={handleSingleTicketQuantity}
              />
            )}

            {ticket === "Multiple Ticket Types" && (
              <TicketInputs
                ticketType={ticket}
                multipleTickets={multipleTickets}
                handleMultipleTickets={handleMultipleTickets}
              />
            )}
          </div>

          {/* Promo codes -- optional, relates directly to ticket purchasing */}
          <div className="space-y-2 text-sm font-normal">
            <PromoCodeBtn
              ticket={ticket}
              handlePromoCodeFormPopup={handlePromoCodeFormPopup}
            />

            {showPromoCodeFormPopup && (
              <PromoCodeInputs
                onPromoCodesChange={handlePromoCodesChange}
                initialPromoCodes={promoCodes}
              />
            )}
          </div>

          <hr className="border-border" />
        </div>
      </form>
    </Form>
  );
}
