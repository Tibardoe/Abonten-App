import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import {
  usePlaceManageContext,
  useSetPlaceStatus,
  useUpdatePlace,
  useUpdatePlaceHours,
} from "@/features/organizer/useManagePlace";
import type {
  PlaceHoursStatusResult,
  PlaceOpeningHoursInput,
  PlaceServiceRow,
  PlaceTemporaryStatus,
  UpdatePlaceResult,
} from "@abonten/api-client";
import { getPlaceSchema } from "@abonten/validation/placeSchema";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

// Mobile echo of the web useManagePlaceDetailsForm + ManagePlaceHoursSection.
// One hook backing the per-place edit screen: core-fields form (Details &
// Location), the weekly-hours editor, and the temporary-status control.
// Each has its own save, mirroring how the web tabs each own their action.

const PLACE_MESSAGES = {
  nameRequired: "Give your place a name.",
  nameTooLong: "That name is too long (max 150 characters).",
  descriptionRequired: "Add a short description.",
  descriptionTooLong: "That description is too long (max 2000 characters).",
  invalidUrl: "Enter a valid website URL.",
  invalidPhone: "Enter a valid phone number.",
  invalidWhatsapp: "Enter a valid WhatsApp number.",
};

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type PlaceEditTextErrors = Partial<
  Record<"name" | "description" | "website_url" | "phone" | "whatsapp", string>
>;

function toHoursRows(
  rows: {
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    is_closed: boolean;
  }[],
): PlaceOpeningHoursInput[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const existing = rows.find((r) => r.day_of_week === dayOfWeek);
    return {
      dayOfWeek,
      openTime: existing?.open_time?.slice(0, 5) ?? "09:00",
      closeTime: existing?.close_time?.slice(0, 5) ?? "17:00",
      isClosed: existing?.is_closed ?? true,
    };
  });
}

export function usePlaceEdit(placeId: string) {
  const query = usePlaceManageContext(placeId);
  const categoriesQuery = usePlaceCategories();
  const autocomplete = usePlacesAutocomplete();
  const update = useUpdatePlace(placeId);
  const updateHours = useUpdatePlaceHours(placeId);
  const setStatusMutation = useSetPlaceStatus(placeId);
  const placeSchema = useMemo(() => getPlaceSchema(PLACE_MESSAGES), []);

  const [prefilled, setPrefilled] = useState(false);

  // core fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [textErrors, setTextErrors] = useState<PlaceEditTextErrors>({});
  const socialLinks = useRef<Record<string, string> | null>(null);

  // cover
  const [existingCover, setExistingCover] = useState<{
    publicId: string;
    version: string;
  } | null>(null);
  const [newCoverUri, setNewCoverUri] = useState<string | null>(null);

  // location
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [resolvingLocation, setResolvingLocation] = useState(false);

  // hours
  const [hours, setHoursState] = useState<PlaceOpeningHoursInput[]>([]);

  // status
  const [status, setStatus] = useState<PlaceTemporaryStatus>(null);
  const [statusNote, setStatusNote] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: prefill runs once when the fetch resolves.
  useEffect(() => {
    if (prefilled || !query.data || query.data.status !== 200) return;
    const { place, openingHours } = query.data.data;

    setName(place.name ?? "");
    setDescription(place.description ?? "");
    setWebsite(place.website_url ?? "");
    setPhone(place.phone ?? "");
    setWhatsapp(place.whatsapp ?? "");
    setCategoryId(place.category_id ?? null);
    socialLinks.current = place.social_links ?? null;
    if (place.cover_public_id && place.cover_version) {
      setExistingCover({
        publicId: place.cover_public_id,
        version: place.cover_version,
      });
    }
    setHoursState(toHoursRows(openingHours));
    setStatus(place.temporary_status);
    setStatusNote(place.temporary_status_note ?? "");

    const storedAddress = place.address?.full_address ?? "";
    setAddress(storedAddress);
    autocomplete.setQuery(storedAddress);
    setPrefilled(true);

    // Best-effort forward-geocode so an unchanged location still submits
    // with finite coords (validateLocationInput needs them). If it fails
    // the user must re-pick before Save.
    (async () => {
      if (!storedAddress) return;
      try {
        const [hit] = await Location.geocodeAsync(storedAddress);
        if (hit) setCoords({ lat: hit.latitude, lng: hit.longitude });
      } catch {
        // ignore — user re-picks
      }
    })();
  }, [query.data, prefilled]);

  const categories = categoriesQuery.data ?? [];

  const hoursComplete = hours.every(
    (h) =>
      h.isClosed ||
      (TIME_RE.test(h.openTime ?? "") && TIME_RE.test(h.closeTime ?? "")),
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
    const next: PlaceEditTextErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof PlaceEditTextErrors;
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

  async function pickSuggestion(id: string) {
    setResolvingLocation(true);
    const resolved = await autocomplete.resolvePlace(id);
    setResolvingLocation(false);
    if (!resolved) {
      Alert.alert(
        "Couldn't use that location",
        "Please try another suggestion or type the address.",
      );
      return;
    }
    applyLocation(resolved.lat, resolved.lng, resolved.address);
  }

  async function useCurrentLocation() {
    setResolvingLocation(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Location access needed",
          "Allow location access to use your current position.",
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const [hit] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const label = hit
        ? [hit.name, hit.street, hit.city, hit.region, hit.country]
            .filter(Boolean)
            .join(", ")
        : `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      applyLocation(pos.coords.latitude, pos.coords.longitude, label);
    } catch {
      Alert.alert(
        "Couldn't get your location",
        "Please try again or type the address.",
      );
    } finally {
      setResolvingLocation(false);
    }
  }

  function setMapLocation(loc: { lat: number; lng: number; label: string }) {
    applyLocation(loc.lat, loc.lng, loc.label);
  }

  async function pickCover() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to pick a cover photo.",
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setNewCoverUri(picked.assets[0].uri);
  }

  function setHours(dayOfWeek: number, patch: Partial<PlaceOpeningHoursInput>) {
    setHoursState((prev) =>
      prev.map((h) => (h.dayOfWeek === dayOfWeek ? { ...h, ...patch } : h)),
    );
  }

  async function saveDetails(): Promise<UpdatePlaceResult | null> {
    if (!validateText()) return null;
    if (categoryId === null) {
      Alert.alert("Pick a category", "Choose the category that fits best.");
      return null;
    }
    if (!address.trim() || !coords) {
      Alert.alert(
        "Confirm the location",
        "Pick the address from a suggestion, the map, or your current location.",
      );
      return null;
    }

    return update.mutateAsync({
      placeId,
      name: name.trim(),
      description: description.trim(),
      categoryId,
      websiteUrl: website.trim() || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      socialLinks: socialLinks.current,
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      coverUri: newCoverUri,
    });
  }

  async function saveHours(): Promise<PlaceHoursStatusResult | null> {
    if (!hoursComplete) {
      Alert.alert(
        "Check your hours",
        "Every open day needs an open and close time in HH:MM format.",
      );
      return null;
    }
    return updateHours.mutateAsync(hours);
  }

  async function applyStatus(
    next: PlaceTemporaryStatus,
  ): Promise<PlaceHoursStatusResult | null> {
    const res = await setStatusMutation.mutateAsync({
      status: next,
      note: next ? statusNote.trim() || null : null,
    });
    if (res.status === 200) setStatus(next);
    return res;
  }

  const manageData =
    query.data && query.data.status === 200 ? query.data.data : null;
  const services: PlaceServiceRow[] = manageData?.services ?? [];
  // Gallery photos + the live cover public_id, read fresh from the query so
  // the Photos section reflects add / remove / set-cover without a reload.
  // Memoised so the empty-while-loading array stays referentially stable
  // (PlacePhotoManager re-syncs local order off this).
  const photos = useMemo(() => manageData?.photos ?? [], [manageData]);
  const coverPublicId = manageData?.place.cover_public_id ?? null;

  return {
    isLoading: query.isLoading,
    isReady: prefilled,
    services,
    loadError:
      query.isError ||
      (query.data && query.data.status !== 200 ? query.data.message : false),
    reload: () => query.refetch(),
    // core fields
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
    categories,
    categoriesLoading: categoriesQuery.isLoading,
    textErrors,
    // cover
    existingCover,
    newCoverUri,
    pickCover,
    // gallery
    photos,
    coverPublicId,
    // location
    autocomplete,
    address,
    coords,
    resolvingLocation,
    pickSuggestion,
    useCurrentLocation,
    setMapLocation,
    // hours
    hours,
    setHours,
    hoursComplete,
    saveHours,
    isSavingHours: updateHours.isPending,
    // status
    status,
    statusNote,
    setStatusNote,
    applyStatus,
    isSavingStatus: setStatusMutation.isPending,
    // details
    saveDetails,
    isSavingDetails: update.isPending,
  };
}

export type PlaceEdit = ReturnType<typeof usePlaceEdit>;
