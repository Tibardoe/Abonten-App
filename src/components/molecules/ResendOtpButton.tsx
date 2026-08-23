"use client";

import { useEffect, useState } from "react";

type Props = {
  onResend: () => unknown | Promise<unknown>;
  cooldownSeconds?: number;
  disabled?: boolean;
  readyLabel?: string;
  cooldownLabel?: (secondsLeft: number) => string;
};

// Shared "Resend code" control with a 60s cooldown timer, used by both the
// phone sign-in OTP screen and Settings -> Security's phone-update flow.
export default function ResendOtpButton({
  onResend,
  cooldownSeconds = 60,
  disabled = false,
  readyLabel = "Resend code",
  cooldownLabel = (secondsLeft) => `Resend code in ${secondsLeft}s`,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(cooldownSeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const handleClick = async () => {
    if (secondsLeft > 0 || disabled) return;
    await onResend();
    setSecondsLeft(cooldownSeconds);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={secondsLeft > 0 || disabled}
      className="text-sm md:text-base font-medium text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
    >
      {secondsLeft > 0 ? cooldownLabel(secondsLeft) : readyLabel}
    </button>
  );
}
