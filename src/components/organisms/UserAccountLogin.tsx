"use client";

import { useState } from "react";
import AuthModal from "./AuthModal";

export default function UserAccountLogin() {
  // const [buttonText, setButtonText] = useState("");
  const [showAuthPopup, setShowAuthPopup] = useState(true);

  return (
    showAuthPopup && <AuthModal buttonText="Sign In" />
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
