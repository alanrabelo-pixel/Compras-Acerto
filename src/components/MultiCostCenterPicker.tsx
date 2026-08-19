"use client";

import { useEffect, useRef, useState } from "react";
import { SelectAllRow } from "@/components/SelectAllRow";

type CostCenterOption = { id: string; name: string };

/**
 * Seletor de MÚLTIPLOS centros de custo (checkboxes num dropdown), usado na
 * visão "Por Aprovador" de /admin/centros-de-custo, o inverso do
 * CostCenterManagerPicker (lá se escolhe o(s) gestor(es) de um centro de
 * custo; aqui se escolhe os centros de custo de um gestor). Mesma relação
 * CostCenter.managers por trás. O Prisma sincroniza dos dois lados.
 *
 * O painel usa position:fixed com coordenadas calculadas a partir do botão
 * (em vez de position:absolute), porque o container pai (.table-wrap) tem
 * overflow:hidden para arredondar os cantos da tabela, o que cortava o
 * dropdown quando ele abria na última linha (ex: Nível 3 da tabela de
 * Alçadas), deixando as opções invisíveis.
 */
export function MultiCostCenterPicker({
  selectedIds, onChange, emptyLabel = "Nenhum centro de custo",
}: { selectedIds: string[]; onChange: (ids: string[]) => void; emptyLabel?: string }) {
  const [costCenters, setCostCenters] = useState<CostCenterOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fetch("/api/cost-centers").then((res) => res.json()).then(setCostCenters).catch(() => setCostCenters([]));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setOpen((o) => !o);
  }

  if (costCenters === null) {
    return <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Carregando…</p>;
  }

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const selectedNames = costCenters.filter((cc) => selectedIds.includes(cc.id)).map((cc) => cc.name);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        className="input"
        style={{ textAlign: "left", cursor: "pointer", width: "100%" }}
        onClick={toggleOpen}
      >
        {selectedNames.length > 0 ? selectedNames.join(", ") : emptyLabel}
      </button>
      {open && coords && (
        <div
          style={{
            position: "fixed", top: coords.top, left: coords.left, minWidth: Math.max(280, coords.width),
            zIndex: 1000, background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: 8, maxHeight: 240, overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {costCenters.length > 0 && (
            <SelectAllRow onSelectAll={() => onChange(costCenters.map((cc) => cc.id))} onDeselectAll={() => onChange([])} />
          )}
          {costCenters.map((cc) => (
            <label key={cc.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, padding: "4px 2px" }}>
              <input type="checkbox" checked={selectedIds.includes(cc.id)} onChange={() => toggle(cc.id)} />
              {cc.name}
            </label>
          ))}
          {costCenters.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Nenhum centro de custo ativo.</p>}
        </div>
      )}
    </div>
  );
}
