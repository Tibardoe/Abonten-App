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
// between digits, supports backspace-to-previous and full-code paste/autofill.
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

  // Focus the first box the moment the OTP screen appears, so the user can
  // start typing (or tap the SMS-autofill suggestion) immediately instead
  // of having to tap into the field themselves.
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const setInputRef = (el: HTMLInputElement | null, index: number) => {
    inputRefs.current[index] = el;
  };

  const emit = (nextDigits: string[]) => {
    setDigits(nextDigits);
    onChange(nextDigits.join(""));
  };

  // Distributes a full (or partial) code across the boxes starting at
  // `startIndex`. Used for both clipboard paste and the multi-character
  // value iOS/Android deliver in one go when the user taps the SMS
  // autofill suggestion above the keyboard -- that fill lands as a single
  // input event on whichever box is currently focused, not one digit per
  // box, so it has to be split here rather than relying on per-box typing.
  const distribute = (rawValue: string, startIndex: number) => {
    const incomingDigits = rawValue.replace(/\D/g, "").split("");
    if (incomingDigits.length === 0) return;

    const nextDigits = [...digits];
    let lastFilledIndex = startIndex;

    for (let i = 0; i < incomingDigits.length && startIndex + i < length; i++) {
      nextDigits[startIndex + i] = incomingDigits[i];
      lastFilledIndex = startIndex + i;
    }

    emit(nextDigits);
    inputRefs.current[Math.min(lastFilledIndex + 1, length - 1)]?.focus();
  };

  const handleChange = (index: number, rawValue: string) => {
    // Autofill (or a paste that landed via `input` rather than `paste`)
    // delivers more than one character at once -- redistribute instead of
    // treating it as a single keystroke.
    if (rawValue.length > 1) {
      distribute(rawValue, index);
      return;
    }

    if (!/^\d?$/.test(rawValue)) return;

    const nextDigits = [...digits];
    nextDigits[index] = rawValue;
    emit(nextDigits);

    if (rawValue && index < length - 1) {
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
    distribute(event.clipboardData.getData("text"), 0);
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
            className="w-[50px] h-[56px] md:w-[60px] md:h-[60px] flex justify-center items-center rounded-2xl bg-muted text-xl border border-input ring-1 ring-transparent transition-shadow focus-within:ring-2 focus-within:ring-ring"
          >
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={digit}
              // No maxLength: iOS's SMS-autofill suggestion fills the
              // *entire* code into whichever box is focused as one input
              // event, and a maxLength={1} attribute lets the browser
              // truncate that to a single character before this component
              // ever sees the rest -- handleChange()/distribute() do the
              // one-digit-per-box enforcement instead.
              disabled={disabled}
              className="w-full h-full text-center outline-none rounded-2xl bg-transparent disabled:opacity-50"
              ref={(el) => setInputRef(el, index)}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleBackspace(index, event)}
              // Selecting existing content on focus means retyping over an
              // already-filled box replaces it instead of appending (which,
              // without a maxLength, would otherwise push the new digit
              // into the next box).
              onFocus={(event) => event.target.select()}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-destructive text-sm md:text-lg">{error}</p>}
    </div>
  );
}
