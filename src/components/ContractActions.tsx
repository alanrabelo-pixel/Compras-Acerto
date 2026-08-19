"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";

export function ContractActions({ contractId, status }: { contractId: string; status: string }) {
  const router = useRouter();
  const [actorId, setActorId] = useState("");
  const [treasuryNotified, setTreasuryNotified] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "CANCELADO") {
    return (
      <section className="card section-gap">
        <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: 0 }}>Contrato cancelado. Tesouraria já foi notificada.</p>
      </section>
    );
  }

  async function cancelar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, action: "CANCELAR", treasuryNotified, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao cancelar contrato.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card section-gap">
      <h2 className="card-title" style={{ color: "var(--danger)" }}>Cancelar contrato</h2>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label className="label">Responsável (comprador ou jurídico)</label>
          <UserPicker value={actorId} onChange={setActorId} placeholder="Selecione o responsável" />
        </div>
        <div>
          <label className="label">Motivo</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={treasuryNotified} onChange={(e) => setTreasuryNotified(e.target.checked)} /> Confirmo que a
          Tesouraria será notificada (obrigatório: evita continuar pagando contrato cancelado)
        </label>
        {error && <p style={{ fontSize: 12, color: "var(--danger)" }}>{error}</p>}
        <div>
          <button className="btn btn-danger" disabled={loading || !actorId || !treasuryNotified} onClick={cancelar}>
            Cancelar contrato
          </button>
        </div>
      </div>
    </section>
  );
}
