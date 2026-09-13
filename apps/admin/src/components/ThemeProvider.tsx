"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// The console follows the operator's system appearance and remembers an
// explicit choice (ThemeToggle). next-themes sets the `dark` class on <html>
// before the first paint, which is why the root layout carries
// suppressHydrationWarning, and every colour in the console is a token from
// globals.css, so nothing else has to know which theme is on.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
