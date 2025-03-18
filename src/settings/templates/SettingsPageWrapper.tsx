"use client";

import { SettingsProvider } from "@/context/settingsContext";
import Settings from "./Settings";

export default function SettingsPageWrapper() {
  return (
    <SettingsProvider>
      <Settings />
    </SettingsProvider>
  );
}
