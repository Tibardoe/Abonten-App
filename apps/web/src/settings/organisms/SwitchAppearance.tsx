"use client";

import { cn } from "@/components/lib/utils";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Laptop },
] as const;

export default function SwitchAppearance() {
  const t = useTranslations("settings.appearance");
  const { theme, setTheme } = useTheme();

  // next-themes only knows the resolved theme after mount, so render a
  // neutral state on the server to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="flex flex-col gap-5 w-full">
      <div>
        <p className="text-xl font-medium text-foreground">{t("title")}</p>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {OPTIONS.map(({ value, icon: Icon }) => {
          const isActive = mounted && theme === value;

          return (
            <button
              key={value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                isActive
                  ? "border-primary bg-accent"
                  : "border-border bg-card hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
              </span>

              <span>
                <p className="font-medium text-card-foreground">{t(value)}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`${value}Description`)}
                </p>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
