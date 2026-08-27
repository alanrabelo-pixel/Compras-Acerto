/**
 * Confere se o CONTEÚDO real de um arquivo bate com a extensão declarada.
 *
 * Achado do DAST de 25/08/2026: o upload aceitava um arquivo chamado
 * "secure.png" cujo conteúdo era texto puro, sem checar nada além do nome. A
 * extensão (src/lib/upload.ts, EXTENSOES_ACEITAS) já era uma allow-list, mas
 * allow-list de nome não prova nada sobre o conteúdo — quem sobe o arquivo
 * escolhe o nome.
 *
 * Não é um sniffer forense: olha só os primeiros bytes (assinatura), que é o
 * padrão de mercado (libmagic, o pacote `file` do Unix, a lib `file-type` do
 * npm fazem o mesmo). Formatos OOXML (docx/xlsx/pptx) e OpenDocument
 * (odt/ods) são ZIP por dentro e compartilham a mesma assinatura entre si —
 * differenciar um do outro exigiria abrir o ZIP e ler o conteúdo interno, o
 * que é desproporcional ao risco aqui. Formatos de texto puro (txt, csv, eml)
 * não têm assinatura nenhuma para checar: são liberados por natureza, o risco
 * deles é outro (script disfarçado de log), não bytes falsificados.
 */

type Assinatura = { bytes: number[]; offset?: number };

/** OLE2 Compound File — doc/xls/ppt legados e msg do Outlook usam o mesmo container. */
const OLE2: Assinatura = { bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] };
/** ZIP local file header — docx/xlsx/pptx/odt/ods/zip são ZIP por dentro. */
const ZIP: Assinatura[] = [
  { bytes: [0x50, 0x4b, 0x03, 0x04] },
  { bytes: [0x50, 0x4b, 0x05, 0x06] }, // arquivo vazio
  { bytes: [0x50, 0x4b, 0x07, 0x08] }, // spanned archive
];

const ASSINATURAS: Record<string, Assinatura[]> = {
  pdf: [{ bytes: [0x25, 0x50, 0x44, 0x46] }], // %PDF
  doc: [OLE2],
  xls: [OLE2],
  ppt: [OLE2],
  msg: [OLE2],
  docx: ZIP,
  xlsx: ZIP,
  pptx: ZIP,
  odt: ZIP,
  ods: ZIP,
  zip: ZIP,
  rtf: [{ bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66] }], // {\rtf
  png: [{ bytes: [0x89, 0x50, 0x4e, 0x47] }],
  jpg: [{ bytes: [0xff, 0xd8, 0xff] }],
  jpeg: [{ bytes: [0xff, 0xd8, 0xff] }],
  gif: [{ bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8
  webp: [
    { bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF, prefixo; WEBP vem depois do tamanho (offset 8)
  ],
  heic: [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }], // ftyp box
};

/** Extensões de texto puro: sem assinatura possível, liberadas por natureza. */
const SEM_ASSINATURA = new Set(["txt", "csv", "eml"]);

function bateComAssinatura(buffer: Buffer, assinatura: Assinatura): boolean {
  const inicio = assinatura.offset ?? 0;
  if (buffer.length < inicio + assinatura.bytes.length) return false;
  return assinatura.bytes.every((byte, i) => buffer[inicio + i] === byte);
}

/**
 * true = conteúdo condiz com a extensão (ou a extensão não tem assinatura
 * verificável). false = conteúdo claramente não é o que o nome do arquivo
 * afirma.
 */
export function conteudoBateComExtensao(buffer: Buffer, extensao: string): boolean {
  const ext = extensao.toLowerCase();
  if (SEM_ASSINATURA.has(ext)) return true;

  const possiveis = ASSINATURAS[ext];
  // Extensão aceita pela allow-list (upload.ts) mas sem assinatura cadastrada
  // aqui: não bloqueia por segurança de disponibilidade — melhor liberar um
  // formato raro do que travar upload legítimo por um mapa incompleto. O
  // ponto de defesa real são os formatos verificados acima.
  if (!possiveis) return true;

  if (ext === "webp") {
    // RIFF....WEBP: "WEBP" fica no byte 8, depois do campo de 4 bytes de tamanho.
    return bateComAssinatura(buffer, possiveis[0]) && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }

  return possiveis.some((assinatura) => bateComAssinatura(buffer, assinatura));
}
