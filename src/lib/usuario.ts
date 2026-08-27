import { Prisma } from "@prisma/client";

/**
 * Colunas de User que podem sair numa resposta de API.
 *
 * O motivo de isto existir: um `include: { requester: true }` (ou qualquer
 * relação apontando para User) traz TODAS as colunas escalares do model
 * junto, sensíveis inclusive. Um inventário das rotas em 20/08/2026 achou 24
 * rotas devolvendo as chaves de IA pessoais (removidas em 27/08/2026) no
 * JSON, e nenhuma delas fazia isso de propósito: era sempre um include
 * genérico escrito para pegar o nome de quem pediu.
 *
 * `googleId` fica de fora por precaução: não é segredo, mas é identificador
 * de conta externa e nenhuma tela usa.
 */
export const USUARIO_PUBLICO = {
  id: true,
  name: true,
  email: true,
  diretoria: true,
  active: true,
  canViewBoard: true,
  avatarUrl: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/**
 * Versão enxuta, para quando a resposta só precisa identificar a pessoa: nome
 * numa lista, autor de um evento, destinatário de um aviso. Prefira esta.
 */
export const USUARIO_RESUMIDO = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export type UsuarioPublico = Prisma.UserGetPayload<{ select: typeof USUARIO_PUBLICO }>;
export type UsuarioResumido = Prisma.UserGetPayload<{ select: typeof USUARIO_RESUMIDO }>;
