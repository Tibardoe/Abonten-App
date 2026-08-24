"use client";

import addPayoutAccount from "@/actions/addPayoutAccount";
import getPaystackMobileMoneyNetworks from "@/actions/getPaystackMobileMoneyNetworks";
import MaskIcon from "@/components/atoms/MaskIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { PayoutAccountRow } from "@/types/organizerFinance";
import {
  type AddMobileMoneyPayoutAccountInput,
  addMobileMoneyPayoutAccountSchema,
} from "@/utils/payoutAccountSchema";
import { phoneNumberFormatter } from "@/utils/phoneNumberFormatter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onclick: () => void;
  onSaved: (account: PayoutAccountRow) => void;
};

function normalizeGhanaPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+233")) return trimmed;
  return `+233${phoneNumberFormatter(trimmed)}`;
}

// Mirrors AddMomoWallet.tsx's exact form shape/flow, applied to organizer
// payout destinations instead of buyer payment methods.
export default function AddMobileMoneyPayoutForm({
  onclick,
  onSaved,
}: PopupCloseProp) {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    data: networksResponse,
    isPending: isNetworksPending,
    isError: isNetworksError,
  } = useQuery({
    queryKey: ["paystack-momo-networks"],
    queryFn: getPaystackMobileMoneyNetworks,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const networks =
    networksResponse?.status === 200 ? networksResponse.data : [];

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddMobileMoneyPayoutAccountInput>({
    resolver: zodResolver(addMobileMoneyPayoutAccountSchema),
    defaultValues: {
      accountType: "mobile_money",
      accountHolderName: "",
      networkCode: "",
      networkName: "",
      phone: "",
    },
  });

  const onSubmit = async (values: AddMobileMoneyPayoutAccountInput) => {
    setServerError(null);
    const response = await addPayoutAccount({
      ...values,
      phone: normalizeGhanaPhone(values.phone),
    });

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
        <h1 className="font-bold text-lg">Add Mobile Money Payout Account</h1>

        <button type="button" onClick={onclick}>
          <MaskIcon
            src="/assets/images/circularCancel.svg"
            alt="Close"
            className="w-[25px] h-[25px] bg-foreground"
          />
        </button>
      </div>

      <div className="flex flex-col gap-2 md:hidden pb-10">
        <div className="flex items-center w-full">
          <button type="button" onClick={onclick}>
            <MaskIcon
              src="/assets/images/arrowLeft.svg"
              alt="Close"
              className="self-start w-[30px] h-[30px]"
            />
          </button>
          <h1 className="font-bold text-xl m-auto">Add Mobile Money Account</h1>
        </div>

        <p className="text-center text-sm">
          Add an account you'll withdraw your earnings to
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="accountHolderName" className="text-sm">
            Account Holder Name
          </label>
          <Input
            id="accountHolderName"
            type="text"
            {...register("accountHolderName")}
            placeholder="Eg. Kwame Mensah"
            aria-invalid={!!errors.accountHolderName}
          />
          {errors.accountHolderName && (
            <p className="text-xs text-destructive">
              {errors.accountHolderName.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="networkCode" className="text-sm">
            Mobile Money Network
          </label>
          <Select
            id="networkCode"
            disabled={isNetworksPending || isNetworksError}
            defaultValue=""
            onChange={(e) => {
              const selected = networks.find((n) => n.code === e.target.value);
              setValue("networkCode", selected?.code ?? "", {
                shouldValidate: true,
              });
              setValue("networkName", selected?.name ?? "", {
                shouldValidate: true,
              });
            }}
          >
            <option value="" disabled>
              {isNetworksPending
                ? "Loading networks…"
                : isNetworksError
                  ? "Couldn't load networks"
                  : "Select mobile network"}
            </option>
            {networks.map((network) => (
              <option key={network.code} value={network.code}>
                {network.name}
              </option>
            ))}
          </Select>
          {errors.networkCode && (
            <p className="text-xs text-destructive">
              {errors.networkCode.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="phone" className="text-sm">
            Mobile Money Number
          </label>
          <Input
            id="phone"
            type="tel"
            {...register("phone")}
            placeholder="Eg. 0244123456"
            aria-invalid={!!errors.phone}
          />
          {errors.phone && (
            <p className="text-xs text-destructive">{errors.phone.message}</p>
          )}
        </div>

        {serverError && (
          <p className="text-sm text-destructive">{serverError}</p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting || isNetworksPending || isNetworksError}
          className="font-semibold md:self-end rounded-md py-6 text-lg md:text-sm"
        >
          {isSubmitting ? "Saving..." : "Save Payout Account"}
        </Button>
      </form>
    </div>
  );
}
