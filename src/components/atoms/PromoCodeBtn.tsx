import { useState } from "react";
import { IoIosArrowDown, IoIosArrowUp } from "react-icons/io";

type PromoCodeProp = {
  ticket: string | null;
  handlePromoCodeFormPopup: (state: boolean) => void;
};

export default function PromoCodeBtn({
  ticket,
  handlePromoCodeFormPopup,
}: PromoCodeProp) {
  const [showPromoCodeFormPopup, _setShowPromoCodeFormPopup] = useState(false);

  return (
    <button
      type="button"
      onClick={() => handlePromoCodeFormPopup(true)}
      disabled={ticket === "Free"}
      className="flex justify-between items-center w-full font-semibold text-slate-700"
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
