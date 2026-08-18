"use client";

import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import { postEvent } from "@/actions/postEvent";
import { saveEventDraft } from "@/actions/saveEventDraft";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import type { EventDates, PostsType } from "@/types/postsType";
import type { Ticket } from "@/types/ticketType";
import type { EventDraftPayload } from "@/utils/eventDraftSchema";
import { type EventSchema, getEventSchema } from "@/utils/eventSchema";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { receivingAccountSchema } from "@/utils/receivingAcountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";
import type { z } from "zod";

export type DateEntry = { start: Date; end: Date };

type PromoCode = {
  promoCode: string;
  discount: number;
  maximumUse: number;
  expiryDate: Date;
};

type UseEventUploadFormOptions = {
  file: File | null;
  onSuccess: () => void;
  // Draft-continue mode: seeds every piece of state below from a
  // previously saved draft instead of starting empty.
  draftId?: string;
  initialValues?: EventDraftPayload;
  initialUpdatedAt?: string;
  // The draft's already-uploaded flyer, reused by postEvent instead of
  // re-uploading when the user hasn't picked a replacement file.
  existingFlyer?: { public_id: string; version: string };
};

// All state, validation and submit logic for posting an event, previously
// duplicated verbatim between the desktop and mobile upload modals. The
// stricter of the two duplicates' date validation (mobile's — it required
// both a start and end date explicitly) is kept as the single source of
// truth; the desktop copy had silently allowed a missing date through.
export function useEventUploadForm({
  file,
  onSuccess,
  draftId,
  initialValues,
  initialUpdatedAt,
  existingFlyer,
}: UseEventUploadFormOptions) {
  const t = useTranslations("events");
  const eventSchema = useMemo(() => getEventSchema(t), [t]);

  const form = useForm<EventSchema>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: initialValues?.title,
      description: initialValues?.description,
      website_url: initialValues?.websiteUrl,
      capacity: initialValues?.capacity,
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty: isFormDirty },
  } = form;

  const receivingAccountForm = useForm<z.infer<typeof receivingAccountSchema>>({
    resolver: zodResolver(receivingAccountSchema),
    defaultValues: initialValues?.receivingAccountDetails,
  });

  const { message: notification, showMessage } = useTimedMessage(3000);

  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const [currentDraftId, setCurrentDraftId] = useState<string | undefined>(
    draftId,
  );
  const draftUpdatedAtRef = useRef<string | undefined>(initialUpdatedAt);

  // Synchronous lock against double submission (double-click, rapid repeat
  // clicks): a ref is checked/set on the very first line of onSubmit,
  // before any await, so it closes the race window that setIsUploading
  // (a state update, only visible next render) can't -- two fast clicks
  // can both fire before the button's disabled state re-renders.
  const isSubmittingRef = useRef(false);

  // Generated once per upload-modal mount and reused across every
  // postEvent call made during this session (including retries after a
  // validation error), so the server can recognize a replay of the same
  // submission (double click that slipped past the lock, network retry)
  // and return the already-created event instead of inserting a duplicate.
  const clientRequestIdRef = useRef(crypto.randomUUID());

  const [dateType, setDateType] = useState<string>(
    initialValues?.dateType ?? "single",
  );
  const [singleDateRange, setSingleDateRange] = useState<DateRange>(
    initialValues?.singleDateRange?.from && initialValues?.singleDateRange?.to
      ? {
          from: initialValues.singleDateRange.from,
          to: initialValues.singleDateRange.to,
        }
      : { from: new Date(), to: new Date() },
  );
  const [multipleDates, setMultipleDates] = useState<DateEntry[]>(
    initialValues?.multipleDates ?? [],
  );

  // Raw hydration values for DateTimePicker's own initialRange/initialEntries
  // props -- distinct from singleDateRange above, which always has a
  // (today, today) fallback that would wrongly pre-fill the picker's editor
  // on a fresh, non-draft create.
  const initialDateRangeForPicker =
    initialValues?.singleDateRange?.from && initialValues?.singleDateRange?.to
      ? {
          from: initialValues.singleDateRange.from,
          to: initialValues.singleDateRange.to,
        }
      : undefined;
  const initialDateEntriesForPicker = initialValues?.multipleDates;

  const [selectedAddress, setSelectedAddress] = useState(
    initialValues?.address ?? "",
  );
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [types, setTypes] = useState<string[]>(initialValues?.types ?? []);

  const [ticket, setTicket] = useState<string | null>(
    initialValues?.ticket ?? null,
  );
  const [singleTicket, setSingleTicket] = useState<number | null>(
    initialValues?.singleTicket ?? null,
  );
  const [singleTicketQuantity, setSingleTicketQuantity] = useState<
    number | null
  >(initialValues?.singleTicketQuantity ?? null);
  const [multipleTickets, setMultipleTickets] = useState<Ticket[]>(
    initialValues?.multipleTickets ?? [],
  );

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>(
    initialValues?.promoCodes ?? [],
  );
  const [showPromoCodeFormPopup, setShowPromoCodeFormPopup] = useState(
    (initialValues?.promoCodes?.length ?? 0) > 0,
  );

  const [checked, setChecked] = useState(
    initialValues?.requireRegistration ?? false,
  );
  const [featured, setFeatured] = useState(initialValues?.featured ?? false);
  const [paymentOption, setPaymentOption] = useState<string | null>(
    initialValues?.paymentOption ?? null,
  );
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(
    initialValues?.selectedNetwork ?? null,
  );
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

  // Tracks whether the organizer has actually entered anything this
  // session, beyond whatever a continued draft was hydrated with — used to
  // decide whether Cancel needs to prompt at all (an untouched fresh form
  // just closes, per spec).
  const [touched, setTouched] = useState(false);
  const markTouched = () => setTouched(true);

  const { data: userCurrency } = useQuery({
    queryKey: ["user-currency"],
    queryFn: async () => {
      const countryMetadata = await fetchCountryMetadata();
      return countryMetadata?.currency ?? "GHS";
    },
    initialData: initialValues?.currency ?? undefined,
  });

  const handleDateAndTime = (date: DateRange | DateEntry[]) => {
    markTouched();
    if (dateType === "single" && !Array.isArray(date)) {
      setSingleDateRange(date);
    } else if (dateType === "specific" && Array.isArray(date)) {
      setMultipleDates(date);
    }
  };

  const handleType = (selectedType: string) => {
    markTouched();
    setTypes((prevTypes) =>
      prevTypes.includes(selectedType)
        ? prevTypes.filter((type) => type !== selectedType)
        : [...prevTypes, selectedType],
    );
  };

  const handlePromoCodesChange = (updatedPromoCodes: PromoCode[]) => {
    markTouched();
    setPromoCodes(updatedPromoCodes);
  };

  const handlePromoCodeFormPopup = () => {
    setShowPromoCodeFormPopup((prev) => !prev);
  };

  const handleChecked = () => {
    markTouched();
    setChecked((prev) => !prev);
  };

  const handleFeatured = () => {
    markTouched();
    setFeatured((prev) => !prev);
  };

  const handlePaymentOption = (option: string) => {
    markTouched();
    setPaymentOption(option);
  };

  const handleSelectedNetwork = (network: string) => {
    markTouched();
    setSelectedNetwork(network);
    setShowNetworkDropdown(false);
  };

  const handleNetworkDropdown = () => setShowNetworkDropdown((prev) => !prev);

  const handleSelectedAddress = (address: string) => {
    markTouched();
    setSelectedAddress(address);
  };

  const handleCategory = (selectedCategory: string) => {
    markTouched();
    setCategory(selectedCategory);
  };

  const handleTicketSelection = (selectedTicket: string) => {
    markTouched();
    setTicket(selectedTicket);
  };

  const handleSingleTicketWithTouch = (amount: number) => {
    markTouched();
    setSingleTicket(amount);
  };

  const handleSingleTicketQuantityWithTouch = (quantity: number) => {
    markTouched();
    setSingleTicketQuantity(quantity);
  };

  const handleMultipleTicketsWithTouch = (tickets: Ticket[]) => {
    markTouched();
    setMultipleTickets(tickets);
  };

  const handleDateTypeWithTouch = (nextDateType: string) => {
    markTouched();
    setDateType(nextDateType);
  };

  // Whether there's anything worth protecting on Cancel — either the form
  // was hydrated from an existing draft, or the organizer has actually
  // entered something this session.
  const hasMeaningfulContent =
    Boolean(initialValues) ||
    touched ||
    isFormDirty ||
    receivingAccountForm.formState.isDirty;

  const buildDraftPayload = (): EventDraftPayload => {
    const formValues = form.getValues();
    const receivingAccountValues = receivingAccountForm.getValues();
    const hasReceivingAccountValues = Object.values(
      receivingAccountValues,
    ).some((value) => Boolean(value));

    return {
      title: formValues.title || undefined,
      description: formValues.description || undefined,
      websiteUrl: formValues.website_url || undefined,
      capacity: Number.isFinite(formValues.capacity)
        ? formValues.capacity
        : undefined,
      category: category || undefined,
      types: types.length > 0 ? types : undefined,
      address: selectedAddress || undefined,
      latitude: undefined,
      longitude: undefined,
      dateType: dateType === "specific" ? "specific" : "single",
      singleDateRange:
        dateType === "single" && singleDateRange.from && singleDateRange.to
          ? { from: singleDateRange.from, to: singleDateRange.to }
          : undefined,
      multipleDates: dateType === "specific" ? multipleDates : undefined,
      ticket: ticket ?? undefined,
      singleTicket: singleTicket ?? undefined,
      singleTicketQuantity: singleTicketQuantity ?? undefined,
      multipleTickets: multipleTickets.length > 0 ? multipleTickets : undefined,
      promoCodes: promoCodes.length > 0 ? promoCodes : undefined,
      requireRegistration: checked,
      featured,
      paymentOption: paymentOption ?? undefined,
      selectedNetwork: selectedNetwork ?? undefined,
      receivingAccountDetails: hasReceivingAccountValues
        ? receivingAccountValues
        : undefined,
      currency: userCurrency ?? undefined,
    };
  };

  const saveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const payload = buildDraftPayload();
      const response = await saveEventDraft({
        draftId: currentDraftId,
        payload,
        expectedUpdatedAt: draftUpdatedAtRef.current,
        flyerFile: file,
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

  const onSubmit = async (formData: EventSchema) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    try {
      setIsUploading(true);

      if (!file && !existingFlyer) {
        showMessage("Please select a file first!");
        return;
      }

      if (!selectedAddress) {
        showMessage("Please enter a location");
        return;
      }

      const coords = await getCoordinatesFromAddress(selectedAddress);
      if (!coords) {
        showMessage("Could not fetch coordinates");
        return;
      }

      let eventDates: EventDates;
      const now = new Date();
      const bufferMs = 5 * 60 * 60 * 1000; // 5 hours
      const bufferedNow = new Date(now.getTime() + bufferMs);

      if (dateType === "single") {
        const start = singleDateRange?.from
          ? new Date(singleDateRange.from)
          : undefined;
        const end = singleDateRange?.to
          ? new Date(singleDateRange.to)
          : undefined;

        if (!start || !end) {
          showMessage("Please select both start and end date");
          return;
        }
        if (start <= bufferedNow || end <= bufferedNow) {
          showMessage("Start or end time must be at least 5 hours from now");
          return;
        }
        if (start >= end) {
          showMessage("Start time must be earlier than end time");
          return;
        }

        eventDates = { starts_at: start, ends_at: end };
      } else if (dateType === "specific") {
        if (!multipleDates || multipleDates.length === 0) {
          showMessage("Please select at least one date");
          return;
        }

        const invalid = multipleDates.some(
          (entry) =>
            new Date(entry.start) <= bufferedNow ||
            new Date(entry.end) <= bufferedNow,
        );
        if (invalid) {
          showMessage("All selected dates must be at least 5 hours from now");
          return;
        }

        eventDates = { specific_dates: multipleDates };
      } else {
        showMessage("Invalid date selection");
        return;
      }

      if (!category || !types) {
        showMessage("Categories and types must be set");
        return;
      }

      const noTicketingSet =
        !ticket &&
        (!singleTicket || !singleTicketQuantity) &&
        (!multipleTickets || multipleTickets.length === 0);

      if (noTicketingSet) {
        showMessage("Event ticketing must be set");
        return;
      }

      const receivingAccountDetails = receivingAccountForm.getValues();
      const isReceivingAccountEmpty = Object.values(
        receivingAccountDetails,
      ).some((value) => !value);
      const isPaidTicketing =
        (singleTicket && singleTicketQuantity) ||
        (multipleTickets && multipleTickets.length > 0);

      if (isPaidTicketing && ticket !== "free" && isReceivingAccountEmpty) {
        showMessage(
          "Set up receiving account to receive payment after successfull event!",
        );
        return;
      }

      const finalData: PostsType = {
        ...formData,
        address: selectedAddress,
        latitude: coords.lat,
        longitude: coords.lng,
        category,
        types,
        selectedFile: file,
        existingFlyer: !file ? existingFlyer : undefined,
        draftId: currentDraftId,
        promoCodes,
        freeEvents: ticket,
        singleTicket,
        singleTicketQuantity,
        multipleTickets,
        currency: userCurrency,
        checked,
        featured,
        paymentOption,
        receivingAccountDetails,
        selectedNetwork,
        clientRequestId: clientRequestIdRef.current,
        ...eventDates,
      };

      const response = await postEvent(finalData);

      if (response.status === 200) {
        showMessage("✅ Event posted successfully!");
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
    receivingAccountForm,
    notification,
    isUploading,
    onSubmit,
    dateType,
    setDateType: handleDateTypeWithTouch,
    handleDateAndTime,
    initialDateRangeForPicker,
    initialDateEntriesForPicker,
    selectedAddress,
    setSelectedAddress: handleSelectedAddress,
    category,
    setCategory: handleCategory,
    types,
    handleType,
    ticket,
    setTicket: handleTicketSelection,
    singleTicket,
    handleSingleTicket: handleSingleTicketWithTouch,
    singleTicketQuantity,
    handleSingleTicketQuantity: handleSingleTicketQuantityWithTouch,
    multipleTickets,
    handleMultipleTickets: handleMultipleTicketsWithTouch,
    checked,
    handleChecked,
    featured,
    handleFeatured,
    promoCodes,
    handlePromoCodesChange,
    showPromoCodeFormPopup,
    handlePromoCodeFormPopup,
    paymentOption,
    handlePaymentOption,
    selectedNetwork,
    handleSelectedNetwork,
    showNetworkDropdown,
    handleNetworkDropdown,
    hasMeaningfulContent,
    saveDraft,
    isSavingDraft,
    currentDraftId,
  };
}
