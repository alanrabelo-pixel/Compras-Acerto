"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Ativa/desativa um centro de custo (ver /admin/centros-de-custo). Preferir
 * desativar a renomear/excluir quando um centro de custo deixa de ser usado
 * — preserva o histórico de solicitações já vinculadas a ele, sem quebrar
 * nenhuma referência.
 */
export function CostCenterActiveToggle({ costCenterId, active }: { costCenterId: string; active: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !active;
    if (!next && !confirm("Desativar este centro de custo? Ele deixa de aparecer para novas solicitações, mas o histórico das já existentes continua intacto.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/cost-centers/${costCenterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={`btn ${active ? "btn-secondary" : "btn-danger"}`}
      style={{ padding: "4px 9px", fontSize: 11 }}
      disabled={loading}
      onClick={toggle}
    >
      {active ? "Ativo" : "Reativar"}
    </button>
  );
}
