import { describe, it, expect } from "vitest";
import { solicitanteAcompanha, convocacao, MARCOS_DO_SOLICITANTE } from "./avisos-de-etapa";
import { STAGES, etapaVisivelNoQuadro } from "./workflow";
import { PAPEIS_QUE_ATUAM_NA_ETAPA } from "./acesso";
import type { Stage } from "@prisma/client";

/**
 * Roteamento dos avisos de etapa, refeito em 21/08/2026.
 *
 * Duas distorções simétricas motivaram a mudança: o solicitante recebia aviso
 * nas doze transições, e quem PRECISA AGIR não recebia em nenhuma. Estes casos
 * travam a separação entre acompanhar e ser convocado.
 */

describe("MARCOS_DO_SOLICITANTE: o solicitante acompanha, não é convocado", () => {
  it("avisa nos marcos que mudam algo para quem pediu", () => {
    expect(solicitanteAcompanha("VALIDACAO_ORCAMENTARIA")).toBe(true); // Triagem aceitou
    expect(solicitanteAcompanha("APROVACAO")).toBe(true);
    expect(solicitanteAcompanha("JURIDICO")).toBe(true);
    expect(solicitanteAcompanha("PEDIDO_COMPRA")).toBe(true);
    expect(solicitanteAcompanha("CONCLUIDO")).toBe(true);
  });

  it("cala nas etapas que são trabalho interno de Compras", () => {
    expect(solicitanteAcompanha("COTACAO")).toBe(false);
    expect(solicitanteAcompanha("MAPA_COTACAO")).toBe(false);
    expect(solicitanteAcompanha("MEDICAO")).toBe(false);
    expect(solicitanteAcompanha("FISCAL")).toBe(false);
    expect(solicitanteAcompanha("TESOURARIA")).toBe(false);
    expect(solicitanteAcompanha("DUE_DILIGENCE")).toBe(false);
  });

  it("é bem menos que as doze de antes, que era o problema", () => {
    const etapasDoFluxo = (Object.keys(STAGES) as Stage[]).filter(etapaVisivelNoQuadro);
    expect(MARCOS_DO_SOLICITANTE.length).toBeLessThan(etapasDoFluxo.length / 2);
  });

  it("reprovação e cancelamento ficam de fora: têm texto próprio, com o motivo", () => {
    expect(solicitanteAcompanha("CANCELADO")).toBe(false);
  });
});

describe("Nenhuma etapa de trabalho fica sem quem avisar", () => {
  // O item que motivou a varredura: "analisar se alguma etapa está sem
  // comunicação". Uma etapa com dono (papel definido) e sem ninguém avisado é
  // trabalho que só anda se alguém olhar a tela por hábito.
  it("toda etapa com papel definido convoca alguém", () => {
    const comPapel = Object.entries(PAPEIS_QUE_ATUAM_NA_ETAPA)
      .filter(([, papeis]) => papeis && papeis.length > 0)
      .map(([etapa]) => etapa as Stage);

    // Quatro ficam de fora, e cada uma por um motivo: Solicitação é
    // instantânea (a solicitação nasce e sai dela na mesma requisição),
    // Concluído e Cancelado são fim de linha, e Aprovação do Gestor é legado
    // fora do fluxo desde 21/08/2026.
    //
    // Aguardando Entrega NÃO está aqui, e isso é intencional: mesmo esperando
    // o fornecedor, ela tem dono (o comprador), que é avisado ao receber a
    // solicitação de volta para acompanhar a entrega.
    const semDono = (Object.keys(STAGES) as Stage[]).filter((e) => !comPapel.includes(e));
    expect(semDono.sort()).toEqual(["APROVACAO_GESTOR", "CANCELADO", "CONCLUIDO", "SOLICITACAO"].sort());
  });

  it("cada etapa é coberta: ou o solicitante acompanha, ou alguém é convocado", () => {
    // A garantia que importa: nenhuma transição do fluxo passa em silêncio
    // total. As exceções são as etapas terminais e as instantâneas.
    const silenciosas = (Object.keys(STAGES) as Stage[])
      .filter(etapaVisivelNoQuadro)
      .filter((etapa) => !solicitanteAcompanha(etapa) && !PAPEIS_QUE_ATUAM_NA_ETAPA[etapa]);

    expect(silenciosas).toEqual(["SOLICITACAO"]);
  });
});

describe("convocacao: o texto de quem precisa agir", () => {
  const base = {
    nome: "Mariana",
    codigo: "PC-2026-0042",
    descricao: "Licenças de observabilidade",
    etapa: "COTACAO" as Stage,
    solicitante: "Afonso",
    valor: "R$ 24.000,00",
    link: "https://compras.acerto.com.br/solicitacoes/abc",
  };

  it("diz a etapa, o valor, quem pediu e para onde ir", () => {
    const msg = convocacao(base);

    expect(msg.assunto).toContain("Ação necessária");
    expect(msg.assunto).toContain("Cotação");
    expect(msg.assunto).toContain("PC-2026-0042");
    for (const texto of [msg.html, msg.slack]) {
      expect(texto).toContain("PC-2026-0042");
      expect(texto).toContain("Licenças de observabilidade");
      expect(texto).toContain("R$ 24.000,00");
      expect(texto).toContain("Afonso");
      expect(texto).toContain(base.link);
    }
  });

  it("usa o rótulo da etapa, e não o nome do enum", () => {
    const msg = convocacao({ ...base, etapa: "MAPA_COTACAO" });
    expect(msg.assunto).toContain("Mapa de Cotação");
    expect(msg.assunto).not.toContain("MAPA_COTACAO");
  });

  it("o Slack não leva HTML, e o e-mail não leva a sintaxe de link do Slack", () => {
    // Os dois canais recebem o MESMO conteúdo em formatos diferentes. Vazar a
    // marcação de um no outro é o erro clássico de mandar pelos dois.
    const msg = convocacao(base);
    expect(msg.slack).not.toContain("<p>");
    expect(msg.slack).not.toContain("</a>");
    expect(msg.html).not.toContain("|Abrir a solicitação>");
  });
});
