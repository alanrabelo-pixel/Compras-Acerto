"use client";

import { useEffect, useState } from "react";

export type SupplierOption = {
  id: string;
  legalName: string;
  tradeName: string | null;
  cnpj: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};

/**
 * Seletor de fornecedor cadastrado (cadastro único de fornecedor). Ao
 * selecionar, devolve o registro completo via onSelect para pré-preencher
 * razão social/CNPJ/contato no formulário de Pedido de Compra — sem obrigar
 * o cadastro (o formulário aceita texto livre se o fornecedor ainda não
 * tiver Supplier cadastrado).
 */
export function SupplierPicker({ onSelect, id }: { onSelect: (supplier: SupplierOption) => void; id?: string }) {
  const [suppliers, setSuppliers] = useState<SupplierOption[] | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    fetch("/api/suppliers")
      .then((res) => res.json())
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  if (suppliers === null) return null;
  if (suppliers.length === 0) return null;

  return (
    <select
      id={id}
      className="input"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        const supplier = suppliers.find((s) => s.id === e.target.value);
        if (supplier) onSelect(supplier);
      }}
    >
      <option value="">Preencher manualmente (fornecedor sem cadastro)</option>
      {suppliers.map((s) => (
        <option key={s.id} value={s.id}>{s.legalName} ({s.cnpj})</option>
      ))}
    </select>
  );
}
