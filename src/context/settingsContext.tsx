// import { createClient } from "@/config/supabase/server";
// import type { userProfileSettingsDetailsType } from "@/types/userProfileType";
import { createContext, useContext, useEffect, useState } from "react";

interface SettingsContextProp {
  settingsActiveTab: string | null;
  setSettingsActiveTab: (text: string) => void;
  // userProfileSettingsDetails: userProfileSettingsDetailsType;
  // setUserProfileSettingsDetails: () => void;
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

  // const [userProfileSettingsDetails, setUserProfileSettingsDetails] =
  //   useState<userProfileSettingsDetailsType | null>(null);

  // useEffect(() => {
  //   const settingsProfile = async () => {
  //     const supabase = await createClient();
  //     const { data: user, error } = await supabase.auth.getUser();

  //     if (!user) {
  //       return;
  //     }

  //     const {data, error:dataError} = await supabase.from()
  //   };
  // }, []);

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
