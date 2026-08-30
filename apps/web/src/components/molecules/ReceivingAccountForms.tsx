// import { zodResolver } from "@hookform/resolvers/zod";
import MaskIcon from "@/components/atoms/MaskIcon";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import type { receivingAccountSchema } from "@/utils/receivingAcountSchema";
import { networks } from "@abonten/core/networkProviderData";
import Image from "next/image";
// import { useState } from "react";
import type { useForm } from "react-hook-form";
import type { z } from "zod";
import { cn } from "../lib/utils";

type ReceivingAccountType = {
  form: ReturnType<typeof useForm<z.infer<typeof receivingAccountSchema>>>;
  handlePaymentOption: (option: string) => void;
  paymentOption: string | null;
  selectedNetwork: string | null;
  handleSelectedNetwork: (network: string) => void;
  setShowNetworkDropdown: (state: boolean) => void;
  showNetworkDropdown: boolean;
};

export default function ReceivingAccountForms({
  handlePaymentOption,
  paymentOption,
  selectedNetwork,
  handleSelectedNetwork,
  setShowNetworkDropdown,
  showNetworkDropdown,
  form,
}: ReceivingAccountType) {
  const { control } = form;

  const fieldInputClassName =
    "w-full border rounded-md px-4 py-2 text-base md:text-sm";

  return (
    <Form {...form}>
      <div className="max-w-3xl mx-auto space-y-3">
        <h2>Receiving Account Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={control}
            name="name"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <input
                    {...field}
                    placeholder="Full Name"
                    className={fieldInputClassName}
                  />
                </FormControl>
                <FormMessage className="text-xs italic mt-1" />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-0">
                <FormControl>
                  <input
                    {...field}
                    placeholder="Email"
                    className={fieldInputClassName}
                  />
                </FormControl>
                <FormMessage className="text-xs italic mt-1" />
              </FormItem>
            )}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          NB: Full name should be the same as your bank or mobile money account
          name
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">Select Payment Option</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {["Mobile Money", "Bank"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handlePaymentOption(option)}
                className={cn(
                  "py-2 px-4 rounded-md border text-sm font-semibold",
                  paymentOption === option
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground border-input",
                )}
              >
                {option}
              </button>
            ))}
          </div>

          {paymentOption === "Mobile Money" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowNetworkDropdown(!selectedNetwork)}
                className="w-full border border-input px-4 py-2 rounded-md flex justify-between items-center text-sm text-foreground"
              >
                {selectedNetwork || "Select Mobile Network"}
                <MaskIcon
                  src="/assets/images/arrowDown.svg"
                  alt="Dropdown"
                  className="w-5 h-5"
                />
              </button>
              {showNetworkDropdown && (
                <ul className="max-h-60 overflow-y-auto border border-border rounded-md shadow bg-popover text-popover-foreground divide-y divide-border">
                  {networks.map((network) => (
                    <li key={network.network}>
                      <button
                        type="button"
                        onClick={() => handleSelectedNetwork(network.network)}
                        className="w-full flex items-center px-4 py-2 hover:bg-accent text-sm"
                      >
                        <Image
                          src={network.logo}
                          alt={network.network}
                          width={24}
                          height={24}
                          className="mr-2"
                        />
                        {network.network}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <FormField
                control={control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormControl>
                      <input
                        {...field}
                        placeholder="Phone Number"
                        className={fieldInputClassName}
                      />
                    </FormControl>
                    <FormMessage className="text-xs italic mt-1" />
                  </FormItem>
                )}
              />
            </div>
          )}

          {paymentOption === "Bank" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <input
                          {...field}
                          placeholder="Bank Name"
                          className={fieldInputClassName}
                        />
                      </FormControl>
                      <FormMessage className="text-xs italic mt-1" />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="branch"
                  render={({ field }) => (
                    <FormItem className="space-y-0">
                      <FormControl>
                        <input
                          {...field}
                          placeholder="Bank Branch"
                          className={fieldInputClassName}
                        />
                      </FormControl>
                      <FormMessage className="text-xs italic mt-1" />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={control}
                name="bankAccountNumber"
                render={({ field }) => (
                  <FormItem className="space-y-0">
                    <FormControl>
                      <input
                        {...field}
                        placeholder="Account Number"
                        type="number"
                        className={fieldInputClassName}
                      />
                    </FormControl>
                    <FormMessage className="text-xs italic mt-1" />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>
      </div>
    </Form>
  );
}
