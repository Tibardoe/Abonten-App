import getUserPaymentMethods from "@/actions/getUserPaymentMethods";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import WalletManager from "@/wallet/organisms/WalletManager";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("wallet");
  return { title: t("paymentMethods") };
}

// Per-user, request-time data (this user's saved payment methods) — same
// force-dynamic precedent as manage/my-events/page.tsx. Independent of any
// checkout: this page must render the same way whether the user has zero,
// one, or several pending/completed checkouts elsewhere.
export const dynamic = "force-dynamic";

export default async function page() {
  const t = await getTranslations("wallet");

  const response = await getUserPaymentMethods();
  // Not read: the component loads them itself and says so if it cannot.
  const paymentMethods = response.status === 200 ? response.data : undefined;

  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <PageTitle>{t("wallets")}</PageTitle>
        <SupportingText>{t("saveAPaymentMethodSoYou")}</SupportingText>
      </div>

      <WalletManager initialPaymentMethods={paymentMethods} />
    </div>
  );
}
