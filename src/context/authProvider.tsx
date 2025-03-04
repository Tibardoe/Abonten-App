"use client";

import { AuthProvider } from "./authContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
