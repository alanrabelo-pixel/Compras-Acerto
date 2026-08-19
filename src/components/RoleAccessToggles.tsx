"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAcaoRemota, StatusDaAcao } from "@/components/useAcaoRemota";

const TIERS: { role: string; label: string }[] = [
  { role: "ADMIN", label: "Admin" },
  { role: "COMPRADOR", label: "Compras" },
  { role: "SOLICITANTE", label: "Solicitante" },
  { role: "APROVADOR", label: "Aprovador" },
  { role: "CONTROLADORIA", label: "Controladoria" },
];

export function RoleAccessToggles({ userId, initialRoles }: { userId: string; initialRoles: string[] }) {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const { estado, executar } = useAcaoRemota();

  async function toggle(role: string) {
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    setEmAndamento(role);
    // Só aplica na tela depois que o servidor aceitou. Um 403 aqui significa
    // que o papel NÃO foi concedido, e deixar o botão aceso mentiria sobre
    // quem tem acesso ao quê, que é justamente o que esta tela controla.
    await executar(
      () =>
        fetch(`/api/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roles: next }),
        }),
      () => {
        setRoles(next);
        router.refresh();
      }
    );
    setEmAndamento(null);
  }

  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {TIERS.map((t) => {
        const active = roles.includes(t.role);
        return (
          <button
            key={t.role}
            className={`btn ${active ? "btn-primary" : "btn-secondary"}`}
            style={{ padding: "4px 9px", fontSize: 11 }}
            disabled={emAndamento === t.role}
            onClick={() => toggle(t.role)}
          >
            {t.label}
          </button>
        );
      })}
      <StatusDaAcao estado={estado} />
    </div>
  );
}
