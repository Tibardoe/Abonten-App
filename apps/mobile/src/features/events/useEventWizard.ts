import { usePlacesAutocomplete } from "@/features/discovery/usePlacesAutocomplete";
import { useEventCreate } from "@/features/events/useEventCreate";
import {
  useEventDraft,
  useSaveEventDraft,
} from "@/features/events/useEventDrafts";
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
import { getEventSchema } from "@abonten/validation/eventSchema";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

// All state, validation and submit logic for the native event-creation
// wizard — the mobile echo of the web useEventUploadForm hook. Publishes an
// event, and (WP-4g-2) saves / resumes a draft against the same
// drafts/event_drafts rows the web saveEventDraft action writes. The
// optional Abonten-Place venue picker is deferred (placeId stays null, as
// it is for most web events).

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

export function useEventWizard(resumeDraftId?: string) {
  const autocomplete = usePlacesAutocomplete();
  const create = useEventCreate();
  const saveDraftMutation = useSaveEventDraft();
  const draftQuery = useEventDraft(resumeDraftId);

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

  // Returns the freshly-picked local asset so the caller can open the
  // in-app editor on it; no OS crop UI (the editor does crop/rotate/flip).
  async function pickFlyer(): Promise<{
    uri: string;
    width: number;
    height: number;
  } | null> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to pick an event flyer.",
      );
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

    const res = await saveDraftMutation.mutateAsync({
      draftId: currentDraftId,
      payload: buildDraftPayload(),
      expectedUpdatedAt: draftUpdatedAt.current,
      flyerUri: localFlyer,
    });

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

    // A resumed draft's flyer is a Cloudinary URL, not a local file — reuse
    // its ids rather than re-uploading. A freshly picked flyer is local.
    const flyerFields = isRemote(flyerUri)
      ? {
          flyerPublicId: resumedFlyer.current?.publicId,
          flyerVersion: resumedFlyer.current?.version,
        }
      : { flyerUri };

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
      ...flyerFields,
      startsAt: schedule.startsAt ?? null,
      endsAt: schedule.endsAt ?? null,
      specificDates: schedule.specificDates ?? null,
      ...tickets.body,
      promoCodes: buildPromos(),
      placeId: null,
    });
  }

  // Whether the current step's requirements are met, so the header's "Next"
  // can be disabled. Step 0 (basics) always returns true here — it runs
  // validateBasics() on press instead, which surfaces field errors. These
  // gates used to live on each step component's own Next button.
  const scheduleValid =
    scheduleMode === "single"
      ? !!rangeStart &&
        (dateMode === "single" || !!rangeEnd) &&
        TIME_RE.test(rangeStartTime) &&
        TIME_RE.test(rangeEndTime)
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
      default:
        return true;
    }
  }, [step, flyerUri, scheduleValid, address, coords]);

  return {
    step,
    setStep,
    canAdvance,
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

export type EventWizard = ReturnType<typeof useEventWizard>;
