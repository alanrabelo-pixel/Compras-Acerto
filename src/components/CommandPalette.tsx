"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchResult = { type: "solicitacao" | "contrato"; id: string; title: string; subtitle: string; href: string };
type Item = { key: string; title: string; subtitle: string; href: string; group: string };

const QUICK_ACTIONS: Item[] = [
  { key: "nova", title: "+ Nova Solicitação", subtitle: "Abrir uma nova solicitação de compra", href: "/solicitacoes/nova", group: "Ações rápidas" },
  { key: "quadro", title: "Quadro", subtitle: "Ver todas as solicitações", href: "/solicitacoes", group: "Navegar" },
  { key: "pendencias", title: "Minhas Pendências", subtitle: "Ações que dependem de mim agora", href: "/solicitacoes/pendencias", group: "Navegar" },
  { key: "contratos", title: "Contratos", subtitle: "Gestão de contratos", href: "/contratos", group: "Navegar" },
  { key: "dashboards", title: "Dashboards", subtitle: "Indicadores executivos de Compras", href: "/dashboards", group: "Navegar" },
];

/**
 * Command Palette (Ctrl/Cmd+K) — busca global (Solicitações + Contratos) e
 * ações rápidas de navegação, num único lugar. Não reaproveita o Modal
 * genérico da biblioteca de componentes de propósito: uma paleta de comando
 * precisa aparecer perto do topo, mais larga, e sem cabeçalho/botão de
 * fechar — o padrão de UX é digitar imediatamente, não ler um título.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const items: Item[] =
    query.trim().length >= 2
      ? results.map((r) => ({
          key: `${r.type}-${r.id}`,
          title: r.title,
          subtitle: r.subtitle,
          href: r.href,
          group: r.type === "solicitacao" ? "Solicitações" : "Contratos",
        }))
      : QUICK_ACTIONS;

  // Fecha/abre com Ctrl+K (ou Cmd+K no Mac) de qualquer lugar do app; Escape fecha.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function select(item: Item) {
    setOpen(false);
    router.push(item.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[activeIndex]) select(items[activeIndex]);
    }
  }

  // Agrupa preservando a ordem (Solicitações antes de Contratos, ou os
  // grupos fixos de Ações rápidas/Navegar).
  const groups: { label: string; items: Item[] }[] = [];
  for (const item of items) {
    const group = groups.find((g) => g.label === item.group);
    if (group) group.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }
  let runningIndex = -1;

  return (
    <>
      {/* Gatilho visível — sem isso, o atalho Ctrl+K seria invisível para
          quem não soubesse que ele existe. */}
      <button type="button" className="sidebar-search-trigger" onClick={() => setOpen(true)}>
        <span aria-hidden>⌕</span>
        Buscar
        <span className="sidebar-search-kbd">Ctrl K</span>
      </button>

      {open && (
        <div className="command-palette-overlay" onClick={() => setOpen(false)} role="presentation">
          <div className="command-palette" role="dialog" aria-modal="true" aria-label="Busca global" onClick={(e) => e.stopPropagation()}>
            <div className="command-palette-input-row">
              <span aria-hidden style={{ color: "var(--ink-muted)" }}>⌕</span>
              <input
                ref={inputRef}
                className="command-palette-input"
                placeholder="Buscar solicitações, contratos, ou navegar..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
              />
              {loading && <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>buscando...</span>}
            </div>
            <div className="command-palette-list">
              {items.length === 0 && <p className="command-palette-empty">Nenhum resultado para &quot;{query}&quot;.</p>}
              {groups.map((group) => (
                <div key={group.label}>
                  <p className="command-palette-group-label">{group.label}</p>
                  {group.items.map((item) => {
                    runningIndex += 1;
                    const index = runningIndex;
                    return (
                      <div
                        key={item.key}
                        className={`command-palette-item${index === activeIndex ? " active" : ""}`}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => select(item)}
                      >
                        <span className="command-palette-item-title">{item.title}</span>
                        <span className="command-palette-item-subtitle">{item.subtitle}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="command-palette-hint">
              <span>↑↓ navegar</span>
              <span>↵ selecionar</span>
              <span>esc fechar</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
