"use client";

import addPaymentMethod from "@/actions/addPaymentMethod";
import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import MaskIcon from "@/components/atoms/MaskIcon";
import { Button } from "@/components/ui/button";
import {
  type AddBankCardInput,
  CARD_BRANDS,
  addBankCardSchema,
} from "@/utils/paymentMethodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onclick: () => void;
  onSaved: (method: PaymentMethodRow) => void;
};

const currentYear = new Date().getFullYear();
const expiryYears = Array.from({ length: 15 }, (_, i) => currentYear + i);

export default function AddBankCard({ onclick, onSaved }: PopupCloseProp) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddBankCardInput>({
    resolver: zodResolver(addBankCardSchema),
    defaultValues: {
      type: "card",
      brand: undefined,
      last4: "",
      expiryMonth: undefined,
      expiryYear: undefined,
      label: "",
    },
  });

  const onSubmit = async (values: AddBankCardInput) => {
    setServerError(null);
    const response = await addPaymentMethod(values);

    if (response.status !== 200) {
      setServerError(response.message);
      return;
    }

    onSaved(response.data);
  };

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
    <div
      onClick={(e) => e.stopPropagation()}
      className="w-full h-screen md:h-fit md:w-[60%] lg:w-[50%] bg-card text-card-foreground md:rounded-xl pt-5 p-3 md:p-5 space-y-5 pb-16 md:pb-20"
    >
      <div className="hidden md:flex justify-between items-center">
        <div>
          <h1 className="font-bold text-lg">Add Bank Card</h1>
          <p className="opacity-50">
            Save your Visa or Mastercard for faster checkout
          </p>
        </div>

        <button type="button" onClick={onclick}>
          <MaskIcon
            src="/assets/images/circularCancel.svg"
            alt="Close"
            className="w-[25px] h-[25px] bg-foreground"
          />
        </button>
      </div>

      {/* Mobile header */}
      <div className="flex flex-col gap-2 md:hidden pb-10">
        <div className="flex items-center w-full">
          <button type="button" onClick={onclick}>
            <MaskIcon
              src="/assets/images/arrowLeft.svg"
              alt="Close"
              className="self-start w-[30px] h-[30px]"
            />
          </button>
          <h1 className="font-bold text-xl m-auto">Add Bank Card</h1>
        </div>

        <p className="text-center text-sm">
          Save your Visa or Mastercard for faster checkout
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          For now this only saves a label for display — full card processing
          isn't connected to a payment provider yet, so we only ask for the last
          4 digits, never your full card number or CVV.
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor="brand" className="text-sm">
            Card Brand
          </label>
          <select
            id="brand"
            className="border border-input rounded-md px-4 py-2 bg-background outline-none"
            {...register("brand")}
            defaultValue=""
          >
            <option value="" disabled>
              Select card brand
            </option>
            {CARD_BRANDS.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          {errors.brand && (
            <p className="text-xs text-destructive">{errors.brand.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="last4" className="text-sm">
            Last 4 digits
          </label>
          <div className="border border-input rounded-md px-4 py-2 bg-background">
            <input
              id="last4"
              type="text"
              inputMode="numeric"
              maxLength={4}
              className="outline-none w-full"
              {...register("last4")}
              placeholder="Eg. 4242"
            />
          </div>
          {errors.last4 && (
            <p className="text-xs text-destructive">{errors.last4.message}</p>
          )}
        </div>

        <div className="flex gap-5">
          <div className="flex flex-col gap-2 w-full">
            <label htmlFor="expiryMonth" className="text-sm">
              Expiry Month
            </label>
            <select
              id="expiryMonth"
              className="border border-input rounded-md px-4 py-2 bg-background outline-none"
              {...register("expiryMonth", { valueAsNumber: true })}
              defaultValue=""
            >
              <option value="" disabled>
                MM
              </option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={month}>
                  {String(month).padStart(2, "0")}
                </option>
              ))}
            </select>
            {errors.expiryMonth && (
              <p className="text-xs text-destructive">
                {errors.expiryMonth.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 w-full">
            <label htmlFor="expiryYear" className="text-sm">
              Expiry Year
            </label>
            <select
              id="expiryYear"
              className="border border-input rounded-md px-4 py-2 bg-background outline-none"
              {...register("expiryYear", { valueAsNumber: true })}
              defaultValue=""
            >
              <option value="" disabled>
                YYYY
              </option>
              {expiryYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            {errors.expiryYear && (
              <p className="text-xs text-destructive">
                {errors.expiryYear.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="label" className="text-sm">
            Label (optional)
          </label>
          <div className="border border-input rounded-md px-4 py-2 bg-background">
            <input
              id="label"
              type="text"
              className="outline-none w-full"
              {...register("label")}
              placeholder="Eg. My Visa"
            />
          </div>
        </div>

        <span className="p-3 rounded-md bg-muted text-center font-semibold text-sm">
          <p>
            Note: Only bank cards registered in your name can be added to your
            account
          </p>
        </span>

        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="font-semibold md:self-end rounded-md py-6 text-lg md:text-sm"
        >
          {isSubmitting ? "Saving..." : "Save This Wallet"}
        </Button>
      </form>
    </div>
  );
}
