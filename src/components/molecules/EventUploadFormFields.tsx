import DateTimeSelectorBtn from "@/components/atoms/DateTimeSelectorBtn";
import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PostInput from "@/components/atoms/PostInput";
import PromoCodeBtn from "@/components/atoms/PromoCodeBtn";
import CategoryFilter from "@/components/molecules/CategoryFilter";
import DateTimePicker from "@/components/molecules/DateTimePicker";
import PromoCodeInputs from "@/components/molecules/PromoCodeInputs";
import ReceivingAccountForms from "@/components/molecules/ReceivingAccountForms";
import TicketInputs from "@/components/molecules/TicketInputs";
import TicketType from "@/components/molecules/TicketType";
import TypeFilter from "@/components/molecules/TypeFilter";
import type { useEventUploadForm } from "@/hooks/useEventUploadForm";
import PlaceSearchSelect from "@/places/molecules/PlaceSearchSelect";
import { TbWorld } from "react-icons/tb";

type EventUploadFormFieldsProps = Pick<
  ReturnType<typeof useEventUploadForm>,
  | "register"
  | "errors"
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
  | "featured"
  | "handleFeatured"
  | "singleTicket"
  | "handleSingleTicket"
  | "singleTicketQuantity"
  | "handleSingleTicketQuantity"
  | "multipleTickets"
  | "handleMultipleTickets"
  | "receivingAccountForm"
  | "paymentOption"
  | "handlePaymentOption"
  | "selectedNetwork"
  | "handleSelectedNetwork"
  | "showNetworkDropdown"
  | "handleNetworkDropdown"
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
> & { className?: string };

// The event-details fields shared by every step-2 (details) screen of the
// event upload flow. Previously pasted twice (once per desktop/mobile
// modal) with identical fields, validation messages and handlers.
export default function EventUploadFormFields({
  register,
  errors,
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
  featured,
  handleFeatured,
  singleTicket,
  handleSingleTicket,
  singleTicketQuantity,
  handleSingleTicketQuantity,
  multipleTickets,
  handleMultipleTickets,
  receivingAccountForm,
  paymentOption,
  handlePaymentOption,
  selectedNetwork,
  handleSelectedNetwork,
  showNetworkDropdown,
  handleNetworkDropdown,
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
  className,
}: EventUploadFormFieldsProps) {
  return (
    <form className={className} onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-4 py-5 font-normal">
        <PostInput
          type="text"
          inputPlaceholder="Title"
          {...register("title")}
        />
        {errors.title && (
          <p className="text-destructive text-sm">{errors.title.message}</p>
        )}

        <PostInput
          type="text"
          inputPlaceholder="Description"
          {...register("description")}
        />
        {errors.description && (
          <p className="text-destructive text-sm">
            {errors.description.message}
          </p>
        )}

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
        {selectedAddress === "" && (
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

        {/* Date and time */}
        <div className="space-y-4 text-sm">
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

        <div className="space-y-4 text-sm font-normal">
          <div className="space-y-3">
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

            {(ticket === "Single Ticket Type" ||
              ticket === "Multiple Ticket Types") && (
              <ReceivingAccountForms
                form={receivingAccountForm}
                handlePaymentOption={handlePaymentOption}
                paymentOption={paymentOption}
                handleSelectedNetwork={handleSelectedNetwork}
                selectedNetwork={selectedNetwork}
                showNetworkDropdown={showNetworkDropdown}
                setShowNetworkDropdown={handleNetworkDropdown}
              />
            )}
          </div>

          <div className="space-y-2">
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

          <CategoryFilter handleCategory={setCategory} category={category} />
          {category === "" && (
            <p className="text-destructive text-sm">Select event category</p>
          )}

          <TypeFilter
            selectedTypes={types}
            selectedCategory={category}
            handleType={handleType}
          />
          {types.length === 0 && (
            <p className="text-destructive text-sm">
              Select at least one type for event
            </p>
          )}

          <div className="flex justify-between items-center">
            <div className="bg-background border border-input rounded-md">
              <input
                type="text"
                placeholder="Website"
                className="rounded-md p-2 bg-transparent"
                {...register("website_url")}
              />
            </div>

            <TbWorld className="text-2xl" />
          </div>
          {errors.website_url && (
            <p className="text-destructive text-sm">
              {errors.website_url.message}
            </p>
          )}

          <div className="flex justify-between items-center font-semibold text-foreground">
            <span>Capacity</span>

            <input
              type="number"
              placeholder="0 if any"
              {...register("capacity", { valueAsNumber: true })}
              className="border border-input bg-background w-28 p-2 rounded-md"
            />
          </div>
          {errors.capacity && (
            <p className="text-destructive text-sm">
              {errors.capacity.message}
            </p>
          )}

          <label className="flex justify-between items-center font-semibold text-foreground cursor-pointer">
            <span>Feature this event on the homepage banner</span>
            <input
              type="checkbox"
              checked={featured}
              onChange={handleFeatured}
              className="h-5 w-5 accent-primary"
            />
          </label>

          <hr className="border-border" />
        </div>
      </div>
    </form>
  );
}
