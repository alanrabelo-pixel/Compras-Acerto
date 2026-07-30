"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";
const STORAGE_KEY = "acerto-compras-theme";

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

const CYCLE: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<ThemeChoice, string> = { system: "Sistema", light: "Claro", dark: "Escuro" };
const ICON: Record<ThemeChoice, string> = { system: "🖥", light: "☀", dark: "☾" };

/**
 * Alterna entre tema Claro / Escuro / Sistema (segue o SO) — persiste em
 * localStorage. Ver o script inline em layout.tsx que aplica isso antes da
 * primeira renderização (evita o "flash" do tema errado ao carregar).
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) ?? "system";
    setChoice(stored);
  }, []);

  function cycle() {
    const next = CYCLE[choice];
    setChoice(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <button type="button" onClick={cycle} className="sidebar-signout" style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", padding: "0 10px" }}>
      <span aria-hidden>{ICON[choice]}</span>
      Tema: {LABEL[choice]}
    </button>
  );
}
