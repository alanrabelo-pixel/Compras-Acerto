import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { bypassAuthAtivo } from "@/lib/bypass";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Registro das mudanças de permissão.
 *
 * UserRole e ApprovalLevelApprover eram apagados com deleteMany, sem deixar
 * rastro. São exatamente as duas tabelas que definem quem aprova dinheiro:
 * quem removeu o papel de alguém, quando e por quê era irrespondível, e numa
 * auditoria de sistema financeiro é a primeira pergunta que fazem.
 *
 * O registro é best-effort de propósito. Falhar aqui não pode impedir um
 * administrador de revogar um acesso: numa emergência, tirar o acesso importa
 * mais que registrar a retirada. Mas a falha fica no log em vez de sumir.
 */
export type TipoDeMudanca = "PAPEL" | "ACESSO_ATIVO" | "ALCADA" | "GESTOR_DE_CENTRO_DE_CUSTO";

export async function registrarMudancaDePermissao(params: {
  targetUserId: string;
  kind: TipoDeMudanca;
  antes: string;
  depois: string;
}): Promise<void> {
  try {
    // Nada a registrar quando nada mudou: evita encher a trilha de ruído e
    // esconder as mudanças reais no meio.
    if (params.antes === params.depois) return;

    let actorId: string | null = null;
    let actorEmail: string | null = null;
    if (!bypassAuthAtivo()) {
      const session = await getServerSession(authOptions);
      const user = session?.user as { id?: string; email?: string } | undefined;
      actorId = user?.id ?? null;
      actorEmail = user?.email ?? null;
    }

    await prisma.permissionChange.create({
      data: { ...params, actorId, actorEmail },
    });
  } catch (erro) {
    logger.error("registro_de_mudanca_de_permissao_falhou", { ...params, erro });
  }
}

/** Lista de papéis/nomes em texto estável, para comparar antes e depois. */
export function comoTexto(valores: (string | null | undefined)[]): string {
  const limpos = valores.filter((v): v is string => Boolean(v));
  return limpos.length > 0 ? [...limpos].sort().join(", ") : "nenhum";
}
