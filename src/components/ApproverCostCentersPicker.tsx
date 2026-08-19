"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAcaoRemota, StatusDaAcao } from "@/components/useAcaoRemota";
import { MultiCostCenterPicker } from "@/components/MultiCostCenterPicker";

/**
 * Escolhe quais centros de custo um aprovador pode aprovar (visão "Por
 * Aprovador" de /admin/centros-de-custo, pedido do usuário). Mesma relação
 * CostCenter.managers do CostCenterManagerPicker, só que editada a partir do
 * lado do usuário.
 */
export function ApproverCostCentersPicker({ userId, initialCostCenterIds }: { userId: string; initialCostCenterIds: string[] }) {
  const router = useRouter();
  const [costCenterIds, setCostCenterIds] = useState(initialCostCenterIds);
  const { estado, executar, salvando } = useAcaoRemota();

  async function save(nextCostCenterIds: string[]) {
    const anterior = costCenterIds;
    setCostCenterIds(nextCostCenterIds);
    const deuCerto = await executar(
      () =>
        fetch(`/api/users/${userId}/cost-centers`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ costCenterIds: nextCostCenterIds }),
        }),
      () => router.refresh()
    );
    // Reverte a mudança otimista: sem isso a tela mostraria o valor novo
    // enquanto o servidor recusou, que é pior que não dar retorno nenhum.
    if (!deuCerto) setCostCenterIds(anterior);
  }

  return (
    <div style={{ opacity: salvando ? 0.6 : 1 }}>
      <MultiCostCenterPicker selectedIds={costCenterIds} onChange={save} emptyLabel="Nenhum centro de custo atribuído" />
      <StatusDaAcao estado={estado} />
    </div>
  );
}
