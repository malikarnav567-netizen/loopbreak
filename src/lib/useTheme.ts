/**
 * LoopBreak — useTheme Hook
 *
 * Manages dark/light mode state with localStorage persistence.
 * Toggles the `.dark` class on the <html> element, which triggers
 * the CSS variable overrides in globals.css.
 */

"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "loopbreak-theme";

type Theme = "light" | "dark";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored || "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    setMounted(true);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.classList.toggle("dark", next === "dark");
      return next;
    });
  }, []);

  return { theme, toggleTheme, mounted };
}
