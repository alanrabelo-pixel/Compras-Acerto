import { Prisma } from "@prisma/client";

/**
 * Colunas de User que podem sair numa resposta de API.
 *
 * O motivo de isto existir: o model User guarda `anthropicApiKey` e
 * `geminiApiKey`, e qualquer `include: { requester: true }` traz todas as
 * colunas escalares junto, chaves inclusive. Um inventário das rotas em
 * 20/08/2026 achou 24 rotas devolvendo as duas chaves no JSON, e nenhuma delas
 * fazia isso de propósito: era sempre um include genérico escrito para pegar o
 * nome de quem pediu.
 *
 * Nenhum código precisa das chaves por padrão. Os três lugares que realmente
 * leem (requests/suggest, ai-insight na hora de chamar o modelo, e
 * users/[id]/ai-keys) já pedem as colunas com select explícito, e continuam
 * funcionando: quem precisa do segredo pede o segredo pelo nome.
 *
 * `googleId` também fica de fora. Não é segredo, mas é identificador de conta
 * externa e nenhuma tela usa.
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
