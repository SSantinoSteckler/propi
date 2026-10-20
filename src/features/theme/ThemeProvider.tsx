"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, setTheme] = useState(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#191b1e" : "#faf8f4");
    // Preferencia de apariencia, sin datos personales ni conexión a Supabase.
    document.cookie = `propi-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [theme]);
  return (
    <ThemeContext.Provider value={{ theme, toggle: () => setTheme((value) => value === "light" ? "dark" : "light") }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("Falta el proveedor de apariencia.");
  return value;
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Activar modo claro" : "Activar modo oscuro";
  return (
    <button className="icon-btn theme-toggle" type="button" onClick={toggle}
      aria-label={label} aria-pressed={theme === "dark"} title={label}>
      {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
