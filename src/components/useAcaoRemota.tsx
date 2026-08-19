"use client";

import { useState, useCallback } from "react";

/**
 * Estado de uma ação que chama a API, com retorno visível.
 *
 * O padrão anterior nos painéis administrativos era:
 *
 *   const res = await fetch(...);
 *   if (res.ok) router.refresh();
 *
 * Sem `else`. Conceder papel, desativar usuário e trocar aprovadores de alçada
 * eram silenciosos NO SUCESSO E NA FALHA: um 403 era descartado e a interface
 * voltava ao estado anterior, indistinguível de nada ter acontecido. Quem
 * clicava não tinha como saber se a mudança valeu.
 *
 * Aqui a falha aparece com a mensagem que a API mandou (que agora diz o que
 * fazer, ver as mensagens reescritas nas rotas), e o sucesso pisca uma
 * confirmação curta que some sozinha.
 */

export type EstadoDaAcao =
  | { tipo: "ocioso" }
  | { tipo: "salvando" }
  | { tipo: "ok" }
  | { tipo: "erro"; mensagem: string };

export function useAcaoRemota() {
  const [estado, setEstado] = useState<EstadoDaAcao>({ tipo: "ocioso" });

  const executar = useCallback(
    async (chamada: () => Promise<Response>, aoDarCerto?: () => void) => {
      setEstado({ tipo: "salvando" });
      try {
        const res = await chamada();
        if (!res.ok) {
          // A resposta pode não ser JSON (ex: erro de proxy, HTML de 500), então
          // a leitura do corpo não pode derrubar o tratamento do erro.
          const corpo = await res.json().catch(() => null);
          setEstado({
            tipo: "erro",
            mensagem: corpo?.error ?? "Não foi possível salvar. Tente de novo em instantes.",
          });
          return false;
        }
        aoDarCerto?.();
        setEstado({ tipo: "ok" });
        // A confirmação some sozinha: é um toggle, não uma ação que a pessoa
        // precise reler depois.
        setTimeout(() => setEstado((atual) => (atual.tipo === "ok" ? { tipo: "ocioso" } : atual)), 2500);
        return true;
      } catch {
        setEstado({ tipo: "erro", mensagem: "Sem conexão com o servidor. Verifique sua rede e tente de novo." });
        return false;
      }
    },
    []
  );

  return { estado, executar, salvando: estado.tipo === "salvando" };
}

/** Retorno visual compacto, para caber ao lado de um toggle numa linha de tabela. */
export function StatusDaAcao({ estado }: { estado: EstadoDaAcao }) {
  if (estado.tipo === "ocioso") return null;

  if (estado.tipo === "salvando") {
    return <span style={{ fontSize: 11, color: "var(--ink-muted)" }}>Salvando…</span>;
  }

  if (estado.tipo === "ok") {
    return (
      <span style={{ fontSize: 11, color: "var(--acerto-green-dark)", fontWeight: 600 }} role="status">
        Salvo
      </span>
    );
  }

  return (
    <span style={{ fontSize: 11, color: "var(--danger, #b3261e)", fontWeight: 600 }} role="alert">
      {estado.mensagem}
    </span>
  );
}
