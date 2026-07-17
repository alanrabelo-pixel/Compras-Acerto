/**
 * Medição de largura de texto para fontes PDF padrão (Helvetica / Helvetica-Bold),
 * equivalente ao `stringWidth` do ReportLab — necessário porque @react-pdf/renderer
 * não expõe medição de texto na camada de JSX, e o layout do Pedido de Compra
 * exige reduzir a fonte dinamicamente quando o texto não cabe na coluna (em vez
 * de usar autosize nativo do PDF).
 *
 * As tabelas abaixo são as métricas AFM padrão da Adobe para Helvetica/Helvetica-Bold
 * (unidades por em de 1000, ASCII 32-126). Caracteres acentuados (Latin-1/WinAnsi,
 * 192-255) usam a largura da letra base correspondente — aproximação padrão da
 * indústria para essas fontes core, suficiente para decidir quando encolher a fonte.
 */

const HELVETICA: Record<string, number> = {
  " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
};

const HELVETICA_BOLD: Record<string, number> = {
  " ": 278, "!": 333, '"': 474, "#": 556, "$": 556, "%": 889, "&": 722, "'": 238,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584,
};

// Mapa de caracteres acentuados (pt-BR) -> letra base, para reaproveitar a largura ASCII.
const BASE_LETTER: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a", Á: "A", À: "A", Â: "A", Ã: "A", Ä: "A",
  é: "e", è: "e", ê: "e", ë: "e", É: "E", È: "E", Ê: "E", Ë: "E",
  í: "i", ì: "i", î: "i", ï: "i", Í: "I", Ì: "I", Î: "I", Ï: "I",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o", Ó: "O", Ò: "O", Ô: "O", Õ: "O", Ö: "O",
  ú: "u", ù: "u", û: "u", ü: "u", Ú: "U", Ù: "U", Û: "U", Ü: "U",
  ç: "c", Ç: "C", ñ: "n", Ñ: "N",
};

function widthOfChar(ch: string, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  if (table[ch] !== undefined) return table[ch];
  const base = BASE_LETTER[ch];
  if (base && table[base] !== undefined) return table[base];
  return bold ? 611 : 556; // fallback ~= largura média de uma letra minúscula
}

/** Largura do texto em pontos, para uma fonte/tamanho dados (equivalente a stringWidth do ReportLab). */
export function stringWidth(text: string, fontSize: number, bold = false): number {
  let units = 0;
  for (const ch of text) units += widthOfChar(ch, bold);
  return (units / 1000) * fontSize;
}

/**
 * Reduz o tamanho da fonte (em passos de 0.5pt) até o texto caber em maxWidthPt,
 * sem descer abaixo de minFontSize. Não trunca o texto — apenas encolhe a fonte,
 * conforme a especificação (nada de autosize nativo do PDF).
 */
export function fitFontSize(params: {
  text: string;
  maxWidthPt: number;
  baseFontSize: number;
  minFontSize?: number;
  bold?: boolean;
}): number {
  const { text, maxWidthPt, baseFontSize, minFontSize = 6, bold = false } = params;
  let fontSize = baseFontSize;
  while (fontSize > minFontSize && stringWidth(text, fontSize, bold) > maxWidthPt) {
    fontSize -= 0.5;
  }
  return Math.max(fontSize, minFontSize);
}
