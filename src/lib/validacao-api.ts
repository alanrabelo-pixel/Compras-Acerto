import { NextResponse } from "next/server";
import { ZodError, ZodSchema } from "zod";
import { logger } from "@/lib/logger";

/**
 * Duas faltas encontradas no relatório de DAST de 25/08/2026 tinham a mesma
 * causa: nenhuma rota validava o formato do corpo antes de usá-lo. Um enum
 * fora da lista (ex.: "priority" com lixo) chegava direto ao Prisma, que
 * lança PrismaClientValidationError; sem try/catch em volta, o Next.js
 * devolve 500 com corpo vazio e a conexão fechada — a mesma assinatura que o
 * scanner confundiu com injeção de SQL e com estouro de buffer. Não era nem
 * uma coisa nem outra: era exceção não tratada em cima de entrada inválida.
 *
 * validarCorpo() troca isso por 400 com mensagem específica de campo.
 * comExcecaoControlada() é a rede de segurança para o que sobrar: qualquer
 * exceção que não seja de validação vira 500 com corpo JSON e log do motivo,
 * nunca mais conexão encerrada em silêncio.
 */
export function validarCorpo<T>(schema: ZodSchema<T>, corpo: unknown): { ok: true; dados: T } | { ok: false; resposta: NextResponse } {
  const resultado = schema.safeParse(corpo);
  if (resultado.success) return { ok: true, dados: resultado.data };
  return { ok: false, resposta: respostaDeValidacao(resultado.error) };
}

function respostaDeValidacao(erro: ZodError): NextResponse {
  const primeiro = erro.issues[0];
  const campo = primeiro?.path?.join(".") || "corpo da requisição";
  return NextResponse.json({ error: `Campo inválido: ${campo}. ${primeiro?.message ?? ""}`.trim() }, { status: 400 });
}

/**
 * Envolve um handler de rota inteiro. Cobre o que a validação de schema não
 * alcança: falha ao interpretar multipart/form-data, erro do Prisma que não é
 * de validação (ex.: FK inexistente), qualquer exceção de terceiro.
 *
 * O corpo da resposta de erro é sempre genérico de propósito — o log completo
 * (com stack) fica só no servidor, para não repetir o "corpo vazio sem pista
 * nenhuma" que o próprio relatório de DAST cita como achado à parte
 * (divulgação de erro de aplicação / falha de tratamento).
 */
export function comExcecaoControlada(
  origem: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  return handler().catch((erro) => {
    logger.error("excecao_nao_tratada_na_rota", {
      origem,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return NextResponse.json(
      { error: "Não foi possível concluir a operação. Tente novamente." },
      { status: 500 },
    );
  });
}
