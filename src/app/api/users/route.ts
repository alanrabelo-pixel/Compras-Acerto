import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { RoleName } from "@prisma/client";
import { exigirQuadro } from "@/lib/acesso";

// GET /api/users?role=COMPRADOR: lista usuários ativos, opcionalmente filtrados por papel.
// Usado pelos seletores de usuário nas telas (substitui colar id cru).
//
// Restrito a quem vê o quadro. A resposta é a lista de pessoas da empresa com
// nome, e-mail e os PAPÉIS de cada uma, ou seja, quem aprova, quem compra,
// quem é do Jurídico. Serve de mapa de alçada para qualquer conta
// @acerto.com.br, que é o que se quer evitar.
//
// Quem consome (levantado em 20/08/2026, buscando "/api/users" em src/components
// e src/app): só UserPicker e MultiUserPicker. Os pontos de montagem deles se
// dividem em dois grupos.
//
// 1. Telas de quadro e de administração: RequestActions e AttachmentsPanel em
//    /solicitacoes/[id], ContractActions em /contratos/[id], StageOverrideControls,
//    ApprovalLevelPicker, CreateCostCenterForm e CostCenterManagerPicker em
//    /admin/*. Todas exigem canViewBoard (ou papel ADMIN, que deriva
//    canViewBoard) no middleware para a página abrir, então quem chega nelas
//    passa por esta guarda.
// 2. Telas abertas a qualquer colaborador: NovaSolicitacaoForm, NdaRequestForm
//    e WhoAmIPicker (/solicitacoes/minhas). Nestas o seletor só é montado no
//    ramo "sem sessão real", que existe para o desenvolvimento local com
//    LOCAL_BYPASS_AUTH (ver o comentário do próprio WhoAmIPicker). Com SSO
//    ativo, sessionRequester nunca é nulo (o middleware exige sessão e o
//    callback signIn faz upsert do User), o seletor não aparece e a rota não é
//    chamada. E com o bypass ligado esta guarda libera sozinha, então o
//    formulário local continua funcionando.
export async function GET(req: NextRequest) {
  const barrado = await exigirQuadro("a lista de usuários");
  if (barrado) return barrado;

  const role = req.nextUrl.searchParams.get("role") as RoleName | null;

  const users = await prisma.user.findMany({
    where: { active: true, ...(role ? { roles: { some: { role } } } : {}) },
    include: { roles: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    users.map((u) => ({ id: u.id, name: u.name, email: u.email, roles: u.roles.map((r) => r.role) }))
  );
}
