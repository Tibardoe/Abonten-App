"use client";

import SearchSuggestionRow from "@/components/atoms/SearchSuggestionRow";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type {
  SuggestionItem,
  SuggestionSection,
} from "@abonten/types/searchSuggestionType";
import {
  IoCalendarOutline,
  IoClose,
  IoPricetagOutline,
  IoSearchOutline,
  IoStorefrontOutline,
  IoTimeOutline,
} from "react-icons/io5";

type SearchSuggestionsDropdownProps = {
  sections: SuggestionSection[];
  highlightedKey: string | null;
  onHighlight: (key: string) => void;
  onSelect: (item: SuggestionItem) => void;
  onRemoveRecent: (text: string) => void;
  onClearRecent: () => void;
  isLoading: boolean;
  noMatches: boolean;
};

function rowContent(item: SuggestionItem) {
  switch (item.kind) {
    case "event":
      return {
        title: item.event.title,
        subtitle: item.event.event_category,
        imageSrc: item.event.flyer_public_id
          ? buildCloudinaryUrl(
              item.event.flyer_public_id,
              item.event.flyer_version,
              {
                width: 40,
                height: 40,
              },
            )
          : undefined,
        icon: <IoCalendarOutline />,
      };
    case "place":
      return {
        title: item.place.name,
        subtitle: "Place",
        imageSrc: item.place.cover_public_id
          ? buildCloudinaryUrl(
              item.place.cover_public_id,
              item.place.cover_version,
              {
                width: 40,
                height: 40,
              },
            )
          : undefined,
        icon: <IoStorefrontOutline />,
      };
    case "eventCategory":
      return { title: item.category, icon: <IoPricetagOutline /> };
    case "placeCategory":
      return { title: item.category.name, icon: <IoPricetagOutline /> };
    case "recent":
      return { title: item.text, icon: <IoTimeOutline /> };
    case "literal":
      return { title: `Search for "${item.text}"`, icon: <IoSearchOutline /> };
  }
}

// Purely presentational — FilterSearchBar.tsx owns the input, the debounced
// suggestions data, and keyboard-navigation state; this just renders whatever
// grouped `sections` it's handed and reports selection/removal back up. Kept
// separate from FilterSearchBar so the (fairly large) grouped-rendering
// markup doesn't bloat the file that owns the actual search-bar logic.
export default function SearchSuggestionsDropdown({
  sections,
  highlightedKey,
  onHighlight,
  onSelect,
  onRemoveRecent,
  onClearRecent,
  isLoading,
  noMatches,
}: SearchSuggestionsDropdownProps) {
  return (
    // A listbox of grouped, heterogeneous rows (thumbnails, remove buttons)
    // doesn't map cleanly onto <select>/<datalist> -- role="listbox" is the
    // correct ARIA combobox-popup pattern for this shape. tabIndex={-1}
    // makes it programmatically focusable without joining the tab order --
    // it's driven via aria-activedescendant from the input, never focused
    // directly.
    // biome-ignore lint/a11y/useSemanticElements: custom ARIA listbox, not a native <select>
    <div
      role="listbox"
      tabIndex={-1}
      aria-label="Search suggestions"
      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover text-popover-foreground shadow-md md:max-h-96"
    >
      {isLoading && sections.length === 0 && (
        <div className="px-3 py-3 text-sm text-muted-foreground">
          Searching…
        </div>
      )}

      {sections.map((section) => (
        <div key={section.label || "literal"} className="p-2">
          {section.label && (
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </span>
              {section.label === "Recent" && (
                <button
                  type="button"
                  onClick={onClearRecent}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
          <ul>
            {section.items.map((item) => {
              const { title, subtitle, imageSrc, icon } = rowContent(item);
              return (
                <li key={item.key} className="group relative">
                  <SearchSuggestionRow
                    id={item.key}
                    title={title}
                    subtitle={subtitle}
                    imageSrc={imageSrc}
                    icon={icon}
                    highlighted={item.key === highlightedKey}
                    onSelect={() => onSelect(item)}
                    onMouseEnter={() => onHighlight(item.key)}
                  />
                  {item.kind === "recent" && (
                    <button
                      type="button"
                      aria-label={`Remove "${item.text}" from recent searches`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveRecent(item.text);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-70 hover:text-foreground hover:opacity-100"
                    >
                      <IoClose />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {noMatches && (
        <div className="px-3 pb-2 pt-1 text-sm text-muted-foreground">
          No matching events or places
        </div>
      )}
    </div>
  );
}
