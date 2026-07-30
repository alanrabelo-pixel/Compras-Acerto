"use client";

import { useEffect, useState } from "react";
import type { RoleName } from "@prisma/client";

export type UserOption = { id: string; name: string; email: string; roles: RoleName[] };

/**
 * Seletor de usuário — substitui os campos de "cole o id aqui" por um
 * dropdown com nome/e-mail, filtrável por papel (RoleName). O value
 * continua sendo o id do usuário (o que as rotas de API esperam).
 *
 * onSelect (opcional): além de onChange(id), devolve o registro completo —
 * usado por telas que precisam do nome/e-mail junto (ex: NdaRequestForm,
 * onde o solicitante manual precisa virar requesterName/requesterEmail em
 * texto, não só um id).
 */
export function UserPicker({
  value, onChange, onSelect, role, placeholder = "Selecione um usuário", id,
}: { value: string; onChange: (userId: string) => void; onSelect?: (user: UserOption) => void; role?: RoleName; placeholder?: string; id?: string }) {
  const [users, setUsers] = useState<UserOption[] | null>(null);

  useEffect(() => {
    const qs = role ? `?role=${role}` : "";
    fetch(`/api/users${qs}`)
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [role]);

  if (users === null) {
    return <select id={id} className="input" disabled><option>Carregando usuários…</option></select>;
  }

  function handleChange(userId: string) {
    onChange(userId);
    const picked = users?.find((u) => u.id === userId);
    if (picked && onSelect) onSelect(picked);
  }

  return (
    <select id={id} className="input" value={value} onChange={(e) => handleChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.email}){role ? "" : ` — ${u.roles.join(", ") || "sem papel"}`}
        </option>
      ))}
    </select>
  );
}
