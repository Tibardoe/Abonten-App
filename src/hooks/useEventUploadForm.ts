"use client";

import { fetchCountryMetadata } from "@/actions/fetchCountryMetaData";
import { postEvent } from "@/actions/postEvent";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import type { EventDates } from "@/types/postsType";
import type { Ticket } from "@/types/ticketType";
import { type EventSchema, getEventSchema } from "@/utils/eventSchema";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { receivingAccountSchema } from "@/utils/receivingAcountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
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
};

// All state, validation and submit logic for posting an event, previously
// duplicated verbatim between the desktop and mobile upload modals. The
// stricter of the two duplicates' date validation (mobile's — it required
// both a start and end date explicitly) is kept as the single source of
// truth; the desktop copy had silently allowed a missing date through.
export function useEventUploadForm({
  file,
  onSuccess,
}: UseEventUploadFormOptions) {
  const t = useTranslations("events");
  const eventSchema = useMemo(() => getEventSchema(t), [t]);

  const form = useForm<EventSchema>({ resolver: zodResolver(eventSchema) });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const receivingAccountForm = useForm<z.infer<typeof receivingAccountSchema>>({
    resolver: zodResolver(receivingAccountSchema),
  });

  const { message: notification, showMessage } = useTimedMessage(3000);

  const [isUploading, setIsUploading] = useState(false);

  const [dateType, setDateType] = useState("single");
  const [singleDateRange, setSingleDateRange] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  });
  const [multipleDates, setMultipleDates] = useState<DateEntry[]>([]);

  const [selectedAddress, setSelectedAddress] = useState("");
  const [category, setCategory] = useState("");
  const [types, setTypes] = useState<string[]>([]);

  const [ticket, setTicket] = useState<string | null>(null);
  const [singleTicket, setSingleTicket] = useState<number | null>(null);
  const [singleTicketQuantity, setSingleTicketQuantity] = useState<
    number | null
  >(null);
  const [multipleTickets, setMultipleTickets] = useState<Ticket[]>([]);

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [showPromoCodeFormPopup, setShowPromoCodeFormPopup] = useState(false);

  const [checked, setChecked] = useState(false);
  const [featured, setFeatured] = useState(false);
  const [paymentOption, setPaymentOption] = useState<string | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [showNetworkDropdown, setShowNetworkDropdown] = useState(false);

  const { data: userCurrency } = useQuery({
    queryKey: ["user-currency"],
    queryFn: async () => {
      const countryMetadata = await fetchCountryMetadata();
      return countryMetadata?.currency ?? "GHS";
    },
  });

  const handleDateAndTime = (date: DateRange | DateEntry[]) => {
    if (dateType === "single" && !Array.isArray(date)) {
      setSingleDateRange(date);
    } else if (dateType === "specific" && Array.isArray(date)) {
      setMultipleDates(date);
    }
  };

  const handleType = (selectedType: string) => {
    setTypes((prevTypes) =>
      prevTypes.includes(selectedType)
        ? prevTypes.filter((type) => type !== selectedType)
        : [...prevTypes, selectedType],
    );
  };

  const handlePromoCodesChange = (updatedPromoCodes: PromoCode[]) => {
    setPromoCodes(updatedPromoCodes);
  };

  const handlePromoCodeFormPopup = () => {
    setShowPromoCodeFormPopup((prev) => !prev);
  };

  const handleChecked = () => setChecked((prev) => !prev);

  const handleFeatured = () => setFeatured((prev) => !prev);

  const handlePaymentOption = (option: string) => setPaymentOption(option);

  const handleSelectedNetwork = (network: string) => {
    setSelectedNetwork(network);
    setShowNetworkDropdown(false);
  };

  const handleNetworkDropdown = () => setShowNetworkDropdown((prev) => !prev);

  const onSubmit = async (formData: EventSchema) => {
    try {
      setIsUploading(true);

      if (!file) {
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

      const finalData = {
        ...formData,
        address: selectedAddress,
        latitude: coords.lat,
        longitude: coords.lng,
        category,
        types,
        selectedFile: file,
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
    setDateType,
    handleDateAndTime,
    selectedAddress,
    setSelectedAddress,
    category,
    setCategory,
    types,
    handleType,
    ticket,
    setTicket,
    singleTicket,
    handleSingleTicket: setSingleTicket,
    singleTicketQuantity,
    handleSingleTicketQuantity: setSingleTicketQuantity,
    multipleTickets,
    handleMultipleTickets: setMultipleTickets,
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
  };
}
