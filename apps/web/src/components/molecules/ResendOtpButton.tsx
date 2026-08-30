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
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((prev) => Math.max(prev - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const handleClick = async () => {
    if (secondsLeft > 0 || disabled || isResending) return;

    setIsResending(true);
    try {
      await onResend();
      setSecondsLeft(cooldownSeconds);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={secondsLeft > 0 || disabled || isResending}
      className="text-sm md:text-base font-medium text-primary disabled:text-muted-foreground disabled:cursor-not-allowed"
    >
      {isResending
        ? "Resending..."
        : secondsLeft > 0
          ? cooldownLabel(secondsLeft)
          : readyLabel}
    </button>
  );
}
