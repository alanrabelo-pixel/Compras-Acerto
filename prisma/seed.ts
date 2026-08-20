import { PrismaClient } from "@prisma/client";
import { exigirBancoLocal } from "../src/lib/guarda-banco";

// Primeira linha executável do arquivo, de propósito: o seed escreve (upsert
// de usuários, papéis, centros de custo e orçamento) e lê o DATABASE_URL do
// ambiente sem perguntar nada. Se a string de conexão apontar para Produção ou
// Sandbox, isto para aqui, antes de qualquer escrita. Ver src/lib/guarda-banco.ts.
//
// Roda depois dos imports, e é isso que faz `npm run prisma:seed` continuar
// funcionando com o DATABASE_URL vindo só do .env: importar @prisma/client
// carrega o .env para process.env, e todo import é avaliado antes do corpo do
// módulo. Verificado em 2026-08-19 rodando tsx neste projeto. Se algum dia o
// Prisma parar de carregar o .env sozinho, a guarda barra por ausência de
// DATABASE_URL, que é ruído visível, e não escrita no banco errado.
exigirBancoLocal("O seed (npm run prisma:seed)");

const prisma = new PrismaClient();

// Centros de custo. Lista final (2026-08-11) confirmada pelo usuário: os 11
// centros com líder definido em COST_CENTER_MANAGERS abaixo, um por um. Os 7
// centros sem líder (Atendimento, Engenharia de Dados, Engenharia de
// Software, Outros, Performance, Plataforma Cloud, SI e Privacidade) foram
// excluídos a pedido do usuário, pois nenhum tinha solicitação vinculada.
const COST_CENTERS = [
  "Comitê de IA", "Gestão", "Data Intelligence", "F&NC",
  "Atração e Fidelização de Consumidores", "Pessoas e Cultura",
  "CRM, Design, Conteúdo e EO", "Produto", "Tecnologia",
  "Vendas e Sucesso do Cliente", "Foundation",
];

// PESSOAS DESTE ARQUIVO SÃO FICTÍCIAS, E ISSO É REQUISITO, NÃO DESCUIDO.
//
// Até 2026-08-19 este seed cadastrava 22 colegas reais da Acerto, com nome e
// e-mail @acerto.com.br verdadeiros. Assim que Slack ou Gmail estiverem
// configurados, qualquer teste de fluxo (aprovação de gestor, aviso de
// renovação, mensagem de chamado) dispara notificação de verdade para essas
// pessoas, em nome do sistema. Não há como cancelar um e-mail enviado.
//
// O domínio é @exemplo.invalid: o TLD .invalid é reservado pela RFC 2606 e
// nunca resolve em DNS nenhum, então um envio acidental morre na resolução de
// nome, antes de sair. NÃO troque por acerto.com.br (são pessoas reais) nem
// por example.com (domínio que existe e tem dono).
//
// Os nomes de CENTRO DE CUSTO continuam reais: são estrutura da empresa, não
// destinatário de mensagem, e o produto depende deles para casar solicitação
// com alçada.
//
// Gestor que aprova solicitações de cada centro de custo logo após o envio
// (etapa APROVACAO_GESTOR), a pedido do usuário (2026-08-11). Todo centro de
// custo hoje tem um líder definido (ver comentário acima). São 11, um por
// centro, mesma quantidade e mesma distribuição da lista anterior.
const COST_CENTER_MANAGERS = [
  { costCenter: "Comitê de IA", name: "Alice Andrade", email: "alice.andrade@exemplo.invalid" },
  { costCenter: "Gestão", name: "Bruno Barreto", email: "bruno.barreto@exemplo.invalid" },
  { costCenter: "F&NC", name: "Camila Cardoso", email: "camila.cardoso@exemplo.invalid" },
  { costCenter: "Atração e Fidelização de Consumidores", name: "Diego Duarte", email: "diego.duarte@exemplo.invalid" },
  { costCenter: "Produto", name: "Elisa Esteves", email: "elisa.esteves@exemplo.invalid" },
  { costCenter: "CRM, Design, Conteúdo e EO", name: "Fábio Furtado", email: "fabio.furtado@exemplo.invalid" },
  { costCenter: "Pessoas e Cultura", name: "Gabriela Guedes", email: "gabriela.guedes@exemplo.invalid" },
  { costCenter: "Foundation", name: "Helena Holanda", email: "helena.holanda@exemplo.invalid" },
  { costCenter: "Tecnologia", name: "Ivan Iglesias", email: "ivan.iglesias@exemplo.invalid" },
  { costCenter: "Data Intelligence", name: "Júlia Junqueira", email: "julia.junqueira@exemplo.invalid" },
  { costCenter: "Vendas e Sucesso do Cliente", name: "Lucas Lacerda", email: "lucas.lacerda@exemplo.invalid" },
];

// Linhas de orçamento: dados de exemplo para desenvolvimento local. O
// mecanismo real de importação mensal (planilha/API do FP&A) ainda não está
// definido (ver README, seção "Assunções não verificadas").
//
// Conferido em 2026-08-19 junto com a troca das pessoas por gente fictícia:
// estes três registros já eram sintéticos. Códigos inventados (BL-2026-00x),
// valores redondos e descrições que só repetem as três diretorias do enum
// (Corporativo, Revenue, Tecnologia). Não há aqui verba real, fornecedor real
// nem pessoa, então nada a substituir.
const BUDGET_LINES = [
  { externalCode: "BL-2026-001", description: "Tecnologia - Infraestrutura", monthRef: "2026-07", available: 150000 },
  { externalCode: "BL-2026-002", description: "Revenue - Ferramentas Comerciais", monthRef: "2026-07", available: 80000 },
  { externalCode: "BL-2026-003", description: "Corporativo - Operações Gerais", monthRef: "2026-07", available: 50000 },
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
    await prisma.costCenter.update({ where: { name: m.costCenter }, data: { managers: { connect: { id: manager.id } } } });
  }

  // Elenco fictício que cobre um papel de cada área do fluxo, para o sistema
  // ficar navegável em desenvolvimento. Mesma quantidade (11) e mesma
  // distribuição de papéis da lista de pessoas reais que existia aqui antes,
  // e o mesmo domínio inexistente explicado no topo do arquivo.
  //
  // O primeiro da lista é ADMIN porque o CHECKLIST-GOOGLE-OAUTH.md manda ter
  // pelo menos um administrador no banco antes do primeiro login com SSO. Não
  // remova o `admin: true`. Atenção, porém: este administrador é FICTÍCIO e
  // serve só para desenvolvimento local, já que ninguém consegue logar com um
  // e-mail @exemplo.invalid (o login exige @acerto.com.br, ver src/lib/auth.ts).
  // Promover a primeira pessoa real a ADMIN em Produção é passo manual, e está
  // descrito na seção 3 do CHECKLIST-GOOGLE-OAUTH.md.
  //
  // canViewBoard: dado de exemplo para desenvolvimento local (libera o
  // Quadro/Contratos/Dashboards para essas pessoas). Em produção, isso é
  // gerenciado manualmente em /admin/acessos (ADMIN), não pelo seed.
  // extraRoles: papéis de alçada da exceção orçamentária (Coordenação/Gerente
  // F&NC, ver budgetExceptionApproverRole em workflow.ts), aqui só para o fluxo
  // ficar testável. Quem de fato ocupa cada papel na Acerto é definido em
  // /admin/acessos, com gente real, e nunca por este arquivo.
  const seedUsers = [
    { email: "marina.macedo@exemplo.invalid", name: "Marina Macedo", role: "COMPRADOR" as const, admin: true, canViewBoard: true },
    { email: "nelson.nogueira@exemplo.invalid", name: "Nelson Nogueira", role: "COMPRADOR" as const, canViewBoard: true },
    { email: "olivia.osorio@exemplo.invalid", name: "Olívia Osório", role: "COMPRADOR" as const, canViewBoard: true },
    { email: "paulo.pacheco@exemplo.invalid", name: "Paulo Pacheco", role: "JURIDICO" as const, canViewBoard: true },
    { email: "renata.rangel@exemplo.invalid", name: "Renata Rangel", role: "TESOURARIA" as const, canViewBoard: true },
    { email: "sergio.salgado@exemplo.invalid", name: "Sérgio Salgado", role: "TESOURARIA" as const, canViewBoard: false },
    { email: "tatiana.teixeira@exemplo.invalid", name: "Tatiana Teixeira", role: "CONTROLADORIA" as const, canViewBoard: true, extraRoles: ["COORDENACAO"] as const },
    { email: "ulisses.uchoa@exemplo.invalid", name: "Ulisses Uchôa", role: "CONTROLADORIA" as const, canViewBoard: false, extraRoles: ["GERENTE_FNC"] as const },
    { email: "vera.valadares@exemplo.invalid", name: "Vera Valadares", role: "APROVADOR" as const, canViewBoard: true },
    { email: "wagner.wolff@exemplo.invalid", name: "Wagner Wolff", role: "PRIVACIDADE" as const, canViewBoard: false },
    { email: "fiscal@exemplo.invalid", name: "Time Fiscal", role: "FISCAL" as const, canViewBoard: false },
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
