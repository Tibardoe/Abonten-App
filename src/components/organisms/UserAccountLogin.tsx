"use client";

import { useState } from "react";
import MobileAuthPopup from "./AuthModal";
import AuthPopup from "./AuthPopup";

export default function UserAccountLogin() {
  // const [buttonText, setButtonText] = useState("");
  const [showAuthPopup, setShowAuthPopup] = useState(true);

  return (
    showAuthPopup && (
      <>
        <AuthPopup
          buttonText="Sign In"
          onClose={() => setShowAuthPopup(false)}
        />
        <MobileAuthPopup
          buttonText="Sign In"
          onClose={() => setShowAuthPopup(false)}
        />
      </>
    )
    // <div>
    //   <p className="flex md:hidden font-bold">
    //     Click on the side menu to select Sign up/Login from the sidebar to view
    //     user profile
    //   </p>

    //   <p className="hidden md:flex font-bold">
    //     Click on Sign up/sign in from the header to view user profile
    //   </p>
    // </div>
  );
}
