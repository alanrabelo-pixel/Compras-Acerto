import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Centros de custo — lista final (2026-08-11) confirmada pelo usuário: os 11
// centros com líder definido em COST_CENTER_MANAGERS abaixo, um por um. Os 7
// centros sem líder (Atendimento, Engenharia de Dados, Engenharia de
// Software, Outros, Performance, Plataforma Cloud, SI e Privacidade) foram
// excluídos a pedido do usuário — nenhum tinha solicitação vinculada.
const COST_CENTERS = [
  "Comitê de IA", "Gestão", "Data Intelligence", "F&NC",
  "Atração e Fidelização de Consumidores", "Pessoas e Cultura",
  "CRM, Design, Conteúdo e EO", "Produto", "Tecnologia",
  "Vendas e Sucesso do Cliente", "Foundation",
];

// Gestor que aprova solicitações de cada centro de custo logo após o envio
// (etapa APROVACAO_GESTOR) — pedido do usuário (2026-08-11). Todo centro de
// custo hoje tem um líder definido (ver comentário acima).
const COST_CENTER_MANAGERS = [
  { costCenter: "Comitê de IA", name: "Afonso Borsoi", email: "afonso.borsoi@acerto.com.br" },
  { costCenter: "Gestão", name: "Bárbara Juliana", email: "barbara.juliana@acerto.com.br" },
  { costCenter: "F&NC", name: "Carolina Bacha", email: "carolina.bacha@acerto.com.br" },
  { costCenter: "Atração e Fidelização de Consumidores", name: "Guilherme Prates", email: "guilherme.prates@acerto.com.br" },
  { costCenter: "Produto", name: "Gustavo Santos", email: "gustavo.santos@acerto.com.br" },
  { costCenter: "CRM, Design, Conteúdo e EO", name: "Taciana Esselin", email: "taciana.esselin@acerto.com.br" },
  { costCenter: "Pessoas e Cultura", name: "Natália Alves", email: "natalia.alves@acerto.com.br" },
  { costCenter: "Foundation", name: "Rafael Vicentini", email: "rafael.vicentini@acerto.com.br" },
  { costCenter: "Tecnologia", name: "Rafael Lima", email: "rafael.lima@acerto.com.br" },
  { costCenter: "Data Intelligence", name: "Thomaz Campos", email: "thomaz.campos@acerto.com.br" },
  { costCenter: "Vendas e Sucesso do Cliente", name: "Pedro", email: "pedro@acerto.com.br" },
];

// Linhas de orçamento — dados de exemplo para desenvolvimento local. O
// mecanismo real de importação mensal (planilha/API do FP&A) ainda não está
// definido (ver README, seção "Assunções não verificadas").
const BUDGET_LINES = [
  { externalCode: "BL-2026-001", description: "Tecnologia — Infraestrutura", monthRef: "2026-07", available: 150000 },
  { externalCode: "BL-2026-002", description: "Revenue — Ferramentas Comerciais", monthRef: "2026-07", available: 80000 },
  { externalCode: "BL-2026-003", description: "Corporativo — Operações Gerais", monthRef: "2026-07", available: 50000 },
];

async function main() {
  for (const name of COST_CENTERS) {
    await prisma.costCenter.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const bl of BUDGET_LINES) {
    await prisma.budgetLine.upsert({ where: { externalCode: bl.externalCode }, update: {}, create: bl });
  }

  for (const m of COST_CENTER_MANAGERS) {
    const manager = await prisma.user.upsert({
      where: { email: m.email },
      update: { name: m.name },
      create: { email: m.email, name: m.name },
    });
    await prisma.userRole.upsert({
      where: { userId_role: { userId: manager.id, role: "APROVADOR" } },
      update: {},
      create: { userId: manager.id, role: "APROVADOR" },
    });
    await prisma.costCenter.update({ where: { name: m.costCenter }, data: { managerId: manager.id } });
  }

  // Usuários-chave citados no documento (memória de contexto Acerto) — ajustar
  // e-mails/roles reais antes de rodar em produção.
  //
  // canViewBoard: dado de exemplo para desenvolvimento local (libera o
  // Quadro/Contratos/Dashboards para essas pessoas). Em produção, isso é
  // gerenciado manualmente em /admin/acessos (ADMIN), não pelo seed.
  // extraRoles: papéis de alçada da exceção orçamentária (Coordenação/Gerente
  // F&NC — ver budgetExceptionApproverRole em workflow.ts). ASSUNÇÃO NÃO
  // VERIFICADA: são placeholders sobre pessoas já seedadas, só para o fluxo
  // ficar testável; quem de fato ocupa cada papel precisa ser validado com o
  // time de Compras | F&NC antes de produção.
  const seedUsers = [
    { email: "alan.rabelo@acerto.com.br", name: "Alan Rabelo", role: "COMPRADOR" as const, admin: true, canViewBoard: true },
    { email: "mariane.gomes@acerto.com.br", name: "Mariane Gomes", role: "COMPRADOR" as const, canViewBoard: true },
    { email: "mariana.flores@acerto.com.br", name: "Mariana Flores", role: "COMPRADOR" as const, canViewBoard: true },
    { email: "vinicius.vieira@acerto.com.br", name: "Vinícius Vieira", role: "JURIDICO" as const, canViewBoard: true },
    { email: "monalisa.tomaz@acerto.com.br", name: "Monalisa Tomaz", role: "TESOURARIA" as const, canViewBoard: true },
    { email: "alcyelle.pereira@acerto.com.br", name: "Alcyelle Pereira", role: "TESOURARIA" as const, canViewBoard: false },
    { email: "ana.reis@acerto.com.br", name: "Ana Reis", role: "CONTROLADORIA" as const, canViewBoard: true, extraRoles: ["COORDENACAO"] as const },
    { email: "jessica.oliveira@acerto.com.br", name: "Jessica Oliveira", role: "CONTROLADORIA" as const, canViewBoard: false, extraRoles: ["GERENTE_FNC"] as const },
    { email: "carolina.horta@acerto.com.br", name: "Carolina Horta", role: "APROVADOR" as const, canViewBoard: true },
    { email: "rafael.martins@acerto.com.br", name: "Rafael Martins", role: "PRIVACIDADE" as const, canViewBoard: false },
    { email: "fiscal@acerto.com.br", name: "Time Fiscal", role: "FISCAL" as const, canViewBoard: false },
  ];

  for (const u of seedUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { canViewBoard: u.canViewBoard },
      create: { email: u.email, name: u.name, canViewBoard: u.canViewBoard },
    });
    await prisma.userRole.upsert({
      where: { userId_role: { userId: user.id, role: u.role } },
      update: {},
      create: { userId: user.id, role: u.role },
    });
    if (u.admin) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: "ADMIN" } },
        update: {},
        create: { userId: user.id, role: "ADMIN" },
      });
    }
    for (const extraRole of u.extraRoles ?? []) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: user.id, role: extraRole } },
        update: {},
        create: { userId: user.id, role: extraRole },
      });
    }
  }

  console.log("Seed concluído.");
}

main().finally(() => prisma.$disconnect());
