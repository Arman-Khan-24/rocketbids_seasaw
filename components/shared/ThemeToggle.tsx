"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex w-full items-center gap-2 rounded-lg border border-rocket-border px-3 py-2 text-sm text-rocket-muted transition-all hover:bg-rocket-bg hover:text-rocket-text"
    >
      <span>{isDark ? "☾" : "☀"}</span>
      <span>{isDark ? "Dark" : "Light"}</span>
    </button>
  );
}
