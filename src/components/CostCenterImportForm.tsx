"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

type Resultado = { criados: string[]; atualizados: string[]; gestorNaoEncontrado: string[]; invalidos: string[] };

/**
 * Cria vários centros de custo de uma vez, já com o gestor vinculado (pedido
 * do dono do sistema em 27/08/2026, logo após o cadastro em massa de
 * usuários). Uma linha por centro, no formato "Nome do centro | e-mail do
 * gestor" — o gestor precisa já estar cadastrado (ver Importar usuários em
 * massa, em /admin/acessos).
 */
export function CostCenterImportForm() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function importar() {
    setErro(null);
    setResultado(null);
    const linhas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
    if (linhas.length === 0) {
      setErro("Preencha ao menos uma linha antes de importar.");
      return;
    }

    const items = linhas.map((linha) => {
      const [name, managerEmail] = linha.split("|").map((parte) => parte.trim());
      return { name, managerEmail };
    });
    const semSeparador = items.filter((i) => !i.managerEmail);
    if (semSeparador.length > 0) {
      setErro(`Falta o separador "|" em ${semSeparador.length} linha(s). Formato: Nome do centro | e-mail@do.gestor`);
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch("/api/cost-centers/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível importar.");
      setResultado(data);
      if (data.criados.length > 0 || data.atualizados.length > 0) {
        setTexto("");
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
        Importar centros de custo em massa
      </button>
    );
  }

  return (
    <div className="card section-gap" style={{ padding: 16, display: "grid", gap: 10, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Importar centros de custo em massa</h2>
        <button type="button" className="btn btn-secondary" style={{ fontSize: 11.5 }} onClick={() => setAberto(false)}>Fechar</button>
      </div>
      <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: 0 }}>
        Uma linha por centro de custo, no formato <strong>Nome do centro | e-mail do gestor</strong>. O gestor
        precisa já estar cadastrado (Importar usuários em massa, em Acessos) — ele ganha o papel Aprovador
        automaticamente. Um centro que já existe não é recriado, só ganha esse gestor a mais.
      </p>
      <textarea
        className="input"
        rows={8}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={"Comitê de IA | afonso@acerto.com.br\nGestão | barbara.silva@acerto.com.br"}
      />
      <div>
        <Button onClick={importar} disabled={enviando}>{enviando ? "Importando..." : "Importar"}</Button>
      </div>
      {erro && <p style={{ fontSize: 12, color: "var(--danger)", margin: 0 }}>{erro}</p>}
      {resultado && (
        <div style={{ fontSize: 12, display: "grid", gap: 4 }}>
          <p style={{ margin: 0, color: "var(--acerto-green-dark)", fontWeight: 600 }}>
            {resultado.criados.length} criado(s): {resultado.criados.join(", ") || "-"}
          </p>
          {resultado.atualizados.length > 0 && (
            <p style={{ margin: 0, color: "var(--acerto-green-dark)" }}>
              {resultado.atualizados.length} já existia(m), gestor adicionado: {resultado.atualizados.join(", ")}
            </p>
          )}
          {resultado.gestorNaoEncontrado.length > 0 && (
            <p style={{ margin: 0, color: "var(--danger)" }}>
              {resultado.gestorNaoEncontrado.length} com gestor não encontrado (cadastre a pessoa primeiro): {resultado.gestorNaoEncontrado.join("; ")}
            </p>
          )}
          {resultado.invalidos.length > 0 && (
            <p style={{ margin: 0, color: "var(--danger)" }}>
              {resultado.invalidos.length} inválido(s): {resultado.invalidos.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
