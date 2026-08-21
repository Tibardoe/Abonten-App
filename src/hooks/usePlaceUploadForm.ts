"use client";

import { postPlace } from "@/actions/postPlace";
import type { PostAutoCompleteHandle } from "@/components/atoms/PostAutoComplete";
import type { PlaceFormType, PlaceOpeningHoursInput } from "@/types/placeType";
import { type PlaceSchema, getPlaceSchema } from "@/utils/placeSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTimedMessage } from "./useTimedMessage";

type UsePlaceUploadFormOptions = {
  // Owned by the modal (useImageSelection + useCroppedImage) and handed in
  // the same way useEventUploadForm.ts receives `file` — the cropped file
  // once the owner crops the cover photo, otherwise the raw selection.
  file: File | null;
  onSuccess: () => void;
};

// A place starts open every day 09:00-17:00 — a sensible default the owner
// edits on the Hours step, rather than starting all-closed.
const DEFAULT_OPENING_HOURS: PlaceOpeningHoursInput[] = Array.from(
  { length: 7 },
  (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: "09:00",
    closeTime: "17:00",
    isClosed: false,
  }),
);

// All state, validation and submit logic for the Place creation flow.
// Mirrors useEventUploadForm.ts's shape: RHF+Zod for the schema-covered
// fields (name/description/website/phone/whatsapp), plain useState for
// everything else, a synchronous double-submit lock, and a per-mount
// clientRequestId threaded into the submit payload so a retried/duplicated
// request can be recognized server-side instead of creating a duplicate
// place.
export function usePlaceUploadForm({
  file,
  onSuccess,
}: UsePlaceUploadFormOptions) {
  const t = useTranslations("places");
  const placeSchema = useMemo(() => getPlaceSchema(t), [t]);

  const form = useForm<PlaceSchema>({
    resolver: zodResolver(placeSchema),
  });
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isDirty: isFormDirty },
  } = form;

  const { message: notification, showMessage } = useTimedMessage(3000);

  const [isUploading, setIsUploading] = useState(false);

  // Synchronous lock against double submission (double-click, rapid repeat
  // clicks): checked/set on the very first line of onSubmit, before any
  // await, closing the race window a state update alone can't.
  const isSubmittingRef = useRef(false);

  // Generated once per modal mount and reused across every postPlace call
  // made during this session (including retries after a validation error),
  // so create_place can recognize a replay of the same submission and
  // return the already-created place instead of inserting a duplicate.
  const clientRequestIdRef = useRef(crypto.randomUUID());

  // Tracks whether the owner has entered anything this session. Not
  // currently consumed for a cancel-confirmation (Places has no draft flow
  // in Phase 1 — Cancel just closes the modal) but returned for parity with
  // useEventUploadForm.ts's hasMeaningfulContent, in case a later milestone
  // wants it.
  const [touched, setTouched] = useState(false);
  const markTouched = () => setTouched(true);

  const [categoryId, setCategoryIdState] = useState<number | null>(null);
  const setCategoryId = (id: number) => {
    markTouched();
    setCategoryIdState(id);
  };

  const [selectedAddress, setSelectedAddressState] = useState("");
  const setSelectedAddress = (address: string) => {
    markTouched();
    setSelectedAddressState(address);
  };

  // Real coordinates captured the moment a suggestion (or current location)
  // resolves -- a ref, not state, so onSubmit can read the just-resolved
  // value synchronously right after awaiting resolveTypedInput() without
  // hitting a stale-closure read of last render's state.
  const addressInputRef = useRef<PostAutoCompleteHandle>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const handleSelectCoordinates = (location: {
    lat: number;
    lng: number;
    address: string;
  }) => {
    coordsRef.current = { lat: location.lat, lng: location.lng };
  };

  const [openingHours, setOpeningHoursState] = useState<
    PlaceOpeningHoursInput[]
  >(DEFAULT_OPENING_HOURS);
  const setOpeningHours = (hours: PlaceOpeningHoursInput[]) => {
    markTouched();
    setOpeningHoursState(hours);
  };

  const hasMeaningfulContent = touched || isFormDirty || Boolean(file);

  const onSubmit = async (formData: PlaceSchema) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    try {
      setIsUploading(true);

      if (!file) {
        showMessage("Please select a cover photo first!");
        return;
      }

      if (!selectedAddress) {
        showMessage("Please enter an address");
        return;
      }

      if (categoryId === null) {
        showMessage("Please select a category");
        return;
      }

      const hasIncompleteHours = openingHours.some(
        (hour) => !hour.isClosed && (!hour.openTime || !hour.closeTime),
      );
      if (hasIncompleteHours) {
        showMessage("Please set open and close times for every open day");
        return;
      }

      const resolution = await addressInputRef.current?.resolveTypedInput();
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

      const coords = coordsRef.current;
      if (!coords) {
        showMessage("Could not fetch coordinates");
        return;
      }

      const finalData: PlaceFormType = {
        name: formData.name,
        description: formData.description,
        categoryId,
        address: selectedAddress,
        latitude: coords.lat,
        longitude: coords.lng,
        websiteUrl: formData.website_url || undefined,
        phone: formData.phone || undefined,
        whatsapp: formData.whatsapp || undefined,
        selectedFile: file,
        openingHours,
        clientRequestId: clientRequestIdRef.current,
      };

      const response = await postPlace(finalData);

      if (response.status === 200) {
        showMessage("✅ Place published successfully!");
        onSuccess();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } catch (error) {
      showMessage("Location unknown! Try again with different location");
    } finally {
      setIsUploading(false);
      isSubmittingRef.current = false;
    }
  };

  return {
    register,
    handleSubmit,
    errors,
    getValues,
    notification,
    isUploading,
    onSubmit,
    categoryId,
    setCategoryId,
    selectedAddress,
    setSelectedAddress,
    addressInputRef,
    handleSelectCoordinates,
    openingHours,
    setOpeningHours,
    hasMeaningfulContent,
  };
}
