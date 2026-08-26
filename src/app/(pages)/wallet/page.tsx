import getUserPaymentMethods from "@/actions/getUserPaymentMethods";
import { PageTitle, SupportingText } from "@/components/ui/typography";
import WalletManager from "@/wallet/organisms/WalletManager";

// Per-user, request-time data (this user's saved payment methods) — same
// force-dynamic precedent as manage/my-events/page.tsx. Independent of any
// checkout: this page must render the same way whether the user has zero,
// one, or several pending/completed checkouts elsewhere.
export const dynamic = "force-dynamic";

export default async function page() {
  const response = await getUserPaymentMethods();
  const paymentMethods = response.status === 200 ? response.data : [];

  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <PageTitle>Wallets</PageTitle>
        <SupportingText>
          Save a payment method so you don't have to enter it every time.
        </SupportingText>
      </div>

      <WalletManager initialPaymentMethods={paymentMethods} />
    </div>
  );
}
