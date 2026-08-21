import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PostInput from "@/components/atoms/PostInput";
import type { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
import PlaceCategoryPicker from "../molecules/PlaceCategoryPicker";

type PlaceCreateStepBasicInfoProps = Pick<
  ReturnType<typeof usePlaceUploadForm>,
  | "register"
  | "errors"
  | "categoryId"
  | "setCategoryId"
  | "selectedAddress"
  | "setSelectedAddress"
  | "addressInputRef"
  | "handleSelectCoordinates"
> & { className?: string };

// Step 1 of the Place creation flow: name, category, description, address
// and optional contact fields. Not wrapped in its own <form> (unlike
// EventUploadFormFields' single-step details form) — this flow spans
// several steps and only the Review step's Publish button actually calls
// handleSubmit(onSubmit), so an early <form> here would let Enter
// prematurely attempt a submission this step alone can't satisfy.
export default function PlaceCreateStepBasicInfo({
  register,
  errors,
  categoryId,
  setCategoryId,
  selectedAddress,
  setSelectedAddress,
  addressInputRef,
  handleSelectCoordinates,
  className,
}: PlaceCreateStepBasicInfoProps) {
  return (
    <div className={className}>
      <PostInput type="text" inputPlaceholder="Name" {...register("name")} />
      {errors.name && (
        <p className="text-destructive text-sm">{errors.name.message}</p>
      )}

      <PlaceCategoryPicker categoryId={categoryId} onSelect={setCategoryId} />
      {categoryId === null && (
        <p className="text-destructive text-sm">Select a category</p>
      )}

      <PostInput
        type="text"
        inputPlaceholder="Description"
        {...register("description")}
      />
      {errors.description && (
        <p className="text-destructive text-sm">{errors.description.message}</p>
      )}

      <PostAutoComplete
        ref={addressInputRef}
        address={{ address: setSelectedAddress }}
        onSelectCoordinates={handleSelectCoordinates}
        placeholderText={{
          text: "Address",
          svgUrl: "/assets/images/location.svg",
        }}
      />
      {selectedAddress === "" && (
        <p className="text-destructive text-sm">Address is required</p>
      )}

      <PostInput
        type="text"
        inputPlaceholder="Website (optional)"
        {...register("website_url")}
      />
      {errors.website_url && (
        <p className="text-destructive text-sm">{errors.website_url.message}</p>
      )}

      <PostInput
        type="text"
        inputPlaceholder="Phone (optional)"
        {...register("phone")}
      />
      {errors.phone && (
        <p className="text-destructive text-sm">{errors.phone.message}</p>
      )}

      <PostInput
        type="text"
        inputPlaceholder="WhatsApp (optional)"
        {...register("whatsapp")}
      />
      {errors.whatsapp && (
        <p className="text-destructive text-sm">{errors.whatsapp.message}</p>
      )}
    </div>
  );
}
