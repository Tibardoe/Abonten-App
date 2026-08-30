"use client";

import addPaymentMethod from "@/actions/addPaymentMethod";
import getPaystackMobileMoneyNetworks from "@/actions/getPaystackMobileMoneyNetworks";
import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
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
import { phoneNumberFormatter } from "@abonten/core/phoneNumberFormatter";
import {
  type AddMomoWalletInput,
  addMomoWalletSchema,
} from "@abonten/validation/paymentMethodSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onSaved: (method: PaymentMethodRow) => void;
};

// Ghana local format (0XXXXXXXXX) is normalized to Paystack's expected
// international form before it's ever sent to the server.
function normalizeGhanaPhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+233")) return trimmed;
  return `+233${phoneNumberFormatter(trimmed)}`;
}

export default function AddMomoWallet({ onSaved }: PopupCloseProp) {
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

  const form = useForm<AddMomoWalletInput>({
    resolver: zodResolver(addMomoWalletSchema),
    defaultValues: {
      type: "momo",
      networkCode: "",
      networkName: "",
      phone: "",
      label: "",
    },
  });
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting },
  } = form;

  const onSubmit = async (values: AddMomoWalletInput) => {
    setServerError(null);
    const response = await addPaymentMethod({
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
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Save your mobile money wallet for faster checkout.
      </p>

      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
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

          <div className="flex flex-col gap-2">
            <label htmlFor="label" className="text-sm">
              Label (optional)
            </label>
            <Input
              id="label"
              type="text"
              {...register("label")}
              placeholder="Eg. My MTN MoMo"
            />
          </div>

          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting || isNetworksPending || isNetworksError}
            className="font-semibold md:self-end rounded-md py-6 text-lg md:text-sm"
          >
            {isSubmitting ? "Saving..." : "Save This Wallet"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
