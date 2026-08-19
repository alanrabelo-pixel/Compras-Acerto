"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAcaoRemota, StatusDaAcao } from "@/components/useAcaoRemota";
import { ACCESS_ROLES, STAGE_ROLES } from "@/lib/roles";

/**
 * Concede e revoga os 11 papéis de uma pessoa.
 *
 * Antes cobria só os 5 primeiros. Os outros 6 (Jurídico, Privacidade, Fiscal,
 * Tesouraria, Coordenação e Gerente F&NC) apareciam em /admin/acessos como
 * texto sem edição, e a única forma de tornar alguém Fiscal ou Tesouraria era
 * mexer direto no banco. São justamente os papéis que decidem sobre nota
 * fiscal, pagamento, contrato e exceção orçamentária.
 *
 * Os dois grupos ficam separados de propósito: o primeiro decide o que a
 * pessoa VÊ (o acesso ao quadro sai dele), o segundo decide em que etapa ela
 * pode AGIR.
 */
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

  function Botao({ role, label, title }: { role: string; label: string; title?: string }) {
    const ativo = roles.includes(role);
    return (
      <button
        className={`btn ${ativo ? "btn-primary" : "btn-secondary"}`}
        style={{ padding: "4px 9px", fontSize: 11 }}
        disabled={emAndamento === role}
        onClick={() => toggle(role)}
        title={title}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--ink-muted)", width: 42 }}>Acesso</span>
        {ACCESS_ROLES.map((t) => (
          <Botao key={t.role} role={t.role} label={t.label} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "var(--ink-muted)", width: 42 }}>Etapa</span>
        {STAGE_ROLES.map((t) => (
          <Botao key={t.role} role={t.role} label={t.label} title={`Pode agir na ${t.etapa}`} />
        ))}
      </div>
      <StatusDaAcao estado={estado} />
    </div>
  );
}
