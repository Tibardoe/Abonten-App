import { useSession } from "@/auth/SessionProvider";
import { AppText, Button, Icon, Sheet, useToast } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useState } from "react";
import { View } from "react-native";
import { EmailVerificationForm } from "./EmailVerificationForm";

// Asked at the moment it matters: paying needs an email on the account
// (createMultiCheckoutPaymentAttemptCore / the promotion attempts refuse
// without one — Paystack charges against it, and the ticket and receipt are
// emailed there). Accounts made with a phone number have none, so checkout
// offers to add one right here, with a code, without leaving the order.
// Unlike the account-setup reminder this is never silenced: it only shows
// when the next tap would otherwise fail.

export function useNeedsEmailToPay(): boolean {
  const { session } = useSession();
  return !!session && !session.user.email;
}

export function EmailRequiredCard({
  purpose = "tickets",
}: {
  purpose?: "tickets" | "promotion";
}) {
  const t = useTranslations("account");

  const toast = useToast();
  const needsEmail = useNeedsEmailToPay();
  const [open, setOpen] = useState(false);
  if (!needsEmail) return null;

  return (
    <View className="gap-3 rounded-xl border border-warning/50 bg-card p-4">
      <View className="flex-row gap-3">
        <Icon name="mail-outline" size={22} tone="warning" />
        <View className="flex-1 gap-0.5">
          <AppText variant="bodyStrong">{t("addYourEmailToPay")}</AppText>
          <AppText variant="meta">
            {purpose === "tickets"
              ? t("cardAndMobileMoneyPaymentsNeed")
              : t("cardAndMobileMoneyPaymentsNeed2")}
          </AppText>
        </View>
      </View>
      <Button
        title={t("addEmail")}
        variant="outline"
        leftIcon="add-outline"
        onPress={() => setOpen(true)}
      />
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t("addYourEmail")}
      >
        {open ? (
          <EmailVerificationForm
            onDone={(message) => {
              setOpen(false);
              toast.success(message, {
                description: t("youCanPayNow"),
              });
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
