"use client";

import { cn } from "@/components/lib/utils";

export type TileSelectorOption = {
  id: string;
  label: string;
};

type TileSelectorProps = {
  options: TileSelectorOption[];
  mode: "single" | "multi";
  value: string | string[];
  onChange: (value: string) => void;
  label?: string;
  labelClassName?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

// Shared tile-grid selection UI extracted from PlaceCategoryPicker's
// original layout (2-col grid, bordered tile, border-primary/bg-accent
// selected state) so Event Creation's category/type pickers and the Event
// Filter modal all render the same visual language instead of three
// separate implementations. mode="single" behaves like a radio group,
// mode="multi" like a checkbox group -- callers decide which by how they
// read/write `value`.
export default function TileSelector({
  options,
  mode,
  value,
  onChange,
  label,
  labelClassName,
  disabled = false,
  loading = false,
  className,
}: TileSelectorProps) {
  const isSelected = (id: string) =>
    mode === "single" ? value === id : (value as string[]).includes(id);

  const headingClassName = cn(
    "text-sm font-semibold text-foreground",
    labelClassName,
  );

  if (loading) {
    return (
      <div className={cn("space-y-2", className)}>
        {label && <h2 className={headingClassName}>{label}</h2>}
        <p className="text-muted-foreground text-sm">Loading options...</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && <h2 className={headingClassName}>{label}</h2>}

      <div
        role={mode === "single" ? "radiogroup" : "group"}
        aria-label={label}
        className="grid grid-cols-2 gap-2"
      >
        {options.map((option) => {
          const selected = isSelected(option.id);

          return (
            <button
              key={option.id}
              type="button"
              role={mode === "single" ? "radio" : "checkbox"}
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.id)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border border-input px-3 py-2 text-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none",
                selected && "border-primary bg-accent",
              )}
            >
              <span className="break-words">{option.label}</span>

              {mode === "single" ? (
                <span className="w-[16px] h-[16px] rounded-full grid place-items-center border border-border shrink-0">
                  <span
                    className={cn("bg-primary w-[8px] h-[8px] rounded-full", {
                      hidden: !selected,
                    })}
                  />
                </span>
              ) : (
                <span className="w-[16px] h-[16px] rounded grid place-items-center border border-border shrink-0">
                  {selected && (
                    <span className="w-full h-full bg-primary rounded-sm relative">
                      <span className="w-[6px] h-[10px] border-r-2 border-b-[2px] border-primary-foreground rotate-45 absolute top-[8%] left-1/2 -translate-x-1/2" />
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
