"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";

export function StageOverrideControls({
  requestId, currentStageLabel, allStageOptions,
}: {
  requestId: string;
  currentStageLabel: string;
  allStageOptions: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actorId, setActorId] = useState("");
  const [retreatTarget, setRetreatTarget] = useState("");
  const [advanceTarget, setAdvanceTarget] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(direction: "back" | "forward") {
    const targetStage = direction === "back" ? retreatTarget : advanceTarget;
    if (!actorId) { setError("Selecione o administrador responsável por este ajuste."); return; }
    if (!targetStage) { setError("Selecione a etapa de destino."); return; }
    const label = allStageOptions.find((o) => o.value === targetStage)?.label ?? targetStage;
    if (!confirm(`Confirma mover esta solicitação de "${currentStageLabel}" para "${label}"?\n\nIsso NÃO refaz as validações normais da etapa. Use só para corrigir um passo em falso.`)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/stage-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId, direction, targetStage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao ajustar etapa.");
      router.refresh();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-secondary" style={{ fontSize: 11.5, padding: "5px 10px" }} onClick={() => setOpen(true)}>
        Ajustar etapa (admin)
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 14, marginTop: 10, background: "var(--surface-muted)" }}>
      <p style={{ fontSize: 12.5, fontWeight: 700, margin: "0 0 8px" }}>Ajuste administrativo de etapa</p>
      <p style={{ fontSize: 11.5, color: "var(--ink-muted)", margin: "0 0 10px" }}>
        Move a solicitação para qualquer outra etapa, pra frente ou pra trás, sem refazer as validações da etapa. Fica registrado no histórico.
      </p>

      <div className="field" style={{ marginBottom: 10, maxWidth: 320 }}>
        <label className="label">Administrador responsável</label>
        <UserPicker value={actorId} onChange={setActorId} role="ADMIN" placeholder="Selecione o administrador" />
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div>
          <p style={{ fontSize: 11.5, margin: "0 0 6px" }}>Retroceder para:</p>
          <div style={{ display: "flex", gap: 8 }}>
            <select className="input" value={retreatTarget} onChange={(e) => setRetreatTarget(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">Selecione a etapa</option>
              {allStageOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button className="btn btn-secondary" disabled={loading || !retreatTarget} onClick={() => submit("back")}>
              ← Retroceder
            </button>
          </div>
        </div>

        <div>
          <p style={{ fontSize: 11.5, margin: "0 0 6px" }}>Avançar para:</p>
          <div style={{ display: "flex", gap: 8 }}>
            <select className="input" value={advanceTarget} onChange={(e) => setAdvanceTarget(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">Selecione a etapa</option>
              {allStageOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button className="btn btn-secondary" disabled={loading || !advanceTarget} onClick={() => submit("forward")}>
              Avançar →
            </button>
          </div>
        </div>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 10 }}>{error}</p>}

      <button className="btn btn-secondary" style={{ fontSize: 11, padding: "3px 8px", marginTop: 10 }} onClick={() => setOpen(false)}>
        Fechar
      </button>
    </div>
  );
}
