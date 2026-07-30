"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "light" | "dark";
const STORAGE_KEY = "acerto-compras-theme";

function applyTheme(choice: ThemeChoice) {
  document.documentElement.setAttribute("data-theme", choice);
}

/**
 * Duas caixinhas (sol/lua) em vez do botão único que ciclava Sistema → Claro
 * → Escuro — mais direto de usar, ao custo de não ter mais um terceiro
 * estado explícito "seguir o SO" depois do primeiro clique. Antes do
 * primeiro clique (nada salvo em localStorage ainda), a caixinha que aparece
 * marcada reflete o tema que já está sendo exibido (prefers-color-scheme),
 * então o usuário não vê o app "discordar" do que a caixinha mostra.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setChoice(stored);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setChoice(prefersDark ? "dark" : "light");
    }
  }, []);

  function select(next: ThemeChoice) {
    setChoice(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Tema">
      <button
        type="button"
        className={`theme-toggle-option${choice === "light" ? " active" : ""}`}
        aria-pressed={choice === "light"}
        title="Tema claro"
        onClick={() => select("light")}
      >
        <span aria-hidden>☀</span>
      </button>
      <button
        type="button"
        className={`theme-toggle-option${choice === "dark" ? " active" : ""}`}
        aria-pressed={choice === "dark"}
        title="Tema escuro"
        onClick={() => select("dark")}
      >
        <span aria-hidden>☾</span>
      </button>
    </div>
  );
}
