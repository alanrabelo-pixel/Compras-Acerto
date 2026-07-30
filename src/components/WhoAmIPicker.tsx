"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPicker } from "@/components/UserPicker";

/**
 * Seletor de identidade para páginas "minhas coisas" (Minhas Pendências,
 * Minhas Solicitações) — só aparece quando não há sessão real
 * (LOCAL_BYPASS_AUTH ligado / SSO ainda não configurado). Quando o SSO
 * estiver ativo, a página resolve a pessoa direto pela sessão e este
 * seletor nem aparece.
 */
export function WhoAmIPicker({
  targetPath = "/solicitacoes/pendencias",
  buttonLabel = "Ver minhas pendências",
}: { targetPath?: string; buttonLabel?: string } = {}) {
  const router = useRouter();
  const [userId, setUserId] = useState("");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <UserPicker value={userId} onChange={setUserId} placeholder="Selecione seu usuário" />
      <button
        className="btn btn-primary"
        disabled={!userId}
        onClick={() => router.push(`${targetPath}?userId=${userId}`)}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
