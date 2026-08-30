"use client";

import PostAutoComplete from "@/components/atoms/PostAutoComplete";
import PostInput from "@/components/atoms/PostInput";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { useManagePlaceDetailsForm } from "@/hooks/useManagePlaceDetailsForm";
import PlaceCategoryPicker from "@/places/molecules/PlaceCategoryPicker";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import Image from "next/image";
import { useEffect, useState } from "react";
import { TbWorld } from "react-icons/tb";

type ManagePlaceDetailsSectionProps = {
  place: {
    id: string;
    name: string;
    description: string;
    category_id: number;
    website_url: string | null;
    phone: string | null;
    whatsapp: string | null;
    social_links: Record<string, string> | null;
    address: { full_address?: string };
    cover_public_id: string;
    cover_version: string;
  };
  onSaved: () => void;
};

// Basic info + location + cover photo, one section of ManagePlaceView.
// Mirrors EditEventFormFields.tsx's shape (RHF for the schema-covered text
// fields, plain state for category/address/cover-photo, a simple
// <input type="file"> replace instead of the creation flow's crop step --
// same simplification EditEventFormFields already makes over
// PlaceCreateStepPhotos' cropper).
export default function ManagePlaceDetailsSection({
  place,
  onSaved,
}: ManagePlaceDetailsSectionProps) {
  const detailsForm = useManagePlaceDetailsForm({
    place,
    onSuccess: onSaved,
  });

  const {
    form,
    control,
    handleSubmit,
    isSaving,
    isResolvingLocation,
    onSubmit,
    categoryId,
    setCategoryId,
    selectedAddress,
    setSelectedAddress,
    addressInputRef,
    handleSelectCoordinates,
    newCoverFile,
    handleCoverFileChange,
  } = detailsForm;

  // Owns the object URL's lifecycle (create on a new file, revoke on
  // unmount/replace) rather than calling URL.createObjectURL inline during
  // render, which would leak a new blob URL on every re-render -- same
  // reasoning useImageSelection.ts documents for its own imagePreview state.
  const [newCoverPreview, setNewCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!newCoverFile) {
      setNewCoverPreview(null);
      return;
    }

    const url = URL.createObjectURL(newCoverFile);
    setNewCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newCoverFile]);

  const coverPreview =
    newCoverPreview ??
    buildCloudinaryUrl(place.cover_public_id, place.cover_version, {
      width: 640,
      height: 360,
    });

  return (
    <>
      <Form {...form}>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted">
            <Image
              src={coverPreview}
              alt="Cover photo"
              fill
              className="object-cover"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="place-cover" className="text-sm font-medium">
              Replace cover photo (optional)
            </label>
            <input
              id="place-cover"
              type="file"
              accept="image/*"
              onChange={(e) =>
                handleCoverFileChange(e.target.files?.[0] ?? null)
              }
              className="block w-full text-sm text-muted-foreground"
            />
          </div>

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

          <PlaceCategoryPicker
            categoryId={categoryId}
            onSelect={setCategoryId}
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

          <PostAutoComplete
            ref={addressInputRef}
            address={{ address: setSelectedAddress }}
            onSelectCoordinates={handleSelectCoordinates}
            value={selectedAddress}
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
                <div className="flex justify-between items-center">
                  <div className="bg-background border border-input rounded-md flex-1 mr-2">
                    <FormControl>
                      <input
                        type="text"
                        placeholder="Phone (optional)"
                        className="rounded-md p-2 bg-transparent w-full"
                        {...field}
                      />
                    </FormControl>
                  </div>
                  <TbWorld className="text-2xl" />
                </div>
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

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {isResolvingLocation
              ? "Resolving location..."
              : isSaving
                ? "Saving..."
                : "Save changes"}
          </button>
        </form>
      </Form>
    </>
  );
}
