import { type ReactNode, createContext, useContext, useState } from "react";

type uiContextTpye = {
  isMenuClicked: boolean;
  setIsMenuClicked: (state: boolean) => void;
  toggleComponent: () => void;
};

const ShowMenuContext = createContext<uiContextTpye | undefined>(undefined);

export function ShowMenuProvider({ children }: { children: ReactNode }) {
  const [isMenuClicked, setIsMenuClicked] = useState(false);

  const toggleComponent = () => {
    setIsMenuClicked((prevState) => !prevState);
  };

  return (
    <ShowMenuContext.Provider
      value={{ isMenuClicked, setIsMenuClicked, toggleComponent }}
    >
      {children}
    </ShowMenuContext.Provider>
  );
}

export function useShowMenu() {
  const context = useContext(ShowMenuContext);
  if (!context) {
    throw new Error("useShowMenu must be used within a ShowMenuProvider");
  }
  return context;
}
