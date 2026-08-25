"use client";

import cancelUserTicket from "@/actions/cancelUserTicket";
import { getEventAttendanceCount } from "@/actions/getAttendace";
import getUserFreeRegistrationStatus from "@/actions/getUserFreeRegistrationStatus";
import registerForFreeEvent from "@/actions/registerForFreeEvent";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { Occurrence } from "@/types/occurrenceType";
import { getEventStatus } from "@/utils/eventStatus";
import {
  invalidateEventListQueries,
  invalidateTicketStatusQueries,
} from "@/utils/mutationQueryInvalidation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FiCheck } from "react-icons/fi";
import Notification from "./Notification";

type AttendingButtonProps = {
  eventId: string;
  occurrenceId: string | null;
  eventStatusRaw: string;
  eventDates: Occurrence[];
  soldOut?: boolean;
};

type AttendanceCountResult = Awaited<
  ReturnType<typeof getEventAttendanceCount>
>;

function hasAttendanceCount(
  value: AttendanceCountResult | undefined,
): value is { status: 200; count: number } {
  return !!value && value.status === 200 && "count" in value;
}

export default function AttendingButton({
  eventId,
  occurrenceId,
  eventStatusRaw,
  eventDates,
  soldOut,
}: AttendingButtonProps) {
  const [error, setError] = useState<string | null>(null);

  const requireAuth = useRequireAuth();
  const queryClient = useQueryClient();

  const { data: registrationStatus } = useQuery({
    queryKey: ["free-registration-status", eventId],
    queryFn: () => getUserFreeRegistrationStatus(eventId),
    initialData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof getUserFreeRegistrationStatus>>
      >(["free-registration-status", eventId]),
  });

  const { data: attendanceCountData } = useQuery({
    queryKey: ["attendance-count", eventId],
    queryFn: () => getEventAttendanceCount(eventId),
    initialData: () =>
      queryClient.getQueryData<
        Awaited<ReturnType<typeof getEventAttendanceCount>>
      >(["attendance-count", eventId]),
  });

  const isAttending = registrationStatus?.isAttending ?? false;
  const ticketId = registrationStatus?.ticketId ?? null;
  const attendanceCount = hasAttendanceCount(attendanceCountData)
    ? attendanceCountData.count
    : null;

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      if (isAttending) {
        if (!ticketId) return { status: 500, message: "Something went wrong" };
        return await cancelUserTicket(ticketId, null);
      }

      return await registerForFreeEvent(eventId, occurrenceId);
    },

    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: ["free-registration-status", eventId],
      });
      await queryClient.cancelQueries({
        queryKey: ["attendance-count", eventId],
      });

      const previousStatus = queryClient.getQueryData<
        Awaited<ReturnType<typeof getUserFreeRegistrationStatus>>
      >(["free-registration-status", eventId]);
      const previousCount = queryClient.getQueryData<
        Awaited<ReturnType<typeof getEventAttendanceCount>>
      >(["attendance-count", eventId]);

      queryClient.setQueryData(["free-registration-status", eventId], {
        status: 200,
        isAttending: !isAttending,
        ticketId: previousStatus?.ticketId ?? null,
      });

      if (hasAttendanceCount(previousCount)) {
        queryClient.setQueryData(["attendance-count", eventId], {
          status: 200,
          count: previousCount.count + (isAttending ? -1 : 1),
        });
      }

      return { previousStatus, previousCount };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(
        ["free-registration-status", eventId],
        context?.previousStatus,
      );
      queryClient.setQueryData(
        ["attendance-count", eventId],
        context?.previousCount,
      );
      setError("Something went wrong. Please try again.");
    },

    onSuccess: (response) => {
      if (response.status !== 200) {
        setError(response.message ?? "Something went wrong. Please try again.");
      }
    },

    onSettled: () => {
      setTimeout(() => setError(null), 3000);
      queryClient.invalidateQueries({
        queryKey: ["free-registration-status", eventId],
      });
      queryClient.invalidateQueries({
        queryKey: ["attendance-count", eventId],
      });
      invalidateTicketStatusQueries(queryClient);
      // The event card/listing surfaces (home/search/explore/around-you)
      // show their own attendance count fetched independently — this is
      // the same targeted invalidation DeleteEventButton.tsx already uses.
      invalidateEventListQueries(queryClient);
    },
  });

  const handleClick = async () => {
    if (!isAttending && !(await requireAuth())) return;
    mutate();
  };

  const eventLifecycleStatus = getEventStatus(null, null, eventDates);

  const ineligibleLabel =
    eventStatusRaw === "canceled"
      ? "Event Canceled"
      : eventLifecycleStatus === "ended"
        ? "Event Ended"
        : soldOut && !isAttending
          ? "Sold Out"
          : null;

  if (ineligibleLabel) {
    return (
      <button
        type="button"
        disabled
        className="font-bold rounded-lg w-full p-6 text-lg bg-muted text-muted-foreground cursor-not-allowed"
      >
        {ineligibleLabel}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {isAttending ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-success/20 bg-success/10 p-4">
          <span className="flex items-center gap-2 font-bold text-success">
            <FiCheck className="text-xl" /> I&apos;m Attending
          </span>
          <button
            type="button"
            onClick={handleClick}
            disabled={isPending}
            className="text-sm font-semibold text-destructive hover:underline disabled:opacity-50 disabled:no-underline shrink-0"
          >
            {isPending ? "Cancelling..." : "Cancel Attendance"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="font-bold rounded-lg w-full p-6 text-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-70"
        >
          {isPending ? "Registering..." : "I'm Attending"}
        </button>
      )}

      {attendanceCount !== null && (
        <p className="text-sm text-muted-foreground text-center">
          {attendanceCount} {attendanceCount === 1 ? "person is" : "people are"}{" "}
          attending
        </p>
      )}

      {error && <Notification notification={error} />}
    </div>
  );
}
