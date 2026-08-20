"use client";

import { useEffect, useState } from "react";

export type ContractOption = {
  id: string;
  supplierName: string;
  supplierTradeName: string | null;
  contractObject: string | null;
};

/**
 * Seletor de contrato ATIVO (ver /api/contracts/search), usado no fluxo de
 * "Dúvida sobre contrato ativo" em Jurídico (NdaRequestForm.tsx). A pessoa
 * escolhe o contrato real ao qual a dúvida se refere, sem inventar dado.
 *
 * Faz as duas coisas, por decisão do dono do sistema em 20/08/2026: abre já
 * com os contratos ativos listados, como sempre foi, e busca conforme a pessoa
 * digita. Uma versão intermediária tinha trocado a lista pela busca, para
 * fechar a exposição da carteira, e ele preferiu somar em vez de trocar: quem
 * tem poucos contratos continua só escolhendo, quem tem muitos digita o nome.
 */
const ESPERA_ANTES_DE_BUSCAR_MS = 300;

export function ContractPicker({ onSelect, id }: { onSelect: (contract: ContractOption) => void; id?: string }) {
  const [termo, setTermo] = useState("");
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [value, setValue] = useState("");

  const termoLimpo = termo.trim();

  useEffect(() => {
    // Espera a pessoa parar de digitar antes de chamar a rota, e ignora a
    // resposta de uma busca já superada: sem isso o resultado de "ace" pode
    // chegar depois do de "acerto" e sobrescrever a lista certa pela antiga.
    let superada = false;
    setBuscando(true);
    const agendada = setTimeout(() => {
      // Sem termo, a rota devolve os contratos ativos: é o carregamento
      // inicial, que abre o seletor já preenchido.
      const busca = termoLimpo ? `?q=${encodeURIComponent(termoLimpo)}` : "";
      fetch(`/api/contracts/search${busca}`)
        .then((res) => res.json())
        .then((lista) => {
          if (superada) return;
          setContracts(Array.isArray(lista) ? lista : []);
          setBuscou(true);
        })
        .catch(() => {
          if (superada) return;
          setContracts([]);
          setBuscou(true);
        })
        .finally(() => {
          if (!superada) setBuscando(false);
        });
    }, ESPERA_ANTES_DE_BUSCAR_MS);

    return () => {
      superada = true;
      clearTimeout(agendada);
    };
  }, [termoLimpo]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        id={id}
        className="input"
        type="search"
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setValue("");
        }}
        placeholder="Filtrar por fornecedor ou objeto (opcional)"
        aria-label="Buscar contrato ativo"
      />

      {buscando && <p className="help">Buscando contratos ativos…</p>}
      {!buscando && buscou && contracts.length === 0 && (
        <p className="help">
          {termoLimpo
            ? `Nenhum contrato ativo encontrado para “${termoLimpo}”. Tente o nome do fornecedor.`
            : "Nenhum contrato ativo cadastrado. Contratos aparecem aqui depois do Mapeamento de Contrato, ou por importação em massa."}
        </p>
      )}

      {contracts.length > 0 && (
        <select
          className="input"
          value={value}
          aria-label="Contrato ativo encontrado"
          onChange={(e) => {
            setValue(e.target.value);
            const contract = contracts.find((c) => c.id === e.target.value);
            if (contract) onSelect(contract);
          }}
        >
          <option value="">Selecione o contrato</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.supplierTradeName ?? c.supplierName}{c.contractObject ? ` (${c.contractObject.slice(0, 60)})` : ""}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
