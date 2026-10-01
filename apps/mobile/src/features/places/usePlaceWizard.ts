import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useCreatePlace } from "@/features/places/useCreatePlace";
import {
  usePlaceDraft,
  useSavePlaceDraft,
} from "@/features/places/usePlaceDrafts";
import { useUploadProgress } from "@/features/uploads/useUploadProgress";
import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { uuidv4 } from "@/lib/uuid";
import type {
  PlaceCreateResult,
  PlaceDraftPayload,
  PlaceOpeningHoursInput,
  SavePlaceDraftResult,
} from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { dayName } from "@abonten/core/dateFormatter";
import { getPlaceSchema } from "@abonten/validation/placeSchema";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";

// All state, validation and submit logic for the native place-creation
// wizard — the mobile echo of the web usePlaceUploadForm hook, so the
// screen (app/(app)/place/new.tsx) and its four step components stay thin
// and presentational. Publishes a place, and (WP-4g-3) saves / resumes a
// draft against the same drafts/place_drafts rows the web savePlaceDraft
// action writes.

const isRemote = (uri: string | null): boolean =>
  !!uri && /^https?:/i.test(uri);

/** Day names (0 = Sunday) in the reader's language. */
export function dayLabel(dayOfWeek: number, locale?: string | null): string {
  return dayName(dayOfWeek, "long", locale);
}

// A place starts open every day 09:00–17:00 — a sensible default the owner
// edits on the Hours step, mirroring the web DEFAULT_OPENING_HOURS.
const DEFAULT_OPENING_HOURS: PlaceOpeningHoursInput[] = Array.from(
  { length: 7 },
  (_, dayOfWeek) => ({
    dayOfWeek,
    openTime: "09:00",
    closeTime: "17:00",
    isClosed: false,
  }),
);

const PLACE_MESSAGES = {
  nameRequired: "giveYourPlaceAName",
  nameTooLong: "thatNameIsTooLongMax",
  descriptionRequired: "addAShortDescription",
  descriptionTooLong: "thatDescriptionIsTooLongMax",
  invalidUrl: "enterAValidWebsiteUrl",
  invalidPhone: "enterAValidPhoneNumber",
  invalidWhatsapp: "enterAValidWhatsappNumber",
};

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Keep place creation fast — the owner can add more from Edit Place later.
export const MAX_WIZARD_GALLERY_PHOTOS = 8;

export type PlaceWizardTextErrors = Partial<
  Record<"name" | "description" | "website_url" | "phone" | "whatsapp", string>
>;

export function usePlaceWizard(resumeDraftId?: string) {
  const t = useTranslations("places");

  const toast = useToast();
  const categoriesQuery = usePlaceCategories();
  const autocomplete = usePlacesAutocomplete();
  const create = useCreatePlace();
  const saveDraftMutation = useSavePlaceDraft();
  // Cover-photo uploads are the slow part of Publish and Save-as-draft, and
  // the staged gallery photos are slower still; one progress state drives
  // the bar for all of them.
  const uploadProgress = useUploadProgress();
  const draftQuery = usePlaceDraft(resumeDraftId);

  const clientRequestId = useRef(uuidv4()).current;
  const placeSchema = useMemo(
    () =>
      getPlaceSchema(
        Object.fromEntries(
          Object.entries(PLACE_MESSAGES).map(([name, key]) => [name, t(key)]),
        ) as typeof PLACE_MESSAGES,
      ),
    [t],
  );

  // Draft tracking: `currentDraftId` becomes set after the first save (or is
  // seeded when resuming); `draftUpdatedAt` feeds the concurrency check;
  // `savedCoverUri` is the cover already persisted, so an unchanged cover
  // isn't re-uploaded on every save.
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(
    resumeDraftId,
  );
  const draftUpdatedAt = useRef<string | undefined>(undefined);
  const savedCoverUri = useRef<string | null>(null);
  // The resumed draft's already-uploaded cover, reused on Publish instead of
  // trying to re-upload a Cloudinary URL.
  const resumedCover = useRef<{ publicId: string; version: string } | null>(
    null,
  );
  const hydratedRef = useRef(false);

  const [step, setStep] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [textErrors, setTextErrors] = useState<PlaceWizardTextErrors>({});

  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [resolvingLocation, setResolvingLocation] = useState(false);

  const [coverUri, setCoverUri] = useState<string | null>(null);
  // Picked source dimensions, for re-opening the crop/rotate/flip editor.
  const [coverSize, setCoverSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  const [openingHours, setOpeningHours] = useState<PlaceOpeningHoursInput[]>(
    DEFAULT_OPENING_HOURS,
  );

  // Optional gallery photos, staged as local URIs and uploaded only after
  // the place row exists (uploadStagedPhotos). Not persisted into the draft
  // — same as web, where the create modal is cover-only.
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  const categories = categoriesQuery.data ?? [];

  const hoursComplete = openingHours.every(
    (h) =>
      h.isClosed ||
      (!!h.openTime &&
        !!h.closeTime &&
        TIME_RE.test(h.openTime) &&
        TIME_RE.test(h.closeTime)),
  );

  function validateText(): boolean {
    const result = placeSchema.safeParse({
      name,
      description,
      website_url: website,
      phone,
      whatsapp,
    });
    if (result.success) {
      setTextErrors({});
      return true;
    }
    const next: PlaceWizardTextErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof PlaceWizardTextErrors;
      if (key && !next[key]) next[key] = issue.message;
    }
    setTextErrors(next);
    return false;
  }

  function applyLocation(lat: number, lng: number, label: string) {
    setAddress(label);
    setCoords({ lat, lng });
    autocomplete.setQuery(label);
    autocomplete.clear();
  }

  async function pickSuggestion(placeId: string) {
    setResolvingLocation(true);
    const resolved = await autocomplete.resolvePlace(placeId);
    setResolvingLocation(false);
    if (!resolved) {
      toast.error(t("couldnTUseThatLocation"), {
        description: t("pleaseTryAnotherSuggestionOrType"),
      });
      return;
    }
    applyLocation(resolved.lat, resolved.lng, resolved.address);
  }

  async function useCurrentLocation() {
    setResolvingLocation(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast.error(t("locationAccessNeeded"), {
          description: t("allowLocationAccessToUseYour"),
        });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const label = place
        ? [place.name, place.street, place.city, place.region, place.country]
            .filter(Boolean)
            .join(", ")
        : `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      applyLocation(pos.coords.latitude, pos.coords.longitude, label);
    } catch {
      toast.error(t("couldnTGetYourLocation"), {
        description: t("pleaseTryAgainOrTypeThe"),
      });
    } finally {
      setResolvingLocation(false);
    }
  }

  /** Commit a point chosen on the map picker. */
  function setMapLocation(loc: { lat: number; lng: number; label: string }) {
    applyLocation(loc.lat, loc.lng, loc.label);
  }

  // Returns the freshly-picked local asset so the caller can open the in-app
  // editor on it; no OS crop UI (the editor does crop/rotate/flip).
  async function pickCover(): Promise<{
    uri: string;
    width: number;
    height: number;
  } | null> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(t("photoAccessNeeded"), {
        description: t("allowPhotoAccessToPickA"),
      });
      return null;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset) return null;
    setCoverUri(asset.uri);
    setCoverSize({ w: asset.width ?? 0, h: asset.height ?? 0 });
    return {
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    };
  }

  // Commit the editor's baked result.
  function setCover(uri: string, w: number, h: number) {
    setCoverUri(uri);
    setCoverSize({ w, h });
  }

  async function pickGalleryPhotos() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(t("photoAccessNeeded"), {
        description: t("allowPhotoAccessToAddGallery"),
      });
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.length) return;
    setPhotoUris((prev) =>
      [...prev, ...picked.assets.map((a) => a.uri)].slice(
        0,
        MAX_WIZARD_GALLERY_PHOTOS,
      ),
    );
  }

  function removeGalleryPhoto(uri: string) {
    setPhotoUris((prev) => prev.filter((u) => u !== uri));
  }

  // Best-effort: a failed gallery upload must never undo a published place.
  // Returns how many of the staged photos were saved.
  async function uploadStagedPhotos(placeId: string): Promise<number> {
    if (photoUris.length === 0) return 0;
    setUploadingPhotos(true);
    uploadProgress.start();
    let saved = 0;
    const total = photoUris.length;
    try {
      for (const [i, uri] of photoUris.entries()) {
        try {
          const up = await uploadToCloudinary(uri, "place_photo", {
            // Each photo's own 0..1 folded into the run as a whole, so the
            // bar walks steadily across "photo 2 of 5" rather than
            // restarting from zero five times.
            onProgress: (f) => uploadProgress.onProgress((i + f) / total),
          });
          const res = await api.organizer.addPlacePhoto(placeId, {
            publicId: up.publicId,
            version: String(up.version),
          });
          if (res.status === 200) saved += 1;
        } catch {
          // keep going — the rest may still succeed
        }
      }
    } finally {
      setUploadingPhotos(false);
      uploadProgress.reset();
    }
    return saved;
  }

  function setHours(dayOfWeek: number, patch: Partial<PlaceOpeningHoursInput>) {
    setOpeningHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)),
    );
  }

  /** Validate the Basic-info step; returns true when it's OK to advance. */
  function validateBasics(): boolean {
    if (!validateText()) return false;
    if (categoryId === null) {
      toast.error(t("pickACategory"), {
        description: t("chooseTheCategoryThatFitsBest"),
      });
      return false;
    }
    if (!address || !coords) {
      toast.error(t("addALocation"), {
        description: t("pickASuggestionChooseOnThe"),
      });
      return false;
    }
    return true;
  }

  // --- draft: hydrate on resume ----------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot hydration guarded by hydratedRef; the setters are stable
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!resumeDraftId || draftQuery.data?.status !== 200) return;
    hydratedRef.current = true;

    const detail = draftQuery.data.data;
    const p = detail.payload;
    draftUpdatedAt.current = detail.updatedAt;

    if (p.name) setName(p.name);
    if (p.description) setDescription(p.description);
    if (p.websiteUrl) setWebsite(p.websiteUrl);
    if (p.phone) setPhone(p.phone);
    if (p.whatsapp) setWhatsapp(p.whatsapp);
    if (p.categoryId != null) setCategoryId(p.categoryId);
    if (p.address) {
      setAddress(p.address);
      autocomplete.setQuery(p.address);
    }
    if (p.latitude != null && p.longitude != null)
      setCoords({ lat: p.latitude, lng: p.longitude });
    if (p.openingHours?.length === 7) setOpeningHours(p.openingHours);

    if (detail.coverPublicId && detail.coverVersion) {
      const url = buildCloudinaryUrl(
        detail.coverPublicId,
        detail.coverVersion,
        { width: 1280, height: 720 },
      );
      setCoverUri(url);
      savedCoverUri.current = url;
      resumedCover.current = {
        publicId: detail.coverPublicId,
        version: detail.coverVersion,
      };
    }
  }, [resumeDraftId, draftQuery.data]);

  // --- draft: build payload from current state ------------------
  function buildDraftPayload(): PlaceDraftPayload {
    return {
      name: name.trim() || undefined,
      description: description.trim() || undefined,
      categoryId: categoryId ?? undefined,
      address: address.trim() || undefined,
      latitude: coords?.lat,
      longitude: coords?.lng,
      websiteUrl: website.trim() || undefined,
      phone: phone.trim() || undefined,
      whatsapp: whatsapp.trim() || undefined,
      openingHours,
    };
  }

  async function saveDraft(): Promise<SavePlaceDraftResult> {
    const localCover =
      coverUri && !isRemote(coverUri) && coverUri !== savedCoverUri.current
        ? coverUri
        : null;

    if (localCover) uploadProgress.start();
    else uploadProgress.setPhase("saving");
    let res: SavePlaceDraftResult;
    try {
      res = await saveDraftMutation.mutateAsync({
        draftId: currentDraftId,
        payload: buildDraftPayload(),
        expectedUpdatedAt: draftUpdatedAt.current,
        coverUri: localCover,
        onUploadProgress: uploadProgress.onProgress,
        onUploadComplete: uploadProgress.finishUpload,
      });
    } finally {
      uploadProgress.reset();
    }

    if (res.status === 200) {
      setCurrentDraftId(res.data.draftId);
      draftUpdatedAt.current = res.data.updatedAt;
      if (coverUri) savedCoverUri.current = coverUri;
    }
    return res;
  }

  async function submit(): Promise<PlaceCreateResult | null> {
    // Same reasoning as the event wizard: a missing prerequisite used to
    // make Publish silently do nothing. Each gap now names itself and offers
    // a jump to the step that owns it.
    if (!coverUri) {
      toast.error(t("yourPlaceNeedsACoverPhoto"), {
        description: t("addOneOnTheFirstStep"),
        action: { label: t("goThere"), onPress: () => setStep(0) },
      });
      return null;
    }
    if (categoryId === null || !coords) {
      toast.error(
        categoryId === null ? t("pickACategory2") : t("confirmTheLocation"),
        {
          description: t("bothAreOnTheBasicInfo"),
          action: { label: t("goThere"), onPress: () => setStep(2) },
        },
      );
      return null;
    }
    if (!hoursComplete) {
      toast.error(t("everyOpenDayNeedsAnOpen"), {
        description: t("useHhMmOrMarkThe"),
        action: { label: t("goThere"), onPress: () => setStep(3) },
      });
      return null;
    }

    // A resumed draft's cover is a Cloudinary URL, not a local file —
    // reuse its ids instead of re-uploading. A freshly picked cover is a
    // local URI and gets uploaded by useCreatePlace.
    const coverFields = isRemote(coverUri)
      ? {
          coverPublicId: resumedCover.current?.publicId,
          coverVersion: resumedCover.current?.version,
        }
      : { coverUri };

    if (!isRemote(coverUri)) uploadProgress.start();
    else uploadProgress.setPhase("saving");
    try {
      return await create.mutateAsync({
        onUploadProgress: uploadProgress.onProgress,
        onUploadComplete: uploadProgress.finishUpload,
        name: name.trim(),
        categoryId,
        description: description.trim(),
        address: address.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        ...coverFields,
        openingHours,
        websiteUrl: website.trim() || null,
        phone: phone.trim() || null,
        whatsapp: whatsapp.trim() || null,
        clientRequestId,
      });
    } finally {
      uploadProgress.reset();
    }
  }

  // Step order (see app/(app)/place/new.tsx): 0 Cover · 1 Photos (optional) ·
  // 2 Basic info · 3 Hours · 4 Review. Basic info (step 2) runs
  // validateBasics() on Next-press, so it isn't gated here.
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return !!coverUri;
      case 3:
        return hoursComplete;
      default:
        return true;
    }
  }, [step, coverUri, hoursComplete]);

  return {
    // step
    step,
    setStep,
    canAdvance,
    // categories
    categories,
    categoriesLoading: categoriesQuery.isLoading,
    // text fields
    name,
    setName,
    description,
    setDescription,
    website,
    setWebsite,
    phone,
    setPhone,
    whatsapp,
    setWhatsapp,
    categoryId,
    setCategoryId,
    textErrors,
    // location
    autocomplete,
    address,
    coords,
    resolvingLocation,
    pickSuggestion,
    useCurrentLocation,
    setMapLocation,
    // cover
    coverUri,
    coverSize,
    pickCover,
    setCover,
    // gallery photos (optional)
    photoUris,
    pickGalleryPhotos,
    removeGalleryPhoto,
    uploadStagedPhotos,
    uploadingPhotos,
    // hours
    openingHours,
    setHours,
    hoursComplete,
    // submit
    validateBasics,
    submit,
    uploadProgress,
    isSubmitting: create.isPending,
    isSubmitError: create.isError,
    // draft
    saveDraft,
    isSavingDraft: saveDraftMutation.isPending,
    currentDraftId,
    isHydratingDraft: !!resumeDraftId && draftQuery.isLoading,
    draftLoadError:
      !!resumeDraftId &&
      draftQuery.data != null &&
      draftQuery.data.status !== 200
        ? draftQuery.data.message
        : null,
  };
}

export type PlaceWizard = ReturnType<typeof usePlaceWizard>;
