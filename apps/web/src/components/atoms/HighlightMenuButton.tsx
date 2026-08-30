"use client";

import HighlightMenu, {
  type HighlightMenuAction,
} from "@/components/molecules/HighlightMenu";
import Image from "next/image";
import type { RefObject } from "react";

type HighlightMenuButtonProps = {
  actions: HighlightMenuAction[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  excludeRefs?: RefObject<HTMLElement | null>[];
  menuRef?: RefObject<HTMLDivElement | null>;
};

export default function HighlightMenuButton({
  actions,
  isOpen,
  onOpenChange,
  excludeRefs,
  menuRef,
}: HighlightMenuButtonProps) {
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!isOpen);
        }}
      >
        <Image
          src="/assets/images/menuDots.svg"
          alt="Highlight options"
          width={20}
          height={20}
          className="invert"
        />
      </button>

      {isOpen && (
        <HighlightMenu
          actions={actions}
          onClose={() => onOpenChange(false)}
          className="absolute right-0 top-full mt-1"
          excludeRefs={excludeRefs}
          menuRef={menuRef}
        />
      )}
    </div>
  );
}
