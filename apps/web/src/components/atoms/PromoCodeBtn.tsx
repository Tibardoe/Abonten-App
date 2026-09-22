import { useState } from "react";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";

type PromoCodeProp = {
  handlePromoCodeFormPopup: (state: boolean) => void;
};

// Only rendered for a paid event — EventUploadFormFields hides the whole
// promo-code section for a free one instead of disabling this button.
export default function PromoCodeBtn({
  handlePromoCodeFormPopup,
}: PromoCodeProp) {
  const [showPromoCodeFormPopup, _setShowPromoCodeFormPopup] = useState(false);

  return (
    <button
      type="button"
      onClick={() => handlePromoCodeFormPopup(true)}
      className="flex justify-between items-center w-full"
    >
      Add Promo Code
      {showPromoCodeFormPopup ? (
        <IoIosArrowUp className="text-2xl" />
      ) : (
        <IoIosArrowDown className="text-2xl" />
      )}
    </button>
  );
}
