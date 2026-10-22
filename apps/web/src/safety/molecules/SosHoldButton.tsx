"use client";

import { useConfirm } from "@/hooks/useConfirm";
import { SOS_HOLD_MS } from "@abonten/core/safety/rules";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

// The website's SOS button: hold it (mouse, finger or the space bar) for a
// second and a half while the ring fills. Letting go early sends nothing.
// Enter asks in a dialog instead, for keyboards and screen readers.

export default function SosHoldButton({
  onTrigger,
  disabled = false,
  size = 184,
}: {
  onTrigger: () => void;
  disabled?: boolean;
  size?: number;
}) {
  const t = useTranslations("safety");
  const confirm = useConfirm();
  const [progress, setProgress] = useState(0);
  const started = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const tick = () => {
    if (started.current === null) return;
    const p = Math.min(1, (performance.now() - started.current) / SOS_HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      started.current = null;
      setProgress(0);
      navigator.vibrate?.(200);
      onTrigger();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  };

  const start = () => {
    if (disabled || started.current !== null) return;
    started.current = performance.now();
    navigator.vibrate?.(30);
    frame.current = requestAnimationFrame(tick);
  };

  const stop = () => {
    started.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    setProgress(0);
  };

  const askFirst = async () => {
    if (disabled) return;
    const ok = await confirm({
      title: t("sosConfirmTitle"),
      message: t("sosConfirmBody"),
      confirmLabel: t("sendSos"),
      cancelLabel: t("cancel"),
    });
    if (ok) onTrigger();
  };

  const degrees = Math.round(progress * 360);
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={t("sos")}
      aria-describedby="sos-hold-hint"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === " " && !e.repeat) {
          e.preventDefault();
          start();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          void askFirst();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " ") stop();
      }}
      style={
        {
          width: size,
          height: size,
          "--sos-progress": `${degrees}deg`,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        } as React.CSSProperties
      }
      className="mx-auto flex select-none flex-col items-center justify-center rounded-full bg-destructive bg-[conic-gradient(rgba(0,0,0,0.3)_var(--sos-progress),transparent_var(--sos-progress))] text-destructive-foreground shadow-lg outline-offset-4 transition-transform active:scale-[0.98] disabled:opacity-50"
    >
      <span className="text-5xl font-bold tracking-wider">{t("sos")}</span>
      <span className="mt-1 px-6 text-center text-sm">
        {progress > 0 ? t("keepHolding") : t("holdToAlert")}
      </span>
      <span id="sos-hold-hint" className="sr-only">
        {t("sosHoldHintWeb")}
      </span>
    </button>
  );
}
