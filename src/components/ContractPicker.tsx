"use client";

import { useEffect, useState } from "react";

export type ContractOption = {
  id: string;
  supplierName: string;
  supplierTradeName: string | null;
  contractObject: string | null;
};

/**
 * Seletor de contrato ATIVO (ver /api/contracts/search) — usado no fluxo de
 * "Dúvida sobre contrato ativo" em Jurídico (NdaRequestForm.tsx). Mesmo
 * padrão do SupplierPicker: lista pronta, sem obrigar digitar nada; a pessoa
 * escolhe o contrato real ao qual a dúvida se refere, sem inventar dado.
 */
export function ContractPicker({ onSelect, id }: { onSelect: (contract: ContractOption) => void; id?: string }) {
  const [contracts, setContracts] = useState<ContractOption[] | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    fetch("/api/contracts/search")
      .then((res) => res.json())
      .then(setContracts)
      .catch(() => setContracts([]));
  }, []);

  if (contracts === null) return <p className="help">Carregando contratos ativos…</p>;
  if (contracts.length === 0) return <p className="help">Nenhum contrato ativo cadastrado no momento.</p>;

  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        const contract = contracts.find((c) => c.id === e.target.value);
        if (contract) onSelect(contract);
      }}
    >
      <option value="">Selecione o contrato</option>
      {contracts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.supplierTradeName ?? c.supplierName}{c.contractObject ? ` — ${c.contractObject.slice(0, 60)}` : ""}
        </option>
      ))}
    </select>
  );
}
