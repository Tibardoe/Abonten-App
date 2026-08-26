"use client";

import { postPlace } from "@/actions/postPlace";
import { savePlaceDraft } from "@/actions/savePlaceDraft";
import type { PostAutoCompleteHandle } from "@/components/atoms/PostAutoComplete";
import type { PlaceFormType, PlaceOpeningHoursInput } from "@/types/placeType";
import type { ResolvedLocation } from "@/types/resolvedLocation";
import type { PlaceDraftPayload } from "@/utils/placeDraftSchema";
import { type PlaceSchema, getPlaceSchema } from "@/utils/placeSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useToast } from "./useToast";

type UsePlaceUploadFormOptions = {
  // Owned by the modal (useImageSelection + useCroppedImage) and handed in
  // the same way useEventUploadForm.ts receives `file` — the cropped file
  // once the owner crops the cover photo, otherwise the raw selection.
  file: File | null;
  onSuccess: () => void;
  // Draft-continue mode: seeds every piece of state below from a
  // previously saved draft instead of starting empty.
  draftId?: string;
  initialValues?: PlaceDraftPayload;
  initialUpdatedAt?: string;
  // The draft's already-uploaded cover photo, reused by postPlace instead
  // of re-uploading when the owner hasn't picked a replacement file.
  existingCoverPhoto?: { public_id: string; version: string };
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
// everything else, a synchronous double-submit lock, a per-mount
// clientRequestId threaded into the submit payload so a retried/duplicated
// request can be recognized server-side instead of creating a duplicate
// place, and full save-as-draft support (buildDraftPayload/saveDraft).
export function usePlaceUploadForm({
  file,
  onSuccess,
  draftId,
  initialValues,
  initialUpdatedAt,
  existingCoverPhoto,
}: UsePlaceUploadFormOptions) {
  const t = useTranslations("places");
  const placeSchema = useMemo(() => getPlaceSchema(t), [t]);

  const form = useForm<PlaceSchema>({
    resolver: zodResolver(placeSchema),
    defaultValues: {
      name: initialValues?.name,
      description: initialValues?.description,
      website_url: initialValues?.websiteUrl,
      phone: initialValues?.phone,
      whatsapp: initialValues?.whatsapp,
    },
  });
  const {
    control,
    handleSubmit,
    getValues,
    formState: { isDirty: isFormDirty },
  } = form;

  const toast = useToast();

  const [isUploading, setIsUploading] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(
    draftId,
  );
  const draftUpdatedAtRef = useRef<string | undefined>(initialUpdatedAt);

  // Synchronous lock against double submission (double-click, rapid repeat
  // clicks): checked/set on the very first line of onSubmit, before any
  // await, closing the race window a state update alone can't.
  const isSubmittingRef = useRef(false);

  // Generated once per modal mount and reused across every postPlace call
  // made during this session (including retries after a validation error),
  // so create_place can recognize a replay of the same submission and
  // return the already-created place instead of inserting a duplicate.
  const clientRequestIdRef = useRef(crypto.randomUUID());

  // Tracks whether the owner has actually entered anything this session,
  // beyond whatever a continued draft was hydrated with — used to decide
  // whether Cancel needs to prompt at all (an untouched fresh form just
  // closes, per spec).
  const [touched, setTouched] = useState(false);
  const markTouched = () => setTouched(true);

  const [categoryId, setCategoryIdState] = useState<number | null>(
    initialValues?.categoryId ?? null,
  );
  const setCategoryId = (id: number) => {
    markTouched();
    setCategoryIdState(id);
  };

  const [selectedAddress, setSelectedAddressState] = useState(
    initialValues?.address ?? "",
  );
  const setSelectedAddress = (address: string) => {
    markTouched();
    setSelectedAddressState(address);
  };

  // Real coordinates captured the moment a suggestion (or current location)
  // resolves -- a ref, not state, so onSubmit can read the just-resolved
  // value synchronously right after awaiting resolveTypedInput() without
  // hitting a stale-closure read of last render's state.
  const addressInputRef = useRef<PostAutoCompleteHandle>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(
    initialValues?.latitude !== undefined &&
      initialValues?.longitude !== undefined
      ? { lat: initialValues.latitude, lng: initialValues.longitude }
      : null,
  );
  const handleSelectCoordinates = (location: ResolvedLocation) => {
    coordsRef.current = { lat: location.lat, lng: location.lng };
  };

  const [openingHours, setOpeningHoursState] = useState<
    PlaceOpeningHoursInput[]
  >(initialValues?.openingHours ?? DEFAULT_OPENING_HOURS);
  const setOpeningHours = (hours: PlaceOpeningHoursInput[]) => {
    markTouched();
    setOpeningHoursState(hours);
  };

  // Not currently editable from the create-flow UI (services/social links
  // have no step-1-4 form control yet), but preserved across a draft
  // save/continue cycle rather than silently dropped if a future milestone
  // adds one.
  const socialLinks = initialValues?.socialLinks;
  const services = initialValues?.services;

  const hasMeaningfulContent =
    Boolean(initialValues) || touched || isFormDirty || Boolean(file);

  const buildDraftPayload = (): PlaceDraftPayload => {
    const formValues = form.getValues();

    return {
      name: formValues.name || undefined,
      description: formValues.description || undefined,
      websiteUrl: formValues.website_url || undefined,
      phone: formValues.phone || undefined,
      whatsapp: formValues.whatsapp || undefined,
      categoryId: categoryId ?? undefined,
      address: selectedAddress || undefined,
      latitude: coordsRef.current?.lat,
      longitude: coordsRef.current?.lng,
      socialLinks,
      openingHours,
      services,
    };
  };

  const saveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const payload = buildDraftPayload();
      const response = await savePlaceDraft({
        draftId: currentDraftId,
        payload,
        expectedUpdatedAt: draftUpdatedAtRef.current,
        coverFile: file,
      });

      if (response.status === 200 && response.data) {
        setCurrentDraftId(response.data.draftId);
        draftUpdatedAtRef.current = response.data.updatedAt;
      }

      return response;
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Resolves whatever is currently typed in the address field -- must run
  // while PostAutoComplete (the Basic Info step) is still mounted, because
  // addressInputRef.current is set by that component's ref and React nulls
  // it out the moment the step unmounts. The Place creation modal is a
  // 4-step wizard that unmounts each step's fields when moving to the
  // next one, so by the time Publish (step 4) is clicked, this ref is
  // already null and resolveTypedInput() can no longer be called -- this
  // was silently producing "Please enter an address" even for a fully
  // typed/selected location. The modal calls this from the Basic Info
  // step's own "Next" button instead, while resolution is still possible,
  // and the resolved address/coordinates are then carried forward in
  // selectedAddress/coordsRef (plain state/ref, unaffected by unmounting).
  const resolveLocation = async (): Promise<boolean> => {
    setIsResolvingLocation(true);
    const resolution = await addressInputRef.current?.resolveTypedInput();
    setIsResolvingLocation(false);

    if (!resolution || resolution.status === "empty") {
      toast.error("Please enter an address");
      return false;
    }
    if (resolution.status === "unresolved") {
      toast.error(
        "Could not find that location — please check the spelling or pick a suggestion.",
      );
      return false;
    }
    if (resolution.status === "error") {
      toast.error(
        "We couldn't verify this location right now. Please try again.",
      );
      return false;
    }
    if (!coordsRef.current) {
      toast.error("Could not fetch coordinates");
      return false;
    }

    return true;
  };

  const onSubmit = async (formData: PlaceSchema) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    try {
      setIsUploading(true);

      if (!file && !existingCoverPhoto) {
        toast.error("Please select a cover photo first!");
        return;
      }

      if (categoryId === null) {
        toast.error("Please select a category");
        return;
      }

      const hasIncompleteHours = openingHours.some(
        (hour) => !hour.isClosed && (!hour.openTime || !hour.closeTime),
      );
      if (hasIncompleteHours) {
        toast.error("Please set open and close times for every open day");
        return;
      }

      // Location was already resolved (and confirmed) back on the Basic
      // Info step via resolveLocation() -- addressInputRef.current is null
      // by now, so resolveTypedInput() can't be called again here.
      const coords = coordsRef.current;
      if (!selectedAddress || !coords) {
        toast.error("Please enter an address");
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
        socialLinks,
        selectedFile: file,
        existingCoverPhoto: !file ? existingCoverPhoto : undefined,
        openingHours,
        // Draft-safe services allow every field to be optional (draft
        // validity != publish validity — see placeDraftSchema.ts); the
        // create flow has no service-editing step yet, so a continued
        // draft's services just need coercing into the stricter
        // publish-time shape rather than being dropped.
        services: services
          ?.filter((service): service is typeof service & { name: string } =>
            Boolean(service.name),
          )
          .map((service) => ({
            ...service,
            showPrice: service.showPrice ?? false,
          })),
        clientRequestId: clientRequestIdRef.current,
        draftId: currentDraftId,
      };

      const response = await postPlace(finalData);

      if (response.status === 200) {
        toast.success("✅ Place published successfully!");
        onSuccess();
      } else {
        toast.error(`❌ ${response.message}`);
      }
    } catch (error) {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsUploading(false);
      setIsResolvingLocation(false);
      isSubmittingRef.current = false;
    }
  };

  return {
    form,
    control,
    handleSubmit,
    getValues,
    isUploading,
    isResolvingLocation,
    onSubmit,
    resolveLocation,
    categoryId,
    setCategoryId,
    selectedAddress,
    setSelectedAddress,
    addressInputRef,
    handleSelectCoordinates,
    openingHours,
    setOpeningHours,
    hasMeaningfulContent,
    saveDraft,
    isSavingDraft,
    currentDraftId,
  };
}
