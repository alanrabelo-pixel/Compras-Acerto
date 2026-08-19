import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { authOptions } from "@/lib/auth";
import { AuditoriaSistemaDocument } from "@/lib/pdf/auditoriaSistema";
import { bypassAuthAtivo } from "@/lib/bypass";

export const runtime = "nodejs";

// GET /api/auditoria/pdf: gera o Mapa Funcional Completo do sistema, sob
// demanda. Documento denso, com achados de segurança inclusos, restrito a ADMIN.
export async function GET() {
  if (!bypassAuthAtivo()) {
    const session = await getServerSession(authOptions);
    const roles = (session?.user as { roles?: string[] } | undefined)?.roles ?? [];
    if (!session || !roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Apenas administradores podem acessar este documento." }, { status: 403 });
    }
  }

  const buffer = await renderToBuffer(<AuditoriaSistemaDocument />);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="mapa-funcional-completo-alai.pdf"`,
    },
  });
}
