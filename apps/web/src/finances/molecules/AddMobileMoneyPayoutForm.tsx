"use client";

import addPayoutAccount from "@/actions/addPayoutAccount";
import getPaystackMobileMoneyNetworks from "@/actions/getPaystackMobileMoneyNetworks";
import requestMobileMoneyNumberCode from "@/actions/requestMobileMoneyNumberCode";
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
import { actionUnreachable } from "@/utils/actionUnreachable";
import type { PayoutAccountRow } from "@abonten/types/organizerFinance";
import {
  type AddMobileMoneyPayoutAccountInput,
  addMobileMoneyPayoutAccountSchema,
} from "@abonten/validation/payoutAccountSchema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import MomoCodeStep from "../../wallet/molecules/MomoCodeStep";

type PopupCloseProp = {
  onSaved: (account: PayoutAccountRow) => void;
};

// Mirrors AddMomoWallet.tsx's exact form shape/flow, applied to organizer
// payout destinations instead of buyer payment methods. Earnings are sent to
// this number, so it is confirmed first: a code is texted to it, unless it
// is the organizer's own verified phone (payments/mobileMoneyNumberCheck).
export default function AddMobileMoneyPayoutForm({ onSaved }: PopupCloseProp) {
  const t = useTranslations("finances");

  const [serverError, setServerError] = useState<string | null>(null);
  // Set once a code has been texted: the code step replaces the form.
  const [pending, setPending] = useState<{
    values: AddMobileMoneyPayoutAccountInput;
    phoneE164: string;
    codeLength: number;
  } | null>(null);
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const {
    data: networksResponse,
    isPending: isNetworksPending,
    isError: isNetworksError,
  } = useQuery({
    queryKey: ["paystack-momo-networks"],
    // The person's home market (the action resolves it when no country is given).
    queryFn: () => getPaystackMobileMoneyNetworks(),
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

  const save = async (
    values: AddMobileMoneyPayoutAccountInput,
    code?: string,
  ) => {
    setServerError(null);
    setBusy(true);
    try {
      const response = await addPayoutAccount({
        ...values,
        // Sent as typed: the service parses it for the account's market.
        phone: values.phone.trim(),
        code,
      }).catch(actionUnreachable);

      if (response.status !== 200) {
        setServerError(response.message);
        return;
      }

      onSaved(response.data);
    } finally {
      setBusy(false);
    }
  };

  const requestCode = async (
    values: AddMobileMoneyPayoutAccountInput,
    resend: boolean,
  ) => {
    setServerError(null);
    setBusy(true);
    try {
      const response = await requestMobileMoneyNumberCode({
        phone: values.phone.trim(),
        use: "payout",
        countryCode: values.countryCode ?? null,
      }).catch(actionUnreachable);

      if (response.status !== 200) {
        setServerError(response.message);
        return;
      }
      if (!response.data.needsCode) {
        await save(values);
        return;
      }
      setCodeNote(resend ? t("aNewCodeIsOnItsWay") : null);
      setPending({
        values,
        phoneE164: response.data.phoneE164,
        codeLength: response.data.codeLength,
      });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (values: AddMobileMoneyPayoutAccountInput) =>
    requestCode(values, false);

  if (pending) {
    return (
      <MomoCodeStep
        phoneE164={pending.phoneE164}
        codeLength={pending.codeLength}
        submitLabel={t("savePayoutAccount")}
        busy={busy}
        error={serverError}
        note={codeNote}
        onSubmit={(code) => void save(pending.values, code)}
        onResend={() => void requestCode(pending.values, true)}
        onChangeNumber={() => {
          setServerError(null);
          setPending(null);
        }}
      />
    );
  }

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
            name="networkCode"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2 space-y-0">
                <label htmlFor="networkCode" className="text-sm">
                  {t("mobileMoneyNetwork")}
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
                        ? t("loadingNetworks")
                        : isNetworksError
                          ? t("couldnTLoadNetworks")
                          : t("selectMobileNetwork")}
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
                  {t("mobileMoneyNumber")}
                </label>
                <FormControl>
                  <Input
                    id="phone"
                    type="tel"
                    {...field}
                    placeholder={t("eg0244123456")}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <p className="text-sm text-muted-foreground">
            {t("weLlTextACodeToThis")}
          </p>

          {serverError && (
            <p className="text-sm text-destructive">{serverError}</p>
          )}

          <Button
            type="submit"
            disabled={
              isSubmitting || busy || isNetworksPending || isNetworksError
            }
            className="font-semibold md:self-end rounded-md py-6 text-lg md:text-sm"
          >
            {isSubmitting || busy ? t("sending") : t("continueText")}
          </Button>
        </form>
      </Form>
    </div>
  );
}
