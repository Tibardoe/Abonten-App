import AddWalletButton from "@/wallet/organisms/AddWalletButton";
import ContinueButton from "@/wallet/atoms/ContinueButton";

export default function page() {
  return (
    <div className="flex flex-col justify-center gap-5">
      <div>
        <h1 className="font-bold text-xl md:text-2xl">Wallets</h1>
        <p className="opacity-60 text-sm md:text-lg">
          Add your mobile money wallet or bank card (and associated account) to
          pay
        </p>
      </div>
      <AddWalletButton />

      <ContinueButton />
    </div>
  );
}
