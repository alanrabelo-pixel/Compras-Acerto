"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

const DEMAND_TYPES = [
  { value: "COMPRA_PRODUTO", label: "Compra de Produtos" },
  { value: "COMPRA_SERVICO", label: "Compra de Serviço" },
  { value: "FERRAMENTA_NOVA", label: "Compra de Nova Ferramenta" },
  { value: "FERRAMENTA_USUARIOS", label: "Ferramentas — Inclusão/remoção de usuários" },
  { value: "FERRAMENTA_UPGRADE_DOWNGRADE", label: "Ferramentas — Upgrade/Downgrade" },
  { value: "RENOVACAO_CONTRATO", label: "Renovação de Contrato" },
  { value: "CANCELAMENTO", label: "Cancelamento de Contrato/Serviço/Ferramenta" },
];

const DATE_PRESETS = [
  { label: "Últimos 7 dias", days: 7 },
  { label: "Últimos 30 dias", days: 30 },
  { label: "Últimos 90 dias", days: 90 },
];

export function DashboardFilters({
  costCenters, stages,
}: { costCenters: { id: string; name: string }[]; stages: { value: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyPreset(days: number) {
    const params = new URLSearchParams(searchParams.toString());
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    params.set("de", from.toISOString().slice(0, 10));
    params.set("ate", to.toISOString().slice(0, 10));
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = ["de", "ate", "diretoria", "costCenterId", "demandType", "stage"].some((k) => searchParams.get(k));

  return (
    <div className="dashboard-filters">
      <div className="dashboard-filters-row">
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Período</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="input" type="date" style={{ width: 130 }}
              value={searchParams.get("de") ?? ""}
              onChange={(e) => setParam("de", e.target.value)}
            />
            <input
              className="input" type="date" style={{ width: 130 }}
              value={searchParams.get("ate") ?? ""}
              onChange={(e) => setParam("ate", e.target.value)}
            />
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Atalhos</label>
          <div style={{ display: "flex", gap: 4 }}>
            {DATE_PRESETS.map((p) => (
              <button key={p.days} className="btn btn-secondary" style={{ fontSize: 11.5, padding: "6px 8px" }} onClick={() => applyPreset(p.days)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Diretoria</label>
          <select className="input" value={searchParams.get("diretoria") ?? ""} onChange={(e) => setParam("diretoria", e.target.value)}>
            <option value="">Todas</option>
            <option value="CORPORATIVO">Corporativo</option>
            <option value="REVENUE">Revenue</option>
            <option value="TECNOLOGIA">Tecnologia</option>
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Centro de Custo</label>
          <select className="input" value={searchParams.get("costCenterId") ?? ""} onChange={(e) => setParam("costCenterId", e.target.value)}>
            <option value="">Todos</option>
            {costCenters.map((cc) => (
              <option key={cc.id} value={cc.id}>{cc.name}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Tipo de Demanda</label>
          <select className="input" value={searchParams.get("demandType") ?? ""} onChange={(e) => setParam("demandType", e.target.value)}>
            <option value="">Todos</option>
            {DEMAND_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Etapa (Funil)</label>
          <select className="input" value={searchParams.get("stage") ?? ""} onChange={(e) => setParam("stage", e.target.value)}>
            <option value="">Todas</option>
            {stages.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {hasFilters && (
          <button className="btn btn-secondary" style={{ alignSelf: "flex-end" }} onClick={() => router.push(pathname)}>
            Limpar filtros
          </button>
        )}

        <a
          className="btn btn-primary"
          style={{ alignSelf: "flex-end", textDecoration: "none" }}
          href={`/api/dashboards/export?${searchParams.toString()}`}
        >
          ⬇ Baixar Excel{hasFilters ? " (recorte atual)" : ""}
        </a>
      </div>
    </div>
  );
}
