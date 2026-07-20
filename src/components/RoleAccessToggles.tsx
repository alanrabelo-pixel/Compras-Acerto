"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [loading, setLoading] = useState<string | null>(null);

  async function toggle(role: string) {
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role];
    setLoading(role);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: next }),
      });
      if (res.ok) {
        setRoles(next);
        router.refresh();
      }
    } finally {
      setLoading(null);
    }
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
            disabled={loading === t.role}
            onClick={() => toggle(t.role)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
