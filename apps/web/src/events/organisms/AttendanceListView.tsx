"use client";

import checkInTicket from "@/actions/checkInTicket";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { AttendanceRow as Attendee } from "@abonten/services/organizer/organizerReadQuery";
import type { PaginatedResult } from "@abonten/types/pagination";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FiCheck } from "react-icons/fi";

export default function AttendanceListView({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<Attendee> | null;
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<Attendee>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="flex flex-col gap-2 mb-5"
      renderItem={(attendee) => (
        <AttendanceRow
          key={attendee.id}
          attendee={attendee}
          queryKey={queryKey}
        />
      )}
    />
  );
}

function AttendanceRow({
  attendee,
  queryKey,
}: {
  attendee: Attendee;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: (checkedIn: boolean) => {
      // A registration without an issued ticket has nothing to check in.
      if (!attendee.ticket_id) {
        return Promise.resolve({
          status: 400,
          message: "No ticket to check in",
        });
      }
      return checkInTicket(attendee.ticket_id, checkedIn);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const isCancelled = attendee.status === "cancelled";
  const isCheckedIn = attendee.ticket?.status === "used";

  return (
    <li className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 space-y-2">
      <div className="flex justify-between items-center gap-2">
        <h2 className="font-bold">
          {attendee.user_info?.full_name ?? attendee.user_info?.username}
        </h2>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground">
            {attendee.ticket_type?.type}
          </span>

          {isCancelled ? (
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
              Cancelled
            </span>
          ) : (
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-success/10 text-success">
              Active
            </span>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{attendee.auth?.email}</p>

      {attendee.auth?.phone && (
        <p className="text-sm text-muted-foreground">{attendee.auth.phone}</p>
      )}

      {!isCancelled && attendee.ticket_id && (
        <div className="pt-1">
          {isCheckedIn ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => mutate(false)}
              className="flex items-center gap-1.5 text-xs font-semibold text-success hover:underline disabled:opacity-50"
            >
              <FiCheck /> Checked in — undo
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => mutate(true)}
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? "Checking in..." : "Check in"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
