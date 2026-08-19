/**
 * Validação compartilhada dos anexos (solicitações e chamados).
 *
 * Antes as duas rotas de anexo só checavam `file instanceof Blob`: nenhum
 * limite de tamanho, nenhuma checagem de tipo. A rota de foto de perfil já
 * fazia as duas coisas corretamente; era inconsistência interna, não decisão.
 *
 * Por que o tipo importa aqui e não é excesso de zelo: em produção o
 * armazenamento é o Vercel Blob, que grava com acesso público e serve o arquivo
 * pelo domínio da Vercel com o Content-Type real, fora do controle das nossas
 * rotas. Um .html ou .svg anexado seria RENDERIZADO ali, com script e tudo.
 * Hoje isso não explode porque a rota que serve anexo devolve
 * application/octet-stream com Content-Disposition attachment, mas isso é
 * proteção de um caminho só: o outro caminho existe e é público.
 *
 * A checagem é por extensão, não por MIME declarado, porque o MIME vem do
 * cliente e não é confiável. A extensão é o que determina como o arquivo será
 * servido depois.
 */

/** 15MB: cabe contrato escaneado, que é o anexo legitimamente maior do fluxo. */
export const TAMANHO_MAXIMO_ANEXO_BYTES = 15 * 1024 * 1024;

/**
 * Extensões aceitas. Lista de permissão, não de bloqueio: o que não está aqui
 * é recusado. Bloqueio nunca fecha, sempre falta uma variante.
 */
const EXTENSOES_ACEITAS = [
  // Documentos
  "pdf", "doc", "docx", "odt", "rtf", "txt",
  // Planilhas
  "xls", "xlsx", "ods", "csv",
  // Apresentações
  "ppt", "pptx",
  // Imagens (proposta fotografada, comprovante)
  "png", "jpg", "jpeg", "webp", "gif", "heic",
  // Mensagens salvas (proposta recebida por e-mail)
  "msg", "eml",
  // Compactados
  "zip",
];

export type ResultadoDeValidacao =
  | { ok: true; nomeDoArquivo: string }
  | { ok: false; erro: string; status: 400 | 413 };

export function validarAnexo(arquivo: unknown): ResultadoDeValidacao {
  if (!(arquivo instanceof Blob) || !("name" in arquivo)) {
    return { ok: false, erro: "Selecione um arquivo para anexar.", status: 400 };
  }

  const nomeDoArquivo = (arquivo as File).name;

  if (arquivo.size === 0) {
    return { ok: false, erro: "O arquivo enviado está vazio.", status: 400 };
  }

  if (arquivo.size > TAMANHO_MAXIMO_ANEXO_BYTES) {
    const limiteMb = TAMANHO_MAXIMO_ANEXO_BYTES / 1024 / 1024;
    const tamanhoMb = (arquivo.size / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      erro: `Arquivo muito grande: ${tamanhoMb}MB, e o limite é ${limiteMb}MB. Comprima o arquivo ou envie em partes.`,
      status: 413,
    };
  }

  const extensao = nomeDoArquivo.split(".").pop()?.toLowerCase() ?? "";
  if (!extensao || !EXTENSOES_ACEITAS.includes(extensao)) {
    return {
      ok: false,
      erro:
        `Tipo de arquivo não aceito${extensao ? ` (.${extensao})` : ""}. ` +
        "Envie PDF, imagem, documento do Office, e-mail salvo ou zip.",
      status: 400,
    };
  }

  return { ok: true, nomeDoArquivo };
}
