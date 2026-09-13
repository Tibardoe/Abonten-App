"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

// Light → dark → system, one button. The choice is announced in words for a
// screen reader and shown as an icon for everyone else; the current setting
// is the accessible name, and what a press does is the description.

const ORDER = ["light", "dark", "system"] as const;
type Choice = (typeof ORDER)[number];

const LABEL: Record<Choice, string> = {
  light: "Light",
  dark: "Dark",
  system: "Same as the device",
};

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the choice after mount; render the neutral state
  // on the server so the markup matches on hydration.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const current: Choice =
    mounted && ORDER.includes(theme as Choice) ? (theme as Choice) : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Laptop;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Appearance: ${LABEL[current]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`Appearance: ${LABEL[current]}`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
