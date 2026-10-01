export type FinancesNavItem = {
  href: string;
  /** A key in the `finances` namespace; the nav components translate it. */
  label: string;
  // Overview ("/finances") must match exactly — every other sub-route
  // starts with "/finances" too, which would otherwise always highlight
  // Overview as active on every Finances page.
  exact?: boolean;
};

export const FINANCES_NAV_ITEMS: FinancesNavItem[] = [
  { href: "/finances", label: "overview", exact: true },
  { href: "/finances/transactions", label: "transactions" },
  { href: "/finances/payouts", label: "payouts" },
  { href: "/finances/payout-accounts", label: "payoutAccounts2" },
];
