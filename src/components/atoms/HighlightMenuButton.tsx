"use client";

import HighlightMenu, {
  type HighlightMenuAction,
} from "@/components/molecules/HighlightMenu";
import Image from "next/image";
import { useState } from "react";

type HighlightMenuButtonProps = {
  actions: HighlightMenuAction[];
};

export default function HighlightMenuButton({
  actions,
}: HighlightMenuButtonProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu((prev) => !prev);
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

      {showMenu && (
        <HighlightMenu
          actions={actions}
          onClose={() => setShowMenu(false)}
          className="absolute right-0 top-full mt-1"
        />
      )}
    </div>
  );
}
