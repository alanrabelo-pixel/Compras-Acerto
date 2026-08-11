"use client";

/** Linha "Marcar todos / Desmarcar todos" — reaproveitada por todo seletor de múltipla escolha (pedido do usuário). */
export function SelectAllRow({ onSelectAll, onDeselectAll }: { onSelectAll: () => void; onDeselectAll: () => void }) {
  const linkStyle: React.CSSProperties = {
    fontSize: 11, padding: 0, background: "none", border: "none",
    color: "var(--acerto-green-dark)", cursor: "pointer", textDecoration: "underline",
  };
  return (
    <div style={{ display: "flex", gap: 10, padding: "2px 2px 6px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
      <button type="button" style={linkStyle} onClick={onSelectAll}>Marcar todos</button>
      <button type="button" style={linkStyle} onClick={onDeselectAll}>Desmarcar todos</button>
    </div>
  );
}
