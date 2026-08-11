"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MultiUserPicker } from "@/components/MultiUserPicker";
import { Button } from "@/components/ui";

/** Cria um novo centro de custo direto do painel (pedido do usuário). */
export function CreateCostCenterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cost-centers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, managerIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar centro de custo.");
      setName("");
      setManagerIds([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card section-gap" style={{ display: "grid", gap: 10, gridTemplateColumns: "1.4fr 1.8fr auto", alignItems: "end" }}>
      <div>
        <label className="label" htmlFor="new-cc-name">Novo centro de custo</label>
        <input id="new-cc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do centro de custo" />
      </div>
      <div>
        <label className="label">Gestor(es) aprovador(es) (opcional)</label>
        <MultiUserPicker selectedIds={managerIds} onChange={setManagerIds} role="APROVADOR" emptyLabel="Nenhum (configure depois)" />
      </div>
      <div>
        <Button variant="primary" disabled={loading || !name.trim()} onClick={submit}>Criar</Button>
      </div>
      {error && <p style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--danger)", margin: 0 }}>{error}</p>}
    </div>
  );
}
