import OrderSummary from "@/components/molecules/OrderSummary";
import ContinueButton from "@/wallet/atoms/ContinueButton";
import AddWalletButton from "@/wallet/organisms/AddWalletButton";

export default async function page({
  searchParams,
}: {
  searchParams?: {
    eventId?: string;
    tickets?: string;
    totalAmount?: string;
  };
}) {
  const eventId = searchParams?.eventId || "";
  const tickets = searchParams?.tickets || "[]";
  const totalAmount = searchParams?.totalAmount || "0";

  let ticketSummary = [];
  try {
    ticketSummary = JSON.parse(tickets);
  } catch (error) {
    console.error("Failed to parse tickets:", error);
  }

  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
        <p className="opacity-60 text-sm">
          Add your mobile money wallet or bank card (and associated account) to
          pay
        </p>
      </div>

      {ticketSummary.length > 0 && (
        <OrderSummary
          ticketSummary={ticketSummary}
          eventId={eventId}
          totalAmount={totalAmount}
        />
      )}

      <AddWalletButton />

      <ContinueButton />
    </div>
  );
}
