"use client";

import { useState, Children } from "react";

export type TabDef = { id: string; label: string };

/**
 * Abas simples — os painéis já vêm renderizados no servidor (cada um pode
 * ter sua própria query/tabela); o componente cliente só decide qual mostrar.
 * Evita empilhar N seções completas (tabela + parágrafo explicativo cada)
 * verticalmente numa única tela de configuração.
 */
export function Tabs({ tabs, children }: { tabs: TabDef[]; children: React.ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const panels = Children.toArray(children);

  return (
    <div>
      <div className="tabs-bar" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? "tabs-tab tabs-tab-active" : "tabs-tab"}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id}>
          {panels[i]}
        </div>
      ))}
    </div>
  );
}
