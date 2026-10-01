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
import type { PayoutAccountRow } from "@abonten/types/organizerFinance";
import {
  type AddBankPayoutAccountInput,
  addBankPayoutAccountSchema,
} from "@abonten/validation/payoutAccountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";

type PopupCloseProp = {
  onSaved: (account: PayoutAccountRow) => void;
};

export default function AddBankPayoutForm({ onSaved }: PopupCloseProp) {
  const t = useTranslations("finances");

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
        {t("addAnAccountYouLlWithdraw")}
      </p>

      <Form {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
          <FormField
            control={control}
            name="accountHolderName"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2 space-y-0">
                <label htmlFor="accountHolderName" className="text-sm">
                  {t("accountHolderName")}
                </label>
                <FormControl>
                  <Input
                    id="accountHolderName"
                    type="text"
                    {...field}
                    placeholder={t("egKwameMensah")}
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
                  {t("bankName")}
                </label>
                <FormControl>
                  <Input
                    id="bankName"
                    type="text"
                    {...field}
                    placeholder={t("egGcbBank")}
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
                  {t("accountNumber")}
                </label>
                <FormControl>
                  <Input
                    id="accountNumber"
                    type="text"
                    inputMode="numeric"
                    {...field}
                    placeholder={t("eg1234567890")}
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
            {isSubmitting ? t("saving") : t("savePayoutAccount")}
          </Button>
        </form>
      </Form>
    </div>
  );
}
