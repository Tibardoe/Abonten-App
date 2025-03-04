"use client";

import { ShowMenuProvider } from "./uiContext";

export default function UIProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ShowMenuProvider>{children}</ShowMenuProvider>;
}
