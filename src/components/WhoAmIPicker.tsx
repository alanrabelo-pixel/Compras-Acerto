"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";

/**
 * Seletor de identidade para Minhas Pendências — só aparece quando não há
 * sessão real (LOCAL_BYPASS_AUTH ligado / SSO ainda não configurado, ver
 * src/app/solicitacoes/pendencias/page.tsx). Quando o SSO estiver ativo, a
 * página resolve a pessoa direto pela sessão e este seletor nem aparece.
 */
export function WhoAmIPicker() {
  const router = useRouter();
  const [userId, setUserId] = useState("");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <UserPicker value={userId} onChange={setUserId} placeholder="Selecione seu usuário" />
      <button
        className="btn btn-primary"
        disabled={!userId}
        onClick={() => router.push(`/solicitacoes/pendencias?userId=${userId}`)}
      >
        Ver minhas pendências
      </button>
    </div>
  );
}
