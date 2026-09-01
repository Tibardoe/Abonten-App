import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useCreatePlace } from "@/features/places/useCreatePlace";
import { uuidv4 } from "@/lib/uuid";
import type {
  PlaceCreateResult,
  PlaceOpeningHoursInput,
} from "@abonten/api-client";
import { getPlaceSchema } from "@abonten/validation/placeSchema";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

// All state, validation and submit logic for the native place-creation
// wizard — the mobile echo of the web usePlaceUploadForm hook, so the
// screen (app/(app)/place/new.tsx) and its four step components stay thin
// and presentational. Create-only; save-as-draft is WP-4g.

export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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
  nameRequired: "Give your place a name.",
  nameTooLong: "That name is too long (max 150 characters).",
  descriptionRequired: "Add a short description.",
  descriptionTooLong: "That description is too long (max 2000 characters).",
  invalidUrl: "Enter a valid website URL.",
  invalidPhone: "Enter a valid phone number.",
  invalidWhatsapp: "Enter a valid WhatsApp number.",
};

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type PlaceWizardTextErrors = Partial<
  Record<"name" | "description" | "website_url" | "phone" | "whatsapp", string>
>;

export function usePlaceWizard() {
  const categoriesQuery = usePlaceCategories();
  const autocomplete = usePlacesAutocomplete();
  const create = useCreatePlace();

  const clientRequestId = useRef(uuidv4()).current;
  const placeSchema = useMemo(() => getPlaceSchema(PLACE_MESSAGES), []);

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

  const [openingHours, setOpeningHours] = useState<PlaceOpeningHoursInput[]>(
    DEFAULT_OPENING_HOURS,
  );

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
      Alert.alert(
        "Couldn't get your location",
        "Please try again or type the address.",
      );
    } finally {
      setResolvingLocation(false);
    }
  }

  /** Commit a point chosen on the map picker. */
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
    setCoverUri(picked.assets[0].uri);
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
      Alert.alert("Pick a category", "Choose the category that fits best.");
      return false;
    }
    if (!address || !coords) {
      Alert.alert(
        "Add a location",
        "Pick a suggestion, choose on the map, or use your current location so people can find this place.",
      );
      return false;
    }
    return true;
  }

  async function submit(): Promise<PlaceCreateResult | null> {
    if (categoryId === null || !coords || !coverUri) return null;
    if (!hoursComplete) {
      Alert.alert(
        "Check your hours",
        "Every open day needs an open and close time in HH:MM format.",
      );
      return null;
    }

    return create.mutateAsync({
      name: name.trim(),
      categoryId,
      description: description.trim(),
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      coverUri,
      openingHours,
      websiteUrl: website.trim() || null,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      clientRequestId,
    });
  }

  return {
    // step
    step,
    setStep,
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
    pickCover,
    // hours
    openingHours,
    setHours,
    hoursComplete,
    // submit
    validateBasics,
    submit,
    isSubmitting: create.isPending,
    isSubmitError: create.isError,
  };
}

export type PlaceWizard = ReturnType<typeof usePlaceWizard>;
