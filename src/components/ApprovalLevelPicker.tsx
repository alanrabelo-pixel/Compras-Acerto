"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAcaoRemota, StatusDaAcao } from "@/components/useAcaoRemota";
import { MultiUserPicker } from "@/components/MultiUserPicker";

/**
 * Troca o(s) aprovador(es) padrão de uma alçada de valor (Nível 1/2/3, ver
 * PATCH /api/approval-levels/[level]). Mais de um é permitido (mesmo
 * raciocínio do CostCenterManagerPicker). Ao salvar, Aprovações já criadas
 * nesse nível e ainda pendentes migram para o novo conjunto.
 */
export function ApprovalLevelPicker({ level, initialApproverIds }: { level: number; initialApproverIds: string[] }) {
  const router = useRouter();
  const [approverIds, setApproverIds] = useState(initialApproverIds);
  const { estado, executar, salvando } = useAcaoRemota();

  async function save(nextApproverIds: string[]) {
    const anterior = approverIds;
    setApproverIds(nextApproverIds);
    const deuCerto = await executar(
      () =>
        fetch(`/api/approval-levels/${level}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approverIds: nextApproverIds }),
        }),
      () => router.refresh()
    );
    if (!deuCerto) setApproverIds(anterior);
  }

  return (
    <div style={{ opacity: salvando ? 0.6 : 1 }}>
      <MultiUserPicker selectedIds={approverIds} onChange={save} role="APROVADOR" emptyLabel="Sem aprovador definido" />
      <StatusDaAcao estado={estado} />
    </div>
  );
}
