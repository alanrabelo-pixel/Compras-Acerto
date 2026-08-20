import { TableWrap, TableHeadRow, TableRow } from "@/components/ui";

export type ChamadoCategoriaRow = {
  slug: string;
  label: string;
  open: number;
  inProgress: number;
  concluded: number;
  total: number;
};

export type ChamadoAbertoRow = {
  id: string;
  code: string;
  categorySlug: string;
  categoryLabel: string;
  href: string;
  requesterName: string;
  descriptionLong: string;
  statusLabel: string;
  daysOpen: number;
};

/**
 * Conteúdo expandido do painel "Chamados (Viagens · Facilities · NDA)".
 *
 * O que o painel compacto corta: a tabela por serviço conta quantos chamados
 * estão abertos, em andamento e concluídos, e o rodapé lista os seis mais
 * antigos em aberto, com código, serviço e dias. Fica de fora exatamente o que
 * transforma a contagem em trabalho: o resto da fila, de quem é cada chamado e
 * em que status ele está (`requesterName` e `statusLabel` já vinham do banco e
 * nunca chegavam à tela), além da descrição, que no rodapé é cortada em 70
 * caracteres.
 *
 * Aqui a fila aparece inteira, quebrada por serviço, do mais antigo para o mais
 * novo, porque a pergunta que sobra depois de ver "12 em aberto" é "quais, de
 * quem, e há quanto tempo".
 *
 * Server Component: nenhuma interação, só leitura.
 */
export function ChamadosExpandido({
  categorias, abertos, totalPeriodo, avgResolutionDays,
}: {
  categorias: ChamadoCategoriaRow[];
  abertos: ChamadoAbertoRow[];
  totalPeriodo: number;
  avgResolutionDays: number | null;
}) {
  const colunas = "minmax(220px, 2.4fr) minmax(120px, 1fr) 120px 108px";

  // Sem nenhum chamado no período não existe fila para detalhar, e três blocos
  // de serviço zerados em tela cheia diriam menos que a tabela do compacto.
  if (totalPeriodo === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--ink-muted)", maxWidth: 620, lineHeight: 1.6 }}>
        Nenhum chamado aberto no período filtrado, nos três serviços. Chamados seguem um fluxo simples, fora do
        processo de Compras: só o filtro de período do Dashboard vale para eles, os demais (diretoria, centro de
        custo, comprador, fornecedor) pertencem à solicitação de compra e não existem aqui.
      </p>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <p className="dash-section-subtitle" style={{ margin: 0 }}>
        {totalPeriodo} chamado(s) abertos no período, {abertos.length} ainda na fila
        {avgResolutionDays !== null ? `, ${avgResolutionDays.toFixed(1)} dia(s) de resolução média entre os concluídos` : ""}.
        O painel compacto mostra os seis mais antigos; abaixo está a fila inteira, por serviço.
      </p>

      {categorias.map((c) => {
        const fila = abertos.filter((t) => t.categorySlug === c.slug);
        return (
          <section key={c.slug} style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                <a href={`/chamados/${c.slug}`} style={{ color: "inherit", textDecoration: "none" }}>{c.label}</a>
              </h3>
              <span style={{ fontSize: 11.5, color: "var(--ink-muted)" }}>
                {c.open} aberto(s) · {c.inProgress} em andamento · {c.concluded} concluído(s) · {c.total} no total
              </span>
            </div>

            {fila.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: 0 }}>
                {c.total === 0
                  ? "Nenhum chamado deste serviço no período."
                  : "Nenhum chamado deste serviço na fila: todos os do período já foram concluídos."}
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <TableWrap style={{ minWidth: 640 }}>
                  <TableHeadRow columns={colunas}>
                    <span>Chamado</span>
                    <span>Solicitante</span>
                    <span>Status</span>
                    <span style={{ textAlign: "right" }}>Em aberto há</span>
                  </TableHeadRow>
                  {fila.map((t) => (
                    <TableRow key={t.id} href={t.href} columns={colunas} style={{ alignItems: "baseline", fontSize: 12.5 }}>
                      <span>
                        <strong>{t.code}</strong>
                        <span style={{ display: "block", color: "var(--ink-soft)", lineHeight: 1.45 }}>{t.descriptionLong}</span>
                      </span>
                      <span style={{ color: "var(--ink-soft)" }}>{t.requesterName}</span>
                      <span style={{ color: "var(--ink-soft)" }}>{t.statusLabel}</span>
                      <strong style={{ textAlign: "right" }}>{t.daysOpen}d</strong>
                    </TableRow>
                  ))}
                </TableWrap>
              </div>
            )}
          </section>
        );
      })}

      <p style={{ fontSize: 11, color: "var(--ink-muted)", margin: 0 }}>
        &quot;Em aberto há&quot; conta os dias desde a abertura do chamado, não desde a última resposta. O tempo médio de
        resolução considera só os chamados concluídos dentro do período, medido entre a abertura e a última mudança
        de status.
      </p>
    </div>
  );
}
