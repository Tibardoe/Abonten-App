import type { MetricKey } from "@abonten/core/admin/metricDefinitions";
import { metricDefinition } from "@abonten/core/admin/metricDefinitions";
import type { ReactNode } from "react";
import { cn } from "../ui";
import { InfoTip } from "./InfoTip";

// A section heading that can explain itself, and that a screen reader can
// jump between (the console had visual headings with no heading semantics
// in places).

export function SectionHeading({
  title,
  tip,
  id,
  action,
  className,
}: {
  title: string;
  /** A metric key, or the explanation itself. */
  tip?: MetricKey | { label?: string; text: string };
  id?: string;
  action?: ReactNode;
  className?: string;
}) {
  const resolved =
    typeof tip === "string"
      ? {
          label: metricDefinition(tip).label,
          text: metricDefinition(tip).definition,
        }
      : tip
        ? { label: tip.label ?? title, text: tip.text }
        : null;

  return (
    <div
      className={cn("mb-2 flex items-center justify-between gap-3", className)}
    >
      <h2
        id={id}
        className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"
      >
        {title}
        {resolved ? (
          <InfoTip label={resolved.label} definition={resolved.text} />
        ) : null}
      </h2>
      {action}
    </div>
  );
}
