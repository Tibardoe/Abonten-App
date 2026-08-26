"use client";

import addPayoutAccount from "@/actions/addPayoutAccount";
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
import type { PayoutAccountRow } from "@/types/organizerFinance";
import {
  type AddBankPayoutAccountInput,
  addBankPayoutAccountSchema,
} from "@/utils/payoutAccountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onclick: () => void;
  onSaved: (account: PayoutAccountRow) => void;
};

export default function AddBankPayoutForm({
  onclick,
  onSaved,
}: PopupCloseProp) {
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<AddBankPayoutAccountInput>({
    resolver: zodResolver(addBankPayoutAccountSchema),
    defaultValues: {
      accountType: "bank",
      accountHolderName: "",
      bankName: "",
      accountNumber: "",
    },
  });
  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onSubmit = async (values: AddBankPayoutAccountInput) => {
    setServerError(null);
    const response = await addPayoutAccount(values);

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
        <h1 className="font-bold text-lg">Add Bank Payout Account</h1>

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
          <h1 className="font-bold text-xl m-auto">Add Bank Account</h1>
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
            name="bankName"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2 space-y-0">
                <label htmlFor="bankName" className="text-sm">
                  Bank Name
                </label>
                <FormControl>
                  <Input
                    id="bankName"
                    type="text"
                    {...field}
                    placeholder="Eg. GCB Bank"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="accountNumber"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2 space-y-0">
                <label htmlFor="accountNumber" className="text-sm">
                  Account Number
                </label>
                <FormControl>
                  <Input
                    id="accountNumber"
                    type="text"
                    inputMode="numeric"
                    {...field}
                    placeholder="Eg. 1234567890"
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
            disabled={isSubmitting}
            className="font-semibold md:self-end rounded-md py-6 text-lg md:text-sm"
          >
            {isSubmitting ? "Saving..." : "Save Payout Account"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
