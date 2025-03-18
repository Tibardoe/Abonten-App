import { createContext, useContext, useEffect, useState } from "react";

interface SettingsContextProp {
  settingsActiveTab: string | null;
  setSettingsActiveTab: (text: string) => void;
}

const SettingsContext = createContext<SettingsContextProp | undefined>(
  undefined,
);

export const SettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [settingsActiveTab, setSettingsActiveTab] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const savedActiveTab = localStorage.getItem("settingsActiveTab");

    if (savedActiveTab) {
      setSettingsActiveTab(savedActiveTab);
    } else {
      setSettingsActiveTab("overview");
    }
  }, []);

  useEffect(() => {
    if (settingsActiveTab !== null) {
      localStorage.setItem("settingsActiveTab", settingsActiveTab);
    }
  }, [settingsActiveTab]);

  return (
    <SettingsContext.Provider
      value={{ settingsActiveTab, setSettingsActiveTab }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettingsTab = () => {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettingsTab must be used within SettingsProvider");
  }

  return context;
};
