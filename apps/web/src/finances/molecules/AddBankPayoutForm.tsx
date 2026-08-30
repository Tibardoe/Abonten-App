"use client";

import addPayoutAccount from "@/actions/addPayoutAccount";
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
  onSaved: (account: PayoutAccountRow) => void;
};

export default function AddBankPayoutForm({ onSaved }: PopupCloseProp) {
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
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Add an account you'll withdraw your earnings to.
      </p>

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
