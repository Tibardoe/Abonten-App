"use client";

import HighlightModal from "@/components/organisms/HighlightModal";
import Image from "next/image";
import { useState } from "react";

export default function Higlight() {
  const [showHighlighModal, setShowHighlightModal] = useState(false);

  const handleShowHighlightModal = (state: boolean) => {
    setShowHighlightModal(state);
  };

  return (
    <>
      {showHighlighModal && (
        <HighlightModal handleShowHighlightModal={handleShowHighlightModal} />
      )}

      <button
        type="button"
        onClick={() => {
          handleShowHighlightModal(true);
        }}
      >
        <Image
          src="/assets/images/highlight.svg"
          alt="Highlight button"
          width={80}
          height={80}
        />
      </button>
    </>
  );
}
