import FinancesNavLinks from "../atoms/FinancesNavLinks";
import { FINANCES_NAV_ITEMS } from "../financesNavItems";

export default function FinancesDesktopSidebar() {
  return (
    <div className="flex flex-col gap-2 w-full md:min-w-[220px]">
      {FINANCES_NAV_ITEMS.map((item) => (
        <FinancesNavLinks key={item.href} item={item} />
      ))}
    </div>
  );
}
