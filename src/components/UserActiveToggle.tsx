"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserActiveToggle({ userId, active }: { userId: string; active: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !active;
    if (next === false && !confirm("Desativar esta pessoa? Ela perde o acesso (inclusive login), mas todo o histórico dela continua no sistema.")) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={`btn ${active ? "btn-secondary" : "btn-danger"}`}
      style={{ padding: "4px 9px", fontSize: 11 }}
      disabled={loading}
      onClick={toggle}
    >
      {active ? "Ativo" : "Reativar"}
    </button>
  );
}
