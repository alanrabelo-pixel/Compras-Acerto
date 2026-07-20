import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import type { Diretoria } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_STATUS = ["ATIVO", "RENOVACAO_EM_ANDAMENTO", "CANCELADO"];
const VALID_DIRETORIA = ["CORPORATIVO", "REVENUE", "TECNOLOGIA"];

const TEMPLATE_COLUMNS = [
  "Razão Social", "Nome Fantasia", "CNPJ", "Tipo de Documento", "Status",
  "Objeto do Contrato", "Prazo", "Início da Vigência", "Fim da Vigência",
  "Renovação Prevista", "Cláusula de Renovação e Rescisão", "Condição de Pagamento",
  "Diretoria", "Área", "Centro de Custo", "E-mail do Gestor",
];

const TEMPLATE_EXAMPLE = {
  "Razão Social": "Fornecedor Exemplo Ltda", "Nome Fantasia": "Fornecedor Exemplo", "CNPJ": "00.000.000/0001-00",
  "Tipo de Documento": "Contrato de Prestação de Serviço", "Status": "ATIVO",
  "Objeto do Contrato": "Licenciamento de software X", "Prazo": "12 meses, renovação automática",
  "Início da Vigência": "01/01/2026", "Fim da Vigência": "31/12/2026", "Renovação Prevista": "31/12/2026",
  "Cláusula de Renovação e Rescisão": "Renovação automática por 12 meses, rescisão com aviso de 30 dias",
  "Condição de Pagamento": "Mensal, boleto", "Diretoria": "TECNOLOGIA", "Área": "Tecnologia",
  "Centro de Custo": "Data Intelligence", "E-mail do Gestor": "nome.sobrenome@acerto.com.br",
};

/** GET /api/contratos/import — planilha modelo para importação em massa. */
export async function GET() {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet([TEMPLATE_EXAMPLE], { header: TEMPLATE_COLUMNS });
  XLSX.utils.book_append_sheet(wb, sheet, "Contratos");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="modelo-importacao-contratos.xlsx"`,
    },
  });
}

type Row = Record<string, unknown>;

function str(row: Row, key: string): string | undefined {
  const v = row[key];
  if (v === undefined || v === null || v === "") return undefined;
  return String(v).trim();
}

// Datas em planilha chegam como serial number (Excel) ou string "dd/mm/aaaa" —
// XLSX.utils.sheet_to_json com { raw: false, dateNF } já normaliza a maioria,
// mas cobrimos os dois formatos por segurança.
function parseDate(row: Row, key: string): Date | undefined {
  const v = row[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (!parsed) return undefined;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? undefined : iso;
}

/**
 * POST /api/contratos/import — importação em massa de contratos já
 * existentes (pré-datam este sistema, sem PurchaseRequest de origem — ver
 * Contract.requestId opcional no schema). Cada linha é validada
 * independentemente; linhas inválidas são reportadas sem interromper as
 * demais. Reaproveitável como padrão para outras importações em massa
 * (ex.: Solicitações) se necessário no futuro.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado (campo 'file')." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Row[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  if (rows.length === 0) {
    return NextResponse.json({ error: "Planilha vazia ou sem cabeçalho reconhecível." }, { status: 400 });
  }

  const managerEmails = Array.from(
    new Set(rows.map((r) => str(r, "E-mail do Gestor")?.toLowerCase()).filter((e): e is string => Boolean(e)))
  );
  const managers = await prisma.user.findMany({ where: { email: { in: managerEmails } } });
  const managerByEmail = new Map(managers.map((m) => [m.email.toLowerCase(), m]));

  const results: { row: number; status: "criado" | "erro"; detail: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +1 índice, +1 cabeçalho

    const supplierName = str(row, "Razão Social");
    const startDate = parseDate(row, "Início da Vigência");
    const endDate = parseDate(row, "Fim da Vigência");
    const costCenter = str(row, "Centro de Custo");
    const area = str(row, "Área") ?? costCenter;
    const managerEmail = str(row, "E-mail do Gestor")?.toLowerCase();

    const missing = [
      !supplierName && "Razão Social",
      !startDate && "Início da Vigência",
      !endDate && "Fim da Vigência",
      !costCenter && "Centro de Custo",
      !managerEmail && "E-mail do Gestor",
    ].filter(Boolean);
    if (missing.length > 0) {
      results.push({ row: rowNum, status: "erro", detail: `Campo(s) obrigatório(s) ausente(s): ${missing.join(", ")}` });
      continue;
    }

    const manager = managerByEmail.get(managerEmail!);
    if (!manager) {
      results.push({ row: rowNum, status: "erro", detail: `Gestor não encontrado para o e-mail "${managerEmail}" — a pessoa precisa ter feito login ao menos uma vez no sistema.` });
      continue;
    }

    const statusRaw = str(row, "Status")?.toUpperCase();
    const status = statusRaw && VALID_STATUS.includes(statusRaw) ? statusRaw : "ATIVO";
    const diretoriaRaw = str(row, "Diretoria")?.toUpperCase();
    const diretoria = diretoriaRaw && VALID_DIRETORIA.includes(diretoriaRaw) ? (diretoriaRaw as Diretoria) : undefined;
    const renewalDate = parseDate(row, "Renovação Prevista") ?? endDate!;

    try {
      await prisma.contract.create({
        data: {
          supplierName: supplierName!,
          supplierTradeName: str(row, "Nome Fantasia"),
          supplierCnpj: str(row, "CNPJ"),
          documentType: str(row, "Tipo de Documento"),
          contractObject: str(row, "Objeto do Contrato"),
          prazo: str(row, "Prazo"),
          paymentCondition: str(row, "Condição de Pagamento"),
          startDate: startDate!,
          endDate: endDate!,
          terminationClause: str(row, "Cláusula de Renovação e Rescisão"),
          renewalDate,
          contractManagerId: manager.id,
          area: area!,
          costCenter: costCenter!,
          diretoria,
          status,
        },
      });
      results.push({ row: rowNum, status: "criado", detail: supplierName! });
    } catch (err) {
      results.push({ row: rowNum, status: "erro", detail: err instanceof Error ? err.message : "Erro desconhecido" });
    }
  }

  const created = results.filter((r) => r.status === "criado").length;
  const failed = results.filter((r) => r.status === "erro").length;
  return NextResponse.json({ created, failed, results });
}
