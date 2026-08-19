/**
 * Normalização de CNPJ.
 *
 * O campo era texto livre, gravado do jeito que chegava: a importação de
 * planilha grava "00.000.000/0001-00", o formulário de Pedido de Compra pode
 * gravar só os dígitos. O `@unique` em Supplier.cnpj não protege contra isso,
 * porque para o banco são duas strings diferentes.
 *
 * O estrago não é cosmético. O controle anti-fracionamento compara por
 * igualdade exata:
 *
 *   where: { supplierCnpj: catalogMatch.cnpj, createdAt: { gte: doze meses } }
 *
 * Com formatos divergentes a busca não encontra nada, a soma dá zero, e
 * checkFragmentationRisk nunca sinaliza. Ou seja, o controle antifraude do
 * módulo de compras deixa de funcionar em silêncio, que é o pior modo de
 * falhar: ninguém percebe que parou.
 *
 * A decisão aqui é guardar sempre só os dígitos e formatar na exibição.
 * O contrário (guardar formatado) exigiria acertar a formatação em todo ponto
 * de escrita, e basta um errar para o furo voltar.
 */

/** Só os dígitos. Devolve null quando não sobra nada aproveitável. */
export function normalizarCnpj(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const digitos = valor.replace(/\D/g, "");
  return digitos.length > 0 ? digitos : null;
}

/** Formato de exibição: 00.000.000/0001-00. */
export function formatarCnpj(valor: string | null | undefined): string {
  const digitos = normalizarCnpj(valor);
  if (!digitos) return "";
  if (digitos.length !== 14) return digitos; // fora do padrão: mostra como está, em vez de mentir
  return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}
