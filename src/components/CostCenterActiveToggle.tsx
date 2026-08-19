"use client";

import { useRouter } from "next/navigation";
import { useAcaoRemota, StatusDaAcao } from "@/components/useAcaoRemota";

/**
 * Ativa/desativa um centro de custo (ver /admin/centros-de-custo). Preferir
 * desativar a renomear/excluir quando um centro de custo deixa de ser usado:
 * isso preserva o histórico de solicitações já vinculadas a ele, sem quebrar
 * nenhuma referência.
 */
export function CostCenterActiveToggle({ costCenterId, active }: { costCenterId: string; active: boolean }) {
  const router = useRouter();
  const { estado, executar, salvando } = useAcaoRemota();

  async function toggle() {
    const next = !active;
    if (!next && !confirm("Desativar este centro de custo? Ele deixa de aparecer para novas solicitações, mas o histórico das já existentes continua intacto.")) {
      return;
    }
    await executar(
      () =>
        fetch(`/api/cost-centers/${costCenterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: next }),
        }),
      () => router.refresh()
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        className={active ? "badge badge-green" : "badge badge-danger"}
        style={{ fontSize: 11 }}
      >
        {active ? "Ativo" : "Inativo"}
      </span>
      <button
        className={`btn ${active ? "btn-danger" : "btn-secondary"}`}
        style={{ padding: "4px 9px", fontSize: 11 }}
        disabled={salvando}
        onClick={toggle}
      >
        {active ? "Desativar" : "Reativar"}
      </button>
      <StatusDaAcao estado={estado} />
    </div>
  );
}
