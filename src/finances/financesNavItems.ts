export type FinancesNavItem = {
  href: string;
  label: string;
  // Overview ("/finances") must match exactly — every other sub-route
  // starts with "/finances" too, which would otherwise always highlight
  // Overview as active on every Finances page.
  exact?: boolean;
};

export const FINANCES_NAV_ITEMS: FinancesNavItem[] = [
  { href: "/finances", label: "Overview", exact: true },
  { href: "/finances/transactions", label: "Transactions" },
  { href: "/finances/payouts", label: "Payouts" },
  { href: "/finances/payout-accounts", label: "Payout Accounts" },
];
