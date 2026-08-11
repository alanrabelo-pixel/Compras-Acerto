"use client";

import { useEffect, useRef, useState } from "react";
import type { RoleName } from "@prisma/client";
import type { UserOption } from "@/components/UserPicker";

/**
 * Seletor de MÚLTIPLOS usuários (checkboxes num dropdown) — usado para
 * designar mais de um aprovador por centro de custo/alçada (pedido do
 * usuário: reduz a necessidade de reajuste manual quando o titular está
 * ausente, qualquer um do grupo pode decidir). Mesma fonte de dados do
 * UserPicker (filtro por role via /api/users?role=X).
 */
export function MultiUserPicker({
  selectedIds, onChange, role, emptyLabel = "Ninguém selecionado",
}: { selectedIds: string[]; onChange: (ids: string[]) => void; role?: RoleName; emptyLabel?: string }) {
  const [users, setUsers] = useState<UserOption[] | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const qs = role ? `?role=${role}` : "";
    fetch(`/api/users${qs}`).then((res) => res.json()).then(setUsers).catch(() => setUsers([]));
  }, [role]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (users === null) {
    return <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Carregando…</p>;
  }

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const selectedNames = users.filter((u) => selectedIds.includes(u.id)).map((u) => u.name);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="input"
        style={{ textAlign: "left", cursor: "pointer", width: "100%" }}
        onClick={() => setOpen((o) => !o)}
      >
        {selectedNames.length > 0 ? selectedNames.join(", ") : emptyLabel}
      </button>
      {open && (
        <div
          style={{
            position: "absolute", zIndex: 20, background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: 8, marginTop: 4, maxHeight: 240, overflowY: "auto", minWidth: 280,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          {users.map((u) => (
            <label key={u.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, padding: "4px 2px" }}>
              <input type="checkbox" checked={selectedIds.includes(u.id)} onChange={() => toggle(u.id)} />
              {u.name} <span style={{ color: "var(--ink-muted)" }}>({u.email})</span>
            </label>
          ))}
          {users.length === 0 && <p style={{ fontSize: 12, color: "var(--ink-muted)" }}>Nenhum usuário com esse papel.</p>}
        </div>
      )}
    </div>
  );
}
