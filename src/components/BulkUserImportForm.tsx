"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Resultado = { criados: string[]; jaExistiam: string[]; invalidos: string[] };

/**
 * Cadastra várias pessoas de uma vez como Solicitante, ANTES de qualquer
 * login via SSO (pedido do dono do sistema em 27/08/2026: sem elas
 * cadastradas não dá para configurar centro de custo nem aprovador).
 *
 * Duas caixas de texto, não uma: o formato mais comum de colar essa lista é
 * duas colunas de planilha (nomes, e-mails), e pedir para já vir "Nome,
 * email" por linha é mais trabalho de preparar do que colar direto.
 * Pareamento é por POSIÇÃO — a mesma ordem nas duas caixas.
 */
export function BulkUserImportForm() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nomes, setNomes] = useState("");
  const [emails, setEmails] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function partirLista(texto: string): string[] {
    return texto
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function importar() {
    setErro(null);
    setResultado(null);
    const listaDeNomes = partirLista(nomes);
    const listaDeEmails = partirLista(emails);

    if (listaDeNomes.length === 0 || listaDeEmails.length === 0) {
      setErro("Preencha as duas listas antes de importar.");
      return;
    }
    if (listaDeNomes.length !== listaDeEmails.length) {
      setErro(
        `As listas têm tamanhos diferentes (${listaDeNomes.length} nomes, ${listaDeEmails.length} e-mails). ` +
          "O pareamento é pela posição, então as duas precisam ter a mesma quantidade."
      );
      return;
    }

    setEnviando(true);
    try {
      const users = listaDeNomes.map((name, i) => ({ name, email: listaDeEmails[i] }));
      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível importar.");
      setResultado(data);
      if (data.criados.length > 0) {
        setNomes("");
        setEmails("");
        router.refresh();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn-secondary section-gap" style={{ fontSize: 12 }} onClick={() => setAberto(true)}>
        Importar usuários em massa
      </button>
    );
  }

  return (
    <div className="card section-gap" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Importar usuários em massa</h2>
        <button type="button" className="btn btn-secondary" style={{ fontSize: 11.5 }} onClick={() => setAberto(false)}>Fechar</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: 0 }}>
        Cadastra as pessoas como Solicitante, mesmo sem nunca terem entrado pelo Google. Cole os nomes numa
        caixa e os e-mails na outra, na MESMA ordem (uma por linha, ou separados por vírgula). Quem já
        estiver cadastrado é ignorado, sem sobrescrever nada.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label className="label" htmlFor="bulk-nomes">Nomes</label>
          <textarea id="bulk-nomes" className="input" rows={6} value={nomes} onChange={(e) => setNomes(e.target.value)} placeholder={"Fulano de Tal\nCiclana Souza"} />
        </div>
        <div>
          <label className="label" htmlFor="bulk-emails">E-mails</label>
          <textarea id="bulk-emails" className="input" rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"fulano@acerto.com.br\nciclana@acerto.com.br"} />
        </div>
      </div>
      <div>
        <Button onClick={importar} disabled={enviando}>{enviando ? "Importando..." : "Importar"}</Button>
      </div>
      {erro && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{erro}</p>}
      {resultado && (
        <div style={{ fontSize: 12, display: "grid", gap: 4 }}>
          <p style={{ margin: 0, color: "var(--acerto-green-dark)", fontWeight: 600 }}>
            {resultado.criados.length} cadastrado(s): {resultado.criados.join(", ") || "-"}
          </p>
          {resultado.jaExistiam.length > 0 && (
            <p style={{ margin: 0, color: "var(--ink-muted)" }}>
              {resultado.jaExistiam.length} já existia(m), ignorado(s): {resultado.jaExistiam.join(", ")}
            </p>
          )}
          {resultado.invalidos.length > 0 && (
            <p style={{ margin: 0, color: "var(--danger)" }}>
              {resultado.invalidos.length} inválido(s) (sem nome ou fora de @acerto.com.br): {resultado.invalidos.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
