"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccessToggle({ userId, initialValue }: { userId: string; initialValue: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    const next = !value;
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canViewBoard: next }),
      });
      if (res.ok) {
        setValue(next);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={`btn ${value ? "btn-primary" : "btn-secondary"}`}
      style={{ padding: "5px 12px", fontSize: 11.5 }}
      disabled={loading}
      onClick={toggle}
    >
      {value ? "Liberado" : "Sem acesso"}
    </button>
  );
}
