"use client";

import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PostInput from "@/components/atoms/PostInput";
import CategoryFilter from "@/components/molecules/CategoryFilter";
import DateTimePicker from "@/components/molecules/DateTimePicker";
import TypeFilter from "@/components/molecules/TypeFilter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { useEventEditForm } from "@/hooks/useEventEditForm";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { useTranslations } from "next-intl";
import Image from "next/image";

type EditEventFormFieldsProps = Pick<
  ReturnType<typeof useEventEditForm>,
  | "form"
  | "control"
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
  form,
  control,
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
  const t = useTranslations("common");

  return (
    <Form {...form}>
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
                alt={t("currentEventFlyer")}
                fill
                className="object-cover"
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="edit-flyer" className="text-sm font-medium">
              {t("replaceFlyerOptional")}
            </label>
            <input
              id="edit-flyer"
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground"
            />
          </div>

          <FormField
            control={control}
            name="title"
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <FormLabel className="text-sm font-medium">
                  {t("eventName")}
                </FormLabel>
                <FormControl>
                  <PostInput
                    type="text"
                    inputPlaceholder={t("title")}
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
              <FormItem className="space-y-1.5">
                <FormLabel className="text-sm font-medium">
                  {t("description")}
                </FormLabel>
                <FormControl>
                  <PostInput
                    type="text"
                    inputPlaceholder={t("description")}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-sm" />
              </FormItem>
            )}
          />

          <fieldset
            disabled={restrictedLocked}
            className={restrictedLocked ? "opacity-60 space-y-4" : "space-y-4"}
          >
            {restrictedLocked && (
              <p className="text-sm text-muted-foreground rounded-md border border-border bg-muted px-3 py-2">
                {t("thisEventAlreadyHasConfirmedTickets")}
              </p>
            )}

            <PostAutoComplete
              ref={addressInputRef}
              address={{ address: setSelectedAddress }}
              onSelectCoordinates={handleSelectCoordinates}
              value={selectedAddress}
              placeholderText={{
                text: t("location"),
                svgUrl: "/assets/images/location.svg",
              }}
            />
            {selectedAddress === "" && (
              <p className="text-destructive text-sm">
                {t("locationRequired")}
              </p>
            )}

            {/* Date and time — dateType is fixed to whatever the event was
              created with (single/range vs specific dates); switching the
              schedule TYPE isn't supported from edit, only the dates within it. */}
            <div className="space-y-4 text-sm">
              <h2>{t("dateTime")}</h2>
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
              <p className="text-destructive text-sm">
                {t("selectEventCategory")}
              </p>
            )}

            <TypeFilter
              selectedTypes={types}
              selectedCategory={category}
              handleType={handleType}
            />
            {types.length === 0 && (
              <p className="text-destructive text-sm">
                {t("selectAtLeastOneTypeFor")}
              </p>
            )}

            <FormField
              control={control}
              name="website_url"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-sm font-medium">
                    {t("websiteOptional")}
                  </FormLabel>
                  <FormControl>
                    <PostInput
                      type="text"
                      inputPlaceholder={t("websiteOptional")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-sm" />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="capacity"
              render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <fieldset
                    disabled={restrictedLocked}
                    className={
                      restrictedLocked ? "opacity-60 space-y-1" : "space-y-1"
                    }
                  >
                    <FormLabel className="text-sm font-medium">
                      {t("capacity")}
                    </FormLabel>
                    <FormControl>
                      <PostInput
                        type="number"
                        inputPlaceholder={t("capacity")}
                        {...field}
                        onChange={(e) =>
                          field.onChange(
                            (e.target as HTMLInputElement).valueAsNumber,
                          )
                        }
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("leaveBlankForUnlimitedCapacity")}
                    </p>
                  </fieldset>
                  <FormMessage className="text-sm" />
                </FormItem>
              )}
            />

            <label className="flex justify-between items-center font-semibold text-foreground cursor-pointer">
              <span>{t("requireRegistration")}</span>
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
    </Form>
  );
}
