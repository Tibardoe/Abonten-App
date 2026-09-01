import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useUpdateEvent } from "@/features/events/useUpdateEvent";
import { useUpdateEventTicketTypes } from "@/features/events/useUpdateEventTicketTypes";
import { api } from "@/lib/api";
import { combineDateAndTime, hhmm, isoDate } from "@/lib/datetime";
import type {
  EventForEditData,
  UpdateEventResult,
  UpdateEventTicketTypesResult,
} from "@abonten/api-client";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import {
  validateSingleDateRange,
  validateSpecificDates,
} from "@abonten/core/eventDateValidation";
import { parseEventTypes } from "@abonten/core/parseEventTypes";
import { getEventSchema } from "@abonten/validation/eventSchema";
import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import type {
  OccurrenceDraft,
  ScheduleMode,
  TicketMode,
  TicketTier,
} from "./useEventWizard";

// Mobile echo of the web useEventEditForm hook. Edits the core, non-ticketing
// fields of an event the organizer already created; ticketing/promo state is
// deliberately untouched (updateEventCore doesn't accept those). Dates,
// location and capacity lock once the event has a confirmed ticket
// (`hasConfirmedParticipation`) — the screen disables them and the server
// re-checks.

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

export type EventEditTextErrors = Partial<
  Record<"title" | "description" | "website_url" | "capacity", string>
>;

function splitIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: isoDate(d), time: hhmm(d) };
}

export function useEventEdit(eventId: string) {
  const autocomplete = usePlacesAutocomplete();
  const update = useUpdateEvent();
  const updateTickets = useUpdateEventTicketTypes();
  const eventSchema = useMemo(() => getEventSchema(EVENT_MESSAGES), []);

  const query = useQuery({
    queryKey: ["mobile", "organizer", "event-edit", eventId],
    queryFn: () => api.organizer.eventEditContext(eventId),
    enabled: !!eventId,
  });

  const [prefilled, setPrefilled] = useState(false);
  const [locked, setLocked] = useState(false);

  // basics
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [capacity, setCapacity] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [requireRegistration, setRequireRegistration] = useState(false);
  const [textErrors, setTextErrors] = useState<EventEditTextErrors>({});

  // flyer — the existing Cloudinary flyer, plus an optional replacement URI
  const [existingFlyer, setExistingFlyer] = useState<{
    publicId: string;
    version: string;
  } | null>(null);
  const [newFlyerUri, setNewFlyerUri] = useState<string | null>(null);

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

  // ticket types — a separate save, like the web ManageEventDetailsSection.
  // Read-only once the event has confirmed tickets (`locked`).
  const [ticketMode, setTicketMode] = useState<TicketMode>("single");
  const [ticketPrice, setTicketPrice] = useState("");
  const [ticketQuantity, setTicketQuantity] = useState("");
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [ticketCurrency, setTicketCurrency] = useState("GHS");

  const seededAddress = useRef<string>("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: prefill runs once when the fetch resolves.
  useEffect(() => {
    if (prefilled || !query.data || query.data.status !== 200) return;

    const { event, hasConfirmedParticipation } = query.data.data;
    setLocked(hasConfirmedParticipation);

    setTitle(event.title ?? "");
    setDescription(event.description ?? "");
    setWebsite(event.website_url ?? "");
    setCapacity(event.capacity != null ? String(event.capacity) : "");
    setCategory(event.event_category ?? null);
    setTypes(parseEventTypes(event.event_type));
    setRequireRegistration(!!event.require_registration);
    setExistingFlyer({
      publicId: event.flyer_public_id,
      version: event.flyer_version,
    });

    const storedAddress = event.address?.full_address ?? "";
    setAddress(storedAddress);
    autocomplete.setQuery(storedAddress);
    seededAddress.current = storedAddress;

    const occ = event.event_occurrence ?? [];
    if (occ.length > 0) {
      setScheduleMode("specific");
      setOccurrences(
        occ.map((o) => {
          const s = splitIso(o.starts_at);
          const e = splitIso(o.ends_at);
          return {
            id: o.id,
            dateIso: s.date,
            start: s.time,
            end: e.time,
          };
        }),
      );
    } else if (event.starts_at && event.ends_at) {
      setScheduleMode("single");
      const s = splitIso(event.starts_at);
      const e = splitIso(event.ends_at);
      setRangeStart(s.date);
      setRangeEnd(e.date);
      setRangeStartTime(s.time);
      setRangeEndTime(e.time);
    }

    // Ticket types — mirrors the web inferInitialTicketState.
    const tt = event.ticket_type ?? [];
    setTicketCurrency(tt[0]?.currency ?? "GHS");
    if (tt.length === 1 && tt[0].type === "FREE") {
      setTicketMode("free");
    } else if (tt.length === 1 && tt[0].type === "SINGLE TICKET") {
      setTicketMode("single");
      setTicketPrice(String(tt[0].price));
      setTicketQuantity(tt[0].quantity != null ? String(tt[0].quantity) : "");
    } else if (tt.length > 0) {
      setTicketMode("multiple");
      setTiers(
        tt.map((t) => ({
          id: t.id,
          name: t.type,
          price: String(t.price),
          quantity: t.quantity != null ? String(t.quantity) : "",
        })),
      );
    }

    setPrefilled(true);

    // Best-effort: forward-geocode the stored address so an unchanged
    // location still submits with coordinates. If it fails the user must
    // re-pick before Save (validateLocationInput needs finite coords).
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

  const categoryTypes = useMemo(
    () =>
      eventCategoriesAndTypes.find((c) => c.category === category)?.types ?? [],
    [category],
  );

  function selectCategory(c: string) {
    setCategory(c);
    const allowed = new Set(
      eventCategoriesAndTypes.find((x) => x.category === c)?.types ?? [],
    );
    setTypes((prev) => prev.filter((t) => allowed.has(t)));
  }

  function toggleType(t: string) {
    setTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
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
    const next: EventEditTextErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof EventEditTextErrors;
      if (key && !next[key]) next[key] = issue.message;
    }
    setTextErrors(next);
    return false;
  }

  // location — same three paths as the create wizard
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
    setNewFlyerUri(picked.assets[0].uri);
  }

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
      // The locked event keeps its original schedule — skip the 5-hour
      // notice check, which would fail for an event starting soon that
      // already has tickets. The server rejects any actual date change.
      if (!locked) {
        const check = validateSingleDateRange({ from: start, to: end });
        if (!check.ok) return { ok: false, message: check.message };
      } else if (!start || !end) {
        return { ok: false, message: "The schedule looks incomplete." };
      }
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
    if (!locked) {
      const check = validateSpecificDates(
        entries.map((e) => ({ start: e.start as Date, end: e.end as Date })),
      );
      if (!check.ok) return { ok: false, message: check.message };
    }
    return {
      ok: true,
      specificDates: entries.map((e) => ({
        start: (e.start as Date).toISOString(),
        end: (e.end as Date).toISOString(),
      })),
    };
  }

  async function save(): Promise<UpdateEventResult | null> {
    if (!validateText()) return null;
    if (!category) {
      Alert.alert("Pick a category", "Choose the category that fits best.");
      return null;
    }
    if (types.length === 0) {
      Alert.alert("Pick at least one type", "Add one or more event types.");
      return null;
    }
    if (!address.trim() || !coords) {
      Alert.alert(
        "Confirm the location",
        "Pick the address from a suggestion, the map, or your current location.",
      );
      return null;
    }

    const schedule = buildSchedule();
    if (!schedule.ok) {
      Alert.alert("Check the schedule", schedule.message);
      return null;
    }

    const capNum =
      capacity.trim() === "" ? null : Math.trunc(Number(capacity.trim()));

    return update.mutateAsync({
      eventId,
      title: title.trim(),
      description: description.trim(),
      address: address.trim(),
      latitude: coords.lat,
      longitude: coords.lng,
      category,
      types,
      checked: requireRegistration,
      capacity:
        capNum != null && Number.isFinite(capNum) && capNum > 0 ? capNum : null,
      websiteUrl: website.trim() || null,
      startsAt: schedule.startsAt ?? null,
      endsAt: schedule.endsAt ?? null,
      specificDates: schedule.specificDates ?? null,
      flyerUri: newFlyerUri,
    });
  }

  async function saveTicketTypes(): Promise<UpdateEventTicketTypesResult | null> {
    if (locked) return null;

    if (ticketMode === "free") {
      return updateTickets.mutateAsync({
        eventId,
        currency: ticketCurrency,
        freeEvent: true,
      });
    }

    if (ticketMode === "single") {
      const price = Number(ticketPrice);
      const qty = ticketQuantity.trim() === "" ? null : Number(ticketQuantity);
      if (!Number.isFinite(price) || price <= 0) {
        Alert.alert(
          "Check the price",
          "Enter a ticket price greater than zero.",
        );
        return null;
      }
      if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
        Alert.alert(
          "Check the quantity",
          "Quantity must be a whole number above zero.",
        );
        return null;
      }
      return updateTickets.mutateAsync({
        eventId,
        currency: ticketCurrency,
        singleTicket: { price, quantity: qty },
      });
    }

    const parsed = tiers.map((t) => ({
      type: t.name.trim(),
      price: Number(t.price),
      quantity: t.quantity.trim() === "" ? null : Number(t.quantity),
    }));
    if (parsed.length === 0) {
      Alert.alert("Add a ticket type", "Add at least one ticket type.");
      return null;
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
      Alert.alert(
        "Check the ticket types",
        "Each ticket type needs a name, a price and a valid quantity.",
      );
      return null;
    }
    return updateTickets.mutateAsync({
      eventId,
      currency: ticketCurrency,
      multipleTickets: parsed,
    });
  }

  return {
    isLoading: query.isLoading,
    loadError:
      query.isError ||
      (query.data && query.data.status !== 200
        ? (query.data as { message?: string }).message ||
          "Couldn't load this event."
        : null),
    isReady: prefilled,
    locked,
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
    // flyer
    existingFlyer,
    newFlyerUri,
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
    // ticket types
    ticketMode,
    setTicketMode,
    ticketPrice,
    setTicketPrice,
    ticketQuantity,
    setTicketQuantity,
    tiers,
    setTiers,
    ticketCurrency,
    saveTicketTypes,
    isSavingTicketTypes: updateTickets.isPending,
    // submit
    save,
    isSaving: update.isPending,
  };
}

export type EventEdit = ReturnType<typeof useEventEdit>;
export type { EventForEditData };
