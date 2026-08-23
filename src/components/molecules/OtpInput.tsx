"use client";

import { HUBTEL_OTP_CODE_LENGTH } from "@/utils/otpConstants";
import { useEffect, useRef, useState } from "react";

type Props = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
};

// Shared OTP box UI (defaults to Hubtel's 4-digit code length) --
// previously duplicated almost identically between AuthModal.tsx (phone
// sign-in) and SecurityInputFields.tsx (Settings phone update). Auto-advances
// between digits, supports
// backspace-to-previous and full-code paste.
export default function OtpInput({
  length = HUBTEL_OTP_CODE_LENGTH,
  value,
  onChange,
  disabled = false,
  error,
}: Props) {
  const [digits, setDigits] = useState<string[]>(
    Array.from({ length }, (_, i) => value[i] ?? ""),
  );

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    setDigits(Array.from({ length }, (_, i) => value[i] ?? ""));
  }, [value, length]);

  const setInputRef = (el: HTMLInputElement | null, index: number) => {
    inputRefs.current[index] = el;
  };

  const emit = (nextDigits: string[]) => {
    setDigits(nextDigits);
    onChange(nextDigits.join(""));
  };

  const handleChange = (index: number, digit: string) => {
    if (!/^\d?$/.test(digit)) return;

    const nextDigits = [...digits];
    nextDigits[index] = digit;
    emit(nextDigits);

    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleBackspace = (index: number, event: React.KeyboardEvent) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").trim();
    if (new RegExp(`^\\d{${length}}$`).test(pasted)) {
      emit(pasted.split(""));
      inputRefs.current[length - 1]?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-3 items-center">
      <div className="flex gap-3 w-full justify-center" onPaste={handlePaste}>
        {digits.map((digit, index) => (
          <div
            key={`otp-digit-${
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length digit boxes, index is a stable identity here
              index
            }`}
            className="w-[50px] h-[56px] md:w-[60px] md:h-[60px] flex justify-center items-center rounded-2xl bg-muted text-xl"
          >
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={digit}
              maxLength={1}
              disabled={disabled}
              className="w-full h-full text-center outline-none rounded-2xl bg-transparent disabled:opacity-50"
              ref={(el) => setInputRef(el, index)}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleBackspace(index, event)}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-destructive text-sm md:text-lg">{error}</p>}
    </div>
  );
}
