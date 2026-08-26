import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PostInput from "@/components/atoms/PostInput";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { usePlaceUploadForm } from "@/hooks/usePlaceUploadForm";
import PlaceCategoryPicker from "../molecules/PlaceCategoryPicker";

type PlaceCreateStepBasicInfoProps = Pick<
  ReturnType<typeof usePlaceUploadForm>,
  | "form"
  | "control"
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
  form,
  control,
  categoryId,
  setCategoryId,
  selectedAddress,
  setSelectedAddress,
  addressInputRef,
  handleSelectCoordinates,
  className,
}: PlaceCreateStepBasicInfoProps) {
  return (
    <Form {...form}>
      <div className={className}>
        <FormField
          control={control}
          name="name"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <PostInput type="text" inputPlaceholder="Name" {...field} />
              </FormControl>
              <FormMessage className="text-sm" />
            </FormItem>
          )}
        />

        <PlaceCategoryPicker categoryId={categoryId} onSelect={setCategoryId} />
        {categoryId === null && (
          <p className="text-destructive text-sm">Select a category</p>
        )}

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

        <FormField
          control={control}
          name="phone"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <PostInput
                  type="text"
                  inputPlaceholder="Phone (optional)"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-sm" />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="whatsapp"
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <PostInput
                  type="text"
                  inputPlaceholder="WhatsApp (optional)"
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-sm" />
            </FormItem>
          )}
        />
      </div>
    </Form>
  );
}
