import MobileNavButton from "../atoms/MobileNavButton";

export default function MobileNavBar() {
  return (
    <div className="flex md:hidden justify-center w-full fixed bottom-0 border-t border-black-500 py-4">
      <div className="flex justify-between w-[90%]">
        <MobileNavButton
          href="/events"
          text="Home"
          imgUrl="/assets/images/home.svg"
        />
        <MobileNavButton
          href="/search"
          text="Search"
          imgUrl="/assets/images/search.svg"
        />
        <MobileNavButton
          href="/transactions"
          text="Transactions"
          imgUrl="/assets/images/transactions.svg"
        />
        <MobileNavButton
          href="/wallets"
          text="Wallets"
          imgUrl="/assets/images/wallet.svg"
        />
        <MobileNavButton
          href="/account"
          text="Account"
          imgUrl="/assets/images/account.svg"
        />
      </div>
    </div>
  );
}
