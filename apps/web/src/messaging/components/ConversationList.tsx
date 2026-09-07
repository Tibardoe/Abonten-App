"use client";

import { cn } from "@/components/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useInfiniteScrollSentinel } from "@/hooks/useInfiniteScrollSentinel";
import type { ConversationListNarrow } from "@/messaging/hooks/keys";
import {
  flattenConversations,
  useConversations,
} from "@/messaging/hooks/useConversations";
import {
  CUSTOM_FILTER_HELP,
  CUSTOM_FILTER_KEYS,
  CUSTOM_FILTER_LABEL,
  type CustomFilterKey,
  useInboxPrefs,
} from "@/messaging/hooks/useInboxPrefs";
import { useOpenConversation } from "@/messaging/hooks/useOpenConversation";
import type { ConversationRoleScope } from "@abonten/types/messagingType";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ConversationListRow } from "./ConversationListRow";

const ROLE_CHIPS: { key: ConversationRoleScope; label: string }[] = [
  { key: "all", label: "All" },
  { key: "member", label: "As Customer" },
  { key: "business", label: "As Organizer" },
];

const MODE_SUBTITLE: Record<ConversationRoleScope, string> = {
  all: "All your conversations",
  member: "Chats about events and places you're attending",
  business: "Messages from people interested in your events and places",
};

export function ConversationList({ activeId }: { activeId?: string }) {
  const { data: user } = useCurrentUser();
  const openSupport = useOpenConversation();
  const { roleScope, customFilters, setRoleScope, toggleCustomFilter } =
    useInboxPrefs(user?.id);

  const [view, setView] = useState<"inbox" | "archived">("inbox");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const archived = view === "archived";
  const wantEvents = customFilters.includes("events");
  const wantPlaces = customFilters.includes("places");
  const filter = archived
    ? "archived"
    : customFilters.includes("unread")
      ? "unread"
      : "active";
  const narrow: ConversationListNarrow = useMemo(
    () => ({
      search: search || undefined,
      type: archived
        ? undefined
        : wantEvents === wantPlaces
          ? undefined
          : wantEvents
            ? "event"
            : "place",
      muted: !archived && customFilters.includes("muted") ? true : undefined,
    }),
    [search, archived, wantEvents, wantPlaces, customFilters],
  );

  const q = useConversations(filter, archived ? "all" : roleScope, narrow);
  const rows = flattenConversations(q.data?.pages);

  const sentinelRef = useInfiniteScrollSentinel({
    onIntersect: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
    },
    enabled: !!q.hasNextPage && !q.isFetchingNextPage,
  });

  const searching = search.length > 0;
  const filtered = customFilters.length > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        {archived ? (
          <button
            type="button"
            onClick={() => setView("inbox")}
            className="-ml-1 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Back to messages"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : null}
        <h1 className="text-base font-semibold">
          {archived ? "Archived" : "Messages"}
        </h1>
      </div>

      {/* Search */}
      <div className="border-b p-2">
        <div className="flex items-center gap-2 rounded-lg border bg-muted px-2.5 py-1.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={archived ? "Search archived" : "Search messages"}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search messages"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter chips (inbox only) */}
      {!archived ? (
        <div className="border-b">
          <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ROLE_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setRoleScope(chip.key)}
                aria-pressed={roleScope === chip.key}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition",
                  roleScope === chip.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {chip.label}
              </button>
            ))}
            {customFilters.length > 0 ? (
              <span className="mx-0.5 h-4 w-px shrink-0 bg-border" />
            ) : null}
            {customFilters.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleCustomFilter(key)}
                aria-label={`${CUSTOM_FILTER_LABEL[key]} filter, active. Click to remove.`}
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
              >
                {CUSTOM_FILTER_LABEL[key]}
                <X className="h-3 w-3" />
              </button>
            ))}
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger
                aria-label="Add filter"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground transition hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-1">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Add filter
                </p>
                {CUSTOM_FILTER_KEYS.map((key) => {
                  const on = customFilters.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCustomFilter(key)}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-accent"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {on ? <span className="text-[10px]">✓</span> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {CUSTOM_FILTER_LABEL[key]}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {CUSTOM_FILTER_HELP[key]}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </PopoverContent>
            </Popover>
          </div>
          {!searching ? (
            <p className="px-3 pb-2 text-[11px] text-muted-foreground">
              {MODE_SUBTITLE[roleScope]}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!archived && !searching && !filtered ? (
          <button
            type="button"
            onClick={() => setView("archived")}
            className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition hover:bg-accent/60"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Archive className="h-4 w-4" />
            </span>
            <span className="flex-1 text-sm">Archived</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ) : null}

        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {q.isError
                ? "Couldn't load your messages."
                : searching
                  ? "No conversations found. Try another name, event, or place."
                  : archived
                    ? "No archived conversations."
                    : roleScope === "business"
                      ? "No organizer conversations yet. They'll appear here when people reach out about your events or places."
                      : filtered
                        ? "Nothing matches these filters."
                        : "No conversations yet. Open an event or place and click Message to start one."}
            </p>
            {q.isError ? (
              <button
                type="button"
                onClick={() => q.refetch()}
                className="text-sm font-medium text-primary hover:underline"
              >
                Retry
              </button>
            ) : !archived && !searching && !filtered ? (
              <button
                type="button"
                disabled={openSupport.isPending}
                onClick={() => openSupport.mutate({ type: "support" })}
                className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
              >
                Contact Abonten Support
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {rows.map((item) => (
              <ConversationListRow
                key={item.conversation_id}
                item={item}
                currentUserId={user?.id}
                active={item.conversation_id === activeId}
                archivedView={archived}
              />
            ))}
            <div ref={sentinelRef} />
            {q.isFetchingNextPage ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
