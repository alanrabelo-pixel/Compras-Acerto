"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MultiUserPicker } from "@/components/MultiUserPicker";

/**
 * Troca o(s) gestor(es) aprovador(es) de um centro de custo (ver
 * /admin/centros-de-custo e PATCH /api/cost-centers/[id]). Mais de um
 * aprovador é permitido (pedido do usuário). Qualquer um do grupo pode
 * decidir na etapa Aprovação do Gestor. Ao salvar, solicitações já paradas
 * nessa etapa (e ainda não decididas) migram automaticamente para o novo
 * conjunto de gestores.
 */
export function CostCenterManagerPicker({ costCenterId, initialManagerIds }: { costCenterId: string; initialManagerIds: string[] }) {
  const router = useRouter();
  const [managerIds, setManagerIds] = useState(initialManagerIds);
  const [loading, setLoading] = useState(false);

  async function save(nextManagerIds: string[]) {
    setManagerIds(nextManagerIds);
    setLoading(true);
    try {
      const res = await fetch(`/api/cost-centers/${costCenterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerIds: nextManagerIds }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <MultiUserPicker selectedIds={managerIds} onChange={save} role="APROVADOR" emptyLabel="Sem gestor do centro de custo definido" />
    </div>
  );
}
