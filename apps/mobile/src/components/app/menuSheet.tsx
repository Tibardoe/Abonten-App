import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

// Lets the header's menu button (rendered deep inside React Navigation's
// header) open the app menu sheet that's mounted once in (app)/_layout.tsx —
// the native stand-in for the web header's hamburger → <SideBar> Sheet.

type MenuSheetValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const MenuSheetContext = createContext<MenuSheetValue | null>(null);

export function MenuSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return (
    <MenuSheetContext.Provider value={value}>
      {children}
    </MenuSheetContext.Provider>
  );
}

export function useMenuSheet(): MenuSheetValue {
  const ctx = useContext(MenuSheetContext);
  if (!ctx) {
    throw new Error("useMenuSheet must be used within <MenuSheetProvider>");
  }
  return ctx;
}
