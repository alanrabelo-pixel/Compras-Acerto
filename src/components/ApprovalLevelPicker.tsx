"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  const [loading, setLoading] = useState(false);

  async function save(nextApproverIds: string[]) {
    setApproverIds(nextApproverIds);
    setLoading(true);
    try {
      const res = await fetch(`/api/approval-levels/${level}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approverIds: nextApproverIds }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ opacity: loading ? 0.6 : 1 }}>
      <MultiUserPicker selectedIds={approverIds} onChange={save} role="APROVADOR" emptyLabel="Sem aprovador definido" />
    </div>
  );
}
