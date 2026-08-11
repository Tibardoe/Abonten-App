"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import type { CSSProperties } from "react";
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
};

export default function HighlightMenu({
  actions,
  onClose,
  className = "",
  style,
}: HighlightMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside([menuRef], onClose);

  return (
    <div
      ref={menuRef}
      style={style}
      className={`bg-white rounded-md border shadow-lg p-2 min-w-48 font-medium flex flex-col text-iconGray z-50 ${className}`}
    >
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`text-left px-3 py-2 rounded hover:bg-gray-100 ${
            action.destructive ? "text-red-700" : ""
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
