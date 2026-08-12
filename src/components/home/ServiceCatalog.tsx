"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

export type ServiceOption = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  // Elemento já renderizado (ex: `<ShoppingCart size={18}/>`), não a
  // referência do componente — só assim atravessa a fronteira Server →
  // Client (este catálogo é Client Component, page.tsx que monta as opções
  // é Server Component).
  icon: ReactNode;
  // Atalho opcional pro destino mais frequente dentro do serviço (ex: pular
  // direto pra "Nova Solicitação" em vez de passar pelo quadro geral) — só
  // faz sentido pro serviço com fluxo completo (Compras); os demais são só
  // um canal de chamado, sem uma ação "principal" separada de "Acessar".
  quickAction?: { href: string; label: string };
};

/**
 * Cardápio de serviços da Home — busca instantânea + chips de categoria,
 * filtrando localmente (só 4 serviços hoje; busca global de verdade — por
 * código de solicitação/contrato — já existe via CommandPalette no topo da
 * página, então isto aqui é só "encontrar o serviço certo", não um segundo
 * mecanismo de busca de dados).
 */
export function ServiceCatalog({ services, popularHref }: { services: ServiceOption[]; popularHref: string | null }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Todos");

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const s of services) if (!seen.includes(s.eyebrow)) seen.push(s.eyebrow);
    return ["Todos", ...seen];
  }, [services]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => {
      const matchesCategory = activeCategory === "Todos" || s.eyebrow === activeCategory;
      const matchesQuery =
        q.length === 0 ||
        s.title.toLowerCase().includes(q) ||
        s.eyebrow.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [services, query, activeCategory]);

  function clearFilters() {
    setQuery("");
    setActiveCategory("Todos");
  }

  return (
    <div>
      <div className="exec-catalog-controls">
        <label className="exec-catalog-search">
          <span aria-hidden style={{ display: "flex" }}><Search size={16} strokeWidth={1.75} /></span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar um serviço (ex: viagem, contrato, NDA...)"
            aria-label="Buscar serviço no cardápio"
          />
        </label>
        <div className="exec-catalog-chips" role="group" aria-label="Filtrar por categoria">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`exec-catalog-chip${activeCategory === cat ? " active" : ""}`}
              aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="exec-tile-grid">
          {filtered.map((opt) =>
            opt.quickAction ? (
              // Serviço com atalho: o card vira um agrupador (não um único
              // link gigante) porque tem DOIS destinos reais — "Acessar" (o
              // quadro geral) e o atalho (ex: Nova Solicitação direto) — um
              // <a> dentro de outro <a> seria HTML inválido.
              <div key={opt.href} className="exec-tile">
                <div className="exec-tile-top">
                  <span className="exec-tile-icon-wrap" aria-hidden>{opt.icon}</span>
                  {opt.href === popularHref && (
                    <span className="exec-tile-badge" title="Mais solicitado nos últimos 30 dias">Mais usado</span>
                  )}
                </div>
                <span className="exec-tile-eyebrow">{opt.eyebrow}</span>
                <span className="exec-tile-title">{opt.title}</span>
                <p className="exec-tile-desc">{opt.description}</p>
                <div className="exec-tile-actions">
                  <a href={opt.href} className="exec-tile-cta">Acessar →</a>
                  <a href={opt.quickAction.href} className="exec-tile-quick-action">{opt.quickAction.label}</a>
                </div>
              </div>
            ) : (
              <a key={opt.href} href={opt.href} className="exec-tile">
                <div className="exec-tile-top">
                  <span className="exec-tile-icon-wrap" aria-hidden>{opt.icon}</span>
                  {opt.href === popularHref && (
                    <span className="exec-tile-badge" title="Mais solicitado nos últimos 30 dias">Mais usado</span>
                  )}
                </div>
                <span className="exec-tile-eyebrow">{opt.eyebrow}</span>
                <span className="exec-tile-title">{opt.title}</span>
                <p className="exec-tile-desc">{opt.description}</p>
                <span className="exec-tile-cta">Acessar →</span>
              </a>
            ),
          )}
        </div>
      ) : (
        <div className="exec-catalog-empty">
          <p>Nenhum serviço encontrado para os filtros atuais.</p>
          <button type="button" className="exec-catalog-empty-clear" onClick={clearFilters}>Limpar filtros</button>
        </div>
      )}
    </div>
  );
}
