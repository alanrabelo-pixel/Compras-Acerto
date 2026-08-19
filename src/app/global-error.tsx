"use client";

/**
 * Último recurso: pega erro que acontece no próprio layout raiz, onde o
 * error.tsx normal não alcança. Por isso precisa trazer as próprias tags html e
 * body, e não pode depender do CSS do app (que pode ser justamente o que
 * falhou). Os estilos aqui são inline de propósito.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "72px 24px", background: "#fff", color: "#14171a" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>O sistema não conseguiu carregar</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#565c63", marginTop: 12 }}>
            A falha foi registrada. Tente carregar de novo: se persistir, avise o time de Compras
            informando o código abaixo.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12.5, marginTop: 14 }}>
              Código do erro: <code>{error.digest}</code>
            </p>
          )}
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: "9px 16px", fontSize: 14, cursor: "pointer", border: "1px solid #14171a", background: "#14171a", color: "#fff", borderRadius: 4 }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
