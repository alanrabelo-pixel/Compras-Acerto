"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";

/**
 * Troca o gestor aprovador de um centro de custo (ver /admin/centros-de-custo
 * e PATCH /api/cost-centers/[id]). Ao salvar, solicitações já paradas na
 * etapa Aprovação do Gestor deste centro de custo (e ainda não decididas)
 * migram automaticamente para o novo gestor — a troca reflete no fluxo em
 * andamento, não só nas próximas solicitações.
 */
export function CostCenterManagerPicker({ costCenterId, initialManagerId }: { costCenterId: string; initialManagerId: string }) {
  const router = useRouter();
  const [managerId, setManagerId] = useState(initialManagerId);
  const [loading, setLoading] = useState(false);

  async function save(nextManagerId: string) {
    setManagerId(nextManagerId);
    setLoading(true);
    try {
      const res = await fetch(`/api/cost-centers/${costCenterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managerId: nextManagerId || null }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <UserPicker value={managerId} onChange={save} role="APROVADOR" placeholder="Sem gestor definido" />
    </div>
  );
}
