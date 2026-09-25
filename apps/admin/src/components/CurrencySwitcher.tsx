import Link from "next/link";

/**
 * Switches a money report between the currencies that have activity. Money
 * is never summed across currencies, so each report shows one; the chips
 * keep every other search param (the date range) intact.
 */
export function CurrencySwitcher({
  basePath,
  current,
  currencies,
  params,
}: {
  basePath: string;
  current: string;
  currencies: string[];
  params: Record<string, string | string[] | undefined>;
}) {
  const options = [...new Set([current, ...currencies])].sort();
  if (options.length < 2) return null;
  const hrefFor = (code: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "currency" || v == null) continue;
      if (Array.isArray(v)) for (const item of v) q.append(k, item);
      else q.set(k, v);
    }
    q.set("currency", code);
    return `${basePath}?${q.toString()}`;
  };
  return (
    <nav
      aria-label="Report currency"
      className="mb-3 flex flex-wrap items-center gap-1 text-xs"
    >
      <span className="mr-1 text-muted-foreground">Currency</span>
      {options.map((code) => (
        <Link
          key={code}
          href={hrefFor(code)}
          aria-current={code === current ? "page" : undefined}
          className={`rounded border px-2 py-0.5 font-mono ${
            code === current
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {code}
        </Link>
      ))}
    </nav>
  );
}
