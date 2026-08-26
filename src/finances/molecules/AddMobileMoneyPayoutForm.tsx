"use client";

import addPayoutAccount from "@/actions/addPayoutAccount";
import getPaystackMobileMoneyNetworks from "@/actions/getPaystackMobileMoneyNetworks";
import MaskIcon from "@/components/atoms/MaskIcon";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
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

  const form = useForm<AddMobileMoneyPayoutAccountInput>({
    resolver: zodResolver(addMobileMoneyPayoutAccountSchema),
    defaultValues: {
      accountType: "mobile_money",
      accountHolderName: "",
      networkCode: "",
      networkName: "",
      phone: "",
    },
  });
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = form;

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

      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <FormField
            control={control}
            name="accountHolderName"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2 space-y-0">
                <label htmlFor="accountHolderName" className="text-sm">
                  Account Holder Name
                </label>
                <FormControl>
                  <Input
                    id="accountHolderName"
                    type="text"
                    {...field}
                    placeholder="Eg. Kwame Mensah"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="networkCode"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2 space-y-0">
                <label htmlFor="networkCode" className="text-sm">
                  Mobile Money Network
                </label>
                <FormControl>
                  <Select
                    id="networkCode"
                    disabled={isNetworksPending || isNetworksError}
                    defaultValue=""
                    onChange={(e) => {
                      const selected = networks.find(
                        (n) => n.code === e.target.value,
                      );
                      field.onChange(selected?.code ?? "");
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
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="phone"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2 space-y-0">
                <label htmlFor="phone" className="text-sm">
                  Mobile Money Number
                </label>
                <FormControl>
                  <Input
                    id="phone"
                    type="tel"
                    {...field}
                    placeholder="Eg. 0244123456"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
      </Form>
    </div>
  );
}
