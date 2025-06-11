// import getEventTitle from "@/actions/getEventTitle";
// import getSubscriptionCheckout from "@/actions/getSubscriptionCheckout";
// import getTicketCheckout from "@/actions/getTicketCheckout";
// import CheckoutBtn from "@/components/atoms/CheckoutBtn";
// import OrderSummary from "@/components/molecules/OrderSummary";
// import type { TicketSummaryItem } from "@/types/ticketType";
// import { getFormattedEventDate } from "@/utils/dateFormatter";
import ContinueButton from "@/wallet/atoms/ContinueButton";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";

export default async function page() {
  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
        <p className="opacity-60 text-sm">
          Add your mobile money wallet or bank card (and associated account) to
          pay
        </p>
      </div>

      <AddWalletButton />

      <ContinueButton />
    </div>
  );
}
