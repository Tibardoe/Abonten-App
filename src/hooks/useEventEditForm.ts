"use client";

import { getEventForEdit } from "@/actions/getEventForEdit";
import { updateEvent } from "@/actions/updateEvent";
import type { PostAutoCompleteHandle } from "@/components/atoms/PostAutoComplete";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import type { ResolvedLocation } from "@/types/resolvedLocation";
import { type EventSchema, getEventSchema } from "@/utils/eventSchema";
import { isImageFile } from "@/utils/isImageFile";
import { parseEventTypes } from "@/utils/parseEventTypes";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@/utils/uploadLimits";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useForm } from "react-hook-form";

export type DateEntry = { start: Date; end: Date };

type UseEventEditFormOptions = {
  eventId: string;
  onSuccess: () => void;
};

// Edit counterpart to useEventUploadForm. Deliberately does not touch
// ticketing/promo/receiving-account state at all — updateEvent.ts doesn't
// accept those fields (see the comment there for why: ticket_type/promo_code
// are live inventory/usage counters referenced by real purchases, not safe
// to blind-overwrite from a form resubmit).
export function useEventEditForm({
  eventId,
  onSuccess,
}: UseEventEditFormOptions) {
  const t = useTranslations("events");
  const eventSchema = useMemo(() => getEventSchema(t), [t]);

  const form = useForm<EventSchema>({ resolver: zodResolver(eventSchema) });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  const { message: notification, showMessage } = useTimedMessage(3000);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrefilled, setIsPrefilled] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  const [dateType, setDateType] = useState("single");
  const [initialRange, setInitialRange] = useState<DateRange | undefined>(
    undefined,
  );
  const [initialEntries, setInitialEntries] = useState<DateEntry[] | undefined>(
    undefined,
  );
  const [singleDateRange, setSingleDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined,
  });
  const [multipleDates, setMultipleDates] = useState<DateEntry[]>([]);

  const [selectedAddress, setSelectedAddress] = useState("");

  const addressInputRef = useRef<PostAutoCompleteHandle>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const handleSelectCoordinates = (location: ResolvedLocation) => {
    coordsRef.current = { lat: location.lat, lng: location.lng };
  };

  const [category, setCategory] = useState("");
  const [types, setTypes] = useState<string[]>([]);

  const [checked, setChecked] = useState(false);

  const [existingFlyer, setExistingFlyer] = useState<{
    publicId: string;
    version: string;
  } | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);

  const { data: eventResponse, isLoading: isFetchingEvent } = useQuery({
    queryKey: ["edit-event", eventId],
    queryFn: () => getEventForEdit(eventId),
    enabled: !!eventId,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: only re-runs when the fetched event or the prefilled flag changes, not on every reset/showMessage identity change.
  useEffect(() => {
    if (
      isPrefilled ||
      !eventResponse ||
      eventResponse.status !== 200 ||
      !eventResponse.data
    ) {
      return;
    }

    const event = eventResponse.data;

    reset({
      title: event.title,
      description: event.description,
      website_url: event.website_url ?? "",
      capacity: event.capacity ?? undefined,
    });

    setSelectedAddress(event.address?.full_address ?? "");
    setCategory(event.event_category ?? "");

    setTypes(parseEventTypes(event.event_type));

    setChecked(!!event.require_registration);
    setExistingFlyer({
      publicId: event.flyer_public_id,
      version: event.flyer_version,
    });

    if (event.event_occurrence && event.event_occurrence.length > 0) {
      setDateType("specific");
      const entries: DateEntry[] = event.event_occurrence.map(
        (occ: { starts_at: string; ends_at: string }) => ({
          start: new Date(occ.starts_at),
          end: new Date(occ.ends_at),
        }),
      );
      setInitialEntries(entries);
      setMultipleDates(entries);
    } else if (event.starts_at && event.ends_at) {
      setDateType("single");
      const range = {
        from: new Date(event.starts_at),
        to: new Date(event.ends_at),
      };
      setInitialRange(range);
      setSingleDateRange(range);
    }

    setIsPrefilled(true);
  }, [eventResponse, isPrefilled]);

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

  const handleChecked = () => setChecked((prev) => !prev);

  // Previously accepted any file with no validation at all (relying only on
  // the <input accept="image/*"> hint, which a user/browser can bypass) —
  // an oversized replacement flyer would only fail once submitted, as the
  // Server Action's raw-File argument hitting Next's 5MB body limit (same
  // failure mode as uploadHighlight.ts's video bug). Rejecting immediately
  // matches useImageSelection's create-flow validation.
  const handleFileChange = (file: File | null) => {
    if (!file) {
      setNewFile(null);
      return;
    }

    if (!isImageFile(file)) {
      showMessage("Please select an image file for your event flyer.");
      return;
    }

    if (file.size > MAX_EVENT_FLYER_SIZE_BYTES) {
      const maxMb = Math.round(MAX_EVENT_FLYER_SIZE_BYTES / (1024 * 1024));
      showMessage(`Image is too large. Maximum size is ${maxMb}MB.`);
      return;
    }

    setNewFile(file);
  };

  const onSubmit = async (formData: EventSchema) => {
    try {
      setIsSubmitting(true);

      setIsResolvingLocation(true);
      const resolution = await addressInputRef.current?.resolveTypedInput();
      setIsResolvingLocation(false);

      if (!resolution || resolution.status === "empty") {
        showMessage("Please enter a location");
        return;
      }
      if (resolution.status === "unresolved") {
        showMessage(
          "Could not find that location — please check the spelling or pick a suggestion.",
        );
        return;
      }
      if (resolution.status === "error") {
        showMessage(
          "We couldn't verify this location right now. Please try again.",
        );
        return;
      }

      const coords = coordsRef.current;
      if (!coords) {
        showMessage("Could not fetch coordinates");
        return;
      }

      let eventDates: {
        starts_at?: Date;
        ends_at?: Date;
        specific_dates?: DateEntry[];
      };
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

      if (!category || types.length === 0) {
        showMessage("Category and types must be set");
        return;
      }

      const response = await updateEvent({
        eventId,
        title: formData.title,
        description: formData.description,
        address: selectedAddress,
        latitude: coords.lat,
        longitude: coords.lng,
        capacity: formData.capacity,
        website_url: formData.website_url,
        category,
        types,
        checked,
        selectedFile: newFile,
        ...eventDates,
      });

      if (response.status === 200) {
        showMessage("✅ Event updated successfully!");
        onSuccess();
      } else {
        showMessage(`❌ ${response.message}`);
      }
    } catch (error) {
      showMessage("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
      setIsResolvingLocation(false);
    }
  };

  return {
    register,
    handleSubmit,
    errors,
    notification,
    isSubmitting,
    isResolvingLocation,
    isFetchingEvent: isFetchingEvent && !isPrefilled,
    isReady: isPrefilled,
    onSubmit,
    dateType,
    setDateType,
    handleDateAndTime,
    initialRange,
    initialEntries,
    selectedAddress,
    setSelectedAddress,
    addressInputRef,
    handleSelectCoordinates,
    category,
    setCategory,
    types,
    handleType,
    checked,
    handleChecked,
    existingFlyer,
    handleFileChange,
  };
}
