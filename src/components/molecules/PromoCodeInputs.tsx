import { useState } from "react";
import React from "react";
import { LiaTimesSolid } from "react-icons/lia";
import { InlineDateField } from "../atoms/InlineDateField";
import { InlineTimeField } from "../atoms/InlineTimeField";
import { Button } from "../ui/button";

function combineDateAndTime(day: Date, time: Date): Date {
  const combined = new Date(day);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

// Expiry is a cutoff, not a start -- defaulting to end of day (23:59) reads
// more naturally than midnight ("expires on Aug 20" implies valid through
// that day, not expiring the instant it begins). Only seeded once the
// organizer explicitly opens the time field, same as the event date editor.
function endOfDay(): Date {
  const date = new Date();
  date.setHours(23, 59, 0, 0);
  return date;
}

type PromoCodeInputProps = {
  onPromoCodesChange: (
    codes: {
      promoCode: string;
      discount: number;
      maximumUse: number;
      expiryDate: Date;
    }[],
  ) => void;
  // Prefills the list from an event draft's saved promo codes (draft
  // continue flow only — the create flow doesn't pass this, so it keeps
  // starting empty). Mirrors DateTimePicker's initialEntries prop.
  initialPromoCodes?: {
    promoCode: string;
    discount: number;
    maximumUse: number;
    expiryDate: Date;
  }[];
};

export default function PromoCodeInputs({
  onPromoCodesChange,
  initialPromoCodes,
}: PromoCodeInputProps) {
  const [promoCode, setPromoCode] = useState("");

  const [discount, setDiscount] = useState<number | null>(null);

  const [maximumUse, setMaximumUse] = useState<number | null>(null);

  const [expiryDate, setExpiryDate] = React.useState<Date | undefined>(
    undefined,
  );

  const [expiryTime, setExpiryTime] = React.useState<Date | undefined>(
    undefined,
  );

  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const [multiplePromoCodes, setMultiplePromoCodes] = useState<
    {
      promoCode: string;
      discount: number;
      maximumUse: number;
      expiryDate: Date;
    }[]
  >(initialPromoCodes ?? []);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();

    if (
      promoCode &&
      maximumUse !== null &&
      discount !== null &&
      expiryDate &&
      expiryTime
    ) {
      // Codes are event-scoped and case-insensitive server-side (normalized
      // upper/trim) -- catch an obvious same-session duplicate immediately
      // instead of waiting for the DB round trip at final submit.
      const normalized = promoCode.trim().toUpperCase();
      const isDuplicate = multiplePromoCodes.some(
        (p) => p.promoCode.trim().toUpperCase() === normalized,
      );

      if (isDuplicate) {
        setDuplicateError("This promo code has already been added.");
        return;
      }

      const updatedCodes = [
        ...multiplePromoCodes,
        {
          promoCode: promoCode,
          maximumUse: maximumUse,
          discount: discount,
          expiryDate: combineDateAndTime(expiryDate, expiryTime),
        },
      ];

      setMultiplePromoCodes(updatedCodes);
      onPromoCodesChange(updatedCodes); // Send to parent

      setPromoCode(""); // Clear inputs
      setMaximumUse(null);
      setDiscount(null);
      setExpiryDate(undefined);
      setExpiryTime(undefined);
      setDuplicateError(null);
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
          onChange={(e) => {
            setPromoCode(e.target.value);
            setDuplicateError(null);
          }}
          className="w-full border p-2 rounded-md"
        />
        {duplicateError && (
          <p className="text-destructive text-sm">{duplicateError}</p>
        )}

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

        {/* Expiry date + time -- inline, not a popover, so it never
            overflows a narrow viewport the way a fixed-width popup would. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <InlineDateField
            label="Expiry date"
            date={expiryDate}
            onSelect={setExpiryDate}
            disabledBefore={new Date()}
            formatDate={(d) => d.toLocaleDateString()}
          />
          <InlineTimeField
            label="Expiry time"
            date={expiryTime}
            onChange={setExpiryTime}
            use12Hour={true}
            seedValue={endOfDay}
          />
        </div>

        <Button
          type="button"
          className="w-full bg-mint"
          onClick={handleClick}
          disabled={
            !promoCode ||
            maximumUse === null ||
            !expiryDate ||
            !expiryTime ||
            discount === null
          }
        >
          Add
        </Button>
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

                  <p>
                    {promoCodes.expiryDate.toLocaleDateString()}{" "}
                    {promoCodes.expiryDate.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
