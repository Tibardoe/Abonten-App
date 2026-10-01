import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useUpdateEvent } from "@/features/events/useUpdateEvent";
import { useUpdateEventTicketTypes } from "@/features/events/useUpdateEventTicketTypes";
import { api } from "@/lib/api";
import { combineDateAndTime, hhmm, isoDate } from "@/lib/datetime";
import { settleEnvelope } from "@/lib/envelope";
import { useQueryView } from "@/lib/useQueryView";
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
import {
  ticketCapacityHint,
  ticketCapacityProblem,
} from "@abonten/core/ticketCapacity";
import {
  paidTierProblem,
  ticketTierProblemMessage,
} from "@abonten/core/ticketTiers";
import { wallClockString } from "@abonten/core/time/timeZone";
import { getEventSchema } from "@abonten/validation/eventSchema";
import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FREE_TICKET_TYPE,
  SINGLE_TICKET_TYPE,
} from "@abonten/core/ticketTiers";
import { useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
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
  titleRequired: "giveYourEventATitle",
  titleTooLong: "thatTitleIsTooLongMax",
  descriptionRequired: "addADescription",
  invalidUrl: "enterAValidWebsiteUrl",
  priceNotNumber: "priceMustBeANumber",
  priceNegative: "priceCanTBeNegative",
  capacityNotNumber: "capacityMustBeANumber",
  capacityNotWhole: "capacityMustBeAWholeNumber",
  capacityMustBePositive: "capacityMustBeGreaterThanZero",
};

export type EventEditTextErrors = Partial<
  Record<"title" | "description" | "website_url" | "capacity", string>
>;

function splitIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: isoDate(d), time: hhmm(d) };
}

export function useEventEdit(eventId: string) {
  const t = useTranslations("events");
  const tc = useTranslations("core");

  const toast = useToast();
  const autocomplete = usePlacesAutocomplete();
  const update = useUpdateEvent();
  const updateTickets = useUpdateEventTicketTypes();
  const eventSchema = useMemo(
    () =>
      getEventSchema(
        Object.fromEntries(
          Object.entries(EVENT_MESSAGES).map(([name, key]) => [name, t(key)]),
        ) as typeof EVENT_MESSAGES,
      ),
    [t],
  );

  const query = useQuery({
    queryKey: ["mobile", "organizer", "event-edit", eventId],
    queryFn: async () =>
      settleEnvelope(await api.organizer.eventEditContext(eventId)),
    enabled: !!eventId,
  });
  const loadView = useQueryView(query);

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
  // One day vs an explicit start→end span (mirrors useEventWizard). "single"
  // leaves rangeEnd null; buildSchedule falls back to rangeStart.
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
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
  // Filled from the event (its market's currency) once it loads.
  const [ticketCurrency, setTicketCurrency] = useState("");

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
      setRangeStartTime(s.time);
      setRangeEndTime(e.time);
      // Only a real multi-day event opens in "range" mode.
      if (e.date !== s.date) {
        setDateMode("range");
        setRangeEnd(e.date);
      }
    }

    // Ticket types — mirrors the web inferInitialTicketState.
    const tt = event.ticket_type ?? [];
    setTicketCurrency(event.currency ?? tt[0]?.currency ?? "");
    if (tt.length === 1 && tt[0].type === FREE_TICKET_TYPE) {
      setTicketMode("free");
    } else if (tt.length === 1 && tt[0].type === SINGLE_TICKET_TYPE) {
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

  function setMapLocation(loc: { lat: number; lng: number; label: string }) {
    applyLocation(loc.lat, loc.lng, loc.label);
  }

  async function pickFlyer() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(t("photoAccessNeeded"), {
        description: t("allowPhotoAccessToPickAn"),
      });
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
        const check = validateSingleDateRange(tc, { from: start, to: end });
        if (!check.ok) return { ok: false, message: check.message };
      } else if (!start || !end) {
        return { ok: false, message: t("theScheduleLooksIncomplete") };
      }
      return {
        ok: true,
        startsAt: wallClockString(
          rangeStart as string,
          rangeStartTime,
        ) as string,
        endsAt: wallClockString(
          (rangeEnd ?? rangeStart) as string,
          rangeEndTime,
        ) as string,
      };
    }
    const entries = occurrences.map((o) => ({
      start: combineDateAndTime(o.dateIso, o.start),
      end: combineDateAndTime(o.dateIso, o.end),
    }));
    if (entries.some((e) => !e.start || !e.end)) {
      return {
        ok: false,
        message: t("everyDateNeedsAValidStart"),
      };
    }
    if (!locked) {
      const check = validateSpecificDates(
        tc,
        entries.map((e) => ({ start: e.start as Date, end: e.end as Date })),
      );
      if (!check.ok) return { ok: false, message: check.message };
    }
    return {
      ok: true,
      specificDates: occurrences.map((o) => ({
        start: wallClockString(o.dateIso, o.start) as string,
        end: wallClockString(o.dateIso, o.end) as string,
      })),
    };
  }

  async function save(): Promise<UpdateEventResult | null> {
    if (!validateText()) return null;
    if (!category) {
      toast.error(t("pickACategory"), {
        description: t("chooseTheCategoryThatFitsBest"),
      });
      return null;
    }
    if (types.length === 0) {
      toast.error(t("pickAtLeastOneType"), {
        description: t("addOneOrMoreEventTypes"),
      });
      return null;
    }
    if (!address.trim() || !coords) {
      toast.error(t("confirmTheLocation"), {
        description: t("pickTheAddressFromASuggestion"),
      });
      return null;
    }

    const schedule = buildSchedule();
    if (!schedule.ok) {
      toast.error(t("checkTheSchedule"), { description: schedule.message });
      return null;
    }

    if (capacityProblem) {
      toast.error(t("checkTheCapacity"), { description: capacityProblem });
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

  // Capacity (core fields) vs the ticket quantities (their own save), live —
  // the same rule updateEventCore / updateEventTicketTypesCore and the
  // database apply (@abonten/core/ticketCapacity). Both saves hold while
  // the two disagree, because each would be refused by the server anyway.
  const capacityNumber =
    capacity.trim() === "" ? null : Number(capacity.trim());
  const tiersForCapacity =
    ticketMode === "single"
      ? [
          {
            quantity:
              ticketQuantity.trim() === "" ? null : Number(ticketQuantity),
          },
        ]
      : ticketMode === "multiple"
        ? tiers.map((t) => ({
            quantity: t.quantity.trim() === "" ? null : Number(t.quantity),
          }))
        : [];
  const capacityProblem =
    ticketMode === "free"
      ? null
      : ticketCapacityProblem(tc, capacityNumber, tiersForCapacity);
  const capacityHint =
    ticketMode === "free"
      ? null
      : ticketCapacityHint(tc, capacityNumber, tiersForCapacity);

  async function saveTicketTypes(): Promise<UpdateEventTicketTypesResult | null> {
    if (locked) return null;
    if (capacityProblem) {
      toast.error(t("checkTheCapacity"), { description: capacityProblem });
      return null;
    }

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
        toast.error(t("checkThePrice"), {
          description: t("enterATicketPriceGreaterThan"),
        });
        return null;
      }
      if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
        toast.error(t("checkTheQuantity"), {
          description: t("quantityMustBeAWholeNumber"),
        });
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
      toast.error(t("addATicketType"), {
        description: t("addAtLeastOneTicketType"),
      });
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
      toast.error(t("checkTheTicketTypes"), {
        description: t("eachTicketTypeNeedsAName"),
      });
      return null;
    }
    const tierProblem = parsed.map(paidTierProblem).find(Boolean);
    if (tierProblem) {
      toast.error(t("checkTheTicketTypes"), {
        description: ticketTierProblemMessage(tc, tierProblem),
      });
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
    /** Loading, offline and failed, told apart, for the form's gate. */
    loadView,
    loadError:
      query.isError ||
      (query.data && query.data.status !== 200
        ? (query.data as { message?: string }).message ||
          t("couldnTLoadThisEvent")
        : null),
    reload: () => query.refetch(),
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
    dateMode,
    setDateMode: (m: "single" | "range") => {
      setDateMode(m);
      if (m === "single") setRangeEnd(null);
    },
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
    capacityProblem,
    capacityHint,
    /** The saved ticketing is the FREE tier (promo codes unavailable). */
    savedFree:
      query.data?.status === 200 &&
      (query.data.data.event.ticket_type ?? []).some((t) => t.type === "FREE"),
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
