"use client";

import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PostInput from "@/components/atoms/PostInput";
import CategoryFilter from "@/components/molecules/CategoryFilter";
import DateTimePicker from "@/components/molecules/DateTimePicker";
import TypeFilter from "@/components/molecules/TypeFilter";
import type { useEventEditForm } from "@/hooks/useEventEditForm";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import Image from "next/image";

type EditEventFormFieldsProps = Pick<
  ReturnType<typeof useEventEditForm>,
  | "register"
  | "errors"
  | "selectedAddress"
  | "setSelectedAddress"
  | "addressInputRef"
  | "handleSelectCoordinates"
  | "dateType"
  | "handleDateAndTime"
  | "initialRange"
  | "initialEntries"
  | "checked"
  | "handleChecked"
  | "category"
  | "setCategory"
  | "types"
  | "handleType"
  | "existingFlyer"
  | "handleFileChange"
  | "handleSubmit"
  | "onSubmit"
> & {
  className?: string;
  // Set once the event has confirmed tickets (see
  // getEventHasConfirmedParticipation.ts) — disables date/location/capacity
  // inputs via a native <fieldset disabled>, which cascades to every
  // descendant input/button without needing changes to DateTimePicker or
  // PostAutoComplete themselves. Only used by ManageEventDetailsSection.tsx
  // (the standalone create-adjacent EditEventModal.tsx never had this
  // concept and has been superseded by that page).
  restrictedLocked?: boolean;
};

// Edit-mode counterpart to EventUploadFormFields. Deliberately omits
// everything ticketing-related (TicketType/TicketInputs/ReceivingAccountForms
// /PromoCodeBtn) — see updateEvent.ts for why ticket types and promo codes
// aren't editable here.
export default function EditEventFormFields({
  register,
  errors,
  selectedAddress,
  setSelectedAddress,
  addressInputRef,
  handleSelectCoordinates,
  dateType,
  handleDateAndTime,
  initialRange,
  initialEntries,
  checked,
  handleChecked,
  category,
  setCategory,
  types,
  handleType,
  existingFlyer,
  handleFileChange,
  handleSubmit,
  onSubmit,
  className,
  restrictedLocked = false,
}: EditEventFormFieldsProps) {
  return (
    <form className={className} onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-4 py-5 font-normal">
        {existingFlyer && (
          <div className="relative w-full aspect-video rounded-lg overflow-hidden">
            <Image
              src={buildCloudinaryUrl(
                existingFlyer.publicId,
                existingFlyer.version,
                { width: 640, height: 360 },
              )}
              alt="Current event flyer"
              fill
              className="object-cover"
            />
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="edit-flyer" className="text-sm font-medium">
            Replace flyer (optional)
          </label>
          <input
            id="edit-flyer"
            type="file"
            accept="image/*"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-muted-foreground"
          />
        </div>

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

        <fieldset
          disabled={restrictedLocked}
          className={restrictedLocked ? "opacity-60 space-y-4" : "space-y-4"}
        >
          {restrictedLocked && (
            <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted px-3 py-2">
              This event already has confirmed tickets — location, dates and
              capacity can't be changed to protect people who already have a
              ticket.
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

          {/* Date and time — dateType is fixed to whatever the event was
              created with (single/range vs specific dates); switching the
              schedule TYPE isn't supported from edit, only the dates within it. */}
          <div className="space-y-4 text-sm">
            <h2>Date & Time</h2>
            <DateTimePicker
              handleDateAndTime={handleDateAndTime}
              dateType={dateType}
              initialRange={initialRange}
              initialEntries={initialEntries}
            />
          </div>
        </fieldset>

        <div className="space-y-4 text-sm font-normal">
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

          <PostInput
            type="text"
            inputPlaceholder="Website (optional)"
            {...register("website_url")}
          />
          {errors.website_url && (
            <p className="text-destructive text-sm">
              {errors.website_url.message}
            </p>
          )}

          <fieldset
            disabled={restrictedLocked}
            className={restrictedLocked ? "opacity-60 space-y-1" : "space-y-1"}
          >
            <PostInput
              type="number"
              inputPlaceholder="Capacity"
              {...register("capacity", { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for unlimited capacity
            </p>
          </fieldset>
          {errors.capacity && (
            <p className="text-destructive text-sm">
              {errors.capacity.message}
            </p>
          )}

          <label className="flex justify-between items-center font-semibold text-foreground cursor-pointer">
            <span>Require registration</span>
            <input
              type="checkbox"
              checked={checked}
              onChange={handleChecked}
              className="h-5 w-5 accent-primary"
            />
          </label>

          <hr className="border-border" />
        </div>
      </div>
    </form>
  );
}
