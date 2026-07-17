"use client";

import { useEffect, useState } from "react";
import type { RoleName } from "@prisma/client";

type UserOption = { id: string; name: string; email: string; roles: RoleName[] };

/**
 * Seletor de usuário — substitui os campos de "cole o id aqui" por um
 * dropdown com nome/e-mail, filtrável por papel (RoleName). O value
 * continua sendo o id do usuário (o que as rotas de API esperam).
 */
export function UserPicker({
  value, onChange, role, placeholder = "Selecione um usuário",
}: { value: string; onChange: (userId: string) => void; role?: RoleName; placeholder?: string }) {
  const [users, setUsers] = useState<UserOption[] | null>(null);

  useEffect(() => {
    const qs = role ? `?role=${role}` : "";
    fetch(`/api/users${qs}`)
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [role]);

  if (users === null) {
    return <select className="input" disabled><option>Carregando usuários…</option></select>;
  }

  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.email}){role ? "" : ` — ${u.roles.join(", ") || "sem papel"}`}
        </option>
      ))}
    </select>
  );
}
