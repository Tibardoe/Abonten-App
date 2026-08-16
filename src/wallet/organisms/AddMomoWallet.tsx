"use client";

import addPaymentMethod from "@/actions/addPaymentMethod";
import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import MaskIcon from "@/components/atoms/MaskIcon";
import { Button } from "@/components/ui/button";
import {
  type AddMomoWalletInput,
  MOMO_NETWORKS,
  addMomoWalletSchema,
} from "@/utils/paymentMethodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onclick: () => void;
  onSaved: (method: PaymentMethodRow) => void;
};

export default function AddMomoWallet({ onclick, onSaved }: PopupCloseProp) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddMomoWalletInput>({
    resolver: zodResolver(addMomoWalletSchema),
    defaultValues: { type: "momo", network: undefined, last4: "", label: "" },
  });

  const onSubmit = async (values: AddMomoWalletInput) => {
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
        <h1 className="font-bold text-lg">Add Mobile Money Wallet</h1>

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
          <h1 className="font-bold text-xl m-auto">Add Mobile Money Wallet</h1>
        </div>

        <p className="text-center text-sm">
          Save your mobile money wallet for faster checkout
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
          For now this only saves a label for display — full mobile money
          processing isn't connected to a payment provider yet, so we only ask
          for the last 4 digits, not your full number.
        </p>

        <div className="flex flex-col gap-2">
          <label htmlFor="network" className="text-sm">
            Mobile Money Network
          </label>
          <select
            id="network"
            className="border border-input rounded-md px-4 py-2 bg-background outline-none"
            {...register("network")}
            defaultValue=""
          >
            <option value="" disabled>
              Select mobile network
            </option>
            {MOMO_NETWORKS.map((network) => (
              <option key={network} value={network}>
                {network}
              </option>
            ))}
          </select>
          {errors.network && (
            <p className="text-xs text-destructive">{errors.network.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="last4" className="text-sm">
            Last 4 digits of the number
          </label>
          <div className="border border-input rounded-md px-4 py-2 bg-background">
            <input
              id="last4"
              type="text"
              inputMode="numeric"
              maxLength={4}
              className="outline-none w-full"
              {...register("last4")}
              placeholder="Eg. 3094"
            />
          </div>
          {errors.last4 && (
            <p className="text-xs text-destructive">{errors.last4.message}</p>
          )}
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
              placeholder="Eg. My MTN MoMo"
            />
          </div>
        </div>

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
