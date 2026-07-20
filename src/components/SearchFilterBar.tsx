"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

export type FilterOption = { value: string; label: string };
export type FilterConfig = { key: string; label: string; options: FilterOption[] };

/**
 * Barra de busca + filtros reutilizável (Solicitações, Contratos). Segue o
 * mesmo padrão do DashboardFilters: tudo vive na URL (searchParams), então a
 * página server component só precisa ler searchParams e montar o `where` do
 * Prisma — dá pra copiar/compartilhar um link já filtrado.
 */
export function SearchFilterBar({
  searchPlaceholder, filters,
}: { searchPlaceholder: string; filters: FilterConfig[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
  }, [searchParams]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function onSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParam("q", value), 350);
  }

  const hasFilters = search || filters.some((f) => searchParams.get(f.key));

  return (
    <div className="dashboard-filters">
      <div className="dashboard-filters-row">
        <div className="field" style={{ marginBottom: 0, minWidth: 240, flex: "1 1 240px" }}>
          <label className="label">Buscar</label>
          <input
            className="input"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
        {filters.map((f) => (
          <div className="field" key={f.key} style={{ marginBottom: 0 }}>
            <label className="label">{f.label}</label>
            <select className="input" value={searchParams.get(f.key) ?? ""} onChange={(e) => setParam(f.key, e.target.value)}>
              <option value="">Todos</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
        {hasFilters && (
          <button className="btn btn-secondary" style={{ alignSelf: "flex-end" }} onClick={() => { setSearch(""); router.push(pathname); }}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
