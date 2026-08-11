"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { MultiUserPicker } from "@/components/MultiUserPicker";
import { Button, Modal } from "@/components/ui";

/**
 * Cria um novo centro de custo (pedido do usuário) — botão que abre um modal
 * em vez de um formulário sempre visível no topo da tela, para não poluir a
 * tela principal.
 */
export function CreateCostCenterForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="primary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setOpen(true)}>
        <Plus size={15} strokeWidth={2} style={{ marginRight: 6, verticalAlign: -2 }} />
        Novo centro de custo
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Novo centro de custo">
        <div style={{ display: "grid", gap: 12, minWidth: 320 }}>
          <div>
            <label className="label" htmlFor="new-cc-name">Nome</label>
            <input id="new-cc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do centro de custo" autoFocus />
          </div>
          <div>
            <label className="label">Gestor(es) aprovador(es) (opcional)</label>
            <MultiUserPicker selectedIds={managerIds} onChange={setManagerIds} role="APROVADOR" emptyLabel="Nenhum (configure depois)" />
          </div>
          {error && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button variant="primary" disabled={loading || !name.trim()} onClick={submit}>Criar</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
