"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAcaoRemota, StatusDaAcao } from "@/components/useAcaoRemota";
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
  const { estado, executar, salvando } = useAcaoRemota();

  async function save(nextManagerIds: string[]) {
    const anterior = managerIds;
    setManagerIds(nextManagerIds);
    const deuCerto = await executar(
      () =>
        fetch(`/api/cost-centers/${costCenterId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ managerIds: nextManagerIds }),
        }),
      () => router.refresh()
    );
    // Reverte a mudança otimista: sem isso a tela mostraria o valor novo
    // enquanto o servidor recusou, que é pior que não dar retorno nenhum.
    if (!deuCerto) setManagerIds(anterior);
  }

  return (
    <div style={{ opacity: salvando ? 0.6 : 1 }}>
      {/* Sem filtro de papel desde 21/08/2026: listava só quem já tinha
          APROVADOR, e quem não tinha simplesmente não aparecia, sem
          explicação. Agora lista todo mundo ativo, e PATCH
          /api/cost-centers/[id] concede o papel a quem for nomeado. */}
      <MultiUserPicker selectedIds={managerIds} onChange={save} emptyLabel="Sem gestor do centro de custo definido" />
      <StatusDaAcao estado={estado} />
    </div>
  );
}
