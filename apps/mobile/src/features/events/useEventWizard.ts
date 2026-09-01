import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useEventCreate } from "@/features/events/useEventCreate";
import { combineDateAndTime } from "@/lib/datetime";
import { uuidv4 } from "@/lib/uuid";
import type { EventCreateBody, EventCreateResult } from "@abonten/api-client";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import {
  validateSingleDateRange,
  validateSpecificDates,
} from "@abonten/core/eventDateValidation";
import { getEventSchema } from "@abonten/validation/eventSchema";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

// All state, validation and submit logic for the native event-creation
// wizard — the mobile echo of the web useEventUploadForm hook. Create-only;
// save-as-draft is WP-4g, and the optional Abonten-Place venue picker is
// deferred (placeId stays null, as it is for most web events).

const EVENT_MESSAGES = {
  titleRequired: "Give your event a title.",
  titleTooLong: "That title is too long (max 150 characters).",
  descriptionRequired: "Add a description.",
  invalidUrl: "Enter a valid website URL.",
  priceNotNumber: "Price must be a number.",
  priceNegative: "Price can't be negative.",
  capacityNotNumber: "Capacity must be a number.",
  capacityNotWhole: "Capacity must be a whole number.",
  capacityMustBePositive: "Capacity must be greater than zero.",
};

// Mobile has no country-metadata lookup; the web form's currency query also
// falls back to this. Ticket prices are entered in this currency.
const CURRENCY = "GHS";

export type ScheduleMode = "single" | "specific";
export type TicketMode = "free" | "single" | "multiple";

// Each editable-list row carries a stable `id` (generated on add) so React
// keys survive reordering/removal — the values themselves aren't unique.
export type OccurrenceDraft = {
  id: string;
  dateIso: string;
  start: string;
  end: string;
};
export type TicketTier = {
  id: string;
  name: string;
  price: string;
  quantity: string;
};
export type PromoDraft = {
  id: string;
  promoCode: string;
  discount: string;
  maximumUse: string;
  expiryIso: string;
};

export type EventWizardTextErrors = Partial<
  Record<"title" | "description" | "website_url" | "capacity", string>
>;

export function useEventWizard() {
  const autocomplete = usePlacesAutocomplete();
  const create = useEventCreate();

  const clientRequestId = useRef(uuidv4()).current;
  const eventSchema = useMemo(() => getEventSchema(EVENT_MESSAGES), []);

  const [step, setStep] = useState(0);

  // basics
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [capacity, setCapacity] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [requireRegistration, setRequireRegistration] = useState(false);
  const [textErrors, setTextErrors] = useState<EventWizardTextErrors>({});

  // flyer
  const [flyerUri, setFlyerUri] = useState<string | null>(null);

  // schedule
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("single");
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [rangeStartTime, setRangeStartTime] = useState("18:00");
  const [rangeEndTime, setRangeEndTime] = useState("22:00");
  const [occurrences, setOccurrences] = useState<OccurrenceDraft[]>([]);

  // location
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [resolvingLocation, setResolvingLocation] = useState(false);

  // tickets
  const [ticketMode, setTicketMode] = useState<TicketMode>("single");
  const [ticketPrice, setTicketPrice] = useState("");
  const [ticketQuantity, setTicketQuantity] = useState("");
  const [tiers, setTiers] = useState<TicketTier[]>([]);

  // promo codes
  const [promos, setPromos] = useState<PromoDraft[]>([]);

  const categoryTypes = useMemo(
    () =>
      eventCategoriesAndTypes.find((c) => c.category === category)?.types ?? [],
    [category],
  );

  function toggleType(t: string) {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  function selectCategory(c: string) {
    setCategory(c);
    // Drop any previously-picked types that don't belong to the new category.
    const allowed = new Set(
      eventCategoriesAndTypes.find((x) => x.category === c)?.types ?? [],
    );
    setTypes((prev) => prev.filter((t) => allowed.has(t)));
  }

  function validateText(): boolean {
    const capNum = capacity.trim() === "" ? undefined : Number(capacity.trim());
    const result = eventSchema.safeParse({
      title,
      description,
      website_url: website,
      capacity: capNum,
    });
    if (result.success) {
      setTextErrors({});
      return true;
    }
    const next: EventWizardTextErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof EventWizardTextErrors;
      if (key && !next[key]) next[key] = issue.message;
    }
    setTextErrors(next);
    return false;
  }

  function validateBasics(): boolean {
    if (!validateText()) return false;
    if (!category) {
      Alert.alert("Pick a category", "Choose the category that fits best.");
      return false;
    }
    if (types.length === 0) {
      Alert.alert("Pick at least one type", "Add one or more event types.");
      return false;
    }
    return true;
  }

  // location — same three paths as the place wizard
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

  function setMapLocation(loc: { lat: number; lng: number; label: string }) {
    applyLocation(loc.lat, loc.lng, loc.label);
  }

  async function pickFlyer() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to pick an event flyer.",
      );
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setFlyerUri(picked.assets[0].uri);
  }

  // Resolve the schedule step into the shape the API expects, or return an
  // error message.
  function buildSchedule():
    | {
        ok: true;
        startsAt?: string;
        endsAt?: string;
        specificDates?: { start: string; end: string }[];
      }
    | { ok: false; message: string } {
    if (scheduleMode === "single") {
      const start = combineDateAndTime(rangeStart, rangeStartTime);
      const end = combineDateAndTime(rangeEnd ?? rangeStart, rangeEndTime);
      const check = validateSingleDateRange({ from: start, to: end });
      if (!check.ok) return { ok: false, message: check.message };
      return {
        ok: true,
        startsAt: (start as Date).toISOString(),
        endsAt: (end as Date).toISOString(),
      };
    }
    const entries = occurrences.map((o) => ({
      start: combineDateAndTime(o.dateIso, o.start),
      end: combineDateAndTime(o.dateIso, o.end),
    }));
    if (entries.some((e) => !e.start || !e.end)) {
      return {
        ok: false,
        message: "Every date needs a valid start and end time.",
      };
    }
    const check = validateSpecificDates(
      entries.map((e) => ({ start: e.start as Date, end: e.end as Date })),
    );
    if (!check.ok) return { ok: false, message: check.message };
    return {
      ok: true,
      specificDates: entries.map((e) => ({
        start: (e.start as Date).toISOString(),
        end: (e.end as Date).toISOString(),
      })),
    };
  }

  function buildTickets():
    | {
        ok: true;
        body: Pick<
          EventCreateBody,
          "freeEvent" | "singleTicket" | "multipleTickets"
        >;
      }
    | { ok: false; message: string } {
    if (ticketMode === "free") {
      return { ok: true, body: { freeEvent: true } };
    }
    if (ticketMode === "single") {
      const price = Number(ticketPrice);
      const qty = ticketQuantity.trim() === "" ? null : Number(ticketQuantity);
      if (!Number.isFinite(price) || price <= 0) {
        return {
          ok: false,
          message: "Enter a ticket price greater than zero.",
        };
      }
      if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
        return {
          ok: false,
          message: "Quantity must be a whole number above zero.",
        };
      }
      return {
        ok: true,
        body: { singleTicket: { price, quantity: qty } },
      };
    }
    const parsed = tiers.map((t) => ({
      type: t.name.trim(),
      price: Number(t.price),
      quantity: t.quantity.trim() === "" ? null : Number(t.quantity),
    }));
    if (parsed.length === 0) {
      return { ok: false, message: "Add at least one ticket type." };
    }
    if (
      parsed.some(
        (t) =>
          !t.type ||
          !Number.isFinite(t.price) ||
          t.price < 0 ||
          (t.quantity != null &&
            (!Number.isFinite(t.quantity) || t.quantity <= 0)),
      )
    ) {
      return {
        ok: false,
        message: "Each ticket type needs a name, a price and a valid quantity.",
      };
    }
    return { ok: true, body: { multipleTickets: parsed } };
  }

  function buildPromos(): EventCreateBody["promoCodes"] {
    const cleaned = promos
      .map((p) => ({
        promoCode: p.promoCode.trim().toUpperCase(),
        discount: Number(p.discount),
        maximumUse: Number(p.maximumUse),
        expiryDate: p.expiryIso,
      }))
      .filter(
        (p) =>
          p.promoCode &&
          Number.isFinite(p.discount) &&
          p.discount > 0 &&
          p.discount <= 100 &&
          Number.isFinite(p.maximumUse) &&
          p.maximumUse > 0 &&
          !!p.expiryDate,
      );
    return cleaned.length > 0 ? cleaned : null;
  }

  async function submit(): Promise<EventCreateResult | null> {
    if (!category || !coords || !flyerUri) return null;

    const schedule = buildSchedule();
    if (!schedule.ok) {
      Alert.alert("Check the schedule", schedule.message);
      return null;
    }
    const tickets = buildTickets();
    if (!tickets.ok) {
      Alert.alert("Check ticketing", tickets.message);
      return null;
    }

    const capNum =
      capacity.trim() === "" ? null : Math.trunc(Number(capacity.trim()));

    return create.mutateAsync({
      title: title.trim(),
      description: description.trim(),
      category,
      types,
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      capacity: capNum && Number.isFinite(capNum) && capNum > 0 ? capNum : null,
      websiteUrl: website.trim() || null,
      requireRegistration,
      currency: CURRENCY,
      clientRequestId,
      flyerUri,
      startsAt: schedule.startsAt ?? null,
      endsAt: schedule.endsAt ?? null,
      specificDates: schedule.specificDates ?? null,
      ...tickets.body,
      promoCodes: buildPromos(),
      placeId: null,
    });
  }

  return {
    step,
    setStep,
    // basics
    title,
    setTitle,
    description,
    setDescription,
    website,
    setWebsite,
    capacity,
    setCapacity,
    category,
    selectCategory,
    categories: eventCategoriesAndTypes.map((c) => c.category),
    categoryTypes,
    types,
    toggleType,
    requireRegistration,
    setRequireRegistration,
    textErrors,
    validateBasics,
    // flyer
    flyerUri,
    pickFlyer,
    // schedule
    scheduleMode,
    setScheduleMode,
    rangeStart,
    rangeEnd,
    setRange: (r: { start: string | null; end: string | null }) => {
      setRangeStart(r.start);
      setRangeEnd(r.end);
    },
    rangeStartTime,
    setRangeStartTime,
    rangeEndTime,
    setRangeEndTime,
    occurrences,
    setOccurrences,
    // location
    autocomplete,
    address,
    coords,
    resolvingLocation,
    pickSuggestion,
    useCurrentLocation,
    setMapLocation,
    // tickets
    ticketMode,
    setTicketMode,
    ticketPrice,
    setTicketPrice,
    ticketQuantity,
    setTicketQuantity,
    tiers,
    setTiers,
    currency: CURRENCY,
    // promos
    promos,
    setPromos,
    // submit
    submit,
    isSubmitting: create.isPending,
    isSubmitError: create.isError,
  };
}

export type EventWizard = ReturnType<typeof useEventWizard>;
