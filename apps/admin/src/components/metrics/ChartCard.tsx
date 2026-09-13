import type { MetricKey } from "@abonten/core/admin/metricDefinitions";
import { metricDefinition } from "@abonten/core/admin/metricDefinitions";
import type { ReactNode } from "react";
import { Card, cn } from "../ui";
import { InfoTip } from "./InfoTip";

// The frame every chart sits in: what it shows, in what unit, over what
// period — plus the two things a chart usually forgets.
//
// First, a chart is an image: it carries a one-sentence summary as its
// accessible label and the same numbers as a visually hidden table, so the
// data is readable without seeing it.
//
// Second, "no bars" is ambiguous. An empty period and a period too short to
// mean anything say so in words instead of drawing an empty box.

export type ChartState = "ok" | "empty" | "insufficient" | "error";

export type ChartTable = {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
};

export function ChartCard({
  title,
  unit,
  caption,
  definition,
  state,
  summary,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  /** e.g. "GHS" or "tickets" — stated once, not repeated on every axis. */
  unit?: string;
  caption?: string;
  definition?: MetricKey | { label?: string; text: string };
  state: ChartState;
  /** One sentence describing the whole series (describeSeries builds it). */
  summary: string;
  legend?: { label: string; swatch: string; dashed?: boolean }[];
  table: ChartTable;
  children: ReactNode;
  className?: string;
}) {
  const tip =
    typeof definition === "string"
      ? {
          label: metricDefinition(definition).label,
          text: metricDefinition(definition).definition,
          caveats: metricDefinition(definition).caveats,
          source: metricDefinition(definition).source,
        }
      : definition
        ? { label: definition.label ?? title, text: definition.text }
        : null;

  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {tip ? (
            <InfoTip
              label={tip.label}
              definition={tip.text}
              caveats={"caveats" in tip ? tip.caveats : undefined}
              source={"source" in tip ? tip.source : undefined}
            />
          ) : null}
        </div>
        {unit ? (
          <span className="text-xs text-muted-foreground">{unit}</span>
        ) : null}
      </div>
      {caption ? (
        <p className="mb-2 text-xs text-muted-foreground">{caption}</p>
      ) : null}

      {state === "ok" ? (
        <>
          <div role="img" aria-label={summary}>
            {children}
          </div>
          {legend?.length ? (
            <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block h-2 w-4 rounded-sm",
                      l.dashed && "opacity-60",
                    )}
                    style={{
                      background: l.dashed
                        ? `repeating-linear-gradient(90deg, ${l.swatch} 0 4px, transparent 4px 7px)`
                        : l.swatch,
                    }}
                  />
                  {l.label}
                </li>
              ))}
            </ul>
          ) : null}
          <table className="sr-only">
            <caption>{table.caption}</caption>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={String(row[0])}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={String(cell)} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={`${String(row[0])}-${table.columns[i]}`}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {state === "empty"
            ? "Nothing happened in this period."
            : state === "insufficient"
              ? "Not enough data yet to show a trend."
              : "This chart couldn't be loaded."}
        </p>
      )}
    </Card>
  );
}
