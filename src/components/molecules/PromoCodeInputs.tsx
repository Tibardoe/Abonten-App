import { useState } from "react";
import React from "react";
import { LiaTimesSolid } from "react-icons/lia";
import { MdDateRange } from "react-icons/md";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

type PromoCodeInputProps = {
  onPromoCodesChange: (
    codes: {
      promoCode: string;
      discount: number;
      maximumUse: number;
      expiryDate: Date;
    }[],
  ) => void;
};

export default function PromoCodeInputs({
  onPromoCodesChange,
}: PromoCodeInputProps) {
  const [promoCode, setPromoCode] = useState("");

  const [discount, setDiscount] = useState<number | null>(null);

  const [maximumUse, setMaximumUse] = useState<number | null>(null);

  const [expiryDate, setExpiryDate] = React.useState<Date | undefined>(
    undefined,
  );

  const [multiplePromoCodes, setMultiplePromoCodes] = useState<
    {
      promoCode: string;
      discount: number;
      maximumUse: number;
      expiryDate: Date;
    }[]
  >([]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();

    if (promoCode && maximumUse !== null && discount !== null && expiryDate) {
      const updatedCodes = [
        ...multiplePromoCodes,
        {
          promoCode: promoCode,
          maximumUse: maximumUse,
          discount: discount,
          expiryDate: expiryDate,
        },
      ];

      setMultiplePromoCodes(updatedCodes);
      onPromoCodesChange(updatedCodes); // Send to parent

      setPromoCode(""); // Clear inputs
      setMaximumUse(null);
      setDiscount(null);
      setExpiryDate(undefined);
    }
  };

  const handleRemove = (
    event: React.MouseEvent<HTMLButtonElement>,
    promoCode: string,
  ) => {
    event?.preventDefault();

    const updatedCodes = multiplePromoCodes.filter(
      (p) => p.promoCode !== promoCode,
    );
    setMultiplePromoCodes(updatedCodes);
    onPromoCodesChange(updatedCodes); // Send to parent
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Promo code"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value)}
          className="w-full border p-2 rounded-md"
        />

        <div className="flex justify-between items-center gap-2">
          <input
            type="number"
            placeholder="Max use"
            value={maximumUse ?? ""}
            onChange={(e) => setMaximumUse(Number(e.target.value))}
            className="border w-full p-2 rounded-md"
          />

          <input
            type="number"
            placeholder="discount"
            value={discount ?? ""}
            onChange={(e) => setDiscount(Number(e.target.value))}
            className="border w-full p-2 rounded-md"
          />
        </div>

        {/* Expiry date */}
        <div className="flex justify-between items-center">
          <Popover>
            <PopoverTrigger className="flex items-center gap-1">
              <MdDateRange className="text-2xl" />{" "}
              {expiryDate ? (
                expiryDate.toLocaleDateString()
              ) : (
                <p className="text-sm font-bold text-gray-600">Expiry date</p>
              )}
            </PopoverTrigger>

            <PopoverContent className="space-y-4">
              <Calendar
                initialFocus
                mode="single"
                selected={expiryDate}
                onSelect={setExpiryDate}
              />
            </PopoverContent>
          </Popover>

          <Button
            className="self-end"
            onClick={handleClick}
            disabled={
              !promoCode ||
              maximumUse === null ||
              !expiryDate ||
              discount === null
            }
          >
            Add
          </Button>
        </div>
      </div>

      {multiplePromoCodes.length > 0 && (
        <ul className="space-y-3">
          {multiplePromoCodes.map((promoCodes) => (
            <li
              key={promoCodes.promoCode}
              className="space-y-2 border rounded-md p-2 shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <p className="text-sm text-muted-foreground">Promo Code</p>

                  <p className="text-sm font-semibold">
                    {promoCodes.promoCode}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(event) => handleRemove(event, promoCodes.promoCode)}
                >
                  <LiaTimesSolid className="text-xl" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <p>Discount</p>

                  <p>{promoCodes.discount}%</p>
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <p>Maximum usage</p>

                  <p>{promoCodes.maximumUse}</p>
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <p> Expiry date </p>

                  <p>{promoCodes.expiryDate.toLocaleDateString()}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
