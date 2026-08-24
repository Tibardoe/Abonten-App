"use client";

import Image from "next/image";
import type { ReactNode } from "react";

type SearchSuggestionRowProps = {
  id: string;
  title: string;
  subtitle?: string;
  imageSrc?: string;
  icon?: ReactNode;
  highlighted: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
};

// Shared row for Event/Place suggestions (thumbnail + title + subtitle) —
// keeps SearchSuggestionsDropdown.tsx from duplicating this markup for each
// suggestion group. Matches the existing hand-rolled dropdown convention in
// AutoComplete.tsx/PlaceSearchSelect.tsx (bg-popover/hover:bg-accent tokens)
// rather than introducing a new visual style.
export default function SearchSuggestionRow({
  id,
  title,
  subtitle,
  imageSrc,
  icon,
  highlighted,
  onSelect,
  onMouseEnter,
}: SearchSuggestionRowProps) {
  return (
    <button
      id={id}
      type="button"
      // biome-ignore lint/a11y/useSemanticElements: custom ARIA listbox row, not inside a native <select>
      role="option"
      aria-selected={highlighted}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-start transition-colors ${
        highlighted ? "bg-accent" : "hover:bg-accent"
      }`}
    >
      {imageSrc ? (
        <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
          <Image
            src={imageSrc}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
          />
        </span>
      ) : icon ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-lg text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-popover-foreground">
          {title}
        </span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
    </button>
  );
}
