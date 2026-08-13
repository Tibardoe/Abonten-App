"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import type { CSSProperties, RefObject } from "react";
import { useRef } from "react";

export type HighlightMenuAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

type HighlightMenuProps = {
  actions: HighlightMenuAction[];
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
  // Elements that should count as "inside" for the outside-click check even
  // though they're not DOM descendants of this menu — e.g. the button that
  // triggered it (a long-press can open the menu while the finger is still
  // down, so the release's synthetic mousedown targets that sibling button,
  // not the menu itself) or a sibling instance of this same logical menu
  // (this component gets rendered twice, once per responsive breakpoint, in
  // HighlightViewer — see the menuRef prop below).
  excludeRefs?: RefObject<HTMLElement | null>[];
  // Lets a caller obtain (and share) this menu's own root ref, so a sibling
  // instance can list it in its own excludeRefs. Falls back to an internal
  // ref when not supplied.
  menuRef?: RefObject<HTMLDivElement | null>;
};

export default function HighlightMenu({
  actions,
  onClose,
  className = "",
  style,
  excludeRefs = [],
  menuRef: externalMenuRef,
}: HighlightMenuProps) {
  const internalMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = externalMenuRef ?? internalMenuRef;

  useClickOutside([menuRef, ...excludeRefs], onClose);

  return (
    <div
      ref={menuRef}
      style={style}
      className={`bg-popover rounded-md border border-border shadow-lg p-2 min-w-48 font-medium flex flex-col text-popover-foreground z-50 ${className}`}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`text-left px-3 py-2 rounded hover:bg-accent ${
            action.destructive ? "text-destructive" : ""
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            action.onSelect();
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
