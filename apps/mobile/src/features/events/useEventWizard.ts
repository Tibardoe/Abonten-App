import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useEventCreate } from "@/features/events/useEventCreate";
import {
  useEventDraft,
  useSaveEventDraft,
} from "@/features/events/useEventDrafts";
import { useUploadProgress } from "@/features/uploads/useUploadProgress";
import { api } from "@/lib/api";
import { TIME_RE, combineDateAndTime, hhmm, isoDate } from "@/lib/datetime";
import { uuidv4 } from "@/lib/uuid";
import type {
  EventCreateBody,
  EventCreateResult,
  EventDraftPayload,
  SaveEventDraftResult,
} from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import {
  validateSingleDateRange,
  validateSpecificDates,
} from "@abonten/core/eventDateValidation";
import {
  ticketCapacityHint,
  ticketCapacityProblem,
} from "@abonten/core/ticketCapacity";
import { paidTierProblem } from "@abonten/core/ticketTiers";
import { wallClockString } from "@abonten/core/time/timeZone";
import { getEventSchema } from "@abonten/validation/eventSchema";
import { useQuery } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@abonten/ui-native";

// All state, validation and submit logic for the native event-creation
// wizard — the mobile echo of the web useEventUploadForm hook. Publishes an
// event, and (WP-4g-2) saves / resumes a draft against the same
// drafts/event_drafts rows the web saveEventDraft action writes.
//
// Venue: like the web form's PlaceSearchSelect, the Location step can pin
// the event to one of the organizer's own Abonten Places (`venuePlace`),
// which fills the address + coordinates and sends `placeId` so the event
// appears under "Upcoming events here" on that place's page. Opened from
// Manage Place › "Add an event here", the place is pre-selected. Every
// event created from this wizard used to send `placeId: null`, so a place
// owner's own events never showed on their place.

const isRemote = (uri: string | null): boolean =>
  !!uri && /^https?:/i.test(uri);

const splitIso = (iso: string): { date: string; time: string } => {
  const d = new Date(iso);
  return { date: isoDate(d), time: hhmm(d) };
};

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

export type VenuePlace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
};

export function useEventWizard(
  resumeDraftId?: string,
  options: { preselectedPlace?: VenuePlace | null } = {},
) {
  const toast = useToast();
  const autocomplete = usePlacesAutocomplete();
  const create = useEventCreate();
  const saveDraftMutation = useSaveEventDraft();
  const draftQuery = useEventDraft(resumeDraftId);
  // Flyer uploads are the slow part of both Publish and Save-as-draft; the
  // wizard owns one progress state so the screen can show a real bar
  // instead of a spinner that says nothing.
  const uploadProgress = useUploadProgress();

  const clientRequestId = useRef(uuidv4()).current;
  const eventSchema = useMemo(() => getEventSchema(EVENT_MESSAGES), []);

  // Draft tracking: `currentDraftId` becomes set after the first save (or is
  // seeded when resuming); `draftUpdatedAt` feeds the optimistic-concurrency
  // check; `savedFlyerUri` is the flyer URI already persisted, so an
  // unchanged flyer isn't re-uploaded on every save.
  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(
    resumeDraftId,
  );
  const draftUpdatedAt = useRef<string | undefined>(undefined);
  const savedFlyerUri = useRef<string | null>(null);
  // The resumed draft's already-uploaded flyer, reused on Publish instead of
  // trying to re-upload a Cloudinary URL.
  const resumedFlyer = useRef<{ publicId: string; version: string } | null>(
    null,
  );
  const hydratedRef = useRef(false);

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

  // flyer — the picked source dimensions ride along so the in-app
  // crop/rotate/flip editor (ImageCropModal) can be re-opened on it.
  const [flyerUri, setFlyerUri] = useState<string | null>(null);
  const [flyerSize, setFlyerSize] = useState<{ w: number; h: number } | null>(
    null,
  );

  // schedule
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("single");
  // Within a single-event schedule: one calendar day, or an explicit
  // start-day → end-day span. "single" leaves rangeEnd null and the
  // schedule builder falls back to rangeStart for the end date.
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
  // The venue decides the market: the currency prices are entered in and
  // the zone the times are read in (same resolver the server saves with).
  const venueMarket = useQuery({
    queryKey: ["listing-market", coords?.lat, coords?.lng],
    queryFn: () =>
      api.markets.at({
        lat: coords?.lat as number,
        lng: coords?.lng as number,
      }),
    enabled: coords !== null,
    staleTime: 10 * 60 * 1000,
  });
  const CURRENCY = venueMarket.data?.data?.currency ?? null;
  const venueMarketMessage =
    venueMarket.data && venueMarket.data.status !== 200
      ? (venueMarket.data.message ?? null)
      : null;
  const venueTimeZone = venueMarket.data?.data?.timeZone ?? null;

  const [resolvingLocation, setResolvingLocation] = useState(false);
  // The Abonten Place this event happens at, if any (see the header note).
  const [venuePlace, setVenuePlaceState] = useState<VenuePlace | null>(null);
  const preselectApplied = useRef(false);

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

  function clearTextError(key: keyof EventWizardTextErrors) {
    setTextErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
      toast.error("Pick a category", {
        description: "Choose the category that fits best.",
      });
      return false;
    }
    if (types.length === 0) {
      toast.error("Pick at least one type", {
        description: "Add one or more event types.",
      });
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
    setVenuePlaceState(null);
    setResolvingLocation(true);
    const resolved = await autocomplete.resolvePlace(placeId);
    setResolvingLocation(false);
    if (!resolved) {
      toast.error("Couldn't use that location", {
        description: "Please try another suggestion or type the address.",
      });
      return;
    }
    applyLocation(resolved.lat, resolved.lng, resolved.address);
  }

  async function useCurrentLocation() {
    setVenuePlaceState(null);
    setResolvingLocation(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        toast.error("Location access needed", {
          description: "Allow location access to use your current position.",
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
      toast.error("Couldn't get your location", {
        description: "Please try again or type the address.",
      });
    } finally {
      setResolvingLocation(false);
    }
  }

  // Pinning a venue fills the address from the place; changing the address
  // any other way (typing, map, GPS) unpins it, so the two can never
  // disagree — same rule as the web form's clearSelectedPlace.
  function setVenuePlace(place: VenuePlace | null) {
    setVenuePlaceState(place);
    if (place) {
      setAddress(place.address);
      autocomplete.setQuery(place.address);
      autocomplete.clear();
      setCoords({ lat: place.lat, lng: place.lng });
    }
  }

  const preselectedPlace = options.preselectedPlace ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the preselected venue is applied exactly once, by id; setVenuePlace is a stable closure over state setters
  useEffect(() => {
    if (!preselectedPlace || preselectApplied.current) return;
    preselectApplied.current = true;
    setVenuePlace(preselectedPlace);
  }, [preselectedPlace?.id]);

  function setMapLocation(loc: { lat: number; lng: number; label: string }) {
    setVenuePlaceState(null);
    applyLocation(loc.lat, loc.lng, loc.label);
  }

  // Returns the freshly-picked local asset so the caller can open the
  // in-app editor on it; no OS crop UI (the editor does crop/rotate/flip).
  async function pickFlyer(): Promise<{
    uri: string;
    width: number;
    height: number;
  } | null> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error("Photo access needed", {
        description: "Allow photo access to pick an event flyer.",
      });
      return null;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    const asset = picked.canceled ? null : picked.assets?.[0];
    if (!asset) return null;
    setFlyerUri(asset.uri);
    setFlyerSize({ w: asset.width ?? 0, h: asset.height ?? 0 });
    return {
      uri: asset.uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    };
  }

  // Commit the editor's baked result.
  function setFlyer(uri: string, w: number, h: number) {
    setFlyerUri(uri);
    setFlyerSize({ w, h });
  }

  // --- draft: hydrate on resume ------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot hydration guarded by hydratedRef; the setters are stable
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!resumeDraftId || draftQuery.data?.status !== 200) return;
    hydratedRef.current = true;

    const detail = draftQuery.data.data;
    const p = detail.payload;
    draftUpdatedAt.current = detail.updatedAt;

    if (p.title) setTitle(p.title);
    if (p.description) setDescription(p.description);
    if (p.websiteUrl) setWebsite(p.websiteUrl);
    if (p.capacity != null) setCapacity(String(p.capacity));
    if (p.category) setCategory(p.category);
    if (p.types?.length) setTypes(p.types);
    if (p.requireRegistration != null)
      setRequireRegistration(p.requireRegistration);

    if (detail.flyerPublicId && detail.flyerVersion) {
      const url = buildCloudinaryUrl(
        detail.flyerPublicId,
        detail.flyerVersion,
        { width: 800 },
      );
      setFlyerUri(url);
      savedFlyerUri.current = url;
      resumedFlyer.current = {
        publicId: detail.flyerPublicId,
        version: detail.flyerVersion,
      };
    }

    if (p.dateType === "specific") {
      setScheduleMode("specific");
      if (p.multipleDates?.length) {
        setOccurrences(
          p.multipleDates.map((d) => {
            const s = splitIso(d.start);
            return {
              id: uuidv4(),
              dateIso: s.date,
              start: s.time,
              end: splitIso(d.end).time,
            };
          }),
        );
      }
    } else if (p.singleDateRange?.from) {
      setScheduleMode("single");
      const from = splitIso(p.singleDateRange.from);
      setRangeStart(from.date);
      setRangeStartTime(from.time);
      if (p.singleDateRange.to) {
        const to = splitIso(p.singleDateRange.to);
        setRangeEndTime(to.time);
        // Only a genuine multi-day span makes this a "range"; a same-day
        // draft round-trips back to the simpler single-date picker.
        if (to.date !== from.date) {
          setDateMode("range");
          setRangeEnd(to.date);
        }
      }
    }

    if (p.address) {
      setAddress(p.address);
      autocomplete.setQuery(p.address);
    }
    if (p.latitude != null && p.longitude != null)
      setCoords({ lat: p.latitude, lng: p.longitude });

    if (p.ticket === "free" || p.ticket === "single" || p.ticket === "multiple")
      setTicketMode(p.ticket);
    if (p.singleTicket != null) setTicketPrice(String(p.singleTicket));
    if (p.singleTicketQuantity != null)
      setTicketQuantity(String(p.singleTicketQuantity));
    if (p.multipleTickets?.length) {
      setTiers(
        p.multipleTickets.map((t) => ({
          id: uuidv4(),
          name: t.category ?? "",
          price: String(t.price),
          quantity: t.quantity != null ? String(t.quantity) : "",
        })),
      );
    }
    if (p.promoCodes?.length) {
      setPromos(
        p.promoCodes.map((c) => ({
          id: uuidv4(),
          promoCode: c.promoCode,
          discount: String(c.discount),
          maximumUse: String(c.maximumUse),
          expiryIso: c.expiryDate,
        })),
      );
    }
  }, [resumeDraftId, draftQuery.data]);

  // --- draft: build payload from current state --------------------
  function buildDraftPayload(): EventDraftPayload {
    const capNum = capacity.trim() === "" ? undefined : Number(capacity.trim());
    const single =
      scheduleMode === "single" && rangeStart
        ? {
            from: combineDateAndTime(rangeStart, rangeStartTime)?.toISOString(),
            to: combineDateAndTime(
              rangeEnd ?? rangeStart,
              rangeEndTime,
            )?.toISOString(),
          }
        : undefined;
    const multi =
      scheduleMode === "specific" && occurrences.length > 0
        ? occurrences
            .map((o) => ({
              start: combineDateAndTime(o.dateIso, o.start)?.toISOString(),
              end: combineDateAndTime(o.dateIso, o.end)?.toISOString(),
            }))
            .filter(
              (e): e is { start: string; end: string } => !!e.start && !!e.end,
            )
        : undefined;

    return {
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      websiteUrl: website.trim() || undefined,
      capacity:
        capNum != null && Number.isInteger(capNum) && capNum > 0
          ? capNum
          : undefined,
      category: category ?? undefined,
      types: types.length > 0 ? types : undefined,
      address: address.trim() || undefined,
      latitude: coords?.lat,
      longitude: coords?.lng,
      dateType: scheduleMode,
      singleDateRange:
        single?.from && single?.to
          ? { from: single.from, to: single.to }
          : undefined,
      multipleDates: multi && multi.length > 0 ? multi : undefined,
      ticket: ticketMode,
      singleTicket:
        ticketMode === "single" && ticketPrice.trim() !== ""
          ? Number(ticketPrice)
          : undefined,
      singleTicketQuantity:
        ticketMode === "single" && ticketQuantity.trim() !== ""
          ? Number(ticketQuantity)
          : undefined,
      multipleTickets:
        ticketMode === "multiple" && tiers.length > 0
          ? tiers.map((t) => ({
              category: t.name.trim() || undefined,
              price: Number(t.price) || 0,
              quantity: t.quantity.trim() === "" ? null : Number(t.quantity),
            }))
          : undefined,
      promoCodes:
        promos.length > 0
          ? promos
              .filter((c) => c.promoCode.trim() !== "" && c.expiryIso)
              .map((c) => ({
                promoCode: c.promoCode.trim().toUpperCase(),
                discount: Number(c.discount) || 0,
                maximumUse: Number(c.maximumUse) || 0,
                expiryDate: c.expiryIso,
              }))
          : undefined,
      requireRegistration,
      currency: CURRENCY,
    };
  }

  async function saveDraft(): Promise<SaveEventDraftResult> {
    const localFlyer =
      flyerUri && !isRemote(flyerUri) && flyerUri !== savedFlyerUri.current
        ? flyerUri
        : null;

    if (localFlyer) uploadProgress.start();
    else uploadProgress.setPhase("saving");
    let res: SaveEventDraftResult;
    try {
      res = await saveDraftMutation.mutateAsync({
        draftId: currentDraftId,
        payload: buildDraftPayload(),
        expectedUpdatedAt: draftUpdatedAt.current,
        flyerUri: localFlyer,
        onUploadProgress: uploadProgress.onProgress,
        onUploadComplete: uploadProgress.finishUpload,
      });
    } finally {
      uploadProgress.reset();
    }

    if (res.status === 200) {
      setCurrentDraftId(res.data.draftId);
      draftUpdatedAt.current = res.data.updatedAt;
      if (flyerUri) savedFlyerUri.current = flyerUri;
    }
    return res;
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
        message: "Every date needs a valid start and end time.",
      };
    }
    const check = validateSpecificDates(
      entries.map((e) => ({ start: e.start as Date, end: e.end as Date })),
    );
    if (!check.ok) return { ok: false, message: check.message };
    return {
      ok: true,
      specificDates: occurrences.map((o) => ({
        start: wallClockString(o.dateIso, o.start) as string,
        end: wallClockString(o.dateIso, o.end) as string,
      })),
    };
  }

  // Capacity (Basics step) vs the ticket quantities (Tickets step), live —
  // the same rule postEventCore and the database apply
  // (@abonten/core/ticketCapacity). Free events carry the capacity on their
  // FREE tier, so nothing to check there.
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
      : ticketCapacityProblem(capacityNumber, tiersForCapacity);
  const capacityHint =
    ticketMode === "free"
      ? null
      : ticketCapacityHint(capacityNumber, tiersForCapacity);

  // A free event has nothing to discount: switching to it drops any promo
  // codes drafted so far, and the wizard skips the promo step.
  function selectTicketMode(mode: TicketMode) {
    setTicketMode(mode);
    if (mode === "free") setPromos([]);
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
      if (capacityProblem) return { ok: false, message: capacityProblem };
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
    const tierProblem = parsed.map(paidTierProblem).find(Boolean);
    if (tierProblem) return { ok: false, message: tierProblem };
    if (capacityProblem) return { ok: false, message: capacityProblem };
    return { ok: true, body: { multipleTickets: parsed } };
  }

  function buildPromos(): EventCreateBody["promoCodes"] {
    if (ticketMode === "free") return null;
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
    // A missing prerequisite used to return null here and Publish did
    // nothing at all — the organiser was left tapping a dead button with no
    // idea which of seven steps was incomplete. Now each gap names itself
    // and sends them back to the step that owns it.
    if (!flyerUri) {
      toast.error("Your event needs a flyer.", {
        description: "Add one on the first step.",
        action: { label: "Go there", onPress: () => setStep(0) },
      });
      return null;
    }
    if (!category) {
      toast.error("Pick a category.", {
        description: "It is on the Basic info step.",
        action: { label: "Go there", onPress: () => setStep(1) },
      });
      return null;
    }
    if (!coords) {
      toast.error("Confirm the location.", {
        description:
          "Pick the address from a suggestion, the map, or your current location.",
        action: { label: "Go there", onPress: () => setStep(3) },
      });
      return null;
    }

    const schedule = buildSchedule();
    if (!schedule.ok) {
      toast.error(schedule.message, {
        description: "Check the date and time step.",
        action: { label: "Go there", onPress: () => setStep(2) },
      });
      return null;
    }
    const tickets = buildTickets();
    if (!tickets.ok) {
      toast.error(tickets.message, {
        description: "Check the tickets and pricing step.",
        action: { label: "Go there", onPress: () => setStep(4) },
      });
      return null;
    }

    const capNum =
      capacity.trim() === "" ? null : Math.trunc(Number(capacity.trim()));

    // A resumed draft's flyer is a Cloudinary URL, not a local file — reuse
    // its ids rather than re-uploading. A freshly picked flyer is local.
    const flyerFields = isRemote(flyerUri)
      ? {
          flyerPublicId: resumedFlyer.current?.publicId,
          flyerVersion: resumedFlyer.current?.version,
        }
      : { flyerUri };

    if (!isRemote(flyerUri)) uploadProgress.start();
    else uploadProgress.setPhase("saving");
    try {
      return await create.mutateAsync({
        // The draft this publish came from, so postEventCore can delete it
        // once create_event succeeds. The web action always sent this; the
        // mobile path dropped it and left every published-from-draft event's
        // draft behind in the list.
        draftId: currentDraftId ?? null,
        onUploadProgress: uploadProgress.onProgress,
        onUploadComplete: uploadProgress.finishUpload,
        title: title.trim(),
        description: description.trim(),
        category,
        types,
        address: address.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        capacity:
          capNum && Number.isFinite(capNum) && capNum > 0 ? capNum : null,
        websiteUrl: website.trim() || null,
        requireRegistration,
        clientRequestId,
        ...flyerFields,
        startsAt: schedule.startsAt ?? null,
        endsAt: schedule.endsAt ?? null,
        specificDates: schedule.specificDates ?? null,
        ...tickets.body,
        promoCodes: buildPromos(),
        placeId: venuePlace?.id ?? null,
      });
    } finally {
      uploadProgress.reset();
    }
  }

  // Whether the current step's requirements are met, so the header's "Next"
  // can be disabled. Step 0 (basics) always returns true here — it runs
  // validateBasics() on press instead, which surfaces field errors. These
  // gates used to live on each step component's own Next button.
  // The same start-before-end rule buildSchedule() enforces at Publish,
  // evaluated live so the organizer is stopped on the step where the times
  // are entered instead of four steps later on Review. Compares the full
  // datetimes (not just the clock times) so a range like Fri 6pm -> Sat 5pm
  // stays valid. Null until there is enough input to judge.
  const scheduleTimeError = useMemo(() => {
    if (scheduleMode !== "single") return null;
    if (!rangeStart) return null;
    if (!TIME_RE.test(rangeStartTime) || !TIME_RE.test(rangeEndTime)) {
      return null;
    }
    if (dateMode === "range" && !rangeEnd) return null;

    const start = combineDateAndTime(rangeStart, rangeStartTime);
    const end = combineDateAndTime(rangeEnd ?? rangeStart, rangeEndTime);
    if (!start || !end) return null;

    return start >= end ? "Start time must be earlier than end time" : null;
  }, [
    scheduleMode,
    dateMode,
    rangeStart,
    rangeEnd,
    rangeStartTime,
    rangeEndTime,
  ]);

  const scheduleValid =
    scheduleMode === "single"
      ? !!rangeStart &&
        (dateMode === "single" || !!rangeEnd) &&
        TIME_RE.test(rangeStartTime) &&
        TIME_RE.test(rangeEndTime) &&
        !scheduleTimeError
      : occurrences.length > 0;

  // Step order (see app/(app)/event/new.tsx): 0 Flyer · 1 Basics · 2 Schedule
  // · 3 Location · 4 Tickets · 5 Promos · 6 Review. Basics (step 1) validates
  // on Next-press via validateBasics(), so it isn't gated here.
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return !!flyerUri;
      case 2:
        return scheduleValid;
      case 3:
        return !!address && !!coords;
      case 4:
        return !capacityProblem;
      default:
        return true;
    }
  }, [step, flyerUri, scheduleValid, address, coords, capacityProblem]);

  return {
    step,
    setStep,
    canAdvance,
    // basics. Each text setter also clears that field's own error, so a red
    // field turns back to normal the moment the user starts correcting it
    // instead of staying red until the next Next press re-validates.
    title,
    setTitle: (v: string) => {
      setTitle(v);
      clearTextError("title");
    },
    description,
    setDescription: (v: string) => {
      setDescription(v);
      clearTextError("description");
    },
    website,
    setWebsite: (v: string) => {
      setWebsite(v);
      clearTextError("website_url");
    },
    capacity,
    setCapacity: (v: string) => {
      setCapacity(v);
      clearTextError("capacity");
    },
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
    flyerSize,
    pickFlyer,
    setFlyer,
    // schedule
    scheduleMode,
    setScheduleMode,
    dateMode,
    setDateMode: (m: "single" | "range") => {
      setDateMode(m);
      // Leaving range mode: drop the now-hidden end day so validity and the
      // review summary reflect a single date. Entering range mode keeps the
      // chosen start as the range's first day.
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
    scheduleTimeError,
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
    venuePlace,
    setVenuePlace,
    // tickets
    ticketMode,
    setTicketMode: selectTicketMode,
    capacityProblem,
    capacityHint,
    ticketPrice,
    setTicketPrice,
    ticketQuantity,
    setTicketQuantity,
    tiers,
    setTiers,
    currency: CURRENCY,
    venueMarketMessage,
    venueTimeZone,
    // promos
    promos,
    setPromos,
    // submit
    submit,
    uploadProgress,
    isSubmitting: create.isPending,
    isSubmitError: create.isError,
    // draft
    saveDraft,
    isSavingDraft: saveDraftMutation.isPending,
    // "Save as draft" is only offered once there is something to save. An
    // untouched wizard used to save a completely empty draft row (found in
    // production: a draft with no flyer, no title, nothing) which then sat
    // in the Event drafts list as "(untitled)" until it expired.
    hasDraftContent:
      !!flyerUri ||
      title.trim() !== "" ||
      description.trim() !== "" ||
      website.trim() !== "" ||
      capacity.trim() !== "" ||
      !!category ||
      types.length > 0 ||
      !!rangeStart ||
      occurrences.length > 0 ||
      address.trim() !== "" ||
      ticketPrice.trim() !== "" ||
      ticketQuantity.trim() !== "" ||
      tiers.length > 0 ||
      promos.length > 0,
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

export type EventWizard = ReturnType<typeof useEventWizard>;
