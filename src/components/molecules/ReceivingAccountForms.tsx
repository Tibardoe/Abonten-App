import { networks } from "@/utils/networkProviderData";
import type { receivingAccountSchema } from "@/utils/receivingAcountSchema";
// import { zodResolver } from "@hookform/resolvers/zod";
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
  const {
    register,
    // handleSubmit,
    // getValues,
    formState: { errors },
  } = form;

  const renderError = (error?: { message?: string }) =>
    error && (
      <p className="text-red-500 text-xs italic mt-1">{error.message}</p>
    );

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <h2>Receiving Account Details</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <input
            {...register("name")}
            placeholder="Full Name"
            className="w-full border rounded-md px-4 py-2 text-sm"
          />
          {renderError(errors.name)}
        </div>
        <div>
          <input
            {...register("email")}
            placeholder="Email"
            className="w-full border rounded-md px-4 py-2 text-sm"
          />

          {renderError(errors.email)}
        </div>
      </div>

      <p className="text-xs text-iconGray">
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
                  ? "bg-mint text-white"
                  : "bg-white text-gray-700 border-gray-300",
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
              className="w-full border px-4 py-2 rounded-md flex justify-between items-center text-sm text-gray-700"
            >
              {selectedNetwork || "Select Mobile Network"}
              <Image
                src="/assets/images/arrowDown.svg"
                alt="Dropdown"
                width={20}
                height={20}
              />
            </button>
            {showNetworkDropdown && (
              <ul className="max-h-60 overflow-y-auto border rounded-md shadow bg-white divide-y">
                {networks.map((network) => (
                  <li key={network.network}>
                    <button
                      type="button"
                      onClick={() => handleSelectedNetwork(network.network)}
                      className="w-full flex items-center px-4 py-2 hover:bg-gray-100 text-sm"
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
            <div>
              <input
                {...register("phone")}
                placeholder="Phone Number"
                className="w-full border rounded-md px-4 py-2 text-sm"
              />
              {renderError(errors.phone)}
            </div>
          </div>
        )}

        {paymentOption === "Bank" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <input
                  {...register("bankName")}
                  placeholder="Bank Name"
                  className="w-full border rounded-md px-4 py-2 text-sm"
                />
                {renderError(errors.bankName)}
              </div>
              <div>
                <input
                  {...register("branch")}
                  placeholder="Bank Branch"
                  className="w-full border rounded-md px-4 py-2 text-sm"
                />
                {renderError(errors.branch)}
              </div>
            </div>
            <div>
              <input
                {...register("bankAccountNumber")}
                placeholder="Account Number"
                type="number"
                className="w-full border rounded-md px-4 py-2 text-sm"
              />
              {renderError(errors.bankAccountNumber)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
