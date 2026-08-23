"use client";

import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";

export default function AttendanceListView({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  initialPage: PaginatedResult<any> | null;
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
  fetchPage: (cursor: string | null) => Promise<PaginatedResult<any>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      listClassName="flex flex-col gap-2 mb-5"
      // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
      renderItem={(attendee: any) => (
        <li
          key={attendee.id}
          className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 space-y-2"
        >
          <div className="flex justify-between items-center gap-2">
            <h2 className="font-bold">
              {attendee.user_info?.full_name ?? attendee.user_info?.username}
            </h2>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm text-muted-foreground">
                {attendee.ticket_type?.type}
              </span>

              {attendee.status === "cancelled" ? (
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive">
                  Cancelled
                </span>
              ) : (
                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
                  Active
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {attendee.auth?.email}
          </p>

          {attendee.auth?.phone && (
            <p className="text-sm text-muted-foreground">
              {attendee.auth.phone}
            </p>
          )}
        </li>
      )}
    />
  );
}
