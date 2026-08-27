"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ACCESS_ROLES, STAGE_ROLES } from "@/lib/roles";

/**
 * Contorno temporário enquanto o PATCH de /admin/acessos (RoleAccessToggles)
 * segue bloqueado numa camada de rede (achado real, com o Daniel). Concede um
 * papel via POST em vez de PATCH — só isso, nunca revoga e nunca mexe nos
 * outros papéis da pessoa. Remover quando o PATCH voltar a funcionar.
 */
export function GrantRoleForm() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ADMIN");
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function conceder() {
    setMensagem(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/users/grant-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível conceder o papel.");
      setMensagem({
        tipo: "ok",
        texto: data.jaTinha ? "Essa pessoa já tinha esse papel." : "Papel concedido.",
      });
      setEmail("");
      router.refresh();
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro inesperado." });
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn-secondary section-gap" style={{ fontSize: 12 }} onClick={() => setAberto(true)}>
        Conceder papel (contorno temporário)
      </button>
    );
  }

  return (
    <div className="card section-gap" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Conceder papel (contorno temporário)</h2>
        <button type="button" className="btn btn-secondary" style={{ fontSize: 11.5 }} onClick={() => setAberto(false)}>Fechar</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: 0 }}>
        Enquanto os botões de Acesso/Etapa acima derem &quot;Não foi possível salvar&quot; (bloqueio de
        infraestrutura, já reportado), use isto pra conceder um papel. Só concede, nunca revoga, e não mexe
        nos outros papéis da pessoa.
      </p>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <label className="label" htmlFor="grant-email">E-mail</label>
          <input id="grant-email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@acerto.com.br" />
        </div>
        <div>
          <label className="label" htmlFor="grant-role">Papel</label>
          <select id="grant-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {[...ACCESS_ROLES, ...STAGE_ROLES].map((r) => (
              <option key={r.role} value={r.role}>{r.label}</option>
            ))}
          </select>
        </div>
        <Button onClick={conceder} disabled={enviando || !email.trim()}>{enviando ? "Concedendo..." : "Conceder"}</Button>
      </div>
      {mensagem && (
        <p style={{ fontSize: 12, margin: 0, color: mensagem.tipo === "ok" ? "var(--acerto-green-dark)" : "var(--danger)" }}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
