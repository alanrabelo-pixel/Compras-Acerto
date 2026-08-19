/**
 * Tela de endereço não encontrado. Antes não existia, então uma solicitação ou
 * contrato inexistente (notFound() é chamado em várias páginas) caía no 404
 * padrão do Next.js, sem a marca e sem caminho de volta.
 */
export default function NotFound() {
  return (
    <main className="exec-home" style={{ maxWidth: 620, margin: "0 auto", paddingTop: 72 }}>
      <div className="card">
        <h1 className="card-title" style={{ fontSize: 20 }}>Não encontramos esta página</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-muted)", marginTop: 10 }}>
          O endereço pode estar errado, ou o item que você procura foi removido. Se você chegou aqui por
          um link de e-mail antigo, o registro pode ter mudado de lugar.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <a className="btn btn-primary" href="/" style={{ textDecoration: "none" }}>Voltar ao início</a>
          <a className="btn btn-secondary" href="/solicitacoes/minhas" style={{ textDecoration: "none" }}>
            Minhas solicitações
          </a>
        </div>
      </div>
    </main>
  );
}
