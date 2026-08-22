"use client";

import { updatePlace } from "@/actions/updatePlace";
import type { PostAutoCompleteHandle } from "@/components/atoms/PostAutoComplete";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import type { ResolvedLocation } from "@/types/resolvedLocation";
import { isImageFile } from "@/utils/isImageFile";
import { type PlaceSchema, getPlaceSchema } from "@/utils/placeSchema";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@/utils/uploadLimits";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

type ManagedPlaceAddress = { full_address?: string };

type ManagePlaceDetailsFormOptions = {
  place: {
    id: string;
    name: string;
    description: string;
    category_id: number;
    website_url: string | null;
    phone: string | null;
    whatsapp: string | null;
    social_links: Record<string, string> | null;
    address: ManagedPlaceAddress;
  };
  onSuccess: () => void;
};

// Edit counterpart to usePlaceUploadForm.ts, mirroring how
// useEventEditForm.ts relates to useEventUploadForm.ts: same RHF+Zod schema
// (getPlaceSchema, shared with creation), plain useState for
// category/address/cover-photo, and no clientRequestId (updatePlace.ts
// isn't idempotency-guarded the way create actions are, since a resubmit
// of an edit is naturally idempotent -- it just re-applies the same
// values).
export function useManagePlaceDetailsForm({
  place,
  onSuccess,
}: ManagePlaceDetailsFormOptions) {
  const t = useTranslations("places");
  const placeSchema = useMemo(() => getPlaceSchema(t), [t]);

  const form = useForm<PlaceSchema>({
    resolver: zodResolver(placeSchema),
    defaultValues: {
      name: place.name,
      description: place.description,
      website_url: place.website_url ?? "",
      phone: place.phone ?? "",
      whatsapp: place.whatsapp ?? "",
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const { message: notification, showMessage } = useTimedMessage(3000);

  const [isSaving, setIsSaving] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [categoryId, setCategoryId] = useState<number>(place.category_id);
  const [selectedAddress, setSelectedAddress] = useState(
    place.address?.full_address ?? "",
  );
  const [newCoverFile, setNewCoverFile] = useState<File | null>(null);

  const addressInputRef = useRef<PostAutoCompleteHandle>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const handleSelectCoordinates = (location: ResolvedLocation) => {
    coordsRef.current = { lat: location.lat, lng: location.lng };
  };

  const handleCoverFileChange = (file: File | null) => {
    if (!file) {
      setNewCoverFile(null);
      return;
    }

    if (!isImageFile(file)) {
      showMessage("Please select an image file for your cover photo.");
      return;
    }

    if (file.size > MAX_EVENT_FLYER_SIZE_BYTES) {
      const maxMb = Math.round(MAX_EVENT_FLYER_SIZE_BYTES / (1024 * 1024));
      showMessage(`Image is too large. Maximum size is ${maxMb}MB.`);
      return;
    }

    setNewCoverFile(file);
  };

  const onSubmit = async (formData: PlaceSchema) => {
    try {
      setIsSaving(true);

      setIsResolvingLocation(true);
      const resolution = await addressInputRef.current?.resolveTypedInput();
      setIsResolvingLocation(false);

      if (!resolution || resolution.status === "empty") {
        showMessage("Please enter an address");
        return;
      }
      if (resolution.status === "unresolved") {
        showMessage(
          "Could not find that location — please check the spelling or pick a suggestion.",
        );
        return;
      }
      if (resolution.status === "error") {
        showMessage(
          "We couldn't verify this location right now. Please try again.",
        );
        return;
      }

      const coords = coordsRef.current;
      if (!coords) {
        showMessage("Could not fetch coordinates");
        return;
      }

      const response = await updatePlace({
        placeId: place.id,
        name: formData.name,
        description: formData.description,
        categoryId,
        websiteUrl: formData.website_url || undefined,
        phone: formData.phone || undefined,
        whatsapp: formData.whatsapp || undefined,
        socialLinks: place.social_links ?? undefined,
        address: selectedAddress,
        latitude: coords.lat,
        longitude: coords.lng,
        selectedFile: newCoverFile,
      });

      if (response.status === 200) {
        showMessage("✅ Place updated successfully!");
        setNewCoverFile(null);
        onSuccess();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } catch (error) {
      showMessage("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
      setIsResolvingLocation(false);
    }
  };

  return {
    register,
    handleSubmit,
    errors,
    notification,
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
  };
}
