import { supabase } from "@/config/supabase/client";
import { signOut } from "@/services/authService";
import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  session: Session | null;
  activeTab: string | null;
  setActiveTab: (text: string) => void;
  setSession: (session: Session | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);

  const [session, setSession] = useState<Session | null>(null);

  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    const savedTab = localStorage.getItem("activeTab");

    if (savedTab) {
      setActiveTab(savedTab);
    } else {
      setActiveTab("Posts");
    }
  }, []);

  useEffect(() => {
    if (activeTab !== null) {
      localStorage.setItem("activeTab", activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Error fetching session:", error.message);
        setLoading(false);
        return;
      }

      setUser(data?.session?.user || null);
      setSession(data?.session || null);
      setLoading(false);
    };

    fetchUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
        setSession(session || null);
      },
    );

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        setSession,
        loading,
        signOut,
        activeTab,
        setActiveTab,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
