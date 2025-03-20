"use client";

import { SettingsProvider } from "./settingsContext";

export default function SettingsProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SettingsProvider>{children}</SettingsProvider>;
}
