"use client";
// Cycles Auto (follow the device) → Light → Dark. Saved in a cookie so the server renders the right theme with no flash.
import { useState } from "react";

type Mode = "auto" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { auto: "light", light: "dark", dark: "auto" };
const LABEL: Record<Mode, string> = { auto: "Theme: follows your device", light: "Theme: light", dark: "Theme: dark" };

export default function ThemeToggle({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const pick = () => {
    const m = NEXT[mode];
    setMode(m);
    if (m === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = m;
    document.cookie = `theme=${m}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button type="button" className="btn ghost themebtn" onClick={pick} aria-label={`${LABEL[mode]}. Change theme`} title={LABEL[mode]}>
      {mode === "light" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>
      ) : mode === "dark" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></svg>
      )}
    </button>
  );
}
