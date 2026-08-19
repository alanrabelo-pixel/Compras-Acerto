"use client";

import { useEffect } from "react";

/**
 * Tela de erro das rotas do app. Antes não existia nenhum error.tsx, então
 * qualquer exceção não tratada (e 56 das 57 rotas não têm try/catch) resultava
 * em tela branca, sem explicação e sem registro.
 *
 * O digest é a única pista que liga o que a pessoa viu ao que foi registrado no
 * servidor. Mostrar em tela permite que ela informe o código ao pedir ajuda.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Chega ao console do navegador; o erro em si já foi registrado no servidor
    // pelo Next.js. Serve para investigar a partir da máquina de quem reportou.
    console.error("Erro na tela:", { mensagem: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="exec-home" style={{ maxWidth: 620, margin: "0 auto", paddingTop: 72 }}>
      <div className="card">
        <h1 className="card-title" style={{ fontSize: 20 }}>Algo deu errado nesta tela</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-muted)", marginTop: 10 }}>
          O problema foi registrado. Você pode tentar carregar de novo: se acontecer outra vez, avise o
          time de Compras informando o código abaixo, que é o que permite localizar o registro.
        </p>
        {error.digest && (
          <p style={{ fontSize: 12.5, marginTop: 14 }}>
            Código do erro: <code>{error.digest}</code>
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={reset}>Tentar de novo</button>
          <a className="btn btn-secondary" href="/" style={{ textDecoration: "none" }}>Voltar ao início</a>
        </div>
      </div>
    </main>
  );
}
