import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { ManualProcessoDocument } from "@/lib/pdf/manualProcesso";

export const runtime = "nodejs";

// GET /api/manual/pdf — gera o Manual do Processo (Compras, Viagens Acerto, Facilities) sob demanda.
export async function GET() {
  const buffer = await renderToBuffer(<ManualProcessoDocument />);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="manual-processo-acerto.pdf"`,
    },
  });
}
