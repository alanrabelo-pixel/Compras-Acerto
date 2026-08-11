"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MultiCostCenterPicker } from "@/components/MultiCostCenterPicker";

/**
 * Escolhe quais centros de custo um aprovador pode aprovar (visão "Por
 * Aprovador" de /admin/centros-de-custo — pedido do usuário). Mesma relação
 * CostCenter.managers do CostCenterManagerPicker, só que editada a partir do
 * lado do usuário.
 */
export function ApproverCostCentersPicker({ userId, initialCostCenterIds }: { userId: string; initialCostCenterIds: string[] }) {
  const router = useRouter();
  const [costCenterIds, setCostCenterIds] = useState(initialCostCenterIds);
  const [loading, setLoading] = useState(false);

  async function save(nextCostCenterIds: string[]) {
    setCostCenterIds(nextCostCenterIds);
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/cost-centers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costCenterIds: nextCostCenterIds }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <MultiCostCenterPicker selectedIds={costCenterIds} onChange={save} emptyLabel="Nenhum centro de custo atribuído" />
    </div>
  );
}
