"use client";

import { createPromoCode } from "@/actions/createPromoCode";
import { useToast } from "@/hooks/useToast";
import {
  promoCodeDraftGap,
  promoCodeDraftGapMessage,
} from "@abonten/core/promoCodeDraft";
import { useMutation } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { InlineDateField } from "../atoms/InlineDateField";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

// The picked day as YYYY-MM-DD: the server reads it in the event's own
// calendar, so the browser's zone never moves it a day.
function calendarDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type AddPromoCodeFormProps = {
  eventId: string;
  onAdded: () => void;
};

// A new code on an event that already exists (ManagePromoCodesModal).
export default function AddPromoCodeForm({
  eventId,
  onAdded,
}: AddPromoCodeFormProps) {
  const t = useTranslations("common");
  const tc = useTranslations("core");
  const format = useFormatter();
  const toast = useToast();

  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiry, setExpiry] = useState<Date | undefined>(undefined);

  const gap = promoCodeDraftGap({ code, discount, maxUses, expiry });
  const touched = code !== "" || discount !== "" || maxUses !== "" || !!expiry;

  const addMutation = useMutation({
    mutationFn: createPromoCode,
    onSuccess: (result) => {
      if (result.status === 200) {
        setCode("");
        setDiscount("");
        setMaxUses("");
        setExpiry(undefined);
        onAdded();
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    },
    onError: () => toast.error(t("weCouldnTAddThatPromoCode")),
  });

  const submit = () => {
    if (gap || !expiry) return;
    addMutation.mutate({
      eventId,
      promoCode: code,
      discountPercentage: Number(discount),
      maxUses: maxUses.trim() === "" ? null : Number(maxUses),
      expiresAt: calendarDay(expiry),
    });
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <p className="text-sm font-semibold">{t("addAPromoCode")}</p>
      <Input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t("promoCode")}
        aria-label={t("promoCode")}
        autoCapitalize="characters"
        autoComplete="off"
      />
      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={100}
          value={discount}
          onChange={(e) => setDiscount(e.target.value)}
          placeholder={t("discount4")}
          aria-label={t("discount4")}
        />
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          value={maxUses}
          onChange={(e) => setMaxUses(e.target.value)}
          placeholder={t("maxUsesBlankUnlimited")}
          aria-label={t("maxUsesBlankUnlimited")}
        />
      </div>
      <InlineDateField
        label={t("expiryDate")}
        date={expiry}
        onSelect={setExpiry}
        disabledBefore={new Date()}
        formatDate={(d) => format.dateTime(d, { dateStyle: "medium" })}
      />
      <Button
        type="button"
        className="w-full"
        disabled={!!gap || addMutation.isPending}
        onClick={submit}
      >
        {addMutation.isPending ? t("adding") : t("add")}
      </Button>
      {touched && gap ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {promoCodeDraftGapMessage(tc, gap)}
        </p>
      ) : null}
    </div>
  );
}
